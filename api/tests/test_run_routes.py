import json
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import Run, RunEvent
from app.models.workflow import Workflow


def test_execute_workflow_route(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "hi"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["workflow_id"] == sample_workflow.id
    assert body["workflow_version"] == "0.1.0"
    assert body["status"] == "succeeded"
    assert len(body["node_runs"]) == 3
    assert body["events"][-1]["event_type"] == "run.completed"

    run_id = body["id"]
    stored_response = client.get(f"/api/runs/{run_id}")
    assert stored_response.status_code == 200
    stored_body = stored_response.json()
    assert stored_body["id"] == run_id
    assert stored_body["event_count"] == len(body["events"])
    assert stored_body["event_type_counts"]["run.completed"] == 1
    assert stored_body["first_event_at"] == body["events"][0]["created_at"]
    assert stored_body["last_event_at"] == body["events"][-1]["created_at"]


def test_get_run_supports_summary_mode_without_events(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "summary only"}},
    )

    assert response.status_code == 201
    body = response.json()
    run_id = body["id"]

    summary_response = client.get(f"/api/runs/{run_id}", params={"include_events": "false"})

    assert summary_response.status_code == 200
    summary_body = summary_response.json()
    assert summary_body["id"] == run_id
    assert summary_body["event_count"] == len(body["events"])
    assert summary_body["event_type_counts"]["run.started"] == 1
    assert summary_body["event_type_counts"]["run.completed"] == 1
    assert summary_body["first_event_at"] == body["events"][0]["created_at"]
    assert summary_body["last_event_at"] == body["events"][-1]["created_at"]
    assert summary_body["events"] == []


def _parse_trace_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_get_run_trace_supports_machine_filters(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "trace me"}},
    )

    assert response.status_code == 201
    body = response.json()
    run_id = body["id"]
    first_node_run_id = body["node_runs"][0]["id"]

    trace_response = client.get(f"/api/runs/{run_id}/trace", params={"limit": 2})

    assert trace_response.status_code == 200
    trace_body = trace_response.json()
    assert trace_body["run_id"] == run_id
    assert trace_body["filters"] == {
        "cursor": None,
        "event_type": None,
        "node_run_id": None,
        "created_after": None,
        "created_before": None,
        "payload_key": None,
        "before_event_id": None,
        "after_event_id": None,
        "limit": 2,
        "order": "asc",
    }
    assert trace_body["summary"]["total_event_count"] == len(body["events"])
    assert trace_body["summary"]["matched_event_count"] == len(body["events"])
    assert trace_body["summary"]["returned_event_count"] == 2
    assert trace_body["summary"]["has_more"] is True
    assert _parse_trace_datetime(trace_body["summary"]["trace_started_at"]).replace(
        tzinfo=None
    ) == _parse_trace_datetime(body["events"][0]["created_at"]).replace(tzinfo=None)
    assert _parse_trace_datetime(trace_body["summary"]["trace_finished_at"]).replace(
        tzinfo=None
    ) == _parse_trace_datetime(body["events"][-1]["created_at"]).replace(tzinfo=None)
    assert _parse_trace_datetime(trace_body["summary"]["matched_started_at"]).replace(
        tzinfo=None
    ) == _parse_trace_datetime(body["events"][0]["created_at"]).replace(tzinfo=None)
    assert _parse_trace_datetime(trace_body["summary"]["matched_finished_at"]).replace(
        tzinfo=None
    ) == _parse_trace_datetime(body["events"][-1]["created_at"]).replace(tzinfo=None)
    assert _parse_trace_datetime(trace_body["summary"]["returned_started_at"]).replace(
        tzinfo=None
    ) == _parse_trace_datetime(body["events"][0]["created_at"]).replace(tzinfo=None)
    assert _parse_trace_datetime(trace_body["summary"]["returned_finished_at"]).replace(
        tzinfo=None
    ) == _parse_trace_datetime(body["events"][1]["created_at"]).replace(tzinfo=None)
    assert trace_body["summary"]["returned_duration_ms"] >= 0
    assert "input" in trace_body["summary"]["available_payload_keys"]
    assert "node_type" in trace_body["summary"]["available_payload_keys"]
    assert trace_body["summary"]["first_event_id"] == body["events"][0]["id"]
    assert trace_body["summary"]["last_event_id"] == body["events"][1]["id"]
    assert trace_body["summary"]["prev_cursor"] is None
    assert isinstance(trace_body["summary"]["next_cursor"], str)
    assert len(trace_body["events"]) == 2
    assert trace_body["events"][0]["sequence"] == 1
    assert trace_body["events"][0]["replay_offset_ms"] == 0
    assert trace_body["events"][1]["sequence"] == 2
    assert trace_body["events"][1]["replay_offset_ms"] >= 0

    next_page_response = client.get(
        f"/api/runs/{run_id}/trace",
        params={"cursor": trace_body["summary"]["next_cursor"]},
    )

    assert next_page_response.status_code == 200
    next_page_body = next_page_response.json()
    assert next_page_body["filters"]["cursor"] == trace_body["summary"]["next_cursor"]
    assert next_page_body["filters"]["after_event_id"] == body["events"][1]["id"]
    assert next_page_body["filters"]["order"] == "asc"
    assert next_page_body["events"][0]["id"] == body["events"][2]["id"]

    filtered_response = client.get(
        f"/api/runs/{run_id}/trace",
        params={"node_run_id": first_node_run_id, "event_type": "node.started"},
    )

    assert filtered_response.status_code == 200
    filtered_body = filtered_response.json()
    assert filtered_body["summary"]["matched_event_count"] == 1
    assert filtered_body["summary"]["returned_event_count"] == 1
    assert filtered_body["summary"]["returned_duration_ms"] == 0
    assert filtered_body["summary"]["next_cursor"] is None
    assert filtered_body["summary"]["prev_cursor"] is None
    assert filtered_body["events"] == [
        {
            "id": body["events"][1]["id"],
            "run_id": run_id,
            "node_run_id": first_node_run_id,
            "event_type": "node.started",
            "payload": body["events"][1]["payload"],
            "created_at": filtered_body["events"][0]["created_at"],
            "sequence": 2,
            "replay_offset_ms": filtered_body["events"][0]["replay_offset_ms"],
        }
    ]
    assert _parse_trace_datetime(filtered_body["events"][0]["created_at"]).replace(
        tzinfo=None
    ) == _parse_trace_datetime(body["events"][1]["created_at"]).replace(tzinfo=None)
    assert filtered_body["events"][0]["replay_offset_ms"] >= 0


