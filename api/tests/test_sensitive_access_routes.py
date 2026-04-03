from copy import deepcopy
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch
from sqlalchemy.orm import Session

from app.api.routes import sensitive_access as sensitive_access_routes
from app.core.config import Settings
from app.models.run import NodeRun, Run
from app.models.sensitive_access import (
    ApprovalTicketRecord,
    NotificationDispatchRecord,
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)
from app.models.workflow import Workflow, WorkflowPublishedEndpoint
from app.services.notification_dispatch_scheduler import NotificationDispatchScheduler
from app.services.run_resume_scheduler import RunResumeScheduler
from app.services.sensitive_access_control import SensitiveAccessControlService
from tests.workflow_publish_helpers import (
    legacy_auth_governance_snapshot_for_single_published_blocker,
)

pytestmark = pytest.mark.usefixtures(
    "workspace_console_auth", "default_console_route_headers"
)


def _assert_single_run_follow_up(
    run_follow_up: dict,
    *,
    run_id: str,
    snapshot: dict,
    follow_up: str,
) -> dict:
    assert run_follow_up["affected_run_count"] == 1
    assert run_follow_up["sampled_run_count"] == 1
    assert run_follow_up["waiting_run_count"] == 1
    assert run_follow_up["running_run_count"] == 0
    assert run_follow_up["succeeded_run_count"] == 0
    assert run_follow_up["failed_run_count"] == 0
    assert run_follow_up["unknown_run_count"] == 0
    assert run_follow_up["explanation"] == {
        "primary_signal": "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
        "follow_up": follow_up,
    }

    sampled_runs = run_follow_up["sampled_runs"]
    assert len(sampled_runs) == 1
    sampled_run = sampled_runs[0]
    assert sampled_run["run_id"] == run_id
    assert sampled_run["snapshot"] == snapshot
    return sampled_run


def _assert_single_sensitive_access_focus_entry(
    sampled_run: dict,
    *,
    run_id: str,
    node_run_id: str,
    requester_id: str,
    resource_id: str,
    approval_ticket_id: str,
    approval_status: str,
    approval_waiting_status: str,
    notification_status_by_id: dict[str, str],
    request_decision: str | None = None,
    request_reason_code: str | None = None,
) -> None:
    assert sampled_run["callback_tickets"] == []

    entries = sampled_run["sensitive_access_entries"]
    assert len(entries) == 1
    entry = entries[0]

    assert entry["request"]["run_id"] == run_id
    assert entry["request"]["node_run_id"] == node_run_id
    assert entry["request"]["requester_id"] == requester_id
    assert entry["request"]["resource_id"] == resource_id
    if request_decision is not None:
        assert entry["request"]["decision"] == request_decision
    if request_reason_code is not None:
        assert entry["request"]["reason_code"] == request_reason_code

    assert entry["resource"]["id"] == resource_id
    assert entry["approval_ticket"] is not None
    assert entry["approval_ticket"]["id"] == approval_ticket_id
    assert entry["approval_ticket"]["status"] == approval_status
    assert entry["approval_ticket"]["waiting_status"] == approval_waiting_status
    assert {
        item["id"]: item["status"] for item in entry["notifications"]
    } == notification_status_by_id


def _normalize_sampled_run_legacy_auth_generated_at(run_follow_up: dict) -> dict:
    normalized = deepcopy(run_follow_up)
    for sampled_run in normalized.get("sampled_runs", []):
        governance = sampled_run.get("legacy_auth_governance")
        if isinstance(governance, dict) and governance.get("generated_at"):
            governance["generated_at"] = "<generated_at>"
        for entry in sampled_run.get("sensitive_access_entries", []):
            governance = entry.get("legacy_auth_governance")
            if isinstance(governance, dict) and governance.get("generated_at"):
                governance["generated_at"] = "<generated_at>"
    return normalized


def _seed_legacy_auth_binding(
    sqlite_session: Session,
    workflow: Workflow,
    *,
    binding_id: str,
    endpoint_id: str,
    endpoint_name: str,
    endpoint_alias: str,
    lifecycle_status: str = "published",
) -> None:
    sqlite_session.add(
        WorkflowPublishedEndpoint(
            id=binding_id,
            workflow_id=workflow.id,
            workflow_version_id=f"{binding_id}-workflow-version",
            workflow_version=workflow.version,
            target_workflow_version_id=f"{binding_id}-target-version",
            target_workflow_version=workflow.version,
            compiled_blueprint_id=f"{binding_id}-blueprint",
            endpoint_id=endpoint_id,
            endpoint_name=endpoint_name,
            endpoint_alias=endpoint_alias,
            route_path=f"/published/{endpoint_alias}",
            protocol="native",
            auth_mode="token",
            streaming=False,
            lifecycle_status=lifecycle_status,
            input_schema={},
            output_schema=None,
            rate_limit_policy=None,
            cache_policy=None,
            created_at=datetime(2026, 3, 24, 8, 0, tzinfo=UTC),
            updated_at=datetime(2026, 3, 24, 8, 0, tzinfo=UTC),
        )
    )


def _assert_legacy_auth_governance_snapshot(
    snapshot: dict,
    *,
    workflow: Workflow,
    binding_id: str,
    endpoint_id: str,
    endpoint_name: str,
) -> None:
    assert snapshot == legacy_auth_governance_snapshot_for_single_published_blocker(
        generated_at=snapshot["generated_at"],
        workflow_id=workflow.id,
        workflow_name=workflow.name,
        workflow_version=workflow.version,
        binding_id=binding_id,
        endpoint_id=endpoint_id,
        endpoint_name=endpoint_name,
    )


def test_create_sensitive_resource_and_list_it(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    create_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Primary credential",
            "description": "Payment provider credential",
            "sensitivity_level": "L2",
            "source": "credential",
            "metadata": {"credential_id": "cred-1"},
        },
    )

    assert create_response.status_code == 201
    create_body = create_response.json()
    assert create_body["label"] == "Primary credential"
    assert create_body["sensitivity_level"] == "L2"
    assert create_body["source"] == "credential"
    assert create_body["metadata"] == {"credential_id": "cred-1"}

    list_response = client.get(
        "/api/sensitive-access/resources",
        params={"sensitivity_level": "L2"},
    )

    assert list_response.status_code == 200
    list_body = list_response.json()
    assert len(list_body) == 1
    assert list_body[0]["id"] == create_body["id"]

    stored = sqlite_session.get(SensitiveResourceRecord, create_body["id"])
    assert stored is not None
    assert stored.metadata_payload == {"credential_id": "cred-1"}


def test_request_low_sensitivity_access_allows_without_ticket(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Template docs",
            "sensitivity_level": "L0",
            "source": "workspace_resource",
            "metadata": {"path": "/docs/template.md"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "requester_type": "workflow",
            "requester_id": "workflow-demo",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "hydrate starter prompt",
        },
    )

    assert request_response.status_code == 201
    body = request_response.json()
    assert body["request"]["decision"] == "allow"
    assert body["request"]["decision_label"] == "Allowed"
    assert body["request"]["reason_code"] == "allow_low_sensitivity"
    assert body["request"]["reason_label"] == "Low-sensitivity access allowed"
    assert (
        body["request"]["policy_summary"]
        == "Default policy allows low-sensitivity resources without extra review."
    )
    assert body["approval_ticket"] is None
    assert body["notifications"] == []
    assert body["outcome_explanation"] == {
        "primary_signal": "本次敏感访问已按策略放行，当前不需要额外审批。",
        "follow_up": "Default policy allows low-sensitivity resources without extra review.",
    }
    assert body["run_snapshot"] is None
    assert body["run_follow_up"] is None

    stored_requests = sqlite_session.query(SensitiveAccessRequestRecord).all()
    assert len(stored_requests) == 1
    assert stored_requests[0].decided_at is not None
    assert sqlite_session.query(ApprovalTicketRecord).count() == 0


