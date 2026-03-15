from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.sensitive_access import service as sensitive_access_route_service
from app.models.run import NodeRun, Run, RunCallbackTicket
from app.models.sensitive_access import (
    ApprovalTicketRecord,
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)
from app.models.workflow import (
    WorkflowPublishedCacheEntry,
    WorkflowPublishedEndpoint,
)
from app.services.published_invocations import PublishedInvocationService
from app.services.run_resume_scheduler import RunResumeScheduler
from tests.workflow_publish_helpers import publishable_definition


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
        label=f"Published invocation sensitive resource {sensitivity_level}",
        description="Seeded sensitive resource for published invocation detail tests.",
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
            reason_code="seeded_sensitive_publish_invocation_access",
            created_at=now,
            decided_at=now,
        )
    )
    sqlite_session.commit()
    return resource


def _create_published_invocation_fixture(
    client: TestClient,
    sqlite_session: Session,
) -> tuple[str, dict, Run, NodeRun, object]:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Publish Invocation Sensitive Detail Workflow",
            "definition": publishable_definition(
                cache={
                    "ttl": 300,
                    "maxEntries": 8,
                    "varyBy": ["question"],
                }
            ),
        },
    )
    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    bindings_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert bindings_response.status_code == 200
    binding = bindings_response.json()[0]

    binding_record = sqlite_session.get(WorkflowPublishedEndpoint, binding["id"])
    assert binding_record is not None

    now = datetime.now(UTC)
    run = Run(
        id=f"run-publish-sensitive-{uuid4()}",
        workflow_id=workflow_id,
        workflow_version=binding_record.workflow_version,
        compiled_blueprint_id=binding_record.compiled_blueprint_id,
        status="waiting",
        input_payload={"question": "hello"},
        checkpoint_payload={},
        current_node_id="tool_wait",
        started_at=now,
        created_at=now,
    )
    node_run = NodeRun(
        id=f"node-run-publish-sensitive-{uuid4()}",
        run_id=run.id,
        node_id="tool_wait",
        node_name="Tool Wait",
        node_type="tool",
        status="waiting",
        phase="waiting_callback",
        retry_count=0,
        input_payload={"question": "hello"},
        output_payload=None,
        checkpoint_payload={
            "scheduled_resume": {
                "delay_seconds": 30,
                "reason": "callback pending",
                "source": "callback_ticket_monitor",
                "waiting_status": "waiting_callback",
            }
        },
        working_context={},
        evidence_context=None,
        artifact_refs=[],
        error_message=None,
        waiting_reason="callback pending",
        started_at=now,
        phase_started_at=now,
        finished_at=None,
        created_at=now,
    )
    callback_ticket = RunCallbackTicket(
        id=f"cb-publish-sensitive-{uuid4()}",
        run_id=run.id,
        node_run_id=node_run.id,
        tool_call_id=None,
        tool_id="native.search",
        tool_call_index=0,
        waiting_status="waiting_callback",
        status="pending",
        reason="callback pending",
        callback_payload={"token": "secret-review-token"},
        created_at=now,
        expires_at=now + timedelta(minutes=5),
    )
    cache_entry = WorkflowPublishedCacheEntry(
        id=f"cache-entry-publish-sensitive-{uuid4()}",
        workflow_id=workflow_id,
        binding_id=binding_record.id,
        endpoint_id=binding_record.endpoint_id,
        cache_key="cache-key-publish-sensitive-detail",
        response_payload={
            "binding_id": binding_record.id,
            "answer": "cached sensitive detail",
            "secret": "masked-later",
        },
        hit_count=2,
        last_hit_at=now,
        expires_at=now + timedelta(minutes=10),
        created_at=now,
        updated_at=now,
    )
    sqlite_session.add(run)
    sqlite_session.add(node_run)
    sqlite_session.add(callback_ticket)
    sqlite_session.add(cache_entry)

    invocation_service = PublishedInvocationService()
    invocation = invocation_service.record_invocation(
        sqlite_session,
        binding=binding_record,
        request_source="workflow",
        input_payload={"question": "hello"},
        status="succeeded",
        cache_status="hit",
        cache_key=cache_entry.cache_key,
        cache_entry_id=cache_entry.id,
        run_id=run.id,
        run_status=run.status,
        response_payload={"answer": "cached sensitive detail", "secret": "masked-later"},
        started_at=now,
        finished_at=now,
    )
    sqlite_session.commit()
    return workflow_id, binding, run, node_run, invocation


