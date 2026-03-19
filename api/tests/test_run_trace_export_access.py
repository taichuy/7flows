from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.sensitive_access import service as sensitive_access_route_service
from app.models.sensitive_access import (
    ApprovalTicketRecord,
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)
from app.models.workflow import Workflow
from app.services.run_resume_scheduler import RunResumeScheduler


def _seed_run_sensitive_access(
    sqlite_session: Session,
    *,
    run_id: str,
    node_run_id: str,
    sensitivity_level: str,
) -> SensitiveResourceRecord:
    now = datetime.now(UTC)
    resource = SensitiveResourceRecord(
        id=str(uuid4()),
        label=f"Run sensitive resource {sensitivity_level}",
        description="Seeded sensitive resource for trace export tests.",
        sensitivity_level=sensitivity_level,
        source="workflow_context",
        metadata_payload={
            "run_id": run_id,
            "artifact_type": "json",
            "source_node_id": "mock_tool",
        },
        created_at=now,
        updated_at=now,
    )
    sqlite_session.add(resource)
    sqlite_session.add(
        SensitiveAccessRequestRecord(
            id=str(uuid4()),
            run_id=run_id,
            node_run_id=node_run_id,
            requester_type="workflow",
            requester_id="mock_tool",
            resource_id=resource.id,
            action_type="read",
            purpose_text="seed sensitive context access",
            decision="allow_masked" if sensitivity_level == "L2" else "allow",
            reason_code="seeded_sensitive_trace_access",
            created_at=now,
            decided_at=now,
        )
    )
    sqlite_session.commit()
    return resource


def test_export_run_trace_requires_approval_for_moderate_sensitive_runs(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        sensitive_access_route_service,
        "_resume_scheduler",
        RunResumeScheduler(dispatcher=lambda _request: None),
    )

    run_response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "export sensitive trace"}},
    )

    assert run_response.status_code == 201
    run_body = run_response.json()
    run_id = run_body["id"]
    node_run_id = run_body["node_runs"][1]["id"]
    _seed_run_sensitive_access(
        sqlite_session,
        run_id=run_id,
        node_run_id=node_run_id,
        sensitivity_level="L2",
    )

    export_response = client.get(
        f"/api/runs/{run_id}/trace/export",
        params={"format": "json", "requester_id": "ops-debugger"},
    )

    assert export_response.status_code == 409
    export_body = export_response.json()
    assert export_body["detail"] == (
        "Run trace export requires approval before the payload can be exported."
    )
    assert export_body["resource"]["source"] == "workspace_resource"
    assert export_body["resource"]["sensitivity_level"] == "L2"
    assert export_body["resource"]["metadata"]["resource_kind"] == "run_trace_export"
    assert export_body["resource"]["metadata"]["run_id"] == run_id
    assert export_body["access_request"]["action_type"] == "export"
    assert export_body["access_request"]["decision"] == "require_approval"
    assert export_body["access_request"]["requester_id"] == "ops-debugger"
    assert export_body["approval_ticket"]["status"] == "pending"
    assert export_body["approval_ticket"]["waiting_status"] == "waiting"
    assert export_body["notifications"][0]["target"] == "sensitive-access-inbox"
    assert export_body["outcome_explanation"]["primary_signal"]
    assert "审批" in export_body["outcome_explanation"]["follow_up"]
    assert export_body["run_snapshot"]["status"]
    assert export_body["run_follow_up"]["affected_run_count"] == 1
    assert export_body["run_follow_up"]["sampled_run_count"] == 1
    assert export_body["run_follow_up"]["explanation"]["primary_signal"]

    export_request_records = sqlite_session.scalars(
        select(SensitiveAccessRequestRecord).where(
            SensitiveAccessRequestRecord.run_id == run_id,
            SensitiveAccessRequestRecord.action_type == "export",
        )
    ).all()
    assert len(export_request_records) == 1

    export_resource = sqlite_session.get(
        SensitiveResourceRecord,
        export_request_records[0].resource_id,
    )
    assert export_resource is not None
    assert export_resource.source == "workspace_resource"
    assert export_resource.metadata_payload["resource_kind"] == "run_trace_export"

    approval_response = client.post(
        f"/api/sensitive-access/approval-tickets/{export_body['approval_ticket']['id']}/decision",
        json={"status": "approved", "approved_by": "ops-reviewer"},
    )

    assert approval_response.status_code == 200

    approved_export_response = client.get(
        f"/api/runs/{run_id}/trace/export",
        params={"format": "json", "requester_id": "ops-debugger"},
    )

    assert approved_export_response.status_code == 200
    assert approved_export_response.headers["content-type"].startswith("application/json")

    export_request_records_after = sqlite_session.scalars(
        select(SensitiveAccessRequestRecord).where(
            SensitiveAccessRequestRecord.run_id == run_id,
            SensitiveAccessRequestRecord.action_type == "export",
        )
    ).all()
    assert len(export_request_records_after) == 1
    approval_ticket = sqlite_session.get(
        ApprovalTicketRecord,
        export_body["approval_ticket"]["id"],
    )
    assert approval_ticket is not None
    assert approval_ticket.status == "approved"


def test_export_run_trace_allows_low_risk_sensitive_runs_without_ticket(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    run_response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "export low risk trace"}},
    )

    assert run_response.status_code == 201
    run_body = run_response.json()
    run_id = run_body["id"]
    node_run_id = run_body["node_runs"][1]["id"]
    _seed_run_sensitive_access(
        sqlite_session,
        run_id=run_id,
        node_run_id=node_run_id,
        sensitivity_level="L1",
    )

    export_response = client.get(
        f"/api/runs/{run_id}/trace/export",
        params={"format": "jsonl", "requester_id": "human-reviewer"},
    )

    assert export_response.status_code == 200
    assert export_response.headers["content-type"].startswith("application/x-ndjson")

    export_request_record = sqlite_session.scalars(
        select(SensitiveAccessRequestRecord).where(
            SensitiveAccessRequestRecord.run_id == run_id,
            SensitiveAccessRequestRecord.action_type == "export",
        )
    ).one()
    assert export_request_record.decision == "allow"
    assert export_request_record.reason_code == "allow_standard_low_risk"