def test_request_high_sensitivity_access_creates_approval_ticket_and_decision(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
    sample_workflow: Workflow,
) -> None:
    monkeypatch.setattr(
        sensitive_access_routes,
        "service",
        SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
            settings=Settings(),
        ),
    )

    run = Run(
        id="run-approval-success",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        current_node_id="mock_tool",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-approval-success",
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
    sqlite_session.add_all([run, node_run])
    _seed_legacy_auth_binding(
        sqlite_session,
        sample_workflow,
        binding_id="binding-approval-handoff",
        endpoint_id="endpoint-approval-handoff",
        endpoint_name="Approval Handoff Endpoint",
        endpoint_alias="approval-handoff-endpoint",
    )
    sqlite_session.commit()

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Published production secret",
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"endpoint_id": "pub-1"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "run_id": run.id,
            "node_run_id": node_run.id,
            "requester_type": "ai",
            "requester_id": "assistant-main",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "inspect published auth secret",
        },
    )

    assert request_response.status_code == 201
    request_body = request_response.json()
    approval_ticket = request_body["approval_ticket"]
    assert request_body["request"]["decision"] == "require_approval"
    assert request_body["request"]["decision_label"] == "Approval required"
    assert request_body["request"]["reason_code"] == "approval_required_high_sensitive_access"
    assert (
        request_body["request"]["reason_label"]
        == "High-sensitivity access requires approval"
    )
    assert (
        request_body["request"]["policy_summary"]
        == "High-sensitivity access must be reviewed by an operator before the workflow can resume."
    )
    assert approval_ticket is not None
    assert approval_ticket["status"] == "pending"
    assert approval_ticket["waiting_status"] == "waiting"
    assert approval_ticket["expires_at"] is not None
    assert request_body["notifications"] == [
        {
            "id": request_body["notifications"][0]["id"],
            "approval_ticket_id": approval_ticket["id"],
            "channel": "in_app",
            "target": "sensitive-access-inbox",
            "status": "delivered",
            "delivered_at": request_body["notifications"][0]["delivered_at"],
            "error": None,
            "created_at": request_body["notifications"][0]["created_at"],
        }
    ]
    assert request_body["outcome_explanation"] == {
        "primary_signal": "敏感访问请求仍在等待审批，对应 waiting 链路会继续保持 blocked。",
        "follow_up": (
            "High-sensitivity access must be reviewed by an operator before "
            "the workflow can resume. "
            "已有 1 条通知送达审批人，可直接在 inbox 里处理。 "
            "审批完成后再继续回看 run / inbox slice，确认 waiting 是否真正恢复。"
        ),
    }
    assert request_body["run_snapshot"] == {
        "workflow_id": sample_workflow.id,
        "status": "waiting",
        "current_node_id": "mock_tool",
        "waiting_reason": "waiting approval",
        "execution_focus_reason": "blocking_node_run",
        "execution_focus_node_id": "mock_tool",
        "execution_focus_node_run_id": node_run.id,
        "execution_focus_node_name": "Mock Tool",
        "execution_focus_node_type": "tool",
        "execution_focus_explanation": {
            "primary_signal": "等待原因：waiting approval",
            "follow_up": (
                "下一步：优先处理 Published production secret 对应的 sensitive access 审批票据，"
                "再观察 waiting 节点是否恢复。"
            ),
        },
        "callback_waiting_explanation": {
            "primary_signal": (
                "当前 callback waiting 仍卡在 1 条待处理审批；"
                "首要治理资源是 Published production secret。"
            ),
            "follow_up": (
                "下一步：先在当前 operator 入口完成 "
                "Published production secret 对应审批或拒绝，"
                "再观察 waiting 节点是否自动恢复。"
            ),
        },
        "callback_waiting_lifecycle": None,
        "scheduled_resume_delay_seconds": None,
        "scheduled_resume_reason": None,
        "scheduled_resume_source": None,
        "scheduled_waiting_status": None,
        "scheduled_resume_scheduled_at": None,
        "scheduled_resume_due_at": None,
        "scheduled_resume_requeued_at": None,
        "scheduled_resume_requeue_source": None,
        "execution_focus_artifact_count": 0,
        "execution_focus_artifact_ref_count": 0,
        "execution_focus_tool_call_count": 0,
        "execution_focus_raw_ref_count": 0,
        "execution_focus_artifact_refs": [],
        "execution_focus_artifacts": [],
        "execution_focus_tool_calls": [],
        "execution_focus_skill_trace": None,
    }
    sampled_run = _assert_single_run_follow_up(
        request_body["run_follow_up"],
        run_id=run.id,
        snapshot=request_body["run_snapshot"],
        follow_up=(
            f"run {run.id}：当前 run 状态：waiting。 当前节点：mock_tool。 "
            "重点信号：当前 callback waiting 仍卡在 1 条待处理审批；"
            "首要治理资源是 Published production secret。 后续动作："
            "下一步：先在当前 operator 入口完成 Published production secret 对应审批或拒绝，"
            "再观察 waiting 节点是否自动恢复。"
        ),
    )
    _assert_single_sensitive_access_focus_entry(
        sampled_run,
        run_id=run.id,
        node_run_id=node_run.id,
        requester_id="assistant-main",
        resource_id=resource_id,
        approval_ticket_id=approval_ticket["id"],
        approval_status="pending",
        approval_waiting_status="waiting",
        notification_status_by_id={request_body["notifications"][0]["id"]: "delivered"},
        request_decision="require_approval",
        request_reason_code="approval_required_high_sensitive_access",
    )

    decision_response = client.post(
        f"/api/sensitive-access/approval-tickets/{approval_ticket['id']}/decision",
        json={"status": "approved", "approved_by": "ops-reviewer"},
    )

    assert decision_response.status_code == 200
    decision_body = decision_response.json()
    assert decision_body["request"]["decision"] == "allow"
    assert decision_body["request"]["decision_label"] == "Allowed"
    assert decision_body["request"]["reason_code"] == "approved_after_review"
    assert decision_body["request"]["reason_label"] == "Access approved after review"
    assert (
        decision_body["request"]["policy_summary"]
        == "An operator approved the request and the blocked workflow can resume."
    )
    assert decision_body["approval_ticket"]["status"] == "approved"
    assert decision_body["approval_ticket"]["waiting_status"] == "resumed"
    assert decision_body["approval_ticket"]["approved_by"] == "ops-reviewer"
    assert len(decision_body["notifications"]) == 1
    assert decision_body["outcome_explanation"] == {
        "primary_signal": "审批已通过，对应 waiting 链路已交回 runtime 恢复。",
        "follow_up": (
            "An operator approved the request and the blocked workflow can resume. "
            "如果 run 仍停在 waiting，请继续检查 callback 到达情况或定时恢复链路。"
        ),
    }
    callback_delta = decision_body["callback_blocker_delta"]
    assert callback_delta["sampled_scope_count"] == 1
    assert callback_delta["changed_scope_count"] == 1
    assert callback_delta["cleared_scope_count"] == 1
    assert callback_delta["fully_cleared_scope_count"] == 1
    assert callback_delta["still_blocked_scope_count"] == 0
    assert callback_delta["summary"] == (
        "阻塞变化：已解除 approval pending。 "
        "阻塞变化：当前 callback summary 已没有显式 operator blocker。 "
        "建议动作已清空；下一步应结合最新 run 状态确认是否真正离开 waiting。"
    )
    assert decision_body["run_snapshot"] == {
        "workflow_id": sample_workflow.id,
        "status": "waiting",
        "current_node_id": "mock_tool",
        "waiting_reason": "waiting approval",
        "execution_focus_reason": "blocking_node_run",
        "execution_focus_node_id": "mock_tool",
        "execution_focus_node_run_id": node_run.id,
        "execution_focus_node_name": "Mock Tool",
        "execution_focus_node_type": "tool",
        "execution_focus_explanation": {
            "primary_signal": "等待原因：waiting approval",
            "follow_up": (
                "下一步：优先沿 waiting / callback 事实链排查，不要只盯单次 invocation 返回。"
            ),
        },
        "callback_waiting_explanation": None,
        "callback_waiting_lifecycle": None,
        "scheduled_resume_delay_seconds": None,
        "scheduled_resume_reason": None,
        "scheduled_resume_source": None,
        "scheduled_waiting_status": None,
        "scheduled_resume_scheduled_at": None,
        "scheduled_resume_due_at": None,
        "scheduled_resume_requeued_at": None,
        "scheduled_resume_requeue_source": None,
        "execution_focus_artifact_count": 0,
        "execution_focus_artifact_ref_count": 0,
        "execution_focus_tool_call_count": 0,
        "execution_focus_raw_ref_count": 0,
        "execution_focus_artifact_refs": [],
        "execution_focus_artifacts": [],
        "execution_focus_tool_calls": [],
        "execution_focus_skill_trace": None,
    }
    sampled_run = _assert_single_run_follow_up(
        decision_body["run_follow_up"],
        run_id=run.id,
        snapshot=decision_body["run_snapshot"],
        follow_up=(
            f"run {run.id}：当前 run 状态：waiting。 当前节点：mock_tool。 "
            "重点信号：等待原因：waiting approval 后续动作："
            "下一步：优先沿 waiting / callback 事实链排查，不要只盯单次 invocation 返回。"
        ),
    )
    _assert_single_sensitive_access_focus_entry(
        sampled_run,
        run_id=run.id,
        node_run_id=node_run.id,
        requester_id="assistant-main",
        resource_id=resource_id,
        approval_ticket_id=approval_ticket["id"],
        approval_status="approved",
        approval_waiting_status="resumed",
        notification_status_by_id={request_body["notifications"][0]["id"]: "delivered"},
        request_decision="allow",
        request_reason_code="approved_after_review",
    )
    assert callback_delta["primary_resource"] == sampled_run[
        "sensitive_access_entries"
    ][0]["resource"]
    _assert_legacy_auth_governance_snapshot(
        decision_body["legacy_auth_governance"],
        workflow=sample_workflow,
        binding_id="binding-approval-handoff",
        endpoint_id="endpoint-approval-handoff",
        endpoint_name="Approval Handoff Endpoint",
    )

    stored_request = sqlite_session.get(
        SensitiveAccessRequestRecord,
        request_body["request"]["id"],
    )
    stored_ticket = sqlite_session.get(ApprovalTicketRecord, approval_ticket["id"])
    stored_notifications = sqlite_session.query(NotificationDispatchRecord).all()
    assert stored_request is not None
    assert stored_ticket is not None
    assert stored_request.decision == "allow"
    assert stored_ticket.status == "approved"
    assert stored_ticket.waiting_status == "resumed"
    assert len(stored_notifications) == 1


