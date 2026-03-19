import json
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.api.routes.sensitive_access_http import build_sensitive_access_blocking_response
from app.models.run import NodeRun, Run
from app.models.sensitive_access import (
    ApprovalTicketRecord,
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)
from app.models.workflow import Workflow
from app.services.sensitive_access_types import SensitiveAccessRequestBundle


def test_build_sensitive_access_blocking_response_resolves_run_context_from_node_run_id(
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    run = Run(
        id="run-blocked-node-run-only",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        current_node_id="mock_tool",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-blocked-node-run-only",
        run_id=run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="tool",
        status="waiting_callback",
        phase="waiting_callback",
        input_payload={},
        checkpoint_payload={},
        working_context={},
        artifact_refs=[],
        waiting_reason="waiting approval",
        created_at=datetime.now(UTC),
    )
    resource = SensitiveResourceRecord(
        id="resource-blocked-node-run-only",
        label="Published production secret",
        sensitivity_level="L3",
        source="published_secret",
        metadata_payload={"endpoint_id": "pub-blocked-node-run-only"},
    )
    access_request = SensitiveAccessRequestRecord(
        id="request-blocked-node-run-only",
        run_id=None,
        node_run_id=node_run.id,
        requester_type="ai",
        requester_id="assistant-main",
        resource_id=resource.id,
        action_type="read",
        purpose_text="inspect published auth secret",
        decision="require_approval",
        reason_code="approval_required_high_sensitive_access",
        created_at=datetime.now(UTC),
    )
    approval_ticket = ApprovalTicketRecord(
        id="ticket-blocked-node-run-only",
        access_request_id=access_request.id,
        run_id=None,
        node_run_id=node_run.id,
        status="pending",
        waiting_status="waiting",
        expires_at=datetime.now(UTC) + timedelta(hours=1),
        created_at=datetime.now(UTC),
    )
    sqlite_session.add_all([run, node_run, resource, access_request, approval_ticket])
    sqlite_session.commit()

    response = build_sensitive_access_blocking_response(
        SensitiveAccessRequestBundle(
            resource=resource,
            access_request=access_request,
            approval_ticket=approval_ticket,
            notifications=[],
        ),
        db=sqlite_session,
        approval_detail="approval required",
        deny_detail="denied",
    )

    assert response is not None
    assert response.status_code == 409

    body = json.loads(response.body)
    assert body["access_request"]["run_id"] is None
    assert body["approval_ticket"]["run_id"] is None
    assert body["run_snapshot"] is not None
    assert body["run_snapshot"]["workflow_id"] == sample_workflow.id
    assert body["run_snapshot"]["execution_focus_node_run_id"] == node_run.id
    assert body["run_follow_up"] is not None
    assert body["run_follow_up"]["affected_run_count"] == 1
    assert body["run_follow_up"]["sampled_runs"][0]["run_id"] == run.id
