from __future__ import annotations

from collections.abc import Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import NodeRun


def normalize_sensitive_access_run_id(value: object | None) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def load_run_ids_by_node_run_id(
    db: Session,
    node_run_ids: Iterable[object | None],
) -> dict[str, str]:
    normalized_node_run_ids = {
        node_run_id
        for node_run_id in (
            normalize_sensitive_access_run_id(value) for value in node_run_ids
        )
        if node_run_id
    }
    if not normalized_node_run_ids:
        return {}

    return {
        node_run_id: run_id
        for node_run_id, run_id in db.execute(
            select(NodeRun.id, NodeRun.run_id).where(NodeRun.id.in_(normalized_node_run_ids))
        ).all()
        if run_id
    }


def resolve_sensitive_access_run_id(
    *,
    run_id: object | None,
    node_run_id: object | None = None,
    run_ids_by_node_run_id: dict[str, str] | None = None,
) -> str | None:
    normalized_run_id = normalize_sensitive_access_run_id(run_id)
    if normalized_run_id:
        return normalized_run_id

    normalized_node_run_id = normalize_sensitive_access_run_id(node_run_id)
    if not normalized_node_run_id or run_ids_by_node_run_id is None:
        return None

    return normalize_sensitive_access_run_id(
        run_ids_by_node_run_id.get(normalized_node_run_id)
    )


def collect_sensitive_access_run_ids(
    db: Session,
    *,
    scopes: Sequence[tuple[object | None, object | None]],
    extra_run_ids: Iterable[object | None] = (),
) -> list[str]:
    run_ids_by_node_run_id = load_run_ids_by_node_run_id(
        db,
        (
            node_run_id
            for run_id, node_run_id in scopes
            if not normalize_sensitive_access_run_id(run_id)
        ),
    )

    resolved_run_ids: list[str] = []
    seen_run_ids: set[str] = set()

    def append_run_id(value: object | None) -> None:
        normalized = normalize_sensitive_access_run_id(value)
        if normalized and normalized not in seen_run_ids:
            seen_run_ids.add(normalized)
            resolved_run_ids.append(normalized)

    for run_id, node_run_id in scopes:
        append_run_id(
            resolve_sensitive_access_run_id(
                run_id=run_id,
                node_run_id=node_run_id,
                run_ids_by_node_run_id=run_ids_by_node_run_id,
            )
        )

    for run_id in extra_run_ids:
        append_run_id(run_id)

    return resolved_run_ids
