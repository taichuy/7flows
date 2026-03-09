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
    assert body["status"] == "succeeded"
    assert len(body["node_runs"]) == 3
    assert body["events"][-1]["event_type"] == "run.completed"

    run_id = body["id"]
    stored_response = client.get(f"/api/runs/{run_id}")
    assert stored_response.status_code == 200
    assert stored_response.json()["id"] == run_id
