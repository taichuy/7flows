import pytest

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes import run_callback_tickets as run_callback_ticket_routes
from app.models.run import NodeRun, Run, RunCallbackTicket, RunEvent
from app.models.workflow import Workflow, WorkflowVersion
from app.schemas.sensitive_access import CallbackBlockerDeltaSummary
from app.services.plugin_runtime import PluginCallProxy, PluginRegistry, PluginToolDefinition
from app.services.run_callback_ticket_cleanup import RunCallbackTicketCleanupService
from app.services.run_resume_scheduler import RunResumeScheduler
from app.services.runtime import RuntimeService

pytestmark = pytest.mark.usefixtures(
    "workspace_console_auth", "default_console_route_headers"
)


def _create_waiting_callback_run(
    sqlite_session: Session,
    *,
    suffix: str = "route",
) -> tuple[str, str]:
    workflow = Workflow(
        id=f"wf-cleanup-{suffix}",
        name="Cleanup Route Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "agent",
                    "type": "llmAgentNode",
                    "name": "Agent",
                    "config": {
                        "assistant": {"enabled": False},
                        "toolPolicy": {"allowedToolIds": ["native.search"]},
                        "mockPlan": {
                            "toolCalls": [
                                {
                                    "toolId": "native.search",
                                    "inputs": {"query": "cleanup-route"},
                                }
                            ]
                        },
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
            ],
        },
    )
    workflow_version = WorkflowVersion(
        id=f"wf-cleanup-{suffix}-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=workflow.definition,
    )
    sqlite_session.add(workflow)
    sqlite_session.add(workflow_version)
    sqlite_session.commit()

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda _request: {
            "status": "waiting",
            "content_type": "json",
            "summary": "waiting for callback",
            "structured": {"externalTicket": "cleanup-route"},
            "meta": {
                "tool_name": "Native Search",
                "waiting_reason": "cleanup route pending",
                "waiting_status": "waiting_callback",
            },
        },
    )

    first_pass = RuntimeService(plugin_call_proxy=PluginCallProxy(registry)).execute_workflow(
        sqlite_session,
        workflow,
        {"topic": "cleanup-route"},
    )
    waiting_run = next(node_run for node_run in first_pass.node_runs if node_run.node_id == "agent")
    return first_pass.run.id, waiting_run.checkpoint_payload["callback_ticket"]["ticket"]


