"""Regression: chunk import routes must not treat 'complete' as chunk index."""

from __future__ import annotations

from app.api.routes import import_dataset as import_routes


def test_complete_route_registered_before_chunk_index():
    paths = [getattr(r, "path", None) for r in import_routes.router.routes]
    complete_idx = paths.index("/datasets/import/chunk/{upload_id}/complete")
    chunk_idx = paths.index("/datasets/import/chunk/{upload_id}/{chunk_index}")
    assert complete_idx < chunk_idx