def test_get_published_invocation_detail_requires_approval_for_high_sensitive_runs(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        sensitive_access_route_service,
        "_resume_scheduler",
        RunResumeScheduler(dispatcher=lambda _request: None),
    )
    workflow_id, binding, run, node_run, invocation = _create_published_invocation_fixture(
        client,
        sqlite_session,
    )
    _seed_run_sensitive_access(
        sqlite_session,
        run_id=run.id,
        node_run_id=node_run.id,
        sensitivity_level="L3",
    )

    detail_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/{invocation.id}",
        params={"requester_id": "ops-reviewer"},
    )

    assert detail_response.status_code == 409
    detail_body = detail_response.json()
    assert detail_body["detail"] == (
        "Published invocation detail requires approval before the payload can be viewed."
    )
    assert detail_body["resource"]["source"] == "workspace_resource"
    assert detail_body["resource"]["sensitivity_level"] == "L3"
    assert detail_body["resource"]["metadata"]["resource_kind"] == "published_invocation_detail"
    assert detail_body["resource"]["metadata"]["invocation_id"] == invocation.id
    assert detail_body["resource"]["metadata"]["run_id"] == run.id
    assert detail_body["access_request"]["action_type"] == "read"
    assert detail_body["access_request"]["decision"] == "require_approval"
    assert detail_body["access_request"]["requester_id"] == "ops-reviewer"
    assert detail_body["approval_ticket"]["status"] == "pending"
    assert detail_body["notifications"][0]["target"] == "sensitive-access-inbox"

    access_request_records = sqlite_session.scalars(
        select(SensitiveAccessRequestRecord).where(
            SensitiveAccessRequestRecord.run_id == run.id,
            SensitiveAccessRequestRecord.requester_type == "human",
            SensitiveAccessRequestRecord.action_type == "read",
        )
    ).all()
    assert len(access_request_records) == 1

    approval_response = client.post(
        f"/api/sensitive-access/approval-tickets/{detail_body['approval_ticket']['id']}/decision",
        json={"status": "approved", "approved_by": "ops-manager"},
    )
    assert approval_response.status_code == 200

    approved_detail_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/{invocation.id}",
        params={"requester_id": "ops-reviewer"},
    )

    assert approved_detail_response.status_code == 200
    approved_body = approved_detail_response.json()
    assert approved_body["invocation"]["id"] == invocation.id
    assert approved_body["invocation"]["run_id"] == run.id
    assert approved_body["callback_tickets"][0]["callback_payload"] == {
        "token": "secret-review-token"
    }

    approval_ticket = sqlite_session.get(
        ApprovalTicketRecord,
        detail_body["approval_ticket"]["id"],
    )
    assert approval_ticket is not None
    assert approval_ticket.status == "approved"


def test_get_published_invocation_detail_allows_moderate_sensitive_runs_without_ticket(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow_id, binding, run, node_run, invocation = _create_published_invocation_fixture(
        client,
        sqlite_session,
    )
    _seed_run_sensitive_access(
        sqlite_session,
        run_id=run.id,
        node_run_id=node_run.id,
        sensitivity_level="L2",
    )

    detail_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/{invocation.id}",
        params={"requester_id": "human-reviewer"},
    )

    assert detail_response.status_code == 200
    detail_body = detail_response.json()
    assert detail_body["invocation"]["id"] == invocation.id
    assert detail_body["cache"]["inventory_entry"]["response_preview"]["sample"]["secret"] == (
        "masked-later"
    )

    access_request_record = sqlite_session.scalars(
        select(SensitiveAccessRequestRecord).where(
            SensitiveAccessRequestRecord.run_id == run.id,
            SensitiveAccessRequestRecord.requester_type == "human",
            SensitiveAccessRequestRecord.action_type == "read",
        )
    ).one()
    assert access_request_record.decision == "allow"
    assert access_request_record.reason_code == "allow_human_moderate_runtime_use"