def test_cleanup_stale_run_callback_tickets_route_expires_stale_tickets(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch,
) -> None:
    run_id, ticket = _create_waiting_callback_run(sqlite_session)
    ticket_record = sqlite_session.get(RunCallbackTicket, ticket)
    assert ticket_record is not None
    ticket_record.expires_at = datetime.now(UTC) - timedelta(minutes=5)
    sqlite_session.commit()

    scheduled_resumes = []
    monkeypatch.setattr(
        run_callback_ticket_routes.cleanup_service,
        "_resume_scheduler",
        RunResumeScheduler(dispatcher=scheduled_resumes.append),
    )
    captured_scopes: list[tuple[str | None, str | None]] = []

    def fake_capture_callback_blocker_snapshot(
        db,
        *,
        run_id: str | None,
        node_run_id: str | None = None,
    ):
        captured_scopes.append((run_id, node_run_id))
        return f"snapshot:{run_id}:{node_run_id}"

    def fake_build_callback_blocker_delta_summary(*, before, after):
        assert before == f"snapshot:{run_id}:{ticket_record.node_run_id}"
        assert after == f"snapshot:{run_id}:{ticket_record.node_run_id}"
        return CallbackBlockerDeltaSummary(
            sampled_scope_count=1,
            changed_scope_count=1,
            cleared_scope_count=1,
            fully_cleared_scope_count=0,
            still_blocked_scope_count=1,
            summary=(
                "阻塞变化：已解除 waiting external callback。 "
                "建议动作已切换为“Handle approval here first”。"
            ),
        )

    monkeypatch.setattr(
        run_callback_ticket_routes,
        "capture_callback_blocker_snapshot",
        fake_capture_callback_blocker_snapshot,
    )
    monkeypatch.setattr(
        run_callback_ticket_routes,
        "build_callback_blocker_delta_summary",
        fake_build_callback_blocker_delta_summary,
    )

    response = client.post(
        "/api/runs/callback-tickets/cleanup",
        json={
            "source": "route_cleanup",
            "run_id": run_id,
            "node_run_id": ticket_record.node_run_id,
        },
    )

    sqlite_session.refresh(ticket_record)
    refreshed_run = sqlite_session.get(Run, run_id)
    node_run = sqlite_session.scalar(
        select(NodeRun).where(NodeRun.run_id == run_id, NodeRun.node_id == "agent")
    )
    event = sqlite_session.scalar(
        select(RunEvent)
        .where(
            RunEvent.run_id == run_id,
            RunEvent.event_type == "run.callback.ticket.expired",
        )
        .order_by(RunEvent.id.desc())
    )
    resume_event = sqlite_session.scalar(
        select(RunEvent)
        .where(
            RunEvent.run_id == run_id,
            RunEvent.event_type == "run.resume.scheduled",
        )
        .order_by(RunEvent.id.desc())
    )

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "route_cleanup"
    assert body["matched_count"] == 1
    assert body["expired_count"] == 1
    assert body["scheduled_resume_count"] == 1
    assert body["terminated_count"] == 0
    assert body["run_ids"] == [run_id]
    assert body["scheduled_resume_run_ids"] == [run_id]
    assert body["terminated_run_ids"] == []
    assert body["outcome_explanation"] == {
        "primary_signal": (
            "本次 cleanup 已处理 1 条过期 callback ticket，"
            "并为 1 个 run 重新安排恢复。"
        ),
        "follow_up": (
            "下一步：继续观察 run 是否真正离开 waiting；"
            "若仍停留，优先检查审批、callback 或定时恢复事实链。"
        ),
    }
    assert body["callback_blocker_delta"] == {
        "sampled_scope_count": 1,
        "changed_scope_count": 1,
        "cleared_scope_count": 1,
        "fully_cleared_scope_count": 0,
        "still_blocked_scope_count": 1,
        "summary": (
            "阻塞变化：已解除 waiting external callback。 "
            "建议动作已切换为“Handle approval here first”。"
        ),
        "primary_resource": None,
    }
    assert body["run_snapshot"]["status"] == "waiting"
    assert body["run_snapshot"]["waiting_reason"] == "cleanup route pending"
    assert body["run_follow_up"]["affected_run_count"] == 1
    assert body["run_follow_up"]["sampled_run_count"] == 1
    assert body["run_follow_up"]["waiting_run_count"] == 1
    assert body["run_follow_up"]["sampled_runs"][0]["run_id"] == run_id
    assert body["run_follow_up"]["sampled_runs"][0]["snapshot"]["status"] == "waiting"
    assert body["run_follow_up"]["explanation"] is not None
    assert body["items"][0]["ticket"] == ticket
    assert body["items"][0]["node_id"] == "agent"
    assert body["items"][0]["status"] == "expired"
    assert ticket_record.status == "expired"
    assert ticket_record.expired_at is not None
    assert ticket_record.callback_payload == {
        "reason": "callback_ticket_expired",
        "source": "route_cleanup",
        "cleanup": True,
    }
    assert refreshed_run is not None
    assert refreshed_run.status == "waiting"
    assert len(scheduled_resumes) == 1
    assert scheduled_resumes[0].run_id == run_id
    assert scheduled_resumes[0].source == "route_cleanup"
    assert captured_scopes == [
        (run_id, ticket_record.node_run_id),
        (run_id, ticket_record.node_run_id),
    ]
    assert node_run is not None
    assert node_run.checkpoint_payload["scheduled_resume"] == {
        "delay_seconds": 0.0,
        "reason": "cleanup route pending",
        "source": "route_cleanup",
        "waiting_status": "waiting_callback",
        "backoff_attempt": 1,
        "scheduled_at": node_run.checkpoint_payload["scheduled_resume"]["scheduled_at"],
        "due_at": node_run.checkpoint_payload["scheduled_resume"]["due_at"],
    }
    assert event is not None
    assert event.payload["ticket"] == ticket
    assert event.payload["source"] == "route_cleanup"
    assert event.payload["cleanup"] is True
    assert resume_event is not None
    assert resume_event.payload == {
        "node_id": "agent",
        "delay_seconds": 0.0,
        "reason": "cleanup route pending",
        "source": "route_cleanup",
        "waiting_status": "waiting_callback",
        "backoff_attempt": 1,
    }


