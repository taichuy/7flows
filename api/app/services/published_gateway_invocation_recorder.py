from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.workflow import WorkflowPublishedApiKey, WorkflowPublishedEndpoint
from app.services.published_invocation_types import PublishedInvocationRequestSource
from app.services.published_invocations import PublishedInvocationService


@dataclass
class PublishedGatewayInvocationContext:
    binding: WorkflowPublishedEndpoint
    request_source: PublishedInvocationRequestSource
    request_preview_payload: dict
    cache_status: str
    cache_key: str | None
    cache_entry_id: str | None
    request_surface_override: str | None
    authenticated_key: WorkflowPublishedApiKey | None
    started_at: datetime
    finished_at: datetime


@dataclass
class PublishedGatewayInvocationSuccess:
    response_preview_payload: dict
    run_id: str | None
    run_status: str | None
    error_message: str | None


class PublishedGatewayInvocationRecorder:
    def __init__(
        self,
        *,
        invocation_service: PublishedInvocationService | None = None,
    ) -> None:
        self._invocation_service = invocation_service or PublishedInvocationService()

    def record_rejection(
        self,
        db: Session,
        *,
        context: PublishedGatewayInvocationContext,
        error_message: str,
        status_code: int,
        run_id: str | None = None,
        run_status: str | None = None,
    ) -> None:
        self._invocation_service.record_invocation(
            db,
            binding=context.binding,
            request_source=context.request_source,
            input_payload=context.request_preview_payload,
            status="rejected" if status_code < 500 else "failed",
            cache_status=context.cache_status,
            cache_key=context.cache_key,
            cache_entry_id=context.cache_entry_id,
            request_surface_override=context.request_surface_override,
            api_key_id=(
                context.authenticated_key.id if context.authenticated_key is not None else None
            ),
            run_id=run_id,
            run_status=run_status,
            error_message=error_message,
            started_at=context.started_at,
            finished_at=context.finished_at,
        )

    def record_success(
        self,
        db: Session,
        *,
        context: PublishedGatewayInvocationContext,
        result: PublishedGatewayInvocationSuccess,
    ) -> None:
        self._invocation_service.record_invocation(
            db,
            binding=context.binding,
            request_source=context.request_source,
            input_payload=context.request_preview_payload,
            status="failed" if result.run_status == "failed" else "succeeded",
            cache_status=context.cache_status,
            cache_key=context.cache_key,
            cache_entry_id=context.cache_entry_id,
            request_surface_override=context.request_surface_override,
            api_key_id=(
                context.authenticated_key.id if context.authenticated_key is not None else None
            ),
            run_id=result.run_id,
            run_status=result.run_status,
            response_payload=result.response_preview_payload,
            error_message=result.error_message,
            started_at=context.started_at,
            finished_at=context.finished_at,
        )
