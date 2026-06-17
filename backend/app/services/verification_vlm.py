"""Optional second VLM for crop verification (e.g. Qwen3-VL)."""

from __future__ import annotations

import enum
import gc
import logging
import threading
import time

import torch
from PIL import Image

from ..core.config import settings
from ..core.gpu_memory import get_memory_manager
from .crop_verify import CropVerifier, parse_verification_answer

logger = logging.getLogger(__name__)

VerificationBackend = str  # "qwen3_vl" | "locate_anything"


class VerificationState(enum.StrEnum):
    UNLOADED = "unloaded"
    LOADING = "loading"
    LOADED = "loaded"
    ERROR = "error"


_verification_state: dict = {
    "state": VerificationState.UNLOADED,
    "model_id": "",
    "error": "",
}
_state_lock = threading.Lock()
_worker: Qwen3VLVerifier | None = None
_last_activity: float = 0.0
_watchdog_thread: threading.Thread | None = None
_watchdog_stop: threading.Event | None = None
_lock = threading.Lock()
_load_complete = threading.Event()


def _log_gpu_memory(stage: str) -> None:
    if not torch.cuda.is_available():
        return
    free, total = torch.cuda.mem_get_info()
    logger.info(
        "GPU memory [%s]: %.2f / %.2f GiB free",
        stage,
        free / (1024**3),
        total / (1024**3),
    )


def _resolve_load_in_4bit(model_id: str) -> bool:
    explicit = settings.verification_vlm_load_in_4bit
    if explicit is not None:
        return explicit
    if not torch.cuda.is_available():
        return False
    model_lower = model_id.lower()
    if "8b" not in model_lower and "32b" not in model_lower:
        return False
    total_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
    return total_gb < 20


def _prepare_gpu_for_verification_load() -> None:
    """Unload other models and reclaim VRAM before loading the verification VLM."""
    from .locate_anything import is_model_loaded, unload_model
    from .sam2_service import is_sam_loaded, unload_sam

    if is_model_loaded():
        logger.info("Unloading LocateAnything before verification VLM")
        unload_model()
    if is_sam_loaded():
        logger.info("Unloading SAM2 before verification VLM")
        unload_sam()

    gpu_mem = get_memory_manager()
    gpu_mem.full_cleanup()
    _log_gpu_memory("after unload")


class Qwen3VLVerifier(CropVerifier):
    def __init__(self, model_id: str, device: str):
        from transformers import AutoProcessor, Qwen3VLForConditionalGeneration

        self.model_id = model_id
        gpu_mem = get_memory_manager()
        attn_impl = gpu_mem.resolve_attn_impl()
        load_in_4bit = _resolve_load_in_4bit(model_id)

        logger.info(
            "Loading verification VLM %s (%s)...",
            model_id,
            "4-bit" if load_in_4bit else "bf16",
        )

        self.processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)

        load_kwargs: dict = {
            "trust_remote_code": True,
            "attn_implementation": attn_impl,
            "low_cpu_mem_usage": True,
        }

        if load_in_4bit and device != "cpu":
            try:
                import bitsandbytes  # noqa: F401
                from transformers import BitsAndBytesConfig
            except ImportError as exc:
                raise RuntimeError(
                    "Qwen3-VL-8B requires 4-bit loading on GPUs under 20GB. "
                    "Install bitsandbytes in the backend venv: "
                    "pip install 'bitsandbytes>=0.45.0'"
                ) from exc

            load_kwargs["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_use_double_quant=True,
                bnb_4bit_quant_type="nf4",
            )
            load_kwargs["device_map"] = "auto"
        elif device != "cpu":
            load_kwargs["dtype"] = torch.bfloat16
            load_kwargs["device_map"] = device
        else:
            load_kwargs["dtype"] = torch.float32

        self.model = Qwen3VLForConditionalGeneration.from_pretrained(model_id, **load_kwargs)
        self.model.eval()
        self.device = (
            next(self.model.parameters()).device
            if device != "cpu"
            else torch.device("cpu")
        )
        logger.info("Verification VLM ready: %s on %s", model_id, self.device)
        _log_gpu_memory("verification loaded")

    @torch.inference_mode()
    def verify_crop(self, image: Image.Image, class_name: str) -> bool:
        prompt = f'Does this image contain "{class_name}"? Answer only yes or no.'
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": prompt},
                ],
            }
        ]
        inputs = self.processor.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_dict=True,
            return_tensors="pt",
        )
        inputs.pop("token_type_ids", None)
        inputs = {
            k: v.to(self.device) if hasattr(v, "to") else v for k, v in inputs.items()
        }

        generated = self.model.generate(**inputs, max_new_tokens=32, do_sample=False)
        input_len = inputs["input_ids"].shape[1]
        trimmed = generated[0][input_len:]
        text = self.processor.decode(trimmed, skip_special_tokens=True)

        del inputs, generated
        get_memory_manager().full_cleanup()

        return parse_verification_answer(text)