def test_cleanup_stale_run_callback_tickets_route_can_skip_resume_scheduling(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch,
) -> None:
    run_id, ticket = _create_waiting_callback_run(sqlite_session)
    ticket_record = sqlite_session.get(RunCallbackTicket, ticket)
    assert ticket_record is not None
    ticket_record.expires_at = datetime.now(UTC) - timedelta(minutes=5)
    sqlite_session.commit()

    scheduled_resumes = []
    monkeypatch.setattr(
        run_callback_ticket_routes.cleanup_service,
        "_resume_scheduler",
        RunResumeScheduler(dispatcher=scheduled_resumes.append),
    )

    response = client.post(
        "/api/runs/callback-tickets/cleanup",
        json={"source": "route_cleanup_no_resume", "schedule_resumes": False},
    )

    node_run = sqlite_session.scalar(
        select(NodeRun).where(NodeRun.run_id == run_id, NodeRun.node_id == "agent")
    )
    resume_event = sqlite_session.scalar(
        select(RunEvent)
        .where(
            RunEvent.run_id == run_id,
            RunEvent.event_type == "run.resume.scheduled",
        )
        .order_by(RunEvent.id.desc())
    )

    assert response.status_code == 200
    body = response.json()
    assert body["matched_count"] == 1
    assert body["expired_count"] == 1
    assert body["scheduled_resume_count"] == 0
    assert body["terminated_count"] == 0
    assert body["scheduled_resume_run_ids"] == []
    assert body["terminated_run_ids"] == []
    assert scheduled_resumes == []
    assert node_run is not None
    assert "scheduled_resume" not in (node_run.checkpoint_payload or {})
    assert resume_event is None