def test_get_run_trace_supports_cursor_and_desc_order(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "trace order"}},
    )

    assert response.status_code == 201
    body = response.json()
    run_id = body["id"]
    anchor_event_id = body["events"][-1]["id"]

    trace_response = client.get(
        f"/api/runs/{run_id}/trace",
        params={"before_event_id": anchor_event_id, "order": "desc", "limit": 3},
    )

    assert trace_response.status_code == 200
    trace_body = trace_response.json()
    expected_events = list(reversed(body["events"][:-1]))[:3]
    assert [event["id"] for event in trace_body["events"]] == [
        event["id"] for event in expected_events
    ]
    assert [event["sequence"] for event in trace_body["events"]] == [
        len(body["events"]) - 1,
        len(body["events"]) - 2,
        len(body["events"]) - 3,
    ]
    assert trace_body["summary"]["returned_started_at"] == trace_body["events"][-1]["created_at"]
    assert trace_body["summary"]["returned_finished_at"] == trace_body["events"][0]["created_at"]
    assert trace_body["summary"]["returned_duration_ms"] >= 0
    assert isinstance(trace_body["summary"]["next_cursor"], str)
    assert isinstance(trace_body["summary"]["prev_cursor"], str)
    assert trace_body["filters"]["before_event_id"] == anchor_event_id
    assert trace_body["filters"]["order"] == "desc"

    prev_page_response = client.get(
        f"/api/runs/{run_id}/trace",
        params={"cursor": trace_body["summary"]["prev_cursor"]},
    )

    assert prev_page_response.status_code == 200
    prev_page_body = prev_page_response.json()
    assert prev_page_body["filters"]["cursor"] == trace_body["summary"]["prev_cursor"]
    assert prev_page_body["filters"]["after_event_id"] == expected_events[0]["id"]
    assert prev_page_body["filters"]["order"] == "asc"
    assert prev_page_body["events"][0]["id"] == body["events"][-1]["id"]


