from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.published_endpoint_invocation_support import (
    build_waiting_lifecycle_lookup,
    serialize_cache_inventory_item,
    serialize_callback_ticket_item,
    serialize_published_invocation_item,
)
from app.api.routes.sensitive_access_http import build_sensitive_access_blocking_response
from app.core.database import get_db
from app.models.run import NodeRun, Run, RunCallbackTicket
from app.models.workflow import Workflow, WorkflowPublishedApiKey, WorkflowPublishedEndpoint
from app.schemas.run_views import RunCallbackTicketItem, RunExecutionSkillTrace
from app.schemas.workflow_publish import (
    PublishedEndpointInvocationApiKeyUsageItem,
    PublishedEndpointInvocationCacheReference,
    PublishedEndpointInvocationDetailResponse,
    PublishedEndpointInvocationRunReference,
    PublishedEndpointInvocationSkillTrace,
    PublishedEndpointInvocationSkillTraceNodeItem,
)
from app.services.operator_run_follow_up import (
    build_operator_run_follow_up_summary,
    resolve_operator_run_snapshot_from_follow_up,
)
from app.services.published_cache import PublishedEndpointCacheService
from app.services.published_invocation_detail_access import (
    PublishedInvocationDetailAccessService,
)
from app.services.published_invocations import PublishedInvocationService
from app.services.run_views import RunViewService
from app.services.sensitive_access_presenters import (
    serialize_sensitive_access_timeline_entry,
)
from app.services.sensitive_access_timeline import load_sensitive_access_timeline
from app.services.workflow_publish import WorkflowPublishBindingService

router = APIRouter(prefix="/workflows", tags=["published-endpoint-activity"])
published_invocation_service = PublishedInvocationService()
published_cache_service = PublishedEndpointCacheService()
published_invocation_detail_access_service = PublishedInvocationDetailAccessService()
run_view_service = RunViewService()
workflow_publish_service = WorkflowPublishBindingService()


def _resolve_blocking_node_run_id(
    *,
    run_id: str | None,
    callback_ticket_items: list[RunCallbackTicketItem],
    waiting_lifecycle_lookup: dict,
) -> str | None:
    if run_id and (waiting_lifecycle := waiting_lifecycle_lookup.get(run_id)) is not None:
        return waiting_lifecycle.node_run_id
    for ticket in callback_ticket_items:
        if ticket.node_run_id:
            return ticket.node_run_id
    return None


def _serialize_blocking_sensitive_access_entries(
    *,
    blocking_node_run_id: str | None,
    sensitive_access_timeline,
    run_snapshot=None,
    run_follow_up=None,
) -> list:
    if not blocking_node_run_id:
        return []
    return [
        serialize_sensitive_access_timeline_entry(
            bundle,
            run_snapshot=run_snapshot,
            run_follow_up=run_follow_up,
        )
        for bundle in sensitive_access_timeline.by_node_run.get(blocking_node_run_id, [])
    ]


def _resolve_callback_waiting_explanation(
    *,
    execution_focus_node,
    waiting_lifecycle,
):
    if (
        execution_focus_node is not None
        and execution_focus_node.callback_waiting_explanation is not None
    ):
        return execution_focus_node.callback_waiting_explanation
    if waiting_lifecycle is not None:
        return waiting_lifecycle.callback_waiting_explanation
    return None


def _serialize_execution_view_skill_trace(
    skill_trace: RunExecutionSkillTrace | None,
) -> PublishedEndpointInvocationSkillTrace | None:
    if skill_trace is None:
        return None

    return PublishedEndpointInvocationSkillTrace(
        scope=skill_trace.scope,
        reference_count=skill_trace.reference_count,
        phase_counts=dict(skill_trace.phase_counts),
        source_counts=dict(skill_trace.source_counts),
        nodes=[
            PublishedEndpointInvocationSkillTraceNodeItem(
                node_run_id=node.node_run_id,
                node_id=node.node_id,
                node_name=node.node_name,
                reference_count=node.reference_count,
                loads=list(node.loads),
            )
            for node in skill_trace.nodes
        ],
    )