def test_cleanup_stale_run_callback_tickets_route_supports_dry_run(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch,
) -> None:
    run_id, ticket = _create_waiting_callback_run(sqlite_session)
    ticket_record = sqlite_session.get(RunCallbackTicket, ticket)
    assert ticket_record is not None
    ticket_record.expires_at = datetime.now(UTC) - timedelta(minutes=5)
    sqlite_session.commit()

    scheduled_resumes = []
    monkeypatch.setattr(
        run_callback_ticket_routes.cleanup_service,
        "_resume_scheduler",
        RunResumeScheduler(dispatcher=scheduled_resumes.append),
    )
    captured_scopes: list[tuple[str | None, str | None]] = []

    def fake_capture_callback_blocker_snapshot(
        db,
        *,
        run_id: str | None,
        node_run_id: str | None = None,
    ):
        captured_scopes.append((run_id, node_run_id))
        return f"snapshot:{run_id}:{node_run_id}"

    def fake_build_callback_blocker_delta_summary(*, before, after):
        assert before == f"snapshot:{run_id}:None"
        assert after == f"snapshot:{run_id}:None"
        return CallbackBlockerDeltaSummary(
            sampled_scope_count=1,
            changed_scope_count=0,
            cleared_scope_count=0,
            fully_cleared_scope_count=0,
            still_blocked_scope_count=1,
            summary=(
                "阻塞变化：当前仍是 waiting external callback。 "
                "建议动作仍是“Wait for callback result”。"
            ),
        )

    monkeypatch.setattr(
        run_callback_ticket_routes,
        "capture_callback_blocker_snapshot",
        fake_capture_callback_blocker_snapshot,
    )
    monkeypatch.setattr(
        run_callback_ticket_routes,
        "build_callback_blocker_delta_summary",
        fake_build_callback_blocker_delta_summary,
    )

    response = client.post(
        "/api/runs/callback-tickets/cleanup",
        json={
            "source": "route_cleanup_dry_run",
            "dry_run": True,
            "run_id": run_id,
        },
    )

    sqlite_session.refresh(ticket_record)
    matching_events = sqlite_session.scalars(
        select(RunEvent).where(
            RunEvent.run_id == run_id,
            RunEvent.event_type == "run.callback.ticket.expired",
        )
    ).all()

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "route_cleanup_dry_run"
    assert body["dry_run"] is True
    assert body["matched_count"] == 1
    assert body["expired_count"] == 0
    assert body["scheduled_resume_count"] == 0
    assert body["terminated_count"] == 0
    assert body["terminated_run_ids"] == []
    assert body["outcome_explanation"] == {
        "primary_signal": "本次 dry-run 匹配到 1 条潜在过期 callback ticket，但尚未真正写回状态。",
        "follow_up": (
            "如需真正收口过期 ticket 并触发后续恢复，"
            "请确认当前 scope 后执行非 dry-run cleanup。"
        ),
    }
    assert body["callback_blocker_delta"] == {
        "sampled_scope_count": 1,
        "changed_scope_count": 0,
        "cleared_scope_count": 0,
        "fully_cleared_scope_count": 0,
        "still_blocked_scope_count": 1,
        "summary": (
            "阻塞变化：当前仍是 waiting external callback。 "
            "建议动作仍是“Wait for callback result”。"
        ),
        "primary_resource": None,
    }
    assert body["run_snapshot"]["status"] == "waiting"
    assert body["run_snapshot"]["waiting_reason"] == "cleanup route pending"
    assert body["run_follow_up"]["affected_run_count"] == 1
    assert body["run_follow_up"]["sampled_run_count"] == 1
    assert body["run_follow_up"]["waiting_run_count"] == 1
    assert body["items"][0]["ticket"] == ticket
    assert body["items"][0]["status"] == "pending"
    assert ticket_record.status == "pending"
    assert ticket_record.expired_at is None
    assert matching_events == []
    assert scheduled_resumes == []
    assert captured_scopes == [(run_id, None), (run_id, None)]