def test_get_run_trace_supports_time_range_and_payload_key_search(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    run = Run(
        id="run-trace-time-payload",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="succeeded",
        input_payload={"message": "trace filters"},
        output_payload={"answer": "done"},
        created_at=datetime(2026, 3, 10, 8, 0, tzinfo=UTC),
    )
    sqlite_session.add(run)
    sqlite_session.flush()

    base_time = datetime(2026, 3, 10, 8, 0, tzinfo=UTC)
    sqlite_session.add_all(
        [
            RunEvent(
                run_id=run.id,
                event_type="run.started",
                payload={"input": {"message": "trace filters"}},
                created_at=base_time,
            ),
            RunEvent(
                run_id=run.id,
                node_run_id="node-planner",
                event_type="node.output.completed",
                payload={"node_id": "planner", "output": {"summary": "draft"}},
                created_at=base_time + timedelta(minutes=1),
            ),
            RunEvent(
                run_id=run.id,
                node_run_id="node-reader",
                event_type="node.context.read",
                payload={
                    "node_id": "reader",
                    "results": [{"nodeId": "planner", "artifactType": "json"}],
                },
                created_at=base_time + timedelta(minutes=2),
            ),
            RunEvent(
                run_id=run.id,
                node_run_id="node-output",
                event_type="node.output.completed",
                payload={"node_id": "output", "output": {"final": {"answer": "done"}}},
                created_at=base_time + timedelta(minutes=3),
            ),
        ]
    )
    sqlite_session.commit()

    trace_response = client.get(
        f"/api/runs/{run.id}/trace",
        params={
            "created_after": (base_time + timedelta(minutes=1, seconds=30)).isoformat(),
            "created_before": (base_time + timedelta(minutes=3, seconds=30)).isoformat(),
            "payload_key": "artifactType",
        },
    )

    assert trace_response.status_code == 200
    trace_body = trace_response.json()
    assert trace_body["filters"]["payload_key"] == "artifactType"
    assert trace_body["summary"]["matched_event_count"] == 1
    assert trace_body["summary"]["returned_event_count"] == 1
    assert _parse_trace_datetime(trace_body["summary"]["trace_started_at"]).replace(
        tzinfo=None
    ) == base_time.replace(tzinfo=None)
    assert _parse_trace_datetime(trace_body["summary"]["trace_finished_at"]).replace(
        tzinfo=None
    ) == (base_time + timedelta(minutes=3)).replace(tzinfo=None)
    assert trace_body["summary"]["matched_started_at"] == trace_body["events"][0]["created_at"]
    assert trace_body["summary"]["matched_finished_at"] == trace_body["events"][0]["created_at"]
    assert trace_body["summary"]["returned_started_at"] == trace_body["events"][0]["created_at"]
    assert trace_body["summary"]["returned_finished_at"] == trace_body["events"][0]["created_at"]
    assert trace_body["summary"]["returned_duration_ms"] == 0
    assert trace_body["summary"]["next_cursor"] is None
    assert trace_body["summary"]["prev_cursor"] is None
    expected_event_id = sqlite_session.scalars(
        select(RunEvent.id).where(
            RunEvent.run_id == run.id,
            RunEvent.event_type == "node.context.read",
        )
    ).one()
    assert trace_body["events"] == [
        {
            "id": expected_event_id,
            "run_id": run.id,
            "node_run_id": "node-reader",
            "event_type": "node.context.read",
            "payload": {
                "node_id": "reader",
                "results": [{"nodeId": "planner", "artifactType": "json"}],
            },
            "created_at": trace_body["events"][0]["created_at"],
            "sequence": 3,
            "replay_offset_ms": 120000,
        }
    ]
    trace_created_at = _parse_trace_datetime(trace_body["events"][0]["created_at"])
    assert trace_created_at.replace(tzinfo=None) == (base_time + timedelta(minutes=2)).replace(
        tzinfo=None
    )
    assert "artifactType" in trace_body["summary"]["available_payload_keys"]
    assert "results.artifactType" in trace_body["summary"]["available_payload_keys"]


def test_get_run_trace_rejects_invalid_time_range(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "time guard"}},
    )

    assert response.status_code == 201
    run_id = response.json()["id"]

    trace_response = client.get(
        f"/api/runs/{run_id}/trace",
        params={
            "created_after": "2026-03-10T09:00:00+00:00",
            "created_before": "2026-03-10T08:00:00+00:00",
        },
    )

    assert trace_response.status_code == 422
    assert trace_response.json() == {
        "detail": "created_after must be earlier than or equal to created_before."
    }