def test_request_high_sensitivity_access_resolves_run_context_from_node_run_id(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
    sample_workflow: Workflow,
) -> None:
    monkeypatch.setattr(
        sensitive_access_routes,
        "service",
        SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
            settings=Settings(),
        ),
    )

    run = Run(
        id="run-approval-node-run-only",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        current_node_id="mock_tool",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-approval-node-run-only",
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
    sqlite_session.add_all([run, node_run])
    _seed_legacy_auth_binding(
        sqlite_session,
        sample_workflow,
        binding_id="binding-bulk-approval-handoff",
        endpoint_id="endpoint-bulk-approval-handoff",
        endpoint_name="Bulk Approval Handoff Endpoint",
        endpoint_alias="bulk-approval-handoff-endpoint",
    )
    sqlite_session.commit()

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Published production secret",
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"endpoint_id": "pub-node-run-only"},
        },
    )

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "node_run_id": node_run.id,
            "requester_type": "ai",
            "requester_id": "assistant-main",
            "resource_id": resource_response.json()["id"],
            "action_type": "read",
            "purpose_text": "inspect published auth secret",
        },
    )

    assert request_response.status_code == 201
    body = request_response.json()
    assert body["request"]["run_id"] is None
    assert body["approval_ticket"]["run_id"] is None
    assert body["run_snapshot"] is not None
    assert body["run_snapshot"]["workflow_id"] == sample_workflow.id
    assert body["run_snapshot"]["execution_focus_node_run_id"] == node_run.id
    assert body["run_follow_up"] is not None
    assert body["run_follow_up"]["affected_run_count"] == 1
    assert body["run_follow_up"]["sampled_runs"][0]["run_id"] == run.id


def test_decide_expired_approval_ticket_marks_ticket_expired_and_returns_error(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
    sample_workflow: Workflow,
) -> None:
    scheduled_resumes = []
    monkeypatch.setattr(
        sensitive_access_routes,
        "service",
        SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=scheduled_resumes.append),
            notification_dispatch_scheduler=NotificationDispatchScheduler(
                dispatcher=lambda _request: None
            ),
            settings=Settings(),
        ),
    )

    run = Run(
        id="run-approval-expired",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-approval-expired",
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
        created_at=datetime.now(UTC),
    )
    sqlite_session.add_all([run, node_run])
    _seed_legacy_auth_binding(
        sqlite_session,
        sample_workflow,
        binding_id="binding-bulk-approval-handoff",
        endpoint_id="endpoint-bulk-approval-handoff",
        endpoint_name="Bulk Approval Handoff Endpoint",
        endpoint_alias="bulk-approval-handoff-endpoint",
    )
    sqlite_session.commit()

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Expired approval secret",
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"binding_id": "binding-expired-approval"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "run_id": run.id,
            "node_run_id": node_run.id,
            "requester_type": "ai",
            "requester_id": "assistant-expired-approval",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "expire before operator decision",
        },
    )

    assert request_response.status_code == 201
    approval_ticket = request_response.json()["approval_ticket"]
    assert approval_ticket is not None

    stored_ticket = sqlite_session.get(ApprovalTicketRecord, approval_ticket["id"])
    assert stored_ticket is not None
    stored_ticket.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    sqlite_session.commit()

    decision_response = client.post(
        f"/api/sensitive-access/approval-tickets/{approval_ticket['id']}/decision",
        json={"status": "approved", "approved_by": "ops-reviewer"},
    )

    assert decision_response.status_code == 422
    assert decision_response.json()["detail"] == "Approval ticket expired."

    sqlite_session.refresh(stored_ticket)
    stored_request = sqlite_session.get(
        SensitiveAccessRequestRecord,
        request_response.json()["request"]["id"],
    )
    assert stored_request is not None
    assert stored_ticket.status == "expired"
    assert stored_ticket.waiting_status == "failed"
    assert stored_request.decision == "deny"
    assert stored_request.reason_code == "approval_expired"
    assert len(scheduled_resumes) == 1
    assert scheduled_resumes[0].run_id == run.id
    assert scheduled_resumes[0].source == "sensitive_access_expiry"