def test_cleanup_service_can_schedule_immediate_resume_for_expired_callback_tickets(
    sqlite_session: Session,
) -> None:
    run_id, ticket = _create_waiting_callback_run(sqlite_session)
    ticket_record = sqlite_session.get(RunCallbackTicket, ticket)
    assert ticket_record is not None
    ticket_record.expires_at = datetime.now(UTC) - timedelta(minutes=5)
    sqlite_session.commit()

    scheduled_resumes = []
    cleanup_service = RunCallbackTicketCleanupService(
        resume_scheduler=RunResumeScheduler(dispatcher=scheduled_resumes.append)
    )

    result = cleanup_service.cleanup_stale_tickets(
        sqlite_session,
        source="scheduler_cleanup",
        schedule_resumes=True,
        resume_source="callback_ticket_monitor",
    )

    assert result.matched_count == 1
    assert result.expired_count == 1
    assert result.scheduled_resume_count == 1
    assert result.terminated_count == 0
    assert result.run_ids == [run_id]
    assert result.scheduled_resume_run_ids == [run_id]
    assert result.terminated_run_ids == []
    assert scheduled_resumes == []

    sqlite_session.commit()

    sqlite_session.refresh(ticket_record)
    node_run = sqlite_session.scalar(
        select(NodeRun).where(NodeRun.run_id == run_id, NodeRun.node_id == "agent")
    )
    resume_event = sqlite_session.scalar(
        select(RunEvent)
        .where(
            RunEvent.run_id == run_id,
            RunEvent.event_type == "run.resume.scheduled",
        )
        .order_by(RunEvent.id.desc())
    )

    assert ticket_record.status == "expired"
    assert node_run is not None
    assert len(scheduled_resumes) == 1
    assert scheduled_resumes[0].run_id == run_id
    assert scheduled_resumes[0].delay_seconds == 0.0
    assert scheduled_resumes[0].reason == "cleanup route pending"
    assert scheduled_resumes[0].source == "callback_ticket_monitor"
    assert node_run.checkpoint_payload["scheduled_resume"] == {
        "delay_seconds": 0.0,
        "reason": "cleanup route pending",
        "source": "callback_ticket_monitor",
        "waiting_status": "waiting_callback",
        "backoff_attempt": 1,
        "scheduled_at": node_run.checkpoint_payload["scheduled_resume"]["scheduled_at"],
        "due_at": node_run.checkpoint_payload["scheduled_resume"]["due_at"],
    }
    assert resume_event is not None
    assert resume_event.payload == {
        "node_id": "agent",
        "delay_seconds": 0.0,
        "reason": "cleanup route pending",
        "source": "callback_ticket_monitor",
        "waiting_status": "waiting_callback",
        "backoff_attempt": 1,
    }


def test_cleanup_service_applies_backoff_after_repeated_callback_expirations(
    sqlite_session: Session,
) -> None:
    run_id, ticket = _create_waiting_callback_run(sqlite_session)
    ticket_record = sqlite_session.get(RunCallbackTicket, ticket)
    assert ticket_record is not None
    node_run = sqlite_session.scalar(
        select(NodeRun).where(NodeRun.run_id == run_id, NodeRun.node_id == "agent")
    )
    assert node_run is not None
    node_run.checkpoint_payload = {
        **dict(node_run.checkpoint_payload or {}),
        "callback_waiting_lifecycle": {
            "wait_cycle_count": 2,
            "issued_ticket_count": 2,
            "expired_ticket_count": 1,
            "consumed_ticket_count": 0,
            "canceled_ticket_count": 0,
            "late_callback_count": 0,
            "resume_schedule_count": 0,
            "last_ticket_status": "expired",
            "last_ticket_reason": "callback_ticket_expired",
        },
    }
    ticket_record.expires_at = datetime.now(UTC) - timedelta(minutes=5)
    sqlite_session.commit()

    scheduled_resumes = []
    cleanup_service = RunCallbackTicketCleanupService(
        resume_scheduler=RunResumeScheduler(dispatcher=scheduled_resumes.append)
    )

    result = cleanup_service.cleanup_stale_tickets(
        sqlite_session,
        source="scheduler_cleanup",
        schedule_resumes=True,
        resume_source="callback_ticket_monitor",
    )

    assert result.matched_count == 1
    assert result.expired_count == 1
    assert result.scheduled_resume_count == 1
    assert scheduled_resumes == []

    sqlite_session.commit()
    sqlite_session.refresh(ticket_record)
    sqlite_session.refresh(node_run)

    assert len(scheduled_resumes) == 1
    assert scheduled_resumes[0].run_id == run_id
    assert scheduled_resumes[0].delay_seconds == 5.0
    assert scheduled_resumes[0].reason == "cleanup route pending"
    assert scheduled_resumes[0].source == "callback_ticket_monitor"
    assert ticket_record.status == "expired"
    assert node_run.checkpoint_payload["scheduled_resume"] == {
        "delay_seconds": 5.0,
        "reason": "cleanup route pending",
        "source": "callback_ticket_monitor",
        "waiting_status": "waiting_callback",
        "backoff_attempt": 2,
        "scheduled_at": node_run.checkpoint_payload["scheduled_resume"]["scheduled_at"],
        "due_at": node_run.checkpoint_payload["scheduled_resume"]["due_at"],
    }
    lifecycle = node_run.checkpoint_payload["callback_waiting_lifecycle"]
    assert lifecycle["expired_ticket_count"] == 2
    assert lifecycle["resume_schedule_count"] == 1
    assert lifecycle["max_expired_ticket_count"] == 3
    assert lifecycle["terminated"] is False
    assert lifecycle["termination_reason"] is None
    assert lifecycle["terminated_at"] is None
    assert lifecycle["last_resume_delay_seconds"] == 5.0
    assert lifecycle["last_resume_reason"] == "cleanup route pending"
    assert lifecycle["last_resume_source"] == "callback_ticket_monitor"
    assert lifecycle["last_resume_backoff_attempt"] == 2