def test_get_run_trace_returns_404_for_missing_run(client: TestClient) -> None:
    response = client.get("/api/runs/run-missing/trace")

    assert response.status_code == 404
    assert response.json() == {"detail": "Run not found."}


def test_get_run_trace_rejects_invalid_cursor(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "cursor guard"}},
    )

    assert response.status_code == 201
    run_id = response.json()["id"]

    trace_response = client.get(
        f"/api/runs/{run_id}/trace",
        params={"cursor": "not-a-valid-cursor"},
    )

    assert trace_response.status_code == 422
    assert trace_response.json() == {"detail": "cursor is invalid."}


def test_export_run_trace_supports_json_and_jsonl(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "export trace"}},
    )

    assert response.status_code == 201
    body = response.json()
    run_id = body["id"]

    export_json_response = client.get(
        f"/api/runs/{run_id}/trace/export",
        params={"event_type": "node.started", "format": "json"},
    )

    assert export_json_response.status_code == 200
    assert export_json_response.headers["content-type"].startswith("application/json")
    assert (
        export_json_response.headers["content-disposition"]
        == f'attachment; filename="run-{run_id}-trace.json"'
    )
    export_json_body = export_json_response.json()
    assert export_json_body["filters"]["event_type"] == "node.started"
    assert export_json_body["summary"]["matched_event_count"] == 3
    assert all(event["event_type"] == "node.started" for event in export_json_body["events"])

    export_jsonl_response = client.get(
        f"/api/runs/{run_id}/trace/export",
        params={
            "node_run_id": body["node_runs"][0]["id"],
            "event_type": "node.started",
            "format": "jsonl",
        },
    )

    assert export_jsonl_response.status_code == 200
    assert export_jsonl_response.headers["content-type"].startswith("application/x-ndjson")
    assert (
        export_jsonl_response.headers["content-disposition"]
        == f'attachment; filename="run-{run_id}-trace.jsonl"'
    )
    export_lines = [
        json.loads(line)
        for line in export_jsonl_response.text.splitlines()
        if line.strip()
    ]
    assert export_lines[0]["record_type"] == "trace"
    assert export_lines[0]["filters"]["node_run_id"] == body["node_runs"][0]["id"]
    assert export_lines[0]["filters"]["event_type"] == "node.started"
    assert export_lines[0]["summary"]["matched_event_count"] == 1
    assert len(export_lines) == 2
    assert export_lines[1]["record_type"] == "event"
    assert export_lines[1]["node_run_id"] == body["node_runs"][0]["id"]
    assert export_lines[1]["event_type"] == "node.started"