def test_request_external_notification_channel_fails_fast_when_target_is_not_supported(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
) -> None:
    scheduled_dispatches = []
    monkeypatch.setattr(
        sensitive_access_routes,
        "service",
        SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
            notification_dispatch_scheduler=NotificationDispatchScheduler(
                dispatcher=scheduled_dispatches.append
            ),
            settings=Settings(
                notification_email_smtp_host="smtp.example.test",
                notification_email_smtp_port=2525,
                notification_email_from_address="noreply@example.test",
            ),
        ),
    )

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Workspace production export",
            "sensitivity_level": "L3",
            "source": "workspace_resource",
            "metadata": {"path": "/exports/prod.csv"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "requester_type": "ai",
            "requester_id": "assistant-export",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "notify operator for export review",
            "notification_channel": "slack",
            "notification_target": "#ops-review",
        },
    )

    assert request_response.status_code == 201
    request_body = request_response.json()
    approval_ticket = request_body["approval_ticket"]
    notification = request_body["notifications"][0]
    assert approval_ticket is not None
    assert approval_ticket["status"] == "pending"
    assert approval_ticket["waiting_status"] == "waiting"
    assert notification["channel"] == "slack"
    assert notification["target"] == "#ops-review"
    assert notification["status"] == "failed"
    assert "incoming webhook URL" in notification["error"]

    assert scheduled_dispatches == []

    stored_notification = sqlite_session.get(NotificationDispatchRecord, notification["id"])
    assert stored_notification is not None
    assert stored_notification.status == "failed"


def test_list_notification_channels_returns_capabilities(client: TestClient) -> None:
    response = client.get("/api/sensitive-access/notification-channels")

    assert response.status_code == 200
    body = response.json()
    channels = {item["channel"]: item for item in body}
    assert set(channels) == {"in_app", "webhook", "slack", "feishu", "email"}
    assert channels["in_app"]["delivery_mode"] == "inline"
    assert channels["webhook"]["target_kind"] == "http_url"
    assert channels["slack"]["health_status"] == "ready"
    assert channels["email"]["target_kind"] == "email_list"
    assert channels["email"]["health_reason"]
    assert channels["email"]["dispatch_summary"] == {
        "pending_count": 0,
        "delivered_count": 0,
        "failed_count": 0,
        "latest_dispatch_at": None,
        "latest_delivered_at": None,
        "latest_failure_at": None,
        "latest_failure_error": None,
        "latest_failure_target": None,
    }
    assert any(
        fact["key"] == "smtp_host" and fact["status"] == "missing"
        for fact in channels["email"]["config_facts"]
    )
    assert any(
        fact["key"] == "default_target" and "each request must provide" in fact["value"]
        for fact in channels["slack"]["config_facts"]
    )


def test_create_sensitive_access_request_uses_channel_default_target_when_omitted(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
) -> None:
    scheduled_dispatches = []
    monkeypatch.setattr(
        sensitive_access_routes,
        "service",
        SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
            notification_dispatch_scheduler=NotificationDispatchScheduler(
                dispatcher=scheduled_dispatches.append
            ),
            settings=Settings(
                notification_slack_default_target="https://hooks.slack.com/services/T000/B000/SECRET",
            ),
        ),
    )

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Workspace production export",
            "sensitivity_level": "L3",
            "source": "workspace_resource",
            "metadata": {"path": "/exports/prod.csv"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "requester_type": "ai",
            "requester_id": "assistant-export-default-target",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "notify operator for export review",
            "notification_channel": "slack",
        },
    )

    assert request_response.status_code == 201
    notification = request_response.json()["notifications"][0]
    assert notification["channel"] == "slack"
    assert notification["target"] == "https://hooks.slack.com/services/T000/B000/SECRET"
    assert notification["status"] == "pending"
    assert notification["error"] is None

    assert len(scheduled_dispatches) == 1
    assert scheduled_dispatches[0].dispatch_id == notification["id"]

    stored_notification = sqlite_session.get(NotificationDispatchRecord, notification["id"])
    assert stored_notification is not None
    assert (
        stored_notification.target
        == "https://hooks.slack.com/services/T000/B000/SECRET"
    )