def _bump_activity():
    global _last_activity
    with _lock:
        _last_activity = time.monotonic()


def _watchdog_loop():
    while _watchdog_stop is not None and not _watchdog_stop.is_set():
        _watchdog_stop.wait(timeout=30)
        if _watchdog_stop is None or _watchdog_stop.is_set():
            break
        with _lock:
            idle = time.monotonic() - _last_activity
        if idle >= settings.model_idle_timeout_seconds:
            logger.info("Verification VLM idle for %.0fs, unloading...", idle)
            unload_verification_model()
            break


def _start_watchdog():
    global _watchdog_thread, _watchdog_stop
    if _watchdog_thread is not None and _watchdog_thread.is_alive():
        return
    _watchdog_stop = threading.Event()
    _watchdog_thread = threading.Thread(
        target=_watchdog_loop, daemon=True, name="verification-vlm-watchdog"
    )
    _watchdog_thread.start()


def _stop_watchdog():
    global _watchdog_thread, _watchdog_stop
    if _watchdog_stop is not None:
        _watchdog_stop.set()
    _watchdog_thread = None
    _watchdog_stop = None


def _load_worker_sync(model_id: str, device: str):
    global _worker
    try:
        with _state_lock:
            _verification_state["state"] = VerificationState.LOADING
            _verification_state["error"] = ""
        _prepare_gpu_for_verification_load()
        _worker = Qwen3VLVerifier(model_id, device)
        with _state_lock:
            _verification_state["state"] = VerificationState.LOADED
            _verification_state["model_id"] = model_id
            _verification_state["error"] = ""
        _bump_activity()
        _start_watchdog()
    except Exception as exc:
        logger.exception("Verification VLM loading failed")
        _worker = None
        with _state_lock:
            _verification_state["state"] = VerificationState.ERROR
            _verification_state["error"] = str(exc)
        get_memory_manager().full_cleanup()
    finally:
        _load_complete.set()


def _get_qwen_worker() -> Qwen3VLVerifier:
    global _worker
    if _worker is not None:
        return _worker

    model_id = settings.verification_vlm_model_id
    device = settings.resolved_device
    with _state_lock:
        if _verification_state["state"] == VerificationState.LOADING:
            pass
        else:
            _verification_state["state"] = VerificationState.LOADING

    _load_complete.clear()
    thread = threading.Thread(
        target=_load_worker_sync,
        args=(model_id, device),
        daemon=True,
        name="verification-vlm-loader",
    )
    thread.start()
    _load_complete.wait()

    if _worker is None:
        with _state_lock:
            err = _verification_state["error"]
        raise RuntimeError(err or "Verification VLM loading failed")
    return _worker


def get_verification_status() -> dict:
    with _state_lock:
        return dict(_verification_state)


def is_verification_model_loaded() -> bool:
    with _state_lock:
        return _verification_state["state"] == VerificationState.LOADED


def unload_verification_model() -> None:
    global _worker
    _stop_watchdog()
    if _worker is not None:
        del _worker.model
        del _worker.processor
        _worker = None
    gc.collect()
    get_memory_manager().full_cleanup()
    with _state_lock:
        _verification_state["state"] = VerificationState.UNLOADED
        _verification_state["model_id"] = ""
        _verification_state["error"] = ""
    logger.info("Verification VLM unloaded")


def run_crop_verification(
    img: Image.Image,
    boxes: list[dict],
    backend: VerificationBackend,
) -> list[dict]:
    """Run crop verification with the selected backend."""
    from .crop_verify import filter_boxes_by_crop_verification
    from .locate_anything import _get_worker

    if not boxes:
        return boxes

    _bump_activity()

    if backend == "qwen3_vl":
        verifier = _get_qwen_worker()
        try:
            return filter_boxes_by_crop_verification(verifier, img, boxes)
        finally:
            unload_verification_model()
    if backend == "locate_anything":
        verifier = _get_worker()
        return filter_boxes_by_crop_verification(verifier, img, boxes)

    raise ValueError(f"Unknown verification backend: {backend}")
