"""Published invocation audit orchestration helpers.

Keeps ``PublishedInvocationService`` focused on record querying while the
heavier summary, facet and timeline aggregation lives in smaller helpers.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.workflow import (
    WorkflowPublishedApiKey,
    WorkflowPublishedInvocation,
)
from app.services.published_invocation_audit_aggregation import (
    build_api_key_usage,
    build_binding_audit_facets,
    summarize_records,
    summarize_records_for_bindings,
)
from app.services.published_invocation_audit_timeline import (
    build_timeline,
    resolve_timeline_granularity,
)
from app.services.published_invocation_types import (
    REQUEST_SURFACE_ORDER,
    PublishedInvocationAudit,
    PublishedInvocationRequestSurface,
    PublishedInvocationSummary,
    classify_invocation_reason,
)


def _resolve_record_reason_code(
    record: WorkflowPublishedInvocation,
) -> str | None:
    return classify_invocation_reason(
        status=record.status,
        error_message=record.error_message,
        run_status=record.run_status,
    )


def _resolve_request_surface(
    record: WorkflowPublishedInvocation,
) -> PublishedInvocationRequestSurface:
    surface_hint = record.request_preview.get("surface_hint")
    if isinstance(surface_hint, str) and surface_hint in REQUEST_SURFACE_ORDER:
        return surface_hint

    if record.protocol == "native":
        if record.request_source == "workflow":
            return "native.workflow"
        if record.request_source == "alias":
            return "native.alias"
        if record.request_source == "path":
            return "native.path"
        return "unknown"

    request_keys = set(record.request_preview.get("keys") or [])
    if record.protocol == "openai":
        if "messages" in request_keys:
            return "openai.chat.completions"
        if "input" in request_keys:
            return "openai.responses"
        return "openai.unknown"

    if record.protocol == "anthropic":
        return "anthropic.messages"

    return "unknown"


# ---------------------------------------------------------------------------
# Mixin
# ---------------------------------------------------------------------------


class PublishedInvocationAuditMixin:
    """Audit aggregation for ``PublishedInvocationService``.

    Expects the host class to provide ``_list_binding_records`` and
    ``_as_utc``.
    """

    # Stubs – provided by host class
    def _list_binding_records(self, db, **kwargs):  # pragma: no cover
        raise NotImplementedError

    def resolve_request_surface(
        self,
        record: WorkflowPublishedInvocation,
    ) -> PublishedInvocationRequestSurface:
        return _resolve_request_surface(record)

    def build_binding_audit(
        self,
        db: Session,
        *,
        workflow_id: str,
        binding_id: str,
        status: str | None = None,
        request_source: str | None = None,
        request_surface: str | None = None,
        cache_status: str | None = None,
        run_status: str | None = None,
        api_key_id: str | None = None,
        reason_code: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
    ) -> PublishedInvocationAudit:
        records = self._list_binding_records(
            db,
            workflow_id=workflow_id,
            binding_id=binding_id,
            status=status,
            request_source=request_source,
            request_surface=request_surface,
            cache_status=cache_status,
            run_status=run_status,
            api_key_id=api_key_id,
            reason_code=reason_code,
            created_from=created_from,
            created_to=created_to,
        )
        summary = summarize_records(records)
        facets = build_binding_audit_facets(
            records,
            resolve_request_surface=_resolve_request_surface,
            resolve_reason_code=_resolve_record_reason_code,
        )

        api_key_lookup: dict[str, WorkflowPublishedApiKey] = {}
        if facets.api_key_buckets:
            api_key_records = db.scalars(
                select(WorkflowPublishedApiKey).where(
                    WorkflowPublishedApiKey.id.in_(list(facets.api_key_buckets.keys()))
                )
            ).all()
            api_key_lookup = {record.id: record for record in api_key_records}

        api_key_usage = build_api_key_usage(
            facets.api_key_buckets,
            api_key_lookup=api_key_lookup,
        )
        timeline_granularity = resolve_timeline_granularity(
            created_from=created_from,
            created_to=created_to,
            records=records,
        )

        return PublishedInvocationAudit(
            summary=summary,
            status_counts=facets.status_counts,
            request_source_counts=facets.request_source_counts,
            request_surface_counts=facets.request_surface_counts,
            cache_status_counts=facets.cache_status_counts,
            run_status_counts=facets.run_status_counts,
            reason_counts=facets.reason_counts,
            api_key_usage=api_key_usage,
            recent_failure_reasons=facets.recent_failure_reasons,
            timeline_granularity=timeline_granularity,
            timeline=build_timeline(
                records,
                granularity=timeline_granularity,
                api_key_lookup=api_key_lookup,
                resolve_request_surface=_resolve_request_surface,
                resolve_reason_code=_resolve_record_reason_code,
            ),
        )

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

        return summarize_records_for_bindings(records)