def test_bulk_decide_approval_tickets_allows_partial_success(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
    sample_workflow: Workflow,
) -> None:
    monkeypatch.setattr(
        sensitive_access_routes,
        "service",
        SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
            settings=Settings(),
        ),
    )

    run = Run(
        id="run-approval-bulk",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        current_node_id="mock_tool",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-approval-bulk",
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
    sqlite_session.add_all([run, node_run])
    _seed_legacy_auth_binding(
        sqlite_session,
        sample_workflow,
        binding_id="binding-bulk-approval-handoff",
        endpoint_id="endpoint-bulk-approval-handoff",
        endpoint_name="Bulk Approval Handoff Endpoint",
        endpoint_alias="bulk-approval-handoff-endpoint",
    )
    sqlite_session.commit()

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Published production secret",
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"endpoint_id": "pub-bulk-1"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "run_id": run.id,
            "node_run_id": node_run.id,
            "requester_type": "ai",
            "requester_id": "assistant-bulk",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "bulk approval review",
        },
    )

    assert request_response.status_code == 201
    request_body = request_response.json()
    ticket_id = request_body["approval_ticket"]["id"]

    bulk_response = client.post(
        "/api/sensitive-access/approval-tickets/bulk-decision",
        json={
            "status": "approved",
            "approved_by": "ops-bulk-reviewer",
            "ticket_ids": [ticket_id, "missing-ticket", ticket_id],
        },
    )

    assert bulk_response.status_code == 200
    body = bulk_response.json()
    assert body["requested_count"] == 2
    assert body["decided_count"] == 1
    assert body["skipped_count"] == 1
    assert body["decided_items"][0]["id"] == ticket_id
    assert body["decided_items"][0]["status"] == "approved"
    assert body["skipped_items"] == [
        {
            "ticket_id": "missing-ticket",
            "reason": "not_found",
            "detail": "Approval ticket not found.",
        }
    ]
    assert body["skipped_reason_summary"] == [
        {
            "reason": "not_found",
            "count": 1,
            "detail": "Approval ticket not found.",
        }
    ]
    assert body["outcome_explanation"] == {
        "primary_signal": "本次已批准 1 条审批票据，并把对应 waiting 链路交回 runtime 恢复。",
        "follow_up": (
            "另有 1 条未处理（票据不存在 1 条），请先刷新 inbox slice 再决定是否补做。 "
            "后续请继续回看对应 run detail / inbox slice，确认 waiting 是否真正继续前进。"
        ),
    }
    callback_delta = body["callback_blocker_delta"]
    assert callback_delta["sampled_scope_count"] == 1
    assert callback_delta["changed_scope_count"] == 1
    assert callback_delta["cleared_scope_count"] == 1
    assert callback_delta["fully_cleared_scope_count"] == 1
    assert callback_delta["still_blocked_scope_count"] == 0
    assert callback_delta["summary"] == (
        "已回读 1 个 blocker 样本；发生变化 1 个。 "
        "其中已解除阻塞 1 个。 "
        "已完全清空显式 operator blocker 1 个。"
    )
    sampled_run = _assert_single_run_follow_up(
        body["run_follow_up"],
        run_id=run.id,
        snapshot={
            "workflow_id": sample_workflow.id,
            "status": "waiting",
            "current_node_id": "mock_tool",
            "waiting_reason": "waiting approval",
            "execution_focus_reason": "blocking_node_run",
            "execution_focus_node_id": "mock_tool",
            "execution_focus_node_run_id": node_run.id,
            "execution_focus_node_name": "Mock Tool",
            "execution_focus_node_type": "tool",
            "execution_focus_explanation": {
                "primary_signal": "等待原因：waiting approval",
                "follow_up": (
                    "下一步：优先沿 waiting / callback 事实链排查，"
                    "不要只盯单次 invocation 返回。"
                ),
            },
            "callback_waiting_explanation": None,
            "callback_waiting_lifecycle": None,
            "scheduled_resume_delay_seconds": None,
            "scheduled_resume_reason": None,
            "scheduled_resume_source": None,
            "scheduled_waiting_status": None,
            "scheduled_resume_scheduled_at": None,
            "scheduled_resume_due_at": None,
            "scheduled_resume_requeued_at": None,
            "scheduled_resume_requeue_source": None,
            "execution_focus_artifact_count": 0,
            "execution_focus_artifact_ref_count": 0,
            "execution_focus_tool_call_count": 0,
            "execution_focus_raw_ref_count": 0,
            "execution_focus_artifact_refs": [],
            "execution_focus_artifacts": [],
            "execution_focus_tool_calls": [],
            "execution_focus_skill_trace": None,
        },
        follow_up=(
            f"run {run.id}：当前 run 状态：waiting。 当前节点：mock_tool。 "
            "重点信号：等待原因：waiting approval 后续动作："
            "下一步：优先沿 waiting / callback 事实链排查，不要只盯单次 invocation 返回。"
        ),
    )
    _assert_single_sensitive_access_focus_entry(
        sampled_run,
        run_id=run.id,
        node_run_id=node_run.id,
        requester_id="assistant-bulk",
        resource_id=resource_id,
        approval_ticket_id=ticket_id,
        approval_status="approved",
        approval_waiting_status="resumed",
        notification_status_by_id={request_body["notifications"][0]["id"]: "delivered"},
        request_decision="allow",
        request_reason_code="approved_after_review",
    )
    assert callback_delta["primary_resource"] == sampled_run[
        "sensitive_access_entries"
    ][0]["resource"]
    _assert_legacy_auth_governance_snapshot(
        body["legacy_auth_governance"],
        workflow=sample_workflow,
        binding_id="binding-bulk-approval-handoff",
        endpoint_id="endpoint-bulk-approval-handoff",
        endpoint_name="Bulk Approval Handoff Endpoint",
    )
    sampled_run_legacy_auth = deepcopy(sampled_run["legacy_auth_governance"])
    sampled_run_legacy_auth["generated_at"] = "<generated_at>"
    body_legacy_auth = deepcopy(body["legacy_auth_governance"])
    body_legacy_auth["generated_at"] = "<generated_at>"
    assert sampled_run_legacy_auth == body_legacy_auth
    assert sampled_run["tool_governance"] == body["legacy_auth_governance"]["workflows"][0][
        "tool_governance"
    ]

    stored_ticket = sqlite_session.get(ApprovalTicketRecord, ticket_id)
    assert stored_ticket is not None
    assert stored_ticket.status == "approved"
    assert stored_ticket.waiting_status == "resumed"
    assert stored_ticket.approved_by == "ops-bulk-reviewer"


def test_retry_notification_dispatch_creates_new_attempt(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
    sample_workflow: Workflow,
) -> None:
    scheduled_dispatches = []
    run = Run(
        id="run-notification-retry",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        current_node_id="mock_tool",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-notification-retry",
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
    sqlite_session.add_all([run, node_run])
    _seed_legacy_auth_binding(
        sqlite_session,
        sample_workflow,
        binding_id="binding-notification-retry-handoff",
        endpoint_id="endpoint-notification-retry-handoff",
        endpoint_name="Notification Retry Handoff Endpoint",
        endpoint_alias="notification-retry-handoff-endpoint",
    )
    sqlite_session.commit()
    monkeypatch.setattr(
        sensitive_access_routes,
        "service",
        SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
            notification_dispatch_scheduler=NotificationDispatchScheduler(
                dispatcher=scheduled_dispatches.append
            ),
            settings=Settings(
                notification_email_smtp_host="smtp.example.test",
                notification_email_smtp_port=2525,
                notification_email_from_address="noreply@example.test",
            ),
        ),
    )

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Publish approval export",
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"binding_id": "binding-1"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "run_id": run.id,
            "node_run_id": node_run.id,
            "requester_type": "ai",
            "requester_id": "assistant-main",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "notify operator to inspect publish secret",
            "notification_channel": "email",
            "notification_target": "ops@example.com",
        },
    )

    assert request_response.status_code == 201
    request_body = request_response.json()
    approval_ticket = request_body["approval_ticket"]
    first_notification = request_body["notifications"][0]
    assert first_notification["status"] == "pending"

    retry_response = client.post(
        f"/api/sensitive-access/notification-dispatches/{first_notification['id']}/retry"
    )

    assert retry_response.status_code == 200
    retry_body = retry_response.json()
    retried_notification = retry_body["notification"]
    assert retry_body["approval_ticket"]["id"] == approval_ticket["id"]
    assert retried_notification["id"] != first_notification["id"]
    assert retried_notification["channel"] == "email"
    assert retried_notification["target"] == "ops@example.com"
    assert retried_notification["status"] == "pending"
    assert retried_notification["error"] is None
    assert retry_body["outcome_explanation"] == {
        "primary_signal": "通知已按 ops@example.com 重新入队，等待 worker 投递。",
        "follow_up": (
            "这一步只负责重新送达审批请求，不会直接恢复 run；"
            "后续仍取决于审批结果或后续 callback。"
        ),
    }
    callback_delta = retry_body["callback_blocker_delta"]
    assert callback_delta["sampled_scope_count"] == 1
    assert callback_delta["changed_scope_count"] == 1
    assert callback_delta["cleared_scope_count"] == 0
    assert callback_delta["fully_cleared_scope_count"] == 0
    assert callback_delta["still_blocked_scope_count"] == 1
    assert callback_delta["summary"] == (
        "阻塞变化：当前仍是 approval pending。 "
        "建议动作已切换为“Retry notification here first”。"
    )
    assert retry_body["run_snapshot"] == {
        "workflow_id": sample_workflow.id,
        "status": "waiting",
        "current_node_id": "mock_tool",
        "waiting_reason": "waiting approval",
        "execution_focus_reason": "blocking_node_run",
        "execution_focus_node_id": "mock_tool",
        "execution_focus_node_run_id": node_run.id,
        "execution_focus_node_name": "Mock Tool",
        "execution_focus_node_type": "tool",
        "execution_focus_explanation": {
            "primary_signal": "等待原因：waiting approval",
            "follow_up": (
                "下一步：优先处理 Publish approval export 对应的 sensitive access 审批票据，"
                "再观察 waiting 节点是否恢复。"
            ),
        },
        "callback_waiting_explanation": {
            "primary_signal": (
                "当前 callback waiting 仍卡在 1 条待处理审批；"
                "首要治理资源是 Publish approval export。"
            ),
            "follow_up": (
                "下一步：先重试或改投 Publish approval export 对应审批通知，"
                "再处理审批结果；不要直接强制恢复 run。"
            ),
        },
        "callback_waiting_lifecycle": None,
        "scheduled_resume_delay_seconds": None,
        "scheduled_resume_reason": None,
        "scheduled_resume_source": None,
        "scheduled_waiting_status": None,
        "scheduled_resume_scheduled_at": None,
        "scheduled_resume_due_at": None,
        "scheduled_resume_requeued_at": None,
        "scheduled_resume_requeue_source": None,
        "execution_focus_artifact_count": 0,
        "execution_focus_artifact_ref_count": 0,
        "execution_focus_tool_call_count": 0,
        "execution_focus_raw_ref_count": 0,
        "execution_focus_artifact_refs": [],
        "execution_focus_artifacts": [],
        "execution_focus_tool_calls": [],
        "execution_focus_skill_trace": None,
    }
    sampled_run = _assert_single_run_follow_up(
        retry_body["run_follow_up"],
        run_id=run.id,
        snapshot=retry_body["run_snapshot"],
        follow_up=(
            f"run {run.id}：当前 run 状态：waiting。 当前节点：mock_tool。 "
            "重点信号：当前 callback waiting 仍卡在 1 条待处理审批；"
            "首要治理资源是 Publish approval export。 后续动作："
            "下一步：先重试或改投 Publish approval export 对应审批通知，"
            "再处理审批结果；不要直接强制恢复 run。"
        ),
    )
    _assert_single_sensitive_access_focus_entry(
        sampled_run,
        run_id=run.id,
        node_run_id=node_run.id,
        requester_id="assistant-main",
        resource_id=resource_id,
        approval_ticket_id=approval_ticket["id"],
        approval_status="pending",
        approval_waiting_status="waiting",
        notification_status_by_id={
            first_notification["id"]: "failed",
            retried_notification["id"]: "pending",
        },
        request_decision="require_approval",
        request_reason_code="approval_required_high_sensitive_access",
    )
    assert callback_delta["primary_resource"] == sampled_run[
        "sensitive_access_entries"
    ][0]["resource"]
    _assert_legacy_auth_governance_snapshot(
        retry_body["legacy_auth_governance"],
        workflow=sample_workflow,
        binding_id="binding-notification-retry-handoff",
        endpoint_id="endpoint-notification-retry-handoff",
        endpoint_name="Notification Retry Handoff Endpoint",
    )

    assert len(scheduled_dispatches) == 2
    assert scheduled_dispatches[0].dispatch_id == first_notification["id"]
    assert scheduled_dispatches[1].dispatch_id == retried_notification["id"]
    assert scheduled_dispatches[1].source == "sensitive_access_retry"

    notifications = (
        sqlite_session.query(NotificationDispatchRecord)
        .filter(NotificationDispatchRecord.approval_ticket_id == approval_ticket["id"])
        .all()
    )
    assert len(notifications) == 2


