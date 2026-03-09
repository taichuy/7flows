import pytest
from sqlalchemy.orm import Session

from app.models.workflow import Workflow
from app.services.runtime import RuntimeService, WorkflowExecutionError


def test_runtime_service_executes_linear_workflow(
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    service = RuntimeService()

    artifacts = service.execute_workflow(
        sqlite_session,
        sample_workflow,
        {"topic": "hello"},
    )

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.workflow_version == "0.1.0"
    assert artifacts.run.output_payload == {"mock_tool": {"answer": "done"}}
    assert len(artifacts.node_runs) == 3
    assert [event.event_type for event in artifacts.events] == [
        "run.started",
        "node.started",
        "node.output.completed",
        "node.started",
        "node.output.completed",
        "node.started",
        "node.output.completed",
        "run.completed",
    ]


def test_runtime_service_only_executes_selected_condition_branch(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-condition",
        name="Condition Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "branch",
                    "type": "condition",
                    "name": "Branch",
                    "config": {"selected": "true"},
                },
                {
                    "id": "true_path",
                    "type": "tool",
                    "name": "True Path",
                    "config": {"mock_output": {"answer": "yes"}},
                },
                {
                    "id": "false_path",
                    "type": "tool",
                    "name": "False Path",
                    "config": {"mock_output": {"answer": "no"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "branch"},
                {
                    "id": "e2",
                    "sourceNodeId": "branch",
                    "targetNodeId": "true_path",
                    "condition": "true",
                },
                {
                    "id": "e3",
                    "sourceNodeId": "branch",
                    "targetNodeId": "false_path",
                    "condition": "false",
                },
                {"id": "e4", "sourceNodeId": "true_path", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "false_path", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "branch"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"true_path": {"answer": "yes"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "branch": "succeeded",
        "true_path": "succeeded",
        "false_path": "skipped",
        "output": "succeeded",
    }
    assert "node.skipped" in [event.event_type for event in artifacts.events]


def test_runtime_service_can_continue_through_failure_branch(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-failure-branch",
        name="Failure Branch Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "explode",
                    "type": "tool",
                    "name": "Explode",
                    "config": {"mock_error": "boom"},
                },
                {
                    "id": "success_path",
                    "type": "tool",
                    "name": "Success Path",
                    "config": {"mock_output": {"answer": "unexpected"}},
                },
                {
                    "id": "fallback",
                    "type": "tool",
                    "name": "Fallback",
                    "config": {"mock_output": {"answer": "recovered"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "explode"},
                {"id": "e2", "sourceNodeId": "explode", "targetNodeId": "success_path"},
                {
                    "id": "e3",
                    "sourceNodeId": "explode",
                    "targetNodeId": "fallback",
                    "condition": "failed",
                },
                {"id": "e4", "sourceNodeId": "success_path", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "fallback", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "errors"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"fallback": {"answer": "recovered"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "explode": "failed",
        "success_path": "skipped",
        "fallback": "succeeded",
        "output": "succeeded",
    }
    assert [event.event_type for event in artifacts.events].count("node.failed") == 1
    assert artifacts.run.error_message is None


def test_runtime_service_rejects_loop_nodes(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-loop",
        name="Loop Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [{"id": "loop", "type": "loop", "name": "Loop", "config": {}}],
            "edges": [],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    service = RuntimeService()

    with pytest.raises(WorkflowExecutionError):
        service.execute_workflow(sqlite_session, workflow, {})