@router.get(
    "/{workflow_id}/published-endpoints/{binding_id}/invocations/{invocation_id}",
    response_model=PublishedEndpointInvocationDetailResponse,
)
def get_published_endpoint_invocation_detail(
    workflow_id: str,
    binding_id: str,
    invocation_id: str,
    requester_id: str = Query(default="publish-activity-detail", min_length=1, max_length=128),
    purpose_text: str | None = Query(default=None, min_length=1, max_length=512),
    db: Session = Depends(get_db),
) -> PublishedEndpointInvocationDetailResponse:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    binding = db.get(WorkflowPublishedEndpoint, binding_id)
    if binding is None or binding.workflow_id != workflow_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published endpoint binding not found.",
        )

    record = published_invocation_service.get_for_binding(
        db,
        workflow_id=workflow_id,
        binding_id=binding_id,
        invocation_id=invocation_id,
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published endpoint invocation not found.",
        )

    sensitive_access_response = build_sensitive_access_blocking_response(
        published_invocation_detail_access_service.ensure_access(
            db,
            invocation=record,
            requester_id=requester_id,
            purpose_text=purpose_text,
        ),
        db=db,
        approval_detail=(
            "Published invocation detail requires approval before the payload can be viewed."
        ),
        deny_detail="Published invocation detail is denied by the sensitive access policy.",
    )
    if sensitive_access_response is not None:
        return sensitive_access_response

    api_key_lookup: dict[str, PublishedEndpointInvocationApiKeyUsageItem] = {}
    if record.api_key_id:
        api_key = db.get(WorkflowPublishedApiKey, record.api_key_id)
        if api_key is not None:
            api_key_lookup[api_key.id] = PublishedEndpointInvocationApiKeyUsageItem(
                api_key_id=api_key.id,
                name=api_key.name,
                key_prefix=api_key.key_prefix,
                status=api_key.status,
            )

    run = db.get(Run, record.run_id) if record.run_id else None
    run_lookup = {run.id: run} if run is not None else {}
    waiting_reason_lookup: dict[str, str | None] = {}
    waiting_lifecycle_lookup = {}
    node_runs: list[NodeRun] = []
    callback_ticket_items = []
    sensitive_access_entries = []
    blocking_sensitive_access_entries = []
    skill_trace = None
    blocking_node_run_id = None
    execution_focus_reason = None
    execution_focus_node = None
    execution_focus_explanation = None
    run_follow_up = None
    timeline_run_snapshot = None
    if record.run_id:
        node_runs = (
            db.scalars(select(NodeRun).where(NodeRun.run_id == record.run_id)).all()
            if run is not None
            else []
        )
        callback_tickets = db.scalars(
            select(RunCallbackTicket)
            .where(RunCallbackTicket.run_id == record.run_id)
            .order_by(RunCallbackTicket.created_at.desc(), RunCallbackTicket.id.desc())
        ).all()
        callback_ticket_items = [
            serialize_callback_ticket_item(ticket) for ticket in callback_tickets
        ]
        if run is not None:
            sensitive_access_timeline = load_sensitive_access_timeline(
                db,
                run_id=record.run_id,
            )
            waiting_reason_lookup, waiting_lifecycle_lookup = build_waiting_lifecycle_lookup(
                run_lookup,
                node_runs,
                callback_tickets,
                {record.run_id: sensitive_access_timeline},
            )
            blocking_node_run_id = _resolve_blocking_node_run_id(
                run_id=record.run_id,
                callback_ticket_items=callback_ticket_items,
                waiting_lifecycle_lookup=waiting_lifecycle_lookup,
            )
            execution_view = run_view_service.get_execution_view(db, record.run_id)
            if execution_view is not None:
                blocking_node_run_id = (
                    blocking_node_run_id or execution_view.blocking_node_run_id
                )
                execution_focus_reason = execution_view.execution_focus_reason
                execution_focus_node = execution_view.execution_focus_node
                if (
                    blocking_node_run_id is None
                    and execution_focus_reason == "blocked_execution"
                    and execution_focus_node is not None
                    and execution_focus_node.sensitive_access_entries
                ):
                    blocking_node_run_id = execution_focus_node.node_run_id
                execution_focus_explanation = execution_view.execution_focus_explanation
                skill_trace = _serialize_execution_view_skill_trace(
                    execution_view.skill_trace
                )
                run_follow_up = execution_view.run_follow_up
                timeline_run_snapshot = execution_view.run_snapshot
            if run_follow_up is None:
                run_follow_up = build_operator_run_follow_up_summary(db, [record.run_id])
            if timeline_run_snapshot is None:
                timeline_run_snapshot = resolve_operator_run_snapshot_from_follow_up(
                    run_follow_up,
                    run_id=record.run_id,
                )
            sensitive_access_entries = [
                serialize_sensitive_access_timeline_entry(
                    bundle,
                    run_snapshot=timeline_run_snapshot,
                    run_follow_up=run_follow_up,
                )
                for bundle in sensitive_access_timeline.bundles
            ]
            blocking_sensitive_access_entries = (
                _serialize_blocking_sensitive_access_entries(
                    blocking_node_run_id=blocking_node_run_id,
                    sensitive_access_timeline=sensitive_access_timeline,
                    run_snapshot=timeline_run_snapshot,
                    run_follow_up=run_follow_up,
                )
            )

    invocation = serialize_published_invocation_item(
        record,
        request_surface=published_invocation_service.resolve_request_surface(record),
        api_key_lookup=api_key_lookup,
        run_lookup=run_lookup,
        waiting_reason_lookup=waiting_reason_lookup,
        waiting_lifecycle_lookup=waiting_lifecycle_lookup,
        run_snapshot_lookup=(
            {record.run_id: timeline_run_snapshot}
            if record.run_id and timeline_run_snapshot is not None
            else None
        ),
        run_follow_up_lookup=(
            {record.run_id: run_follow_up}
            if record.run_id and run_follow_up is not None
            else None
        ),
    )

    cache_inventory_item = None
    if record.cache_entry_id:
        cache_item = published_cache_service.get_inventory_item(
            db,
            binding=binding,
            cache_entry_id=record.cache_entry_id,
        )
        if cache_item is not None:
            cache_inventory_item = serialize_cache_inventory_item(cache_item)

    callback_waiting_explanation = _resolve_callback_waiting_explanation(
        execution_focus_node=execution_focus_node,
        waiting_lifecycle=(waiting_lifecycle_lookup.get(record.run_id) if record.run_id else None),
    )

    return PublishedEndpointInvocationDetailResponse(
        invocation=invocation,
        run=(
            PublishedEndpointInvocationRunReference(
                id=run.id,
                status=run.status,
                current_node_id=run.current_node_id,
                error_message=run.error_message,
                created_at=run.created_at,
                started_at=run.started_at,
                finished_at=run.finished_at,
            )
            if run is not None
            else None
        ),
        run_snapshot=timeline_run_snapshot,
        run_follow_up=run_follow_up,
        legacy_auth_governance=workflow_publish_service.build_legacy_auth_governance_snapshot(
            db,
            workflow_id=workflow_id,
        ),
        callback_tickets=callback_ticket_items,
        blocking_node_run_id=blocking_node_run_id,
        execution_focus_reason=execution_focus_reason,
        execution_focus_node=execution_focus_node,
        execution_focus_explanation=execution_focus_explanation,
        callback_waiting_explanation=callback_waiting_explanation,
        skill_trace=skill_trace,
        blocking_sensitive_access_entries=blocking_sensitive_access_entries,
        sensitive_access_entries=sensitive_access_entries,
        cache=PublishedEndpointInvocationCacheReference(
            cache_status=record.cache_status or "bypass",
            cache_key=record.cache_key,
            cache_entry_id=record.cache_entry_id,
            inventory_entry=cache_inventory_item,
        ),
    )