def test_bulk_retry_notification_dispatches_allows_partial_success(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
    sample_workflow: Workflow,
) -> None:
    scheduled_dispatches = []
    run = Run(
        id="run-notification-bulk",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        current_node_id="mock_tool",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-notification-bulk",
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
    sqlite_session.add_all([run, node_run])
    _seed_legacy_auth_binding(
        sqlite_session,
        sample_workflow,
        binding_id="binding-bulk-retry-handoff",
        endpoint_id="endpoint-bulk-retry-handoff",
        endpoint_name="Bulk Retry Handoff Endpoint",
        endpoint_alias="bulk-retry-handoff-endpoint",
    )
    sqlite_session.commit()
    monkeypatch.setattr(
        sensitive_access_routes,
        "service",
        SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
            notification_dispatch_scheduler=NotificationDispatchScheduler(
                dispatcher=scheduled_dispatches.append
            ),
            settings=Settings(
                notification_email_smtp_host="smtp.example.test",
                notification_email_smtp_port=2525,
                notification_email_from_address="noreply@example.test",
            ),
        ),
    )

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Publish approval export",
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"binding_id": "binding-bulk-1"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "run_id": run.id,
            "node_run_id": node_run.id,
            "requester_type": "ai",
            "requester_id": "assistant-bulk-retry",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "bulk retry notification",
            "notification_channel": "email",
            "notification_target": "ops@example.com",
        },
    )

    assert request_response.status_code == 201
    request_body = request_response.json()
    approval_ticket = request_body["approval_ticket"]
    first_notification = request_body["notifications"][0]
    assert first_notification["status"] == "pending"

    bulk_retry_response = client.post(
        "/api/sensitive-access/notification-dispatches/bulk-retry",
        json={
            "dispatch_ids": [
                first_notification["id"],
                "missing-dispatch",
                first_notification["id"],
            ],
        },
    )

    assert bulk_retry_response.status_code == 200
    body = bulk_retry_response.json()
    assert body["requested_count"] == 2
    assert body["retried_count"] == 1
    assert body["skipped_count"] == 1
    retried_item = body["retried_items"][0]
    assert retried_item["approval_ticket"]["id"] == approval_ticket["id"]
    assert retried_item["notification"]["id"] != first_notification["id"]
    assert retried_item["notification"]["status"] == "pending"
    assert body["skipped_items"] == [
        {
            "dispatch_id": "missing-dispatch",
            "reason": "not_found",
            "detail": "Notification dispatch not found.",
        }
    ]
    assert body["skipped_reason_summary"] == [
        {
            "reason": "not_found",
            "count": 1,
            "detail": "Notification dispatch not found.",
        }
    ]
    assert body["outcome_explanation"] == {
        "primary_signal": "本次已重试 1 条通知，其中 1 条正在等待 worker 投递。",
        "follow_up": (
            "另有 1 条未处理（通知不存在 1 条），请先刷新当前 ticket 的最新通知列表。 "
            "通知重试只负责把审批请求重新送达目标，不会直接恢复 run；"
            "后续仍取决于审批结果或 callback。"
        ),
    }
    callback_delta = body["callback_blocker_delta"]
    assert callback_delta["sampled_scope_count"] == 1
    assert callback_delta["changed_scope_count"] == 1
    assert callback_delta["cleared_scope_count"] == 0
    assert callback_delta["fully_cleared_scope_count"] == 0
    assert callback_delta["still_blocked_scope_count"] == 1
    assert callback_delta["summary"] == (
        "已回读 1 个 blocker 样本；发生变化 1 个。 "
        "动作后仍有 1 个样本存在 operator blocker。"
    )
    sampled_run = _assert_single_run_follow_up(
        body["run_follow_up"],
        run_id=run.id,
        snapshot={
            "workflow_id": sample_workflow.id,
            "status": "waiting",
            "current_node_id": "mock_tool",
            "waiting_reason": "waiting approval",
            "execution_focus_reason": "blocking_node_run",
            "execution_focus_node_id": "mock_tool",
            "execution_focus_node_run_id": node_run.id,
            "execution_focus_node_name": "Mock Tool",
            "execution_focus_node_type": "tool",
            "execution_focus_explanation": {
                "primary_signal": "等待原因：waiting approval",
                "follow_up": (
                    "下一步：优先处理 Publish approval export 对应的 sensitive access 审批票据，"
                    "再观察 waiting 节点是否恢复。"
                ),
            },
            "callback_waiting_explanation": {
                "primary_signal": (
                    "当前 callback waiting 仍卡在 1 条待处理审批；"
                    "首要治理资源是 Publish approval export。"
                ),
                "follow_up": (
                    "下一步：先重试或改投 Publish approval export 对应审批通知，"
                    "再处理审批结果；"
                    "不要直接强制恢复 run。"
                ),
            },
            "callback_waiting_lifecycle": None,
            "scheduled_resume_delay_seconds": None,
            "scheduled_resume_reason": None,
            "scheduled_resume_source": None,
            "scheduled_waiting_status": None,
            "scheduled_resume_scheduled_at": None,
            "scheduled_resume_due_at": None,
            "scheduled_resume_requeued_at": None,
            "scheduled_resume_requeue_source": None,
            "execution_focus_artifact_count": 0,
            "execution_focus_artifact_ref_count": 0,
            "execution_focus_tool_call_count": 0,
            "execution_focus_raw_ref_count": 0,
            "execution_focus_artifact_refs": [],
            "execution_focus_artifacts": [],
            "execution_focus_tool_calls": [],
            "execution_focus_skill_trace": None,
        },
        follow_up=(
            f"run {run.id}：当前 run 状态：waiting。 当前节点：mock_tool。 "
            "重点信号：当前 callback waiting 仍卡在 1 条待处理审批；"
            "首要治理资源是 Publish approval export。 后续动作："
            "下一步：先重试或改投 Publish approval export 对应审批通知，"
            "再处理审批结果；不要直接强制恢复 run。"
        ),
    )
    _assert_single_sensitive_access_focus_entry(
        sampled_run,
        run_id=run.id,
        node_run_id=node_run.id,
        requester_id="assistant-bulk-retry",
        resource_id=resource_id,
        approval_ticket_id=approval_ticket["id"],
        approval_status="pending",
        approval_waiting_status="waiting",
        notification_status_by_id={
            first_notification["id"]: "failed",
            retried_item["notification"]["id"]: "pending",
        },
        request_decision="require_approval",
        request_reason_code="approval_required_high_sensitive_access",
    )
    assert callback_delta["primary_resource"] == sampled_run[
        "sensitive_access_entries"
    ][0]["resource"]
    _assert_legacy_auth_governance_snapshot(
        body["legacy_auth_governance"],
        workflow=sample_workflow,
        binding_id="binding-bulk-retry-handoff",
        endpoint_id="endpoint-bulk-retry-handoff",
        endpoint_name="Bulk Retry Handoff Endpoint",
    )

    assert len(scheduled_dispatches) == 2
    assert scheduled_dispatches[0].dispatch_id == first_notification["id"]
    assert scheduled_dispatches[1].dispatch_id == retried_item["notification"]["id"]
    assert scheduled_dispatches[1].source == "sensitive_access_retry"

    notifications = (
        sqlite_session.query(NotificationDispatchRecord)
        .filter(NotificationDispatchRecord.approval_ticket_id == approval_ticket["id"])
        .all()
    )
    assert len(notifications) == 2
    original_notification = next(
        item for item in notifications if item.id == first_notification["id"]
    )
    retried_notification = next(
        item for item in notifications if item.id == retried_item["notification"]["id"]
    )
    assert original_notification.status == "failed"
    assert retried_notification.status == "pending"


