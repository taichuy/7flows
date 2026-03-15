from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.run import (
    AICallRecord,
    NodeRun,
    Run,
    RunArtifact,
    RunCallbackTicket,
    RunEvent,
    ToolCallRecord,
)
from app.models.workflow import Workflow


def test_get_run_execution_view_returns_grouped_runtime_facts(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    run = Run(
        id="run-execution-view",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        compiled_blueprint_id="bp-execution-view",
        status="waiting",
        input_payload={"message": "inspect execution"},
        created_at=datetime(2026, 3, 11, 10, 0, tzinfo=UTC),
    )
    node_run = NodeRun(
        id="node-run-agent",
        run_id=run.id,
        node_id="agent_plan",
        node_name="Agent Plan",
        node_type="llm_agent",
        status="waiting_callback",
        phase="waiting_callback",
        retry_count=1,
        checkpoint_payload={
            "callback_waiting_lifecycle": {
                "wait_cycle_count": 2,
                "issued_ticket_count": 2,
                "expired_ticket_count": 1,
                "consumed_ticket_count": 0,
                "canceled_ticket_count": 0,
                "late_callback_count": 1,
                "resume_schedule_count": 1,
                "last_ticket_status": "pending",
                "last_ticket_reason": "search callback pending",
                "last_ticket_updated_at": "2026-03-11T10:01:00Z",
                "last_late_callback_status": "expired",
                "last_late_callback_reason": "callback_ticket_expired",
                "last_late_callback_at": "2026-03-11T10:05:00Z",
                "last_resume_delay_seconds": 5.0,
                "last_resume_reason": "search callback pending",
                "last_resume_source": "callback_ticket_monitor",
                "last_resume_backoff_attempt": 2,
            }
        },
        artifact_refs=["artifact://artifact-tool", "artifact://artifact-evidence"],
        waiting_reason="Waiting for external search callback.",
        started_at=datetime(2026, 3, 11, 10, 0, tzinfo=UTC),
        phase_started_at=datetime(2026, 3, 11, 10, 1, tzinfo=UTC),
        created_at=datetime(2026, 3, 11, 10, 0, tzinfo=UTC),
    )
    sqlite_session.add_all(
        [
            run,
            node_run,
            RunArtifact(
                id="artifact-tool",
                run_id=run.id,
                node_run_id=node_run.id,
                artifact_kind="tool_result",
                content_type="json",
                summary="Tool returned pending callback metadata.",
                payload={"status": "waiting"},
                created_at=datetime(2026, 3, 11, 10, 1, tzinfo=UTC),
            ),
            RunArtifact(
                id="artifact-evidence",
                run_id=run.id,
                node_run_id=node_run.id,
                artifact_kind="evidence_pack",
                content_type="json",
                summary="Assistant highlighted missing facts.",
                payload={"summary": "Need callback result."},
                created_at=datetime(2026, 3, 11, 10, 2, tzinfo=UTC),
            ),
            ToolCallRecord(
                id="tool-call-agent",
                run_id=run.id,
                node_run_id=node_run.id,
                tool_id="compat:dify:plugin/search",
                tool_name="search",
                phase="tool_execute",
                status="waiting",
                request_summary="Search pending callback.",
                response_summary="Waiting for callback payload.",
                raw_artifact_id="artifact-tool",
                latency_ms=1200,
                retry_count=0,
                created_at=datetime(2026, 3, 11, 10, 1, tzinfo=UTC),
            ),
            AICallRecord(
                id="ai-call-main",
                run_id=run.id,
                node_run_id=node_run.id,
                role="main_plan",
                status="succeeded",
                provider="mock-provider",
                model_id="mock-model",
                input_summary="Plan request",
                output_summary="Tool call plan",
                latency_ms=300,
                assistant=False,
                created_at=datetime(2026, 3, 11, 10, 0, tzinfo=UTC),
            ),
            AICallRecord(
                id="ai-call-assistant",
                run_id=run.id,
                node_run_id=node_run.id,
                role="assistant_distill",
                status="succeeded",
                provider="mock-provider",
                model_id="mock-model",
                input_summary="Summarize tool result",
                output_summary="Missing callback data",
                latency_ms=180,
                assistant=True,
                created_at=datetime(2026, 3, 11, 10, 2, tzinfo=UTC),
            ),
            RunCallbackTicket(
                id="ticket-agent",
                run_id=run.id,
                node_run_id=node_run.id,
                tool_call_id="tool-call-agent",
                tool_id="compat:dify:plugin/search",
                tool_call_index=0,
                waiting_status="waiting_callback",
                status="pending",
                reason="search callback pending",
                created_at=datetime(2026, 3, 11, 10, 1, tzinfo=UTC),
                expires_at=datetime(2026, 3, 12, 10, 1, tzinfo=UTC),
            ),
            RunEvent(
                run_id=run.id,
                event_type="run.started",
                payload={"input": {"message": "inspect execution"}},
                created_at=datetime(2026, 3, 11, 10, 0, tzinfo=UTC),
            ),
            RunEvent(
                run_id=run.id,
                node_run_id=node_run.id,
                event_type="tool.waiting",
                payload={"tool_id": "compat:dify:plugin/search"},
                created_at=datetime(2026, 3, 11, 10, 1, tzinfo=UTC),
            ),
            RunEvent(
                run_id=run.id,
                node_run_id=node_run.id,
                event_type="run.callback.ticket.issued",
                payload={"ticket": "ticket-agent"},
                created_at=datetime(2026, 3, 11, 10, 1, tzinfo=UTC),
            ),
        ]
    )
    sqlite_session.commit()

    response = client.get(f"/api/runs/{run.id}/execution-view")

    assert response.status_code == 200
    body = response.json()
    assert body["run_id"] == run.id
    assert body["compiled_blueprint_id"] == "bp-execution-view"
    assert body["summary"]["node_run_count"] == 1
    assert body["summary"]["waiting_node_count"] == 1
    assert body["summary"]["artifact_count"] == 2
    assert body["summary"]["tool_call_count"] == 1
    assert body["summary"]["ai_call_count"] == 2
    assert body["summary"]["assistant_call_count"] == 1
    assert body["summary"]["callback_ticket_count"] == 1
    assert body["summary"]["artifact_kind_counts"] == {
        "evidence_pack": 1,
        "tool_result": 1,
    }
    assert body["summary"]["callback_ticket_status_counts"] == {"pending": 1}
    assert len(body["nodes"]) == 1
    node = body["nodes"][0]
    assert node["node_run_id"] == node_run.id
    assert node["phase"] == "waiting_callback"
    assert node["event_count"] == 2
    assert node["event_type_counts"] == {
        "run.callback.ticket.issued": 1,
        "tool.waiting": 1,
    }
    assert node["last_event_type"] == "run.callback.ticket.issued"
    assert len(node["artifacts"]) == 2
    assert len(node["tool_calls"]) == 1
    assert len(node["ai_calls"]) == 2
    assert len(node["callback_tickets"]) == 1
    assert node["callback_tickets"][0]["ticket"] == "ticket-agent"
    assert node["callback_tickets"][0]["expires_at"] == "2026-03-12T10:01:00Z"
    assert node["callback_tickets"][0]["expired_at"] is None
    assert node["callback_waiting_lifecycle"] == {
        "wait_cycle_count": 2,
        "issued_ticket_count": 2,
        "expired_ticket_count": 1,
        "consumed_ticket_count": 0,
        "canceled_ticket_count": 0,
        "late_callback_count": 1,
        "resume_schedule_count": 1,
        "last_ticket_status": "pending",
        "last_ticket_reason": "search callback pending",
        "last_ticket_updated_at": "2026-03-11T10:01:00Z",
        "last_late_callback_status": "expired",
        "last_late_callback_reason": "callback_ticket_expired",
        "last_late_callback_at": "2026-03-11T10:05:00Z",
        "last_resume_delay_seconds": 5.0,
        "last_resume_reason": "search callback pending",
        "last_resume_source": "callback_ticket_monitor",
        "last_resume_backoff_attempt": 2,
    }


def test_get_run_evidence_view_returns_evidence_nodes_only(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    run = Run(
        id="run-evidence-view",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="succeeded",
        input_payload={"message": "inspect evidence"},
        output_payload={"result": "final answer"},
        created_at=datetime(2026, 3, 11, 11, 0, tzinfo=UTC),
    )
    evidence_node = NodeRun(
        id="node-run-evidence",
        run_id=run.id,
        node_id="agent_review",
        node_name="Agent Review",
        node_type="llm_agent",
        status="succeeded",
        phase="emit_output",
        artifact_refs=["artifact://artifact-tool-result", "artifact://artifact-evidence-pack"],
        evidence_context={
            "summary": "Assistant extracted the decision basis.",
            "key_points": ["Found supporting article", "Need manual review on one conflict"],
            "evidence": [
                {
                    "title": "Key fact",
                    "detail": "The callback supplied the missing identifier.",
                    "source_ref": "artifact://artifact-tool-result",
                }
            ],
            "conflicts": ["One source disagreed on pricing."],
            "unknowns": ["Need confirm the newest quota policy."],
            "recommended_focus": ["Validate callback payload against publish contract."],
            "confidence": 0.72,
        },
        output_payload={"decision": "continue", "result": {"answer": "done"}},
        started_at=datetime(2026, 3, 11, 11, 0, tzinfo=UTC),
        finished_at=datetime(2026, 3, 11, 11, 3, tzinfo=UTC),
        created_at=datetime(2026, 3, 11, 11, 0, tzinfo=UTC),
    )
    plain_node = NodeRun(
        id="node-run-plain",
        run_id=run.id,
        node_id="output",
        node_name="Output",
        node_type="output",
        status="succeeded",
        phase="emit_output",
        output_payload={"answer": "done"},
        started_at=datetime(2026, 3, 11, 11, 3, tzinfo=UTC),
        finished_at=datetime(2026, 3, 11, 11, 4, tzinfo=UTC),
        created_at=datetime(2026, 3, 11, 11, 3, tzinfo=UTC),
    )
    sqlite_session.add_all(
        [
            run,
            evidence_node,
            plain_node,
            RunArtifact(
                id="artifact-tool-result",
                run_id=run.id,
                node_run_id=evidence_node.id,
                artifact_kind="tool_result",
                content_type="json",
                summary="Structured callback payload",
                payload={"identifier": "abc-123"},
                created_at=datetime(2026, 3, 11, 11, 1, tzinfo=UTC),
            ),
            RunArtifact(
                id="artifact-evidence-pack",
                run_id=run.id,
                node_run_id=evidence_node.id,
                artifact_kind="evidence_pack",
                content_type="json",
                summary="Assistant evidence pack",
                payload={"summary": "Assistant extracted the decision basis."},
                created_at=datetime(2026, 3, 11, 11, 2, tzinfo=UTC),
            ),
            ToolCallRecord(
                id="tool-call-evidence",
                run_id=run.id,
                node_run_id=evidence_node.id,
                tool_id="compat:dify:plugin/search",
                tool_name="search",
                phase="tool_execute",
                status="success",
                request_summary="Search request",
                response_summary="Structured callback payload",
                raw_artifact_id="artifact-tool-result",
                latency_ms=980,
                retry_count=0,
                created_at=datetime(2026, 3, 11, 11, 1, tzinfo=UTC),
            ),
            AICallRecord(
                id="ai-call-assistant-evidence",
                run_id=run.id,
                node_run_id=evidence_node.id,
                role="assistant_distill",
                status="succeeded",
                provider="mock-provider",
                model_id="mock-model",
                input_summary="Summarize callback payload",
                output_summary="Assistant extracted the decision basis.",
                latency_ms=210,
                assistant=True,
                created_at=datetime(2026, 3, 11, 11, 2, tzinfo=UTC),
            ),
        ]
    )
    sqlite_session.commit()

    response = client.get(f"/api/runs/{run.id}/evidence-view")

    assert response.status_code == 200
    body = response.json()
    assert body["run_id"] == run.id
    assert body["summary"] == {
        "node_count": 1,
        "artifact_count": 2,
        "tool_call_count": 1,
        "assistant_call_count": 1,
    }
    assert len(body["nodes"]) == 1
    node = body["nodes"][0]
    assert node["node_run_id"] == evidence_node.id
    assert node["summary"] == "Assistant extracted the decision basis."
    assert node["key_points"] == [
        "Found supporting article",
        "Need manual review on one conflict",
    ]
    assert node["evidence"][0]["source_ref"] == "artifact://artifact-tool-result"
    assert node["conflicts"] == ["One source disagreed on pricing."]
    assert node["unknowns"] == ["Need confirm the newest quota policy."]
    assert node["recommended_focus"] == [
        "Validate callback payload against publish contract."
    ]
    assert node["confidence"] == 0.72
    assert node["decision_output"] == {"decision": "continue", "result": {"answer": "done"}}
    assert len(node["tool_calls"]) == 1
    assert len(node["assistant_calls"]) == 1
    assert [artifact["id"] for artifact in node["supporting_artifacts"]] == [
        "artifact-tool-result",
        "artifact-evidence-pack",
    ]
