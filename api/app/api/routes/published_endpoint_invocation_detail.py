from collections import Counter

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
from app.models.run import NodeRun, Run, RunCallbackTicket, RunEvent
from app.models.workflow import Workflow, WorkflowPublishedApiKey, WorkflowPublishedEndpoint
from app.schemas.run_views import RunCallbackTicketItem
from app.schemas.workflow_publish import (
    PublishedEndpointInvocationApiKeyUsageItem,
    PublishedEndpointInvocationCacheReference,
    PublishedEndpointInvocationDetailResponse,
    PublishedEndpointInvocationRunReference,
    PublishedEndpointInvocationSkillTrace,
    PublishedEndpointInvocationSkillTraceNodeItem,
)
from app.services.published_cache import PublishedEndpointCacheService
from app.services.published_invocation_detail_access import (
    PublishedInvocationDetailAccessService,
)
from app.services.published_invocations import PublishedInvocationService
from app.services.run_execution_focus_explanations import (
    build_run_execution_focus_explanation,
)
from app.services.run_execution_views import (
    resolve_execution_focus_node,
    summarize_skill_reference_loads,
)
from app.services.run_views import RunViewService
from app.services.runtime_records import ExecutionArtifacts
from app.services.sensitive_access_presenters import (
    serialize_sensitive_access_timeline_entry,
)
from app.services.sensitive_access_timeline import load_sensitive_access_timeline

router = APIRouter(prefix="/workflows", tags=["published-endpoint-activity"])
published_invocation_service = PublishedInvocationService()
published_cache_service = PublishedEndpointCacheService()
published_invocation_detail_access_service = PublishedInvocationDetailAccessService()
run_view_service = RunViewService()


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
) -> list:
    if not blocking_node_run_id:
        return []
    return [
        serialize_sensitive_access_timeline_entry(bundle)
        for bundle in sensitive_access_timeline.by_node_run.get(blocking_node_run_id, [])
    ]


def _count_skill_references(loads) -> int:
    return sum(len(load.references) for load in loads)


def _summarize_skill_reference_sources(loads) -> dict[str, int]:
    source_counts: Counter[str] = Counter()
    for load in loads:
        for reference in load.references:
            source = reference.load_source or "unknown"
            source_counts[source] += 1
    return dict(sorted(source_counts.items()))


def _summarize_skill_reference_phases(loads) -> dict[str, int]:
    phase_counts: Counter[str] = Counter()
    for load in loads:
        if load.references:
            phase_counts[load.phase] += len(load.references)
    return dict(sorted(phase_counts.items()))


def _serialize_skill_trace_node(
    *,
    node_run_id: str,
    node_run: NodeRun | None,
    loads,
) -> PublishedEndpointInvocationSkillTraceNodeItem:
    return PublishedEndpointInvocationSkillTraceNodeItem(
        node_run_id=node_run_id,
        node_id=(node_run.node_id if node_run is not None else None),
        node_name=(node_run.node_name if node_run is not None else None),
        reference_count=_count_skill_references(loads),
        loads=list(loads),
    )


def _build_skill_trace(
    *,
    run: Run | None,
    node_runs: list[NodeRun],
    events: list[RunEvent],
    execution_focus_node_run_id: str | None,
) -> PublishedEndpointInvocationSkillTrace | None:
    if run is None or not node_runs or not events:
        return None

    summary = summarize_skill_reference_loads(
        ExecutionArtifacts(
            run=run,
            node_runs=node_runs,
            events=events,
        )
    )
    if summary.reference_count <= 0:
        return None

    node_run_lookup = {node_run.id: node_run for node_run in node_runs}
    if (
        execution_focus_node_run_id
        and execution_focus_node_run_id in summary.by_node_run
    ):
        scoped_loads = summary.by_node_run[execution_focus_node_run_id]
        return PublishedEndpointInvocationSkillTrace(
            scope="execution_focus_node",
            reference_count=_count_skill_references(scoped_loads),
            phase_counts=_summarize_skill_reference_phases(scoped_loads),
            source_counts=_summarize_skill_reference_sources(scoped_loads),
            nodes=[
                _serialize_skill_trace_node(
                    node_run_id=execution_focus_node_run_id,
                    node_run=node_run_lookup.get(execution_focus_node_run_id),
                    loads=scoped_loads,
                )
            ],
        )

    node_ids = [node_run.id for node_run in node_runs if node_run.id in summary.by_node_run]
    return PublishedEndpointInvocationSkillTrace(
        scope="run",
        reference_count=summary.reference_count,
        phase_counts=summary.phase_counts,
        source_counts=summary.source_counts,
        nodes=[
            _serialize_skill_trace_node(
                node_run_id=node_run_id,
                node_run=node_run_lookup.get(node_run_id),
                loads=summary.by_node_run[node_run_id],
            )
            for node_run_id in node_ids
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
    run_events: list[RunEvent] = []
    callback_ticket_items = []
    sensitive_access_entries = []
    blocking_sensitive_access_entries = []
    skill_trace = None
    blocking_node_run_id = None
    execution_focus_reason = None
    execution_focus_node = None
    execution_focus_explanation = None
    if record.run_id:
        node_runs = (
            db.scalars(select(NodeRun).where(NodeRun.run_id == record.run_id)).all()
            if run is not None
            else []
        )
        run_events = (
            db.scalars(
                select(RunEvent)
                .where(RunEvent.run_id == record.run_id)
                .order_by(RunEvent.id.asc())
            ).all()
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
            sensitive_access_entries = [
                serialize_sensitive_access_timeline_entry(bundle)
                for bundle in sensitive_access_timeline.bundles
            ]
            execution_view = run_view_service.get_execution_view(db, record.run_id)
            if execution_view is not None:
                blocking_node_run_id = (
                    blocking_node_run_id or execution_view.blocking_node_run_id
                )
                execution_focus_node, execution_focus_reason = resolve_execution_focus_node(
                    execution_nodes=execution_view.nodes,
                    blocking_node_run_id=blocking_node_run_id,
                    current_node_id=run.current_node_id,
                )
                if (
                    blocking_node_run_id is None
                    and execution_focus_reason == "blocked_execution"
                    and execution_focus_node is not None
                    and execution_focus_node.sensitive_access_entries
                ):
                    blocking_node_run_id = execution_focus_node.node_run_id
                execution_focus_explanation = build_run_execution_focus_explanation(
                    execution_focus_node
                )
            blocking_sensitive_access_entries = (
                _serialize_blocking_sensitive_access_entries(
                    blocking_node_run_id=blocking_node_run_id,
                    sensitive_access_timeline=sensitive_access_timeline,
                )
            )
            skill_trace = _build_skill_trace(
                run=run,
                node_runs=node_runs,
                events=run_events,
                execution_focus_node_run_id=(
                    execution_focus_node.node_run_id
                    if execution_focus_node is not None
                    else None
                ),
            )

    invocation = serialize_published_invocation_item(
        record,
        request_surface=published_invocation_service.resolve_request_surface(record),
        api_key_lookup=api_key_lookup,
        run_lookup=run_lookup,
        waiting_reason_lookup=waiting_reason_lookup,
        waiting_lifecycle_lookup=waiting_lifecycle_lookup,
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
        callback_tickets=callback_ticket_items,
        blocking_node_run_id=blocking_node_run_id,
        execution_focus_reason=execution_focus_reason,
        execution_focus_node=execution_focus_node,
        execution_focus_explanation=execution_focus_explanation,
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