def test_retry_notification_dispatch_allows_target_override(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
) -> None:
    scheduled_dispatches = []
    monkeypatch.setattr(
        sensitive_access_routes,
        "service",
        SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
            notification_dispatch_scheduler=NotificationDispatchScheduler(
                dispatcher=scheduled_dispatches.append
            ),
            settings=Settings(
                notification_email_smtp_host="smtp.example.test",
                notification_email_smtp_port=2525,
                notification_email_from_address="noreply@example.test",
            ),
        ),
    )

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Publish approval export",
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"binding_id": "binding-target-override"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "requester_type": "ai",
            "requester_id": "assistant-target-override",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "retarget notification",
            "notification_channel": "email",
            "notification_target": "ops-old@example.com",
        },
    )

    assert request_response.status_code == 201
    request_body = request_response.json()
    approval_ticket = request_body["approval_ticket"]
    first_notification = request_body["notifications"][0]
    assert first_notification["status"] == "pending"

    retry_response = client.post(
        f"/api/sensitive-access/notification-dispatches/{first_notification['id']}/retry",
        json={"target": "ops-new@example.com"},
    )

    assert retry_response.status_code == 200
    retry_body = retry_response.json()
    retried_notification = retry_body["notification"]
    assert retry_body["approval_ticket"]["id"] == approval_ticket["id"]
    assert retried_notification["id"] != first_notification["id"]
    assert retried_notification["target"] == "ops-new@example.com"
    assert retried_notification["status"] == "pending"

    assert len(scheduled_dispatches) == 2
    assert scheduled_dispatches[1].dispatch_id == retried_notification["id"]

    notifications = (
        sqlite_session.query(NotificationDispatchRecord)
        .filter(NotificationDispatchRecord.approval_ticket_id == approval_ticket["id"])
        .all()
    )
    assert len(notifications) == 2
    original_notification = next(
        item for item in notifications if item.id == first_notification["id"]
    )
    latest_notification = next(
        item for item in notifications if item.id == retried_notification["id"]
    )
    assert original_notification.target == "ops-old@example.com"
    assert original_notification.status == "failed"
    assert latest_notification.target == "ops-new@example.com"
    assert latest_notification.status == "pending"


