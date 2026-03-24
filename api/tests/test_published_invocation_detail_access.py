from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.sensitive_access import service as sensitive_access_route_service
from app.models.run import NodeRun, Run, RunCallbackTicket, RunEvent
from app.models.sensitive_access import (
    ApprovalTicketRecord,
    NotificationDispatchRecord,
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


def _seed_pending_blocking_sensitive_access(
    sqlite_session: Session,
    *,
    run_id: str,
    node_run_id: str,
    sensitivity_level: str = "L2",
) -> None:
    now = datetime.now(UTC)
    resource = SensitiveResourceRecord(
        id=str(uuid4()),
        label=f"Published invocation blocker resource {sensitivity_level}",
        description="Seeded pending approval blocker for published invocation detail tests.",
        sensitivity_level=sensitivity_level,
        source="local_capability",
        metadata_payload={
            "run_id": run_id,
            "tool_id": "native.search",
        },
        created_at=now,
        updated_at=now,
    )
    access_request = SensitiveAccessRequestRecord(
        id=str(uuid4()),
        run_id=run_id,
        node_run_id=node_run_id,
        requester_type="workflow",
        requester_id="mock_tool",
        resource_id=resource.id,
        action_type="invoke",
        purpose_text="seed pending sensitive access blocker",
        decision="require_approval",
        reason_code="approval_required_high_sensitive_access",
        created_at=now,
        decided_at=None,
    )
    approval_ticket = ApprovalTicketRecord(
        id=str(uuid4()),
        access_request_id=access_request.id,
        run_id=run_id,
        node_run_id=node_run_id,
        status="pending",
        waiting_status="waiting",
        approved_by=None,
        decided_at=None,
        expires_at=now + timedelta(minutes=30),
        created_at=now,
    )
    notification = NotificationDispatchRecord(
        id=str(uuid4()),
        approval_ticket_id=approval_ticket.id,
        channel="in_app",
        target="sensitive-access-inbox",
        status="failed",
        delivered_at=None,
        error="delivery failed",
        created_at=now,
    )
    sqlite_session.add(resource)
    sqlite_session.add(access_request)
    sqlite_session.add(approval_ticket)
    sqlite_session.add(notification)
    sqlite_session.commit()


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
            "callback_waiting_lifecycle": {
                "wait_cycle_count": 1,
                "issued_ticket_count": 1,
                "expired_ticket_count": 0,
                "consumed_ticket_count": 0,
                "canceled_ticket_count": 0,
                "late_callback_count": 0,
                "resume_schedule_count": 1,
                "last_ticket_status": "pending",
                "last_ticket_reason": "callback pending",
                "last_ticket_updated_at": now.isoformat().replace("+00:00", "Z"),
                "last_late_callback_status": None,
                "last_late_callback_reason": None,
                "last_late_callback_at": None,
                "last_resume_delay_seconds": 30.0,
                "last_resume_reason": "callback pending",
                "last_resume_source": "callback_ticket_monitor",
                "last_resume_backoff_attempt": 0,
            },
            "scheduled_resume": {
                "delay_seconds": 30,
                "reason": "callback pending",
                "source": "callback_ticket_monitor",
                "waiting_status": "waiting_callback",
                "scheduled_at": now.isoformat().replace("+00:00", "Z"),
                "due_at": (now + timedelta(seconds=30)).isoformat().replace("+00:00", "Z"),
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
    assert detail_body["outcome_explanation"]["primary_signal"]
    assert "审批" in detail_body["outcome_explanation"]["follow_up"]
    assert detail_body["run_snapshot"]["status"] == "waiting"
    assert detail_body["run_snapshot"]["execution_focus_node_id"]
    assert detail_body["run_follow_up"]["affected_run_count"] == 1
    assert detail_body["run_follow_up"]["sampled_run_count"] == 1
    assert detail_body["run_follow_up"]["explanation"]["primary_signal"]

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
    assert approved_body["invocation"]["run_waiting_lifecycle"][
        "callback_waiting_lifecycle"
    ] == {
        "wait_cycle_count": 1,
        "issued_ticket_count": 1,
        "expired_ticket_count": 0,
        "consumed_ticket_count": 0,
        "canceled_ticket_count": 0,
        "late_callback_count": 0,
        "resume_schedule_count": 1,
        "max_expired_ticket_count": 0,
        "terminated": False,
        "termination_reason": None,
        "terminated_at": None,
        "last_ticket_status": "pending",
        "last_ticket_reason": "callback pending",
        "last_ticket_updated_at": node_run.checkpoint_payload["callback_waiting_lifecycle"][
            "last_ticket_updated_at"
        ],
        "last_late_callback_status": None,
        "last_late_callback_reason": None,
        "last_late_callback_at": None,
        "last_resume_delay_seconds": 30.0,
        "last_resume_reason": "callback pending",
        "last_resume_source": "callback_ticket_monitor",
        "last_resume_backoff_attempt": 0,
    }
    assert approved_body["callback_waiting_explanation"] == {
        "primary_signal": "当前仍有 1 条 callback ticket 等待外部回调。",
        "follow_up": (
            "下一步：优先确认外部系统是否已经回调，不要重复触发 resume 或额外发起同类请求。"
        ),
    }
    assert approved_body["run_follow_up"]["affected_run_count"] == 1
    assert approved_body["run_follow_up"]["sampled_run_count"] == 1
    assert approved_body["run_follow_up"]["waiting_run_count"] == 1
    assert approved_body["run_follow_up"]["sampled_runs"][0]["run_id"] == run.id
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
    assert detail_body["invocation"]["run_waiting_lifecycle"]["callback_waiting_lifecycle"][
        "issued_ticket_count"
    ] == 1
    assert detail_body["invocation"]["run_waiting_lifecycle"]["callback_waiting_lifecycle"][
        "resume_schedule_count"
    ] == 1
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


def test_get_published_invocation_detail_includes_sensitive_access_summary_for_waiting_node(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow_id, binding, run, node_run, invocation = _create_published_invocation_fixture(
        client,
        sqlite_session,
    )
    _seed_pending_blocking_sensitive_access(
        sqlite_session,
        run_id=run.id,
        node_run_id=node_run.id,
    )

    detail_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/{invocation.id}",
        params={"requester_id": "human-reviewer"},
    )

    assert detail_response.status_code == 200
    detail_body = detail_response.json()
    assert detail_body["invocation"]["run_waiting_lifecycle"]["sensitive_access_summary"] == {
        "request_count": 1,
        "approval_ticket_count": 1,
        "pending_approval_count": 1,
        "approved_approval_count": 0,
        "rejected_approval_count": 0,
        "expired_approval_count": 0,
        "pending_notification_count": 0,
        "delivered_notification_count": 0,
        "failed_notification_count": 1,
    }


def test_get_published_invocation_detail_includes_workflow_legacy_auth_handoff(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow_id, binding, run, node_run, invocation = _create_published_invocation_fixture(
        client,
        sqlite_session,
    )
    binding_record = sqlite_session.get(WorkflowPublishedEndpoint, binding["id"])
    assert binding_record is not None

    now = datetime.now(UTC)
    sqlite_session.add(
        WorkflowPublishedEndpoint(
            id=str(uuid4()),
            workflow_id=workflow_id,
            workflow_version_id=binding_record.workflow_version_id,
            workflow_version=binding_record.workflow_version,
            target_workflow_version_id=binding_record.target_workflow_version_id,
            target_workflow_version=binding_record.target_workflow_version,
            compiled_blueprint_id=binding_record.compiled_blueprint_id,
            endpoint_id="legacy-auth-endpoint",
            endpoint_name="Legacy Auth Endpoint",
            endpoint_alias="legacy-auth-endpoint",
            route_path="/published/legacy-auth-endpoint",
            protocol=binding_record.protocol,
            auth_mode="token",
            streaming=False,
            lifecycle_status="draft",
            input_schema={"type": "object"},
            created_at=now,
            updated_at=now,
        )
    )
    sqlite_session.commit()

    detail_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/{invocation.id}",
        params={"requester_id": "human-reviewer"},
    )

    assert detail_response.status_code == 200
    detail_body = detail_response.json()
    governance = detail_body["legacy_auth_governance"]
    assert governance["binding_count"] == 1
    assert governance["auth_mode_contract"] == {
        "supported_auth_modes": ["api_key", "internal"],
        "retired_legacy_auth_modes": ["token"],
        "summary": (
            "当前 publish gateway 只支持 durable authMode=api_key/internal；"
            "token 仅作为 legacy inventory 出现在治理 handoff 中。"
        ),
        "follow_up": (
            "先把 workflow draft endpoint 切回 api_key/internal 并保存，再补发 "
            "replacement binding，最后清理 draft/offline legacy backlog。"
        ),
    }
    assert governance["summary"] == {
        "draft_candidate_count": 1,
        "published_blocker_count": 0,
        "offline_inventory_count": 0,
    }
    assert governance["checklist"][0]["key"] == "draft_cleanup"
    assert governance["workflows"] == [
        {
            "workflow_id": workflow_id,
            "workflow_name": "Publish Invocation Sensitive Detail Workflow",
            "binding_count": 1,
            "draft_candidate_count": 1,
            "published_blocker_count": 0,
            "offline_inventory_count": 0,
        }
    ]


def test_get_published_invocation_detail_maps_blocking_sensitive_access_from_execution_view(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow_id, binding, run, node_run, invocation = _create_published_invocation_fixture(
        client,
        sqlite_session,
    )
    _seed_pending_blocking_sensitive_access(
        sqlite_session,
        run_id=run.id,
        node_run_id=node_run.id,
    )

    callback_ticket = sqlite_session.scalar(
        select(RunCallbackTicket).where(RunCallbackTicket.run_id == run.id)
    )
    if callback_ticket is not None:
        sqlite_session.delete(callback_ticket)

    run.status = "failed"
    run.checkpoint_payload = {}
    node_run.status = "failed"
    node_run.phase = "main_plan"
    node_run.waiting_reason = None
    node_run.checkpoint_payload = {}
    sqlite_session.add(
        RunEvent(
            run_id=run.id,
            node_run_id=node_run.id,
            event_type="tool.execution.blocked",
            payload={
                "requested_execution_class": "sandbox",
                "reason": "No compatible sandbox backend is healthy for execution class 'sandbox'.",
            },
            created_at=datetime.now(UTC),
        )
    )
    sqlite_session.commit()

    detail_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/{invocation.id}",
        params={"requester_id": "publish-blocker-reviewer"},
    )

    assert detail_response.status_code == 200
    detail_body = detail_response.json()
    assert detail_body["blocking_node_run_id"] == node_run.id
    assert detail_body["execution_focus_reason"] == "blocking_node_run"
    assert detail_body["execution_focus_node"]["node_run_id"] == node_run.id
    assert len(detail_body["blocking_sensitive_access_entries"]) == 1
    blocking_entry = detail_body["blocking_sensitive_access_entries"][0]
    assert blocking_entry["request"]["node_run_id"] == node_run.id
    assert blocking_entry["approval_ticket"]["status"] == "pending"


def test_get_published_invocation_detail_surfaces_execution_fallback_explanation(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow_id, binding, run, node_run, invocation = _create_published_invocation_fixture(
        client,
        sqlite_session,
    )

    callback_ticket = sqlite_session.scalar(
        select(RunCallbackTicket).where(RunCallbackTicket.run_id == run.id)
    )
    if callback_ticket is not None:
        sqlite_session.delete(callback_ticket)

    run.status = "succeeded"
    run.current_node_id = None
    run.checkpoint_payload = {}
    node_run.status = "succeeded"
    node_run.phase = "main_plan"
    node_run.waiting_reason = None
    node_run.checkpoint_payload = {}
    invocation.run_status = "succeeded"
    sqlite_session.add(
        RunEvent(
            run_id=run.id,
            node_run_id=node_run.id,
            event_type="tool.execution.fallback",
            payload={
                "node_id": node_run.node_id,
                "requested_execution_class": "microvm",
                "execution_source": "runtime_policy",
                "requested_execution_profile": "strict",
                "requested_execution_timeout_ms": 5000,
                "requested_network_policy": "isolated",
                "requested_filesystem_policy": "ephemeral",
                "effective_execution_class": "inline",
                "executor_ref": "runtime:inline-fallback:microvm",
                "reason": "execution_class_not_implemented_for_node_type",
            },
            created_at=datetime.now(UTC),
        )
    )
    sqlite_session.commit()

    detail_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/{invocation.id}"
    )

    assert detail_response.status_code == 200
    detail_body = detail_response.json()
    assert detail_body["blocking_node_run_id"] is None
    assert detail_body["execution_focus_reason"] == "fallback_node"
    assert detail_body["execution_focus_node"]["node_run_id"] == node_run.id
    assert detail_body["execution_focus_node"]["execution_class"] == "inline"
    assert detail_body["execution_focus_node"]["requested_execution_class"] == "microvm"
    assert detail_body["execution_focus_node"]["requested_execution_source"] == "runtime_policy"
    assert detail_body["execution_focus_node"]["requested_execution_profile"] == "strict"
    assert detail_body["execution_focus_node"]["requested_execution_timeout_ms"] == 5000
    assert (
        detail_body["execution_focus_node"]["requested_execution_network_policy"]
        == "isolated"
    )
    assert (
        detail_body["execution_focus_node"]["requested_execution_filesystem_policy"]
        == "ephemeral"
    )
    assert detail_body["execution_focus_node"]["effective_execution_class"] == "inline"
    assert (
        detail_body["execution_focus_node"]["execution_fallback_reason"]
        == "execution_class_not_implemented_for_node_type"
    )
    assert detail_body["execution_focus_explanation"] == {
        "primary_signal": (
            "执行降级：当前节点尚未实现请求的 execution class，已临时回退到 inline。"
        ),
        "follow_up": (
            "下一步：如果这条节点需要受控执行或强隔离，应补齐对应 execution adapter；"
            "不要把当前 fallback 当成长期默认。"
        ),
    }
    assert detail_body["callback_waiting_explanation"] is None
    assert detail_body["run_snapshot"] is not None
    assert detail_body["run_snapshot"]["workflow_id"] == workflow_id
    assert detail_body["run_snapshot"]["status"] == "succeeded"
    assert detail_body["run_follow_up"]["affected_run_count"] == 1
    assert detail_body["run_follow_up"]["sampled_run_count"] == 1
    assert detail_body["run_follow_up"]["sampled_runs"][0]["snapshot"][
        "execution_focus_reason"
    ] == "fallback_node"
    assert detail_body["run_follow_up"]["explanation"]["primary_signal"] == (
        "本次影响 1 个 run；整体状态分布：succeeded 1。已回读 1 个样本。"
    )


def test_get_published_invocation_detail_surfaces_blocking_skill_trace(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow_id, binding, run, node_run, invocation = _create_published_invocation_fixture(
        client,
        sqlite_session,
    )
    sqlite_session.add(
        RunEvent(
            run_id=run.id,
            node_run_id=node_run.id,
            event_type="agent.skill.references.loaded",
            payload={
                "node_id": node_run.node_id,
                "phase": "main_plan",
                "references": [
                    {
                        "skill_id": "skill-ops-review",
                        "skill_name": "Ops Review",
                        "reference_id": "ref-escalation",
                        "reference_name": "Escalation Checklist",
                        "load_source": "skill_binding",
                        "retrieval_http_path": (
                            "/api/skills/skill-ops-review/references/ref-escalation"
                        ),
                        "retrieval_mcp_method": "skills.get_reference",
                        "retrieval_mcp_params": {
                            "skill_id": "skill-ops-review",
                            "reference_id": "ref-escalation",
                        },
                    },
                    {
                        "skill_id": "skill-ops-review",
                        "skill_name": "Ops Review",
                        "reference_id": "ref-risk",
                        "reference_name": "Risk Notes",
                        "load_source": "retrieval_query_match",
                        "fetch_reason": "Matched query terms: callback, blocker",
                        "fetch_request_index": 1,
                        "fetch_request_total": 1,
                        "retrieval_http_path": "/api/skills/skill-ops-review/references/ref-risk",
                        "retrieval_mcp_method": "skills.get_reference",
                        "retrieval_mcp_params": {
                            "skill_id": "skill-ops-review",
                            "reference_id": "ref-risk",
                        },
                    },
                ],
            },
            created_at=datetime.now(UTC),
        )
    )
    sqlite_session.commit()

    detail_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/{invocation.id}",
        params={"requester_id": "publish-detail-reviewer"},
    )

    assert detail_response.status_code == 200
    detail_body = detail_response.json()
    assert detail_body["skill_trace"] == {
        "scope": "execution_focus_node",
        "reference_count": 2,
        "phase_counts": {"main_plan": 2},
        "source_counts": {"retrieval_query_match": 1, "skill_binding": 1},
        "nodes": [
            {
                "node_run_id": node_run.id,
                "node_id": node_run.node_id,
                "node_name": node_run.node_name,
                "reference_count": 2,
                "loads": [
                    {
                        "phase": "main_plan",
                        "references": [
                            {
                                "skill_id": "skill-ops-review",
                                "skill_name": "Ops Review",
                                "reference_id": "ref-escalation",
                                "reference_name": "Escalation Checklist",
                                "load_source": "skill_binding",
                                "fetch_reason": None,
                                "fetch_request_index": None,
                                "fetch_request_total": None,
                                "retrieval_http_path": (
                                    "/api/skills/skill-ops-review/references/ref-escalation"
                                ),
                                "retrieval_mcp_method": "skills.get_reference",
                                "retrieval_mcp_params": {
                                    "skill_id": "skill-ops-review",
                                    "reference_id": "ref-escalation",
                                },
                            },
                            {
                                "skill_id": "skill-ops-review",
                                "skill_name": "Ops Review",
                                "reference_id": "ref-risk",
                                "reference_name": "Risk Notes",
                                "load_source": "retrieval_query_match",
                                "fetch_reason": "Matched query terms: callback, blocker",
                                "fetch_request_index": 1,
                                "fetch_request_total": 1,
                                "retrieval_http_path": (
                                    "/api/skills/skill-ops-review/references/ref-risk"
                                ),
                                "retrieval_mcp_method": "skills.get_reference",
                                "retrieval_mcp_params": {
                                    "skill_id": "skill-ops-review",
                                    "reference_id": "ref-risk",
                                },
                            },
                        ],
                    }
                ],
            }
        ],
    }
    assert detail_body["run_snapshot"] is not None
    assert detail_body["run_snapshot"]["workflow_id"] == workflow_id
    assert detail_body["run_snapshot"]["execution_focus_node_run_id"] == node_run.id


def test_get_published_invocation_detail_scopes_skill_trace_to_current_execution_focus(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow_id, binding, run, node_run, invocation = _create_published_invocation_fixture(
        client,
        sqlite_session,
    )
    callback_ticket = sqlite_session.scalar(
        select(RunCallbackTicket).where(RunCallbackTicket.run_id == run.id)
    )
    if callback_ticket is not None:
        sqlite_session.delete(callback_ticket)

    run.status = "running"
    node_run.status = "running"
    node_run.phase = "main_plan"
    node_run.waiting_reason = None
    node_run.checkpoint_payload = {}
    sqlite_session.add(
        RunEvent(
            run_id=run.id,
            node_run_id=node_run.id,
            event_type="agent.skill.references.loaded",
            payload={
                "node_id": node_run.node_id,
                "phase": "main_plan",
                "references": [
                    {
                        "skill_id": "skill-runtime-check",
                        "skill_name": "Runtime Check",
                        "reference_id": "ref-focus",
                        "reference_name": "Focus Node Guide",
                        "load_source": "skill_binding",
                        "retrieval_http_path": (
                            "/api/skills/skill-runtime-check/references/ref-focus"
                        ),
                        "retrieval_mcp_method": "skills.get_reference",
                        "retrieval_mcp_params": {
                            "skill_id": "skill-runtime-check",
                            "reference_id": "ref-focus",
                        },
                    }
                ],
            },
            created_at=datetime.now(UTC),
        )
    )
    sqlite_session.commit()

    detail_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/{invocation.id}",
        params={"requester_id": "publish-detail-reviewer"},
    )

    assert detail_response.status_code == 200
    detail_body = detail_response.json()
    assert detail_body["blocking_node_run_id"] is None
    assert detail_body["execution_focus_reason"] == "current_node"
    assert detail_body["execution_focus_node"]["node_run_id"] == node_run.id
    assert detail_body["run_snapshot"] is not None
    assert detail_body["run_snapshot"]["execution_focus_reason"] == "current_node"
    assert detail_body["run_snapshot"]["execution_focus_node_run_id"] == node_run.id
    assert detail_body["skill_trace"] == {
        "scope": "execution_focus_node",
        "reference_count": 1,
        "phase_counts": {"main_plan": 1},
        "source_counts": {"skill_binding": 1},
        "nodes": [
            {
                "node_run_id": node_run.id,
                "node_id": node_run.node_id,
                "node_name": node_run.node_name,
                "reference_count": 1,
                "loads": [
                    {
                        "phase": "main_plan",
                        "references": [
                            {
                                "skill_id": "skill-runtime-check",
                                "skill_name": "Runtime Check",
                                "reference_id": "ref-focus",
                                "reference_name": "Focus Node Guide",
                                "load_source": "skill_binding",
                                "fetch_reason": None,
                                "fetch_request_index": None,
                                "fetch_request_total": None,
                                "retrieval_http_path": (
                                    "/api/skills/skill-runtime-check/references/ref-focus"
                                ),
                                "retrieval_mcp_method": "skills.get_reference",
                                "retrieval_mcp_params": {
                                    "skill_id": "skill-runtime-check",
                                    "reference_id": "ref-focus",
                                },
                            }
                        ],
                    }
                ],
            }
        ],
    }


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
    assert inventory_body["outcome_explanation"]["primary_signal"]
    assert "审批" in inventory_body["outcome_explanation"]["follow_up"]
    assert inventory_body["run_snapshot"]["status"] == "waiting"
    assert inventory_body["run_snapshot"]["execution_focus_node_id"]
    assert inventory_body["run_follow_up"]["affected_run_count"] == 1
    assert inventory_body["run_follow_up"]["sampled_run_count"] == 1
    assert inventory_body["run_follow_up"]["explanation"]["primary_signal"]

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
