from collections.abc import Generator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import app
from app.models.plugin import PluginAdapterRecord, PluginToolRecord  # noqa: F401
from app.models.workflow import Workflow, WorkflowVersion
from app.services.compiled_blueprints import CompiledBlueprintService


@pytest.fixture
def sqlite_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture
def client(sqlite_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield sqlite_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def workspace_console_auth(client: TestClient) -> dict[str, object]:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@taichuy.com", "password": "admin123"},
    )
    assert response.status_code == 200
    return response.json()


@pytest.fixture
def auth_headers(workspace_console_auth: dict) -> dict[str, str]:
    """Bearer token headers for console routes protected by require_console_route_access."""
    return {"Authorization": f"Bearer {workspace_console_auth['access_token']}"}


@pytest.fixture
def write_headers(workspace_console_auth: dict) -> dict[str, str]:
    """Headers for CSRF-protected write routes (POST/PUT/PATCH/DELETE)."""
    return {
        "Authorization": f"Bearer {workspace_console_auth['access_token']}",
        "X-CSRF-Token": workspace_console_auth["csrf_token"],
    }


@pytest.fixture
def default_console_route_headers(
    client: TestClient,
    auth_headers: dict[str, str],
    write_headers: dict[str, str],
) -> None:
    """Inject auth/CSRF headers for console `/api/*` routes unless a test overrides headers."""

    def _wrap_client_method(method_name: str, default_headers: dict[str, str]) -> None:
        original = getattr(client, method_name)

        def wrapped(url: str, *args, **kwargs):
            if url.startswith("/api/") and "headers" not in kwargs:
                kwargs["headers"] = default_headers
            return original(url, *args, **kwargs)

        setattr(client, method_name, wrapped)

    _wrap_client_method("get", auth_headers)
    _wrap_client_method("post", write_headers)
    _wrap_client_method("put", write_headers)
    _wrap_client_method("patch", write_headers)
    _wrap_client_method("delete", write_headers)


@pytest.fixture
def sample_workflow(sqlite_session: Session) -> Workflow:
    blueprint_service = CompiledBlueprintService()
    workflow = Workflow(
        id="wf-demo",
        name="Demo Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "mock_tool",
                    "type": "tool",
                    "name": "Mock Tool",
                    "config": {"mock_output": {"answer": "done"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "mock_tool"},
                {"id": "e2", "sourceNodeId": "mock_tool", "targetNodeId": "output"},
            ],
        },
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    workflow_version = WorkflowVersion(
        id="wf-demo-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=workflow.definition,
        created_at=datetime.now(UTC),
    )
    sqlite_session.add(workflow)
    sqlite_session.add(workflow_version)
    blueprint_service.ensure_for_workflow_version(sqlite_session, workflow_version)
    sqlite_session.commit()
    sqlite_session.refresh(workflow)
    return workflow