def test_sensitive_access_listing_filters_support_node_and_ticket_scopes(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    first_run = Run(
        id="run-scope-1",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    second_run = Run(
        id="run-scope-2",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    first_node_run = NodeRun(
        id="node-run-scope-1",
        run_id=first_run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="tool",
        status="waiting_callback",
        phase="waiting_callback",
        input_payload={},
        checkpoint_payload={},
        working_context={},
        artifact_refs=[],
        created_at=datetime.now(UTC),
    )
    second_node_run = NodeRun(
        id="node-run-scope-2",
        run_id=second_run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="tool",
        status="waiting_callback",
        phase="waiting_callback",
        input_payload={},
        checkpoint_payload={},
        working_context={},
        artifact_refs=[],
        created_at=datetime.now(UTC),
    )
    sqlite_session.add_all([first_run, second_run, first_node_run, second_node_run])
    sqlite_session.commit()

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Scoped approval secret",
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"binding_id": "binding-scope-1"},
        },
    )
    resource_id = resource_response.json()["id"]

    first_request = client.post(
        "/api/sensitive-access/requests",
        json={
            "run_id": "run-scope-1",
            "node_run_id": "node-run-scope-1",
            "requester_type": "ai",
            "requester_id": "assistant-scope-1",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "first scoped request",
        },
    )
    second_request = client.post(
        "/api/sensitive-access/requests",
        json={
            "run_id": "run-scope-2",
            "node_run_id": "node-run-scope-2",
            "requester_type": "ai",
            "requester_id": "assistant-scope-2",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "second scoped request",
        },
    )

    first_body = first_request.json()
    second_body = second_request.json()

    requests_response = client.get(
        "/api/sensitive-access/requests",
        params={
            "node_run_id": "node-run-scope-1",
            "access_request_id": first_body["request"]["id"],
        },
    )
    assert requests_response.status_code == 200
    assert [item["id"] for item in requests_response.json()] == [first_body["request"]["id"]]

    tickets_response = client.get(
        "/api/sensitive-access/approval-tickets",
        params={
            "node_run_id": "node-run-scope-1",
            "access_request_id": first_body["request"]["id"],
            "approval_ticket_id": first_body["approval_ticket"]["id"],
        },
    )
    assert tickets_response.status_code == 200
    assert [item["id"] for item in tickets_response.json()] == [first_body["approval_ticket"]["id"]]

    notifications_response = client.get(
        "/api/sensitive-access/notification-dispatches",
        params={"approval_ticket_id": first_body["approval_ticket"]["id"]},
    )
    assert notifications_response.status_code == 200
    notifications = notifications_response.json()
    assert len(notifications) == 1
    assert notifications[0]["approval_ticket_id"] == first_body["approval_ticket"]["id"]

    scoped_notifications_response = client.get(
        "/api/sensitive-access/notification-dispatches",
        params={
            "run_id": "run-scope-1",
            "node_run_id": "node-run-scope-1",
            "access_request_id": first_body["request"]["id"],
        },
    )
    assert scoped_notifications_response.status_code == 200
    scoped_notifications = scoped_notifications_response.json()
    assert [item["approval_ticket_id"] for item in scoped_notifications] == [
        first_body["approval_ticket"]["id"]
    ]

    notification_status_response = client.get(
        "/api/sensitive-access/notification-dispatches",
        params={
            "approval_ticket_id": first_body["approval_ticket"]["id"],
            "status": notifications[0]["status"],
            "channel": notifications[0]["channel"],
        },
    )
    assert notification_status_response.status_code == 200
    assert [item["id"] for item in notification_status_response.json()] == [notifications[0]["id"]]

    unmatched_channel_response = client.get(
        "/api/sensitive-access/notification-dispatches",
        params={
            "approval_ticket_id": first_body["approval_ticket"]["id"],
            "channel": "slack",
        },
    )
    assert unmatched_channel_response.status_code == 200
    assert unmatched_channel_response.json() == []

    unmatched_notifications_response = client.get(
        "/api/sensitive-access/notification-dispatches",
        params={
            "node_run_id": "node-run-scope-1",
            "access_request_id": second_body["request"]["id"],
        },
    )
    assert unmatched_notifications_response.status_code == 200
    assert unmatched_notifications_response.json() == []

    unmatched_tickets_response = client.get(
        "/api/sensitive-access/approval-tickets",
        params={
            "node_run_id": "node-run-scope-1",
            "approval_ticket_id": second_body["approval_ticket"]["id"],
        },
    )
    assert unmatched_tickets_response.status_code == 200
    assert unmatched_tickets_response.json() == []



def test_sensitive_access_inbox_returns_filtered_entries_and_run_snapshots(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    run = Run(
        id="run-inbox-1",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        current_node_id="mock_tool",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-inbox-1",
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
    sqlite_session.add_all([run, node_run])
    sqlite_session.add(
        WorkflowPublishedEndpoint(
            id="binding-inbox-handoff",
            workflow_id=sample_workflow.id,
            workflow_version_id="wf-demo-v1",
            workflow_version=sample_workflow.version,
            target_workflow_version_id="wf-demo-v1",
            target_workflow_version=sample_workflow.version,
            compiled_blueprint_id="bp-inbox-handoff",
            endpoint_id="endpoint-inbox-handoff",
            endpoint_name="Inbox Handoff Endpoint",
            endpoint_alias="inbox-handoff-endpoint",
            route_path="/published/inbox-handoff-endpoint",
            protocol="native",
            auth_mode="token",
            streaming=False,
            lifecycle_status="published",
            input_schema={},
            output_schema=None,
            rate_limit_policy=None,
            cache_policy=None,
            created_at=datetime(2026, 3, 24, 8, 0, tzinfo=UTC),
            updated_at=datetime(2026, 3, 24, 8, 0, tzinfo=UTC),
        )
    )
    sqlite_session.commit()

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Inbox approval secret",
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"endpoint_id": "pub-inbox-1"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "run_id": run.id,
            "node_run_id": node_run.id,
            "requester_type": "ai",
            "requester_id": "assistant-inbox",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "inspect inbox contract",
        },
    )

    assert request_response.status_code == 201
    request_body = request_response.json()

    response = client.get(
        "/api/sensitive-access/inbox",
        params={
            "status": "pending",
            "waiting_status": "waiting",
            "decision": "require_approval",
            "run_id": run.id,
            "approval_ticket_id": request_body["approval_ticket"]["id"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["ticket"]["id"] for item in body["entries"]] == [
        request_body["approval_ticket"]["id"]
    ]
    assert body["entries"][0]["request"]["id"] == request_body["request"]["id"]
    assert body["entries"][0]["resource"]["id"] == resource_id
    assert [item["id"] for item in body["entries"][0]["notifications"]] == [
        request_body["notifications"][0]["id"]
    ]
    assert body["entries"][0]["run_snapshot"] == request_body["run_snapshot"]
    assert _normalize_sampled_run_legacy_auth_generated_at(
        body["entries"][0]["run_follow_up"]
    ) == _normalize_sampled_run_legacy_auth_generated_at(request_body["run_follow_up"])
    assert body["entries"][0]["legacy_auth_governance"] == (
        legacy_auth_governance_snapshot_for_single_published_blocker(
            generated_at=body["entries"][0]["legacy_auth_governance"]["generated_at"],
            workflow_id=sample_workflow.id,
            workflow_name="Demo Workflow",
            workflow_version=sample_workflow.version,
            binding_id="binding-inbox-handoff",
            endpoint_id="endpoint-inbox-handoff",
            endpoint_name="Inbox Handoff Endpoint",
        )
    )
    assert request_body["legacy_auth_governance"] == (
        legacy_auth_governance_snapshot_for_single_published_blocker(
            generated_at=request_body["legacy_auth_governance"]["generated_at"],
            workflow_id=sample_workflow.id,
            workflow_name="Demo Workflow",
            workflow_version=sample_workflow.version,
            binding_id="binding-inbox-handoff",
            endpoint_id="endpoint-inbox-handoff",
            endpoint_name="Inbox Handoff Endpoint",
        )
    )
    assert body["execution_views"] == []
    assert body["summary"] == {
        "ticket_count": 1,
        "pending_ticket_count": 1,
        "approved_ticket_count": 0,
        "rejected_ticket_count": 0,
        "expired_ticket_count": 0,
        "waiting_ticket_count": 1,
        "resumed_ticket_count": 0,
        "failed_ticket_count": 0,
        "pending_notification_count": 0,
        "delivered_notification_count": 1,
        "failed_notification_count": 0,
        "affected_run_count": 1,
        "affected_workflow_count": 1,
        "primary_resource": {
            "id": resource_id,
            "label": "Inbox approval secret",
            "description": None,
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"endpoint_id": "pub-inbox-1"},
            "credential_governance": None,
            "created_at": body["summary"]["primary_resource"]["created_at"],
            "updated_at": body["summary"]["primary_resource"]["updated_at"],
        },
        "primary_blocker_kind": "pending_approval",
        "blockers": [
            {
                "kind": "pending_approval",
                "tone": "blocked",
                "item_count": 1,
                "affected_run_count": 1,
                "affected_workflow_count": 1,
            },
            {
                "kind": "waiting_resume",
                "tone": "blocked",
                "item_count": 1,
                "affected_run_count": 1,
                "affected_workflow_count": 1,
            },
        ],
    }
    assert any(item["channel"] == "in_app" for item in body["channels"])