def test_cleanup_service_schedules_only_one_resume_per_run_in_single_batch(
    sqlite_session: Session,
) -> None:
    run_id, ticket = _create_waiting_callback_run(sqlite_session, suffix="route-duplicate-batch")
    primary_ticket = sqlite_session.get(RunCallbackTicket, ticket)
    node_run = sqlite_session.scalar(
        select(NodeRun).where(NodeRun.run_id == run_id, NodeRun.node_id == "agent")
    )
    assert primary_ticket is not None
    assert node_run is not None

    expired_at = datetime.now(UTC) - timedelta(minutes=5)
    primary_ticket.expires_at = expired_at
    sqlite_session.add(
        RunCallbackTicket(
            id="duplicate-expired-ticket",
            run_id=run_id,
            node_run_id=node_run.id,
            tool_call_id=None,
            tool_id="native.search",
            tool_call_index=0,
            waiting_status="waiting_callback",
            status="pending",
            reason="stale duplicate pending ticket",
            created_at=expired_at - timedelta(minutes=1),
            expires_at=expired_at,
        )
    )
    sqlite_session.commit()

    scheduled_resumes = []
    cleanup_service = RunCallbackTicketCleanupService(
        resume_scheduler=RunResumeScheduler(dispatcher=scheduled_resumes.append)
    )

    result = cleanup_service.cleanup_stale_tickets(
        sqlite_session,
        source="scheduler_cleanup",
        schedule_resumes=True,
        resume_source="callback_ticket_monitor",
    )
    sqlite_session.commit()
    sqlite_session.refresh(node_run)

    resume_events = sqlite_session.scalars(
        select(RunEvent)
        .where(
            RunEvent.run_id == run_id,
            RunEvent.event_type == "run.resume.scheduled",
        )
        .order_by(RunEvent.id.asc())
    ).all()

    assert result.matched_count == 2
    assert result.expired_count == 2
    assert result.scheduled_resume_count == 1
    assert result.scheduled_resume_run_ids == [run_id]
    assert len(scheduled_resumes) == 1
    assert scheduled_resumes[0].run_id == run_id
    assert len(resume_events) == 1
    assert node_run.checkpoint_payload["scheduled_resume"] == {
        "delay_seconds": 0.0,
        "reason": "cleanup route pending",
        "source": "callback_ticket_monitor",
        "waiting_status": "waiting_callback",
        "backoff_attempt": 1,
        "scheduled_at": node_run.checkpoint_payload["scheduled_resume"]["scheduled_at"],
        "due_at": node_run.checkpoint_payload["scheduled_resume"]["due_at"],
    }


