from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes import run_callback_tickets as run_callback_ticket_routes
from app.models.run import NodeRun, Run, RunCallbackTicket, RunEvent
from app.models.workflow import Workflow, WorkflowVersion
from app.services.plugin_runtime import PluginCallProxy, PluginRegistry, PluginToolDefinition
from app.services.run_callback_ticket_cleanup import RunCallbackTicketCleanupService
from app.services.run_resume_scheduler import RunResumeScheduler
from app.services.runtime import RuntimeService


def _create_waiting_callback_run(sqlite_session: Session) -> tuple[str, str]:
    workflow = Workflow(
        id="wf-cleanup-route",
        name="Cleanup Route Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "agent",
                    "type": "llm_agent",
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
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "output"},
            ],
        },
    )
    workflow_version = WorkflowVersion(
        id="wf-cleanup-route-v1",
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

    response = client.post(
        "/api/runs/callback-tickets/cleanup",
        json={"source": "route_cleanup"},
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
    assert body["run_ids"] == [run_id]
    assert body["scheduled_resume_run_ids"] == [run_id]
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
    assert node_run is not None
    assert node_run.checkpoint_payload["scheduled_resume"] == {
        "delay_seconds": 0.0,
        "reason": "cleanup route pending",
        "source": "route_cleanup",
        "waiting_status": "waiting_callback",
        "backoff_attempt": 1,
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
    assert body["scheduled_resume_run_ids"] == []
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

    response = client.post(
        "/api/runs/callback-tickets/cleanup",
        json={"source": "route_cleanup_dry_run", "dry_run": True},
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
    assert body["items"][0]["ticket"] == ticket
    assert body["items"][0]["status"] == "pending"
    assert ticket_record.status == "pending"
    assert ticket_record.expired_at is None
    assert matching_events == []
    assert scheduled_resumes == []


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
    assert result.run_ids == [run_id]
    assert result.scheduled_resume_run_ids == [run_id]
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
    }
    lifecycle = node_run.checkpoint_payload["callback_waiting_lifecycle"]
    assert lifecycle["expired_ticket_count"] == 2
    assert lifecycle["resume_schedule_count"] == 1
    assert lifecycle["last_resume_delay_seconds"] == 5.0
    assert lifecycle["last_resume_reason"] == "cleanup route pending"
    assert lifecycle["last_resume_source"] == "callback_ticket_monitor"
    assert lifecycle["last_resume_backoff_attempt"] == 2