def test_list_published_cache_inventory_requires_approval_for_high_sensitive_runs(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow_id, binding, run, node_run, _invocation = _create_published_invocation_fixture(
        client,
        sqlite_session,
    )
    _seed_run_sensitive_access(
        sqlite_session,
        run_id=run.id,
        node_run_id=node_run.id,
        sensitivity_level="L3",
    )

    inventory_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/cache-entries",
        params={"requester_id": "ops-reviewer"},
    )

    assert inventory_response.status_code == 409
    inventory_body = inventory_response.json()
    assert inventory_body["detail"] == (
        "Published cache inventory requires approval before the payload can be viewed."
    )
    assert inventory_body["resource"]["source"] == "workspace_resource"
    assert inventory_body["resource"]["sensitivity_level"] == "L3"
    assert inventory_body["resource"]["metadata"]["resource_kind"] == "published_cache_inventory"
    assert inventory_body["resource"]["metadata"]["binding_id"] == binding["id"]
    assert inventory_body["resource"]["metadata"]["run_ids"] == [run.id]
    assert inventory_body["access_request"]["requester_id"] == "ops-reviewer"
    assert inventory_body["access_request"]["decision"] == "require_approval"
    assert inventory_body["approval_ticket"]["status"] == "pending"

    approval_response = client.post(
        f"/api/sensitive-access/approval-tickets/{inventory_body['approval_ticket']['id']}/decision",
        json={"status": "approved", "approved_by": "ops-manager"},
    )
    assert approval_response.status_code == 200

    approved_inventory_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/cache-entries",
        params={"requester_id": "ops-reviewer"},
    )

    assert approved_inventory_response.status_code == 200
    approved_body = approved_inventory_response.json()
    assert approved_body["summary"]["enabled"] is True
    assert approved_body["summary"]["active_entry_count"] == 1
    assert approved_body["items"][0]["response_preview"]["sample"]["secret"] == "masked-later"


def test_list_published_cache_inventory_allows_moderate_sensitive_runs_without_ticket(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow_id, binding, run, node_run, _invocation = _create_published_invocation_fixture(
        client,
        sqlite_session,
    )
    _seed_run_sensitive_access(
        sqlite_session,
        run_id=run.id,
        node_run_id=node_run.id,
        sensitivity_level="L2",
    )

    inventory_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/cache-entries",
        params={"requester_id": "human-reviewer"},
    )

    assert inventory_response.status_code == 200
    inventory_body = inventory_response.json()
    assert inventory_body["summary"]["active_entry_count"] == 1
    assert inventory_body["items"][0]["response_preview"]["sample"]["secret"] == "masked-later"

    resource_record = sqlite_session.scalars(
        select(SensitiveResourceRecord).where(
            SensitiveResourceRecord.source == "workspace_resource"
        )
    ).all()
    inventory_resource = next(
        record
        for record in resource_record
        if (record.metadata_payload or {}).get("resource_kind") == "published_cache_inventory"
        and (record.metadata_payload or {}).get("binding_id") == binding["id"]
    )
    assert inventory_resource.metadata_payload["run_ids"] == [run.id]

    access_request_record = sqlite_session.scalars(
        select(SensitiveAccessRequestRecord).where(
            SensitiveAccessRequestRecord.requester_type == "human",
            SensitiveAccessRequestRecord.requester_id == "human-reviewer",
            SensitiveAccessRequestRecord.resource_id == inventory_resource.id,
            SensitiveAccessRequestRecord.action_type == "read",
        )
    ).one()
    assert access_request_record.run_id is None
    assert access_request_record.decision == "allow"
    assert access_request_record.reason_code == "allow_human_moderate_runtime_use"
