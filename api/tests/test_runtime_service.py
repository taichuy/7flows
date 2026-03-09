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
