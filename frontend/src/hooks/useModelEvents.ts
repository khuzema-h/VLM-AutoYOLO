import { useSyncExternalStore } from "react";

interface VlmState {
  state: string;
  stage: string;
  progress: number;
  error: string;
}

interface Sam2State {
  state: string;
  stage: string;
  progress: number;
  error: string;
}

interface Sam3State {
  loaded: boolean;
  status: string;
}

interface ModelStates {
  vlm: VlmState;
  sam2: Sam2State;
  sam3: Sam3State;
}

const defaults: ModelStates = {
  vlm: { state: "unloaded", stage: "", progress: 0, error: "" },
  sam2: { state: "unloaded", stage: "", progress: 0, error: "" },
  sam3: { loaded: false, status: "unloaded" },
};

let cached: ModelStates = { ...defaults };
let subscribers: Array<() => void> = [];
let es: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function modelStatesEqual(a: ModelStates, b: ModelStates): boolean {
  return (
    a.vlm.state === b.vlm.state &&
    a.vlm.stage === b.vlm.stage &&
    a.vlm.progress === b.vlm.progress &&
    a.vlm.error === b.vlm.error &&
    a.sam2.state === b.sam2.state &&
    a.sam2.stage === b.sam2.stage &&
    a.sam2.progress === b.sam2.progress &&
    a.sam2.error === b.sam2.error &&
    a.sam3.loaded === b.sam3.loaded &&
    a.sam3.status === b.sam3.status
  );
}

function publish(next: ModelStates) {
  if (modelStatesEqual(cached, next)) return;
  cached = next;
  subscribers.forEach((fn) => fn());
}

function connect() {
  if (subscribers.length === 0) return;
  if (es) return;
  es = new EventSource(`${API_BASE}/model/events`);
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      publish({ ...defaults, ...data });
    } catch {
      /* ignore */
    }
  };
  es.onerror = () => {
    es?.close();
    es = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 5000);
  };
}

function subscribe(onStoreChange: () => void) {
  subscribers.push(onStoreChange);
  if (subscribers.length === 1) connect();
  return () => {
    subscribers = subscribers.filter((fn) => fn !== onStoreChange);
    if (subscribers.length === 0) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      es?.close();
      es = null;
    }
  };
}

function getSnapshot(): ModelStates {
  return cached;
}

/** Immediately mark a model as loading — SSE will correct it on next poll. */
export function optimisticModelLoading(model: "vlm" | "sam2" | "sam3") {
  const alreadyLoaded =
    model === "vlm"
      ? cached.vlm.state === "loaded"
      : model === "sam2"
        ? cached.sam2.state === "loaded"
        : cached.sam3.status === "loaded";
  if (alreadyLoaded) return;

  if (model === "vlm") {
    publish({ ...cached, vlm: { ...cached.vlm, state: "loading" } });
  } else if (model === "sam2") {
    publish({ ...cached, sam2: { ...cached.sam2, state: "loading" } });
  } else {
    publish({ ...cached, sam3: { ...cached.sam3, status: "loading" } });
  }
}

/** Immediately mark a model as unloaded — SSE will correct it on next poll. */
export function optimisticModelUnloaded(model: "vlm" | "sam2" | "sam3") {
  if (model === "vlm") {
    publish({ ...cached, vlm: { state: "unloaded", stage: "", progress: 0, error: "" } });
  } else if (model === "sam2") {
    publish({ ...cached, sam2: { state: "unloaded", stage: "", progress: 0, error: "" } });
  } else {
    publish({ ...cached, sam3: { loaded: false, status: "unloaded" } });
  }
}

export function useModelEvents(): ModelStates {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
