from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

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
    assert stored_response.json()["id"] == run_id


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