def test_execute_workflow_route_returns_handled_failure_branch(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-failure-branch",
        name="Route Failure Branch",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "explode",
                    "type": "tool",
                    "name": "Explode",
                    "config": {"mock_error": "route boom"},
                },
                {
                    "id": "fallback",
                    "type": "tool",
                    "name": "Fallback",
                    "config": {"mock_output": {"answer": "route recovered"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "explode"},
                {
                    "id": "e2",
                    "sourceNodeId": "explode",
                    "targetNodeId": "fallback",
                    "condition": "failed",
                },
                {"id": "e3", "sourceNodeId": "fallback", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"message": "recover"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["output_payload"] == {"fallback": {"answer": "route recovered"}}
    assert {node_run["node_id"]: node_run["status"] for node_run in body["node_runs"]} == {
        "trigger": "succeeded",
        "explode": "failed",
        "fallback": "succeeded",
        "output": "succeeded",
    }


def test_execute_workflow_route_exposes_retry_events(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-retry",
        name="Route Retry Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "flaky_tool",
                    "type": "tool",
                    "name": "Flaky Tool",
                    "config": {
                        "mock_error_sequence": ["route temporary"],
                        "mock_output": {"answer": "route recovered"},
                    },
                    "runtimePolicy": {
                        "retry": {
                            "maxAttempts": 2,
                            "backoffSeconds": 0,
                        }
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "flaky_tool"},
                {"id": "e2", "sourceNodeId": "flaky_tool", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"message": "retry route"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["output_payload"] == {"flaky_tool": {"answer": "route recovered"}}
    assert [event["event_type"] for event in body["events"]].count("node.retrying") == 1


def test_execute_workflow_route_supports_selector_driven_branching(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-selector",
        name="Route Selector Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "branch",
                    "type": "router",
                    "name": "Branch",
                    "config": {
                        "selector": {
                            "rules": [
                                {
                                    "key": "search",
                                    "path": "trigger_input.intent",
                                    "operator": "eq",
                                    "value": "search",
                                }
                            ]
                        }
                    },
                },
                {
                    "id": "search_path",
                    "type": "tool",
                    "name": "Search Path",
                    "config": {"mock_output": {"answer": "search mode"}},
                },
                {
                    "id": "default_path",
                    "type": "tool",
                    "name": "Default Path",
                    "config": {"mock_output": {"answer": "default mode"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "branch"},
                {
                    "id": "e2",
                    "sourceNodeId": "branch",
                    "targetNodeId": "search_path",
                    "condition": "search",
                },
                {"id": "e3", "sourceNodeId": "branch", "targetNodeId": "default_path"},
                {"id": "e4", "sourceNodeId": "search_path", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "default_path", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"intent": "search"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["output_payload"] == {"search_path": {"answer": "search mode"}}
    assert {node_run["node_id"]: node_run["status"] for node_run in body["node_runs"]} == {
        "trigger": "succeeded",
        "branch": "succeeded",
        "search_path": "succeeded",
        "default_path": "skipped",
        "output": "succeeded",
    }


def test_execute_workflow_route_supports_expression_driven_branching(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-expression",
        name="Route Expression Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "branch",
                    "type": "router",
                    "name": "Branch",
                    "config": {
                        "expression": "trigger_input.intent if trigger_input.intent else 'default'"
                    },
                },
                {
                    "id": "search_path",
                    "type": "tool",
                    "name": "Search Path",
                    "config": {"mock_output": {"answer": "search mode"}},
                },
                {
                    "id": "default_path",
                    "type": "tool",
                    "name": "Default Path",
                    "config": {"mock_output": {"answer": "default mode"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "branch"},
                {
                    "id": "e2",
                    "sourceNodeId": "branch",
                    "targetNodeId": "search_path",
                    "condition": "search",
                },
                {"id": "e3", "sourceNodeId": "branch", "targetNodeId": "default_path"},
                {"id": "e4", "sourceNodeId": "search_path", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "default_path", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"intent": "search"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["output_payload"] == {"search_path": {"answer": "search mode"}}
    branch_run = next(node_run for node_run in body["node_runs"] if node_run["node_id"] == "branch")
    assert branch_run["output_payload"]["selected"] == "search"
    assert branch_run["output_payload"]["expression"]["defaultUsed"] is False


def test_execute_workflow_route_supports_edge_condition_expression(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-edge-expression",
        name="Route Edge Expression Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "scorer",
                    "type": "tool",
                    "name": "Scorer",
                    "config": {"mock_output": {"approved": True, "score": 97}},
                },
                {
                    "id": "approve",
                    "type": "tool",
                    "name": "Approve",
                    "config": {"mock_output": {"answer": "approved route"}},
                },
                {
                    "id": "reject",
                    "type": "tool",
                    "name": "Reject",
                    "config": {"mock_output": {"answer": "rejected route"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "scorer"},
                {
                    "id": "e2",
                    "sourceNodeId": "scorer",
                    "targetNodeId": "approve",
                    "conditionExpression": "source_output.approved and source_output.score >= 90",
                },
                {
                    "id": "e3",
                    "sourceNodeId": "scorer",
                    "targetNodeId": "reject",
                    "conditionExpression": "not source_output.approved",
                },
                {"id": "e4", "sourceNodeId": "approve", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "reject", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"message": "edge expr route"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["output_payload"] == {"approve": {"answer": "approved route"}}
    assert {node_run["node_id"]: node_run["status"] for node_run in body["node_runs"]} == {
        "trigger": "succeeded",
        "scorer": "succeeded",
        "approve": "succeeded",
        "reject": "skipped",
        "output": "succeeded",
    }


def test_execute_workflow_route_supports_join_all_policy(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-join-all",
        name="Route Join All Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "planner",
                    "type": "tool",
                    "name": "Planner",
                    "config": {"mock_output": {"plan": "outline"}},
                },
                {
                    "id": "researcher",
                    "type": "tool",
                    "name": "Researcher",
                    "config": {"mock_output": {"facts": ["a"]}},
                },
                {
                    "id": "joiner",
                    "type": "tool",
                    "name": "Joiner",
                    "config": {"mock_output": {"answer": "route combined"}},
                    "runtimePolicy": {"join": {"mode": "all"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
                {"id": "e2", "sourceNodeId": "trigger", "targetNodeId": "researcher"},
                {"id": "e3", "sourceNodeId": "planner", "targetNodeId": "joiner"},
                {"id": "e4", "sourceNodeId": "researcher", "targetNodeId": "joiner"},
                {"id": "e5", "sourceNodeId": "joiner", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"message": "join route"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "succeeded"
    joiner_run = next(node_run for node_run in body["node_runs"] if node_run["node_id"] == "joiner")
    assert joiner_run["input_payload"]["join"]["expectedSourceIds"] == ["planner", "researcher"]
    assert joiner_run["input_payload"]["join"]["mergeStrategy"] == "error"
    assert [event["event_type"] for event in body["events"]].count("node.join.ready") == 1


def test_execute_workflow_route_supports_edge_mapping_append_merge_strategy(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-mapping-append",
        name="Route Mapping Append Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "planner",
                    "type": "tool",
                    "name": "Planner",
                    "config": {"mock_output": {"topic": "plan"}},
                },
                {
                    "id": "researcher",
                    "type": "tool",
                    "name": "Researcher",
                    "config": {"mock_output": {"topic": "facts"}},
                },
                {
                    "id": "joiner",
                    "type": "tool",
                    "name": "Joiner",
                    "config": {},
                    "runtimePolicy": {
                        "join": {"mode": "all", "mergeStrategy": "append"}
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
                {"id": "e2", "sourceNodeId": "trigger", "targetNodeId": "researcher"},
                {
                    "id": "e3",
                    "sourceNodeId": "planner",
                    "targetNodeId": "joiner",
                    "mapping": [{"sourceField": "topic", "targetField": "inputs.topics"}],
                },
                {
                    "id": "e4",
                    "sourceNodeId": "researcher",
                    "targetNodeId": "joiner",
                    "mapping": [{"sourceField": "topic", "targetField": "inputs.topics"}],
                },
                {"id": "e5", "sourceNodeId": "joiner", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"message": "mapping append route"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "succeeded"
    joiner_run = next(node_run for node_run in body["node_runs"] if node_run["node_id"] == "joiner")
    assert joiner_run["input_payload"]["inputs"]["topics"] == ["plan", "facts"]


def test_execute_workflow_route_exposes_authorized_context_reads(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-mcp",
        name="Route MCP Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "planner",
                    "type": "tool",
                    "name": "Planner",
                    "config": {"mock_output": {"plan": "route plan"}},
                },
                {
                    "id": "reader",
                    "type": "mcp_query",
                    "name": "Reader",
                    "config": {
                        "contextAccess": {"readableNodeIds": ["planner"]},
                        "query": {
                            "type": "authorized_context",
                            "sourceNodeIds": ["planner"],
                            "artifactTypes": ["json"],
                        },
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
                {"id": "e2", "sourceNodeId": "planner", "targetNodeId": "reader"},
                {"id": "e3", "sourceNodeId": "reader", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"message": "mcp route"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["output_payload"] == {
        "reader": {
            "query": {
                "type": "authorized_context",
                "sourceNodeIds": ["planner"],
                "artifactTypes": ["json"],
            },
            "results": [
                {"nodeId": "planner", "artifactType": "json", "content": {"plan": "route plan"}}
            ],
        }
    }
    assert [event["event_type"] for event in body["events"]].count("node.context.read") == 1
