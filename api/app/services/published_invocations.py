from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.workflow import WorkflowPublishedEndpoint, WorkflowPublishedInvocation

PublishedInvocationRequestSource = Literal["workflow", "alias", "path"]
PublishedInvocationStatus = Literal["succeeded", "failed", "rejected"]


@dataclass(frozen=True)
class PublishedInvocationSummary:
    total_count: int = 0
    succeeded_count: int = 0
    failed_count: int = 0
    rejected_count: int = 0
    last_invoked_at: datetime | None = None
    last_status: PublishedInvocationStatus | None = None
    last_run_id: str | None = None
    last_run_status: str | None = None


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _build_payload_preview(payload: dict) -> dict:
    keys = sorted(payload.keys())
    preview: dict[str, object] = {
        "key_count": len(keys),
        "keys": keys[:10],
    }

    scalar_preview: dict[str, object] = {}
    for key in keys[:5]:
        value = payload.get(key)
        if value is None or isinstance(value, (bool, int, float)):
            scalar_preview[key] = value
            continue
        if isinstance(value, str):
            scalar_preview[key] = value[:120]
            continue
        if isinstance(value, list):
            scalar_preview[key] = {
                "type": "list",
                "length": len(value),
            }
            continue
        if isinstance(value, dict):
            nested_keys = sorted(value.keys())
            scalar_preview[key] = {
                "type": "object",
                "key_count": len(nested_keys),
                "keys": nested_keys[:5],
            }
            continue
        scalar_preview[key] = {"type": type(value).__name__}

    if scalar_preview:
        preview["sample"] = scalar_preview
    return preview


class PublishedInvocationService:
    def record_invocation(
        self,
        db: Session,
        *,
        binding: WorkflowPublishedEndpoint,
        request_source: PublishedInvocationRequestSource,
        input_payload: dict,
        status: PublishedInvocationStatus,
        api_key_id: str | None = None,
        run_id: str | None = None,
        run_status: str | None = None,
        response_payload: dict | None = None,
        error_message: str | None = None,
        started_at: datetime | None = None,
        finished_at: datetime | None = None,
    ) -> WorkflowPublishedInvocation:
        effective_started_at = started_at or _utcnow()
        effective_finished_at = finished_at or _utcnow()
        duration_ms = max(
            int((effective_finished_at - effective_started_at).total_seconds() * 1000),
            0,
        )
        record = WorkflowPublishedInvocation(
            id=str(uuid4()),
            workflow_id=binding.workflow_id,
            binding_id=binding.id,
            endpoint_id=binding.endpoint_id,
            endpoint_alias=binding.endpoint_alias,
            route_path=binding.route_path,
            protocol=binding.protocol,
            auth_mode=binding.auth_mode,
            request_source=request_source,
            status=status,
            api_key_id=api_key_id,
            run_id=run_id,
            run_status=run_status,
            error_message=error_message[:512] if error_message else None,
            request_preview=_build_payload_preview(input_payload),
            response_preview=(
                _build_payload_preview(response_payload)
                if isinstance(response_payload, dict)
                else response_payload
            ),
            duration_ms=duration_ms,
            created_at=effective_started_at,
            finished_at=effective_finished_at,
        )
        db.add(record)
        db.flush()
        return record

    def list_for_binding(
        self,
        db: Session,
        *,
        workflow_id: str,
        binding_id: str,
        limit: int = 20,
    ) -> list[WorkflowPublishedInvocation]:
        statement = (
            select(WorkflowPublishedInvocation)
            .where(
                WorkflowPublishedInvocation.workflow_id == workflow_id,
                WorkflowPublishedInvocation.binding_id == binding_id,
            )
            .order_by(
                WorkflowPublishedInvocation.created_at.desc(),
                WorkflowPublishedInvocation.id.desc(),
            )
            .limit(limit)
        )
        return db.scalars(statement).all()

    def summarize_for_bindings(
        self,
        db: Session,
        *,
        workflow_id: str,
        binding_ids: list[str],
    ) -> dict[str, PublishedInvocationSummary]:
        if not binding_ids:
            return {}

        records = db.scalars(
            select(WorkflowPublishedInvocation)
            .where(
                WorkflowPublishedInvocation.workflow_id == workflow_id,
                WorkflowPublishedInvocation.binding_id.in_(binding_ids),
            )
            .order_by(
                WorkflowPublishedInvocation.created_at.desc(),
                WorkflowPublishedInvocation.id.desc(),
            )
        ).all()

        summaries: dict[str, PublishedInvocationSummary] = {}
        counts: dict[str, dict[str, int]] = {}
        last_seen: set[str] = set()

        for record in records:
            bucket = counts.setdefault(
                record.binding_id,
                {
                    "total_count": 0,
                    "succeeded_count": 0,
                    "failed_count": 0,
                    "rejected_count": 0,
                },
            )
            bucket["total_count"] += 1
            bucket[f"{record.status}_count"] += 1

            if record.binding_id in last_seen:
                continue

            summaries[record.binding_id] = PublishedInvocationSummary(
                total_count=bucket["total_count"],
                succeeded_count=bucket["succeeded_count"],
                failed_count=bucket["failed_count"],
                rejected_count=bucket["rejected_count"],
                last_invoked_at=record.created_at,
                last_status=record.status,
                last_run_id=record.run_id,
                last_run_status=record.run_status,
            )
            last_seen.add(record.binding_id)

        for binding_id, bucket in counts.items():
            existing = summaries.get(binding_id)
            if existing is None:
                summaries[binding_id] = PublishedInvocationSummary(
                    total_count=bucket["total_count"],
                    succeeded_count=bucket["succeeded_count"],
                    failed_count=bucket["failed_count"],
                    rejected_count=bucket["rejected_count"],
                )
                continue
            summaries[binding_id] = PublishedInvocationSummary(
                total_count=bucket["total_count"],
                succeeded_count=bucket["succeeded_count"],
                failed_count=bucket["failed_count"],
                rejected_count=bucket["rejected_count"],
                last_invoked_at=existing.last_invoked_at,
                last_status=existing.last_status,
                last_run_id=existing.last_run_id,
                last_run_status=existing.last_run_status,
            )

        return summaries