def test_cleanup_service_skips_resume_for_expired_ticket_outside_current_waiting_node(
    sqlite_session: Session,
) -> None:
    run_id, _ticket = _create_waiting_callback_run(sqlite_session, suffix="route-stale-node")
    run = sqlite_session.get(Run, run_id)
    active_node_run = sqlite_session.scalar(
        select(NodeRun).where(NodeRun.run_id == run_id, NodeRun.node_id == "agent")
    )
    assert run is not None
    assert active_node_run is not None

    stale_node_run = NodeRun(
        id="node-run-stale-callback",
        run_id=run_id,
        node_id="stale_agent",
        node_name="Stale Agent",
        node_type="llmAgentNode",
        status="waiting_callback",
        phase="waiting_callback",
        waiting_reason="stale callback pending",
        checkpoint_payload={},
    )
    expired_at = datetime.now(UTC) - timedelta(minutes=5)
    stale_ticket = RunCallbackTicket(
        id="stale-node-ticket",
        run_id=run_id,
        node_run_id=stale_node_run.id,
        tool_call_id=None,
        tool_id="native.search",
        tool_call_index=0,
        waiting_status="waiting_callback",
        status="pending",
        reason="stale callback ticket",
        created_at=expired_at - timedelta(minutes=1),
        expires_at=expired_at,
    )
    sqlite_session.add(stale_node_run)
    sqlite_session.add(stale_ticket)
    sqlite_session.commit()

    scheduled_resumes = []
    cleanup_service = RunCallbackTicketCleanupService(
        resume_scheduler=RunResumeScheduler(dispatcher=scheduled_resumes.append)
    )

    result = cleanup_service.cleanup_stale_tickets(
        sqlite_session,
        source="scheduler_cleanup",
        schedule_resumes=True,
        resume_source="callback_ticket_monitor",
        run_id=run_id,
        node_run_id=stale_node_run.id,
    )
    sqlite_session.commit()
    sqlite_session.refresh(stale_node_run)
    sqlite_session.refresh(run)

    resume_events = sqlite_session.scalars(
        select(RunEvent)
        .where(
            RunEvent.run_id == run_id,
            RunEvent.event_type == "run.resume.scheduled",
        )
        .order_by(RunEvent.id.asc())
    ).all()

    assert result.matched_count == 1
    assert result.expired_count == 1
    assert result.scheduled_resume_count == 0
    assert result.scheduled_resume_run_ids == []
    assert scheduled_resumes == []
    assert "scheduled_resume" not in (stale_node_run.checkpoint_payload or {})
    assert resume_events == []
    assert run.checkpoint_payload["waiting_node_run_id"] == active_node_run.id
    assert run.status == "waiting"


def test_cleanup_stale_run_callback_tickets_route_scopes_to_run_and_node(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch,
) -> None:
    target_run_id, target_ticket = _create_waiting_callback_run(
        sqlite_session,
        suffix="route-scope-a",
    )
    other_run_id, other_ticket = _create_waiting_callback_run(
        sqlite_session,
        suffix="route-scope-b",
    )
    target_record = sqlite_session.get(RunCallbackTicket, target_ticket)
    other_record = sqlite_session.get(RunCallbackTicket, other_ticket)
    assert target_record is not None
    assert other_record is not None
    target_record.expires_at = datetime.now(UTC) - timedelta(minutes=5)
    other_record.expires_at = datetime.now(UTC) - timedelta(minutes=5)
    sqlite_session.commit()

    scheduled_resumes = []
    monkeypatch.setattr(
        run_callback_ticket_routes.cleanup_service,
        "_resume_scheduler",
        RunResumeScheduler(dispatcher=scheduled_resumes.append),
    )

    response = client.post(
        "/api/runs/callback-tickets/cleanup",
        json={
            "source": "route_cleanup_scoped",
            "run_id": target_run_id,
            "node_run_id": target_record.node_run_id,
        },
    )

    assert response.status_code == 200
    body = response.json()

    sqlite_session.refresh(target_record)
    sqlite_session.refresh(other_record)

    assert body["matched_count"] == 1
    assert body["expired_count"] == 1
    assert body["scheduled_resume_count"] == 1
    assert body["run_ids"] == [target_run_id]
    assert target_record.status == "expired"
    assert other_record.status == "pending"
    assert len(scheduled_resumes) == 1
    assert scheduled_resumes[0].run_id == target_run_id
    assert scheduled_resumes[0].run_id != other_run_id


def test_cleanup_service_terminates_waiting_callback_after_max_expired_cycles(
    sqlite_session: Session,
) -> None:
    run_id, ticket = _create_waiting_callback_run(sqlite_session)
    ticket_record = sqlite_session.get(RunCallbackTicket, ticket)
    assert ticket_record is not None
    node_run = sqlite_session.scalar(
        select(NodeRun).where(NodeRun.run_id == run_id, NodeRun.node_id == "agent")
    )
    run = sqlite_session.get(Run, run_id)
    assert node_run is not None
    assert run is not None
    node_run.checkpoint_payload = {
        **dict(node_run.checkpoint_payload or {}),
        "callback_waiting_lifecycle": {
            "wait_cycle_count": 2,
            "issued_ticket_count": 2,
            "expired_ticket_count": 1,
            "consumed_ticket_count": 0,
            "canceled_ticket_count": 0,
            "late_callback_count": 0,
            "resume_schedule_count": 0,
            "max_expired_ticket_count": 2,
            "last_ticket_status": "expired",
            "last_ticket_reason": "callback_ticket_expired",
        },
    }
    ticket_record.expires_at = datetime.now(UTC) - timedelta(minutes=5)
    sqlite_session.commit()

    scheduled_resumes = []
    cleanup_service = RunCallbackTicketCleanupService(
        resume_scheduler=RunResumeScheduler(dispatcher=scheduled_resumes.append),
        max_expired_cycles=2,
    )

    result = cleanup_service.cleanup_stale_tickets(
        sqlite_session,
        source="scheduler_cleanup",
        schedule_resumes=True,
        resume_source="callback_ticket_monitor",
    )

    sqlite_session.commit()
    sqlite_session.refresh(ticket_record)
    sqlite_session.refresh(node_run)
    sqlite_session.refresh(run)

    terminated_event = sqlite_session.scalar(
        select(RunEvent)
        .where(
            RunEvent.run_id == run_id,
            RunEvent.event_type == "run.callback.waiting.terminated",
        )
        .order_by(RunEvent.id.desc())
    )
    run_failed_event = sqlite_session.scalar(
        select(RunEvent)
        .where(
            RunEvent.run_id == run_id,
            RunEvent.event_type == "run.failed",
        )
        .order_by(RunEvent.id.desc())
    )

    assert result.matched_count == 1
    assert result.expired_count == 1
    assert result.scheduled_resume_count == 0
    assert result.terminated_count == 1
    assert result.terminated_run_ids == [run_id]
    assert scheduled_resumes == []
    assert ticket_record.status == "expired"
    assert run.status == "failed"
    assert node_run.status == "failed"
    assert node_run.phase == "failed"
    assert node_run.phase_started_at == run.finished_at
    assert run.error_message == (
        "Callback waiting terminated after 2 expired ticket cycle(s) (max 2)."
    )
    assert node_run.error_message == run.error_message
    assert run.checkpoint_payload["waiting_node_run_id"] is None
    assert "callback_ticket" not in (node_run.checkpoint_payload or {})
    assert "scheduled_resume" not in (node_run.checkpoint_payload or {})
    assert (
        node_run.checkpoint_payload["callback_waiting_lifecycle"]["max_expired_ticket_count"]
        == 2
    )
    assert node_run.checkpoint_payload["callback_waiting_lifecycle"]["terminated"] is True
    assert (
        node_run.checkpoint_payload["callback_waiting_lifecycle"]["termination_reason"]
        == "callback_waiting_max_expired_tickets_reached"
    )
    assert node_run.checkpoint_payload["callback_waiting_lifecycle"]["terminated_at"] is not None
    assert terminated_event is not None
    assert terminated_event.payload["expired_ticket_count"] == 2
    assert terminated_event.payload["max_expired_ticket_count"] == 2
    assert terminated_event.payload["reason"] == "callback_waiting_max_expired_tickets_reached"
    assert run_failed_event is not None
    assert run_failed_event.payload["error"] == run.error_message
