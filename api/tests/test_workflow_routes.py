from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.models.run import NodeRun, Run, RunEvent
from app.services import workflow_definitions, workflow_library
from app.services.plugin_runtime import PluginRegistry, PluginToolDefinition
from app.services.sandbox_backends import (
    SandboxBackendCapability,
    SandboxBackendClient,
    SandboxBackendHealth,
    SandboxBackendHealthChecker,
    SandboxBackendRegistration,
    SandboxBackendRegistry,
)


def _sandbox_backend_client(*, execution_classes: tuple[str, ...]) -> SandboxBackendClient:
    registry = SandboxBackendRegistry()
    registry.register_backend(
        SandboxBackendRegistration(
            id="sandbox-default",
            kind="official",
            endpoint="http://sandbox.local",
            enabled=True,
        )
    )
    health_checker = SandboxBackendHealthChecker(client_factory=lambda _timeout_ms: None)
    health_checker.probe_all = lambda _registry: [  # type: ignore[method-assign]
        SandboxBackendHealth(
            id="sandbox-default",
            kind="official",
            endpoint="http://sandbox.local",
            enabled=True,
            status="healthy",
            capability=SandboxBackendCapability(
                supported_execution_classes=execution_classes,
            ),
        )
    ]
    return SandboxBackendClient(registry, health_checker=health_checker)


def _workflow_detail_message(response) -> str:
    detail = response.json()["detail"]
    if isinstance(detail, dict):
        message = detail.get("message")
        return message if isinstance(message, str) else str(detail)
    return str(detail)


def _workflow_detail_issues(response) -> list[dict]:
    detail = response.json()["detail"]
    if isinstance(detail, dict) and isinstance(detail.get("issues"), list):
        return [issue for issue in detail["issues"] if isinstance(issue, dict)]
    return []


def _valid_definition(answer: str = "done", runtime_policy: dict | None = None) -> dict:
    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "tool",
                "type": "tool",
                "name": "Tool",
                "config": {"mock_output": {"answer": answer}},
                "runtimePolicy": runtime_policy,
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool"},
            {"id": "e2", "sourceNodeId": "tool", "targetNodeId": "output"},
        ],
    }


def _planned_loop_definition() -> dict:
    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {"id": "loop", "type": "loop", "name": "Loop", "config": {}},
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "loop"},
            {"id": "e2", "sourceNodeId": "loop", "targetNodeId": "output"},
        ],
    }


def _bound_tool_definition(
    *,
    tool_id: str,
    ecosystem: str,
    adapter_id: str | None = None,
    runtime_policy: dict | None = None,
) -> dict:
    binding = {
        "toolId": tool_id,
        "ecosystem": ecosystem,
    }
    if adapter_id is not None:
        binding["adapterId"] = adapter_id

    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "tool",
                "type": "tool",
                "name": "Tool",
                "config": {"tool": binding},
                "runtimePolicy": runtime_policy,
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool"},
            {"id": "e2", "sourceNodeId": "tool", "targetNodeId": "output"},
        ],
    }


def _sandbox_code_definition(
    *,
    config: dict | None = None,
    runtime_policy: dict | None = None,
) -> dict:
    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "sandbox",
                "type": "sandbox_code",
                "name": "Sandbox",
                "config": {
                    "language": "python",
                    "code": "result = {'ok': True}",
                    **(config or {}),
                },
                "runtimePolicy": runtime_policy,
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "sandbox"},
            {"id": "e2", "sourceNodeId": "sandbox", "targetNodeId": "output"},
        ],
    }


def _valid_mcp_definition() -> dict:
    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "planner",
                "type": "tool",
                "name": "Planner",
                "config": {"mock_output": {"plan": "collect facts"}},
            },
            {
                "id": "reader",
                "type": "mcp_query",
                "name": "Reader",
                "config": {
                    "contextAccess": {
                        "readableNodeIds": ["planner"],
                    },
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
    }


def _valid_selector_definition() -> dict:
    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "branch",
                "type": "condition",
                "name": "Branch",
                "config": {
                    "selector": {
                        "rules": [
                            {
                                "key": "urgent",
                                "path": "trigger_input.priority",
                                "operator": "eq",
                                "value": "high",
                            }
                        ]
                    }
                },
            },
            {
                "id": "urgent_path",
                "type": "tool",
                "name": "Urgent Path",
                "config": {"mock_output": {"answer": "rush"}},
            },
            {
                "id": "default_path",
                "type": "tool",
                "name": "Default Path",
                "config": {"mock_output": {"answer": "later"}},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "branch"},
            {
                "id": "e2",
                "sourceNodeId": "branch",
                "targetNodeId": "urgent_path",
                "condition": "urgent",
            },
            {"id": "e3", "sourceNodeId": "branch", "targetNodeId": "default_path"},
            {"id": "e4", "sourceNodeId": "urgent_path", "targetNodeId": "output"},
            {"id": "e5", "sourceNodeId": "default_path", "targetNodeId": "output"},
        ],
    }


def _valid_expression_definition() -> dict:
    return {
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
                "config": {"mock_output": {"answer": "search"}},
            },
            {
                "id": "default_path",
                "type": "tool",
                "name": "Default Path",
                "config": {"mock_output": {"answer": "default"}},
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
    }


def _valid_edge_expression_definition() -> dict:
    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "scorer",
                "type": "tool",
                "name": "Scorer",
                "config": {"mock_output": {"approved": True, "score": 95}},
            },
            {
                "id": "approve",
                "type": "tool",
                "name": "Approve",
                "config": {"mock_output": {"answer": "approved"}},
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
            {"id": "e3", "sourceNodeId": "approve", "targetNodeId": "output"},
        ],
    }


def _valid_join_definition() -> dict:
    return {
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
                "config": {"mock_output": {"answer": "combined"}},
                "runtimePolicy": {"join": {"mode": "all", "onUnmet": "fail"}},
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
    }


def _valid_mapping_definition() -> dict:
    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "planner",
                "type": "tool",
                "name": "Planner",
                "config": {"mock_output": {"plan": {"title": "Draft"}, "priority": "7"}},
            },
            {
                "id": "formatter",
                "type": "tool",
                "name": "Formatter",
                "config": {},
                "runtimePolicy": {"join": {"mergeStrategy": "append"}},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
            {
                "id": "e2",
                "sourceNodeId": "planner",
                "targetNodeId": "formatter",
                "mapping": [
                    {"sourceField": "plan.title", "targetField": "prompt"},
                    {
                        "sourceField": "priority",
                        "targetField": "config.priority",
                        "transform": {"type": "toNumber"},
                    },
                ],
            },
            {"id": "e3", "sourceNodeId": "formatter", "targetNodeId": "output"},
        ],
    }


def _valid_publish_definition() -> dict:
    definition = _valid_definition()
    definition["variables"] = [
        {"name": "apiBaseUrl", "type": "string", "default": "https://example.com"},
    ]
    definition["publish"] = [
        {
            "id": "native-chat",
            "name": "Native Chat",
            "protocol": "native",
            "workflowVersion": "0.1.0",
            "authMode": "internal",
            "streaming": False,
            "inputSchema": {"type": "object"},
        }
    ]
    return definition


def _invalid_variable_definition() -> dict:
    definition = _valid_definition()
    definition["variables"] = [
        {"name": "shared_input", "type": "string"},
        {"name": " shared_input ", "type": "string"},
        {"name": "   ", "type": "string"},
    ]
    return definition


def _invalid_publish_identity_definition() -> dict:
    definition = _valid_publish_definition()
    definition["publish"] = [
        {
            "id": "native-chat",
            "name": "Native Chat",
            "alias": "Support.Chat",
            "path": "/support/chat",
            "protocol": "native",
            "workflowVersion": "0.1.0",
            "authMode": "internal",
            "streaming": False,
            "inputSchema": {"type": "object"},
        },
        {
            "id": "native-chat",
            "name": "Support Chat Alias Clash",
            "alias": "support.chat",
            "path": "support/chat/",
            "protocol": "openai",
            "workflowVersion": "0.1.0",
            "authMode": "api_key",
            "streaming": True,
            "inputSchema": {"type": "object"},
        },
    ]
    return definition


def test_create_workflow_persists_initial_version(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={"name": "Validated Workflow", "definition": _valid_definition()},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Validated Workflow"
    assert body["version"] == "0.1.0"
    assert body["definition"]["edges"][0]["channel"] == "control"
    assert [version["version"] for version in body["versions"]] == ["0.1.0"]
    assert body["versions"][0]["compiled_blueprint_id"] is not None
    assert body["versions"][0]["compiled_blueprint_compiler_version"] == "flow-compiler.v1"


def test_create_workflow_rejects_invalid_variables(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Invalid Variable Workflow",
            "definition": _invalid_variable_definition(),
        },
    )

    assert response.status_code == 422
    message = _workflow_detail_message(response)
    issues = _workflow_detail_issues(response)
    assert "workflow variables that are not valid for persistence" in message
    assert any(issue["category"] == "variables" for issue in issues)
    assert any(issue.get("path") == "variables.0.name" for issue in issues)
    assert any(issue.get("path") == "variables.2.name" for issue in issues)


def test_create_workflow_rejects_duplicate_publish_identities(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Invalid Publish Identity Workflow",
            "definition": _invalid_publish_identity_definition(),
        },
    )

    assert response.status_code == 422
    message = _workflow_detail_message(response)
    issues = _workflow_detail_issues(response)
    assert "publish endpoint identities that are not valid for persistence" in message
    assert any(issue["category"] == "publish_identity" for issue in issues)
    assert any(issue.get("path") == "publish.0.id" for issue in issues)
    assert any(issue.get("path") == "publish.1.alias" for issue in issues)
    assert any(issue.get("path") == "publish.1.path" for issue in issues)


def test_create_workflow_rejects_invalid_definition(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Broken Workflow",
            "definition": {
                "nodes": [{"id": "tool", "type": "tool", "name": "Tool", "config": {}}],
                "edges": [],
            },
        },
    )

    assert response.status_code == 422
    assert "trigger node" in _workflow_detail_message(response)


def test_create_workflow_rejects_unavailable_persisted_nodes(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Loop Workflow",
            "definition": _planned_loop_definition(),
        },
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "not currently available for persistence" in detail["message"]
    assert detail["issues"][0]["category"] == "node_support"
    assert "loop" in detail["issues"][0]["message"]


def test_create_workflow_rejects_cycles_during_blueprint_compilation(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Cycle Workflow",
            "definition": {
                "nodes": [
                    {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                    {"id": "middle", "type": "tool", "name": "Middle", "config": {}},
                    {"id": "output", "type": "output", "name": "Output", "config": {}},
                ],
                "edges": [
                    {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "middle"},
                    {"id": "e2", "sourceNodeId": "middle", "targetNodeId": "output"},
                    {"id": "e3", "sourceNodeId": "output", "targetNodeId": "middle"},
                ],
            },
        },
    )

    assert response.status_code == 422
    assert "cycle" in _workflow_detail_message(response)


def test_update_workflow_bumps_version_and_keeps_history(
    client: TestClient,
    sample_workflow,
) -> None:
    response = client.put(
        f"/api/workflows/{sample_workflow.id}",
        json={"definition": _valid_definition(answer="updated")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["version"] == "0.1.1"
    assert body["definition"]["nodes"][1]["config"]["mock_output"]["answer"] == "updated"
    assert [version["version"] for version in body["versions"]] == ["0.1.1", "0.1.0"]
    assert all(version["compiled_blueprint_id"] for version in body["versions"])

    versions_response = client.get(f"/api/workflows/{sample_workflow.id}/versions")
    assert versions_response.status_code == 200
    assert [version["version"] for version in versions_response.json()] == ["0.1.1", "0.1.0"]
    assert all(version["compiled_blueprint_id"] for version in versions_response.json())


def test_update_workflow_rejects_unavailable_persisted_nodes(
    client: TestClient,
    sample_workflow,
) -> None:
    response = client.put(
        f"/api/workflows/{sample_workflow.id}",
        json={"definition": _planned_loop_definition()},
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "not currently available for persistence" in detail["message"]
    assert detail["issues"][0]["category"] == "node_support"
    assert "loop" in detail["issues"][0]["message"]


def test_update_workflow_allows_publish_binding_to_next_persisted_version(
    client: TestClient,
    sample_workflow,
) -> None:
    definition = _valid_publish_definition()
    definition["publish"][0]["workflowVersion"] = "0.1.1"

    response = client.put(
        f"/api/workflows/{sample_workflow.id}",
        json={"definition": definition},
    )

    assert response.status_code == 200
    assert response.json()["version"] == "0.1.1"
    assert response.json()["definition"]["publish"][0]["workflowVersion"] == "0.1.1"


def test_update_workflow_rejects_publish_binding_beyond_next_persisted_version(
    client: TestClient,
    sample_workflow,
) -> None:
    definition = _valid_publish_definition()
    definition["publish"][0]["workflowVersion"] = "0.1.2"

    response = client.put(
        f"/api/workflows/{sample_workflow.id}",
        json={"definition": definition},
    )

    assert response.status_code == 422
    assert "references unknown publish workflow versions" in _workflow_detail_message(response)
    assert "0.1.0, 0.1.1" in _workflow_detail_message(response)
    issues = _workflow_detail_issues(response)
    assert any(
        issue.get("category") == "publish_version"
        and issue.get("path") == "publish.0.workflowVersion"
        and issue.get("field") == "workflowVersion"
        for issue in issues
    )


def test_list_workflow_runs_returns_aggregated_summary(
    client: TestClient,
    sample_workflow,
    sqlite_session,
) -> None:
    now = datetime.now(UTC)
    first_run = Run(
        id="run-1",
        workflow_id=sample_workflow.id,
        workflow_version="0.1.0",
        status="succeeded",
        input_payload={},
        checkpoint_payload={},
        started_at=now - timedelta(minutes=3),
        finished_at=now - timedelta(minutes=2),
        created_at=now - timedelta(minutes=3),
    )
    second_run = Run(
        id="run-2",
        workflow_id=sample_workflow.id,
        workflow_version="0.1.0",
        status="running",
        input_payload={},
        checkpoint_payload={},
        started_at=now - timedelta(minutes=1),
        created_at=now - timedelta(minutes=1),
    )
    sqlite_session.add_all(
        [
            first_run,
            second_run,
            NodeRun(
                id="node-run-1",
                run_id="run-1",
                node_id="mock_tool",
                node_name="Mock Tool",
                node_type="tool",
            ),
            NodeRun(
                id="node-run-2",
                run_id="run-1",
                node_id="output",
                node_name="Output",
                node_type="output",
            ),
            RunEvent(
                run_id="run-1",
                node_run_id="node-run-1",
                event_type="node.started",
                payload={},
                created_at=now - timedelta(minutes=3),
            ),
            RunEvent(
                run_id="run-1",
                node_run_id="node-run-2",
                event_type="node.completed",
                payload={},
                created_at=now - timedelta(minutes=2),
            ),
            RunEvent(
                run_id="run-2",
                event_type="run.started",
                payload={},
                created_at=now - timedelta(minutes=1),
            ),
        ]
    )
    sqlite_session.commit()

    response = client.get(f"/api/workflows/{sample_workflow.id}/runs?limit=2")

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == ["run-2", "run-1"]
    assert body[0]["node_run_count"] == 0
    assert body[0]["event_count"] == 1
    assert body[1]["node_run_count"] == 2
    assert body[1]["event_count"] == 2
    assert body[1]["last_event_at"] is not None


def test_create_workflow_accepts_retry_runtime_policy(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Retry Workflow",
            "definition": _valid_definition(
                runtime_policy={
                    "retry": {
                        "maxAttempts": 3,
                        "backoffSeconds": 1,
                        "backoffMultiplier": 2,
                    }
                }
            ),
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["definition"]["nodes"][1]["runtimePolicy"]["retry"]["maxAttempts"] == 3


def test_create_workflow_rejects_invalid_retry_runtime_policy(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Broken Retry Workflow",
            "definition": _valid_definition(
                runtime_policy={
                    "retry": {
                        "maxAttempts": 0,
                    }
                }
            ),
        },
    )

    assert response.status_code == 422
    assert "maxAttempts" in _workflow_detail_message(response)


def test_create_workflow_accepts_execution_runtime_policy(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Execution Policy Workflow",
            "definition": _valid_definition(
                runtime_policy={
                    "execution": {
                        "class": "sandbox",
                        "profile": "browser-safe",
                        "timeoutMs": 30000,
                        "networkPolicy": "restricted",
                        "filesystemPolicy": "readonly_tmp",
                    }
                }
            ),
        },
    )

    assert response.status_code == 201
    body = response.json()
    execution_policy = body["definition"]["nodes"][1]["runtimePolicy"]["execution"]
    assert execution_policy == {
        "class": "sandbox",
        "profile": "browser-safe",
        "timeoutMs": 30000,
        "networkPolicy": "restricted",
        "filesystemPolicy": "readonly_tmp",
    }



def test_create_workflow_rejects_invalid_execution_runtime_policy(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Broken Execution Workflow",
            "definition": _valid_definition(
                runtime_policy={
                    "execution": {
                        "class": "vm",
                    }
                }
            ),
        },
    )

    assert response.status_code == 422
    detail = _workflow_detail_message(response)
    assert "Input should be 'inline', 'subprocess', 'sandbox' or 'microvm'" in detail


def test_create_workflow_rejects_builtin_package_set_without_builtin_dependency_mode(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Broken Sandbox Dependency Workflow",
            "definition": _sandbox_code_definition(
                config={
                    "dependencyMode": "backend_managed",
                    "builtinPackageSet": "py-data-basic",
                },
            ),
        },
    )

    assert response.status_code == 422
    detail = _workflow_detail_message(response)
    assert "config.builtinPackageSet requires config.dependencyMode = 'builtin'" in detail


def test_create_workflow_rejects_dependency_ref_without_dependency_ref_mode(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Broken Sandbox Dependency Ref Workflow",
            "definition": _sandbox_code_definition(
                config={
                    "dependencyMode": "builtin",
                    "dependencyRef": "bundle:finance-safe-v1",
                },
            ),
        },
    )

    assert response.status_code == 422
    detail = _workflow_detail_message(response)
    assert "config.dependencyRef requires config.dependencyMode = 'dependency_ref'" in detail


def test_create_workflow_rejects_unsupported_tool_execution_class(client: TestClient) -> None:
    adapter_response = client.post(
        "/api/plugins/adapters",
        json={
            "id": "dify-default",
            "ecosystem": "compat:dify",
            "endpoint": "http://adapter.local/dify",
            "supported_execution_classes": ["subprocess"],
        },
    )
    assert adapter_response.status_code == 201

    tool_response = client.post(
        "/api/plugins/tools",
        json={
            "id": "compat:dify:plugin:demo/search",
            "name": "Demo Search",
            "ecosystem": "compat:dify",
            "description": "Search via adapter",
            "input_schema": {"type": "object"},
            "output_schema": {"type": "object"},
        },
    )
    assert tool_response.status_code == 201

    response = client.post(
        "/api/workflows",
        json={
            "name": "Unsupported Tool Execution Workflow",
            "definition": _bound_tool_definition(
                tool_id="compat:dify:plugin:demo/search",
                ecosystem="compat:dify",
                adapter_id="dify-default",
                runtime_policy={"execution": {"class": "microvm"}},
            ),
        },
    )

    assert response.status_code == 422
    detail = _workflow_detail_message(response)
    assert "tool execution capabilities" in detail
    assert "microvm" in detail
    assert "dify-default" in detail


def test_create_workflow_rejects_unscoped_agent_tool_execution_target(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Unscoped Agent Tool Execution Workflow",
            "definition": {
                "nodes": [
                    {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                    {
                        "id": "agent",
                        "type": "llm_agent",
                        "name": "Agent",
                        "config": {
                            "prompt": "Plan with tools",
                            "toolPolicy": {
                                "execution": {"class": "microvm"},
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
        },
    )

    assert response.status_code == 422
    detail = _workflow_detail_message(response)
    assert "tool execution capabilities" in detail
    assert "without narrowing toolPolicy.allowedToolIds" in detail
    assert "execution-incompatible tools:" in detail


def test_create_workflow_accepts_supported_tool_execution_class(
    client: TestClient,
    monkeypatch,
) -> None:
    adapter_response = client.post(
        "/api/plugins/adapters",
        json={
            "id": "dify-microvm",
            "ecosystem": "compat:dify",
            "endpoint": "http://adapter.local/dify-microvm",
            "supported_execution_classes": ["subprocess", "microvm"],
        },
    )
    assert adapter_response.status_code == 201

    tool_response = client.post(
        "/api/plugins/tools",
        json={
            "id": "compat:dify:plugin:demo/search-2",
            "name": "Demo Search 2",
            "ecosystem": "compat:dify",
            "description": "Search via adapter",
            "input_schema": {"type": "object"},
            "output_schema": {"type": "object"},
        },
    )
    assert tool_response.status_code == 201
    monkeypatch.setattr(
        workflow_definitions,
        "get_sandbox_backend_client",
        lambda: _sandbox_backend_client(execution_classes=("microvm",)),
    )

    response = client.post(
        "/api/workflows",
        json={
            "name": "Supported Tool Execution Workflow",
            "definition": _bound_tool_definition(
                tool_id="compat:dify:plugin:demo/search-2",
                ecosystem="compat:dify",
                adapter_id="dify-microvm",
                runtime_policy={"execution": {"class": "microvm"}},
            ),
        },
    )

    assert response.status_code == 201


def test_create_workflow_accepts_native_tool_declared_sandbox_execution(
    client: TestClient,
    monkeypatch,
) -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="native.risk-search",
            name="Risk Search",
            supported_execution_classes=("inline", "sandbox"),
        ),
        invoker=lambda request: {
            "documents": ["doc-1"],
            "execution": request.execution,
        },
    )
    monkeypatch.setattr(workflow_library, "get_plugin_registry", lambda: registry)
    monkeypatch.setattr(workflow_definitions, "get_plugin_registry", lambda: registry)
    monkeypatch.setattr(
        workflow_definitions,
        "get_sandbox_backend_client",
        lambda: _sandbox_backend_client(execution_classes=("sandbox",)),
    )

    response = client.post(
        "/api/workflows",
        json={
            "name": "Native Sandbox Tool Workflow",
            "definition": _bound_tool_definition(
                tool_id="native.risk-search",
                ecosystem="native",
                runtime_policy={"execution": {"class": "sandbox"}},
            ),
        },
    )

    assert response.status_code == 201


def test_create_workflow_accepts_authorized_context_mcp_query(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={"name": "MCP Workflow", "definition": _valid_mcp_definition()},
    )

    assert response.status_code == 201
    body = response.json()
    reader_node = next(node for node in body["definition"]["nodes"] if node["id"] == "reader")
    assert reader_node["config"]["query"]["type"] == "authorized_context"
    assert reader_node["config"]["contextAccess"]["readableNodeIds"] == ["planner"]


def test_create_workflow_rejects_unauthorized_mcp_query_source(client: TestClient) -> None:
    definition = _valid_mcp_definition()
    definition["nodes"].insert(
        2,
        {
            "id": "search",
            "type": "tool",
            "name": "Search",
            "config": {"mock_output": {"docs": ["x"]}},
        },
    )
    definition["edges"] = [
        {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
        {"id": "e2", "sourceNodeId": "planner", "targetNodeId": "search"},
        {"id": "e3", "sourceNodeId": "search", "targetNodeId": "reader"},
        {"id": "e4", "sourceNodeId": "reader", "targetNodeId": "output"},
    ]
    reader_node = next(node for node in definition["nodes"] if node["id"] == "reader")
    reader_node["config"]["query"]["sourceNodeIds"] = ["planner", "search"]

    response = client.post(
        "/api/workflows",
        json={"name": "Broken MCP Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "unauthorized source nodes" in _workflow_detail_message(response)


def test_create_workflow_accepts_condition_selector_rules(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={"name": "Selector Workflow", "definition": _valid_selector_definition()},
    )

    assert response.status_code == 201
    body = response.json()
    branch_node = next(node for node in body["definition"]["nodes"] if node["id"] == "branch")
    assert branch_node["config"]["selector"]["rules"][0]["path"] == "trigger_input.priority"


def test_create_workflow_accepts_branch_expression(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={"name": "Expression Workflow", "definition": _valid_expression_definition()},
    )

    assert response.status_code == 201
    body = response.json()
    branch_node = next(node for node in body["definition"]["nodes"] if node["id"] == "branch")
    assert branch_node["config"]["expression"] == (
        "trigger_input.intent if trigger_input.intent else 'default'"
    )


def test_create_workflow_accepts_edge_condition_expression(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Edge Expression Workflow",
            "definition": _valid_edge_expression_definition(),
        },
    )

    assert response.status_code == 201
    body = response.json()
    approve_edge = next(edge for edge in body["definition"]["edges"] if edge["id"] == "e2")
    assert approve_edge["conditionExpression"] == (
        "source_output.approved and source_output.score >= 90"
    )


def test_create_workflow_accepts_join_runtime_policy(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={"name": "Join Workflow", "definition": _valid_join_definition()},
    )

    assert response.status_code == 201
    body = response.json()
    joiner_node = next(node for node in body["definition"]["nodes"] if node["id"] == "joiner")
    assert joiner_node["runtimePolicy"]["join"]["mode"] == "all"
    assert joiner_node["runtimePolicy"]["join"]["onUnmet"] == "fail"


def test_create_workflow_accepts_edge_mapping_definition(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={"name": "Mapping Workflow", "definition": _valid_mapping_definition()},
    )

    assert response.status_code == 201
    body = response.json()
    formatter_node = next(node for node in body["definition"]["nodes"] if node["id"] == "formatter")
    assert formatter_node["runtimePolicy"]["join"]["mergeStrategy"] == "append"
    mapping_edge = next(edge for edge in body["definition"]["edges"] if edge["id"] == "e2")
    assert mapping_edge["mapping"][0]["targetField"] == "prompt"
    assert mapping_edge["mapping"][1]["transform"]["type"] == "toNumber"


def test_create_workflow_rejects_selector_on_non_branch_node(client: TestClient) -> None:
    definition = _valid_definition()
    definition["nodes"][1]["config"]["selector"] = {
        "rules": [
            {
                "key": "broken",
                "path": "trigger_input.priority",
                "operator": "eq",
                "value": "high",
            }
        ]
    }

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Selector Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "Only condition/router nodes may define config.selector" in (
        _workflow_detail_message(response)
    )


def test_create_workflow_rejects_expression_on_non_branch_node(client: TestClient) -> None:
    definition = _valid_definition()
    definition["nodes"][1]["config"]["expression"] = "trigger_input.priority == 'high'"

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Expression Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "Only condition/router nodes may define config.expression" in (
        _workflow_detail_message(response)
    )


def test_create_workflow_rejects_unsafe_edge_condition_expression(client: TestClient) -> None:
    definition = _valid_edge_expression_definition()
    definition["edges"][1]["conditionExpression"] = "__import__('os')"

    response = client.post(
        "/api/workflows",
        json={"name": "Unsafe Edge Expression Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "Unsupported expression syntax 'Call'" in _workflow_detail_message(response)


def test_create_workflow_rejects_join_required_node_ids_outside_incoming_edges(
    client: TestClient,
) -> None:
    definition = _valid_join_definition()
    joiner_node = next(node for node in definition["nodes"] if node["id"] == "joiner")
    joiner_node["runtimePolicy"]["join"]["requiredNodeIds"] = ["planner", "ghost"]

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Join Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "join.requiredNodeIds references non-incoming sources" in (
        _workflow_detail_message(response)
    )


def test_create_workflow_rejects_mapping_to_runtime_managed_input_root(
    client: TestClient,
) -> None:
    definition = _valid_mapping_definition()
    definition["edges"][1]["mapping"][0]["targetField"] = "upstream.plan"

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Mapping Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "runtime-managed input roots" in _workflow_detail_message(response)


def test_create_workflow_rejects_mapping_to_execution_input_root(
    client: TestClient,
) -> None:
    definition = _valid_mapping_definition()
    definition["edges"][1]["mapping"][0]["targetField"] = "execution.class"

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Execution Mapping Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "runtime-managed input roots" in _workflow_detail_message(response)


def test_create_workflow_rejects_invalid_tool_binding(
    client: TestClient,
) -> None:
    definition = _valid_definition()
    definition["nodes"][1]["config"] = {
        "tool": {
            "toolId": "",
        }
    }

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Tool Binding Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "String should have at least 1 character" in _workflow_detail_message(response)


def test_create_workflow_rejects_missing_catalog_tool_binding(client: TestClient) -> None:
    definition = _valid_definition()
    definition["nodes"][1]["config"] = {
        "tool": {
            "toolId": "native.missing",
            "ecosystem": "native",
        }
    }

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Missing Tool Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "references missing or drifted tool catalog entries" in (
        _workflow_detail_message(response)
    )
    assert "native.missing" in _workflow_detail_message(response)
    issues = _workflow_detail_issues(response)
    assert any(
        issue.get("category") == "tool_reference"
        and issue.get("path") == "nodes.1.config.tool.toolId"
        and issue.get("field") == "toolId"
        for issue in issues
    )


def test_create_workflow_rejects_missing_tool_policy_reference(client: TestClient) -> None:
    definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "agent",
                "type": "llm_agent",
                "name": "Agent",
                "config": {
                    "toolPolicy": {
                        "allowedToolIds": ["native.search", "native.missing"],
                    }
                },
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "agent"},
            {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "output"},
        ],
    }

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Missing Tool Policy Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "toolPolicy.allowedToolIds references missing catalog tools" in (
        _workflow_detail_message(response)
    )
    assert "native.missing" in _workflow_detail_message(response)
    issues = _workflow_detail_issues(response)
    assert any(
        issue.get("category") == "tool_reference"
        and issue.get("path") == "nodes.1.config.toolPolicy.allowedToolIds"
        and issue.get("field") == "allowedToolIds"
        for issue in issues
    )


def test_create_workflow_rejects_duplicate_variable_names(client: TestClient) -> None:
    definition = _valid_publish_definition()
    definition["variables"] = [
        {"name": "apiBaseUrl", "type": "string"},
        {"name": "apiBaseUrl", "type": "string"},
    ]

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Variable Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "Workflow variable names must be unique" in _workflow_detail_message(response)


def test_create_workflow_rejects_duplicate_publish_endpoint_metadata(
    client: TestClient,
) -> None:
    definition = _valid_publish_definition()
    definition["publish"].append(
        {
            "id": "native-chat",
            "name": "Native Chat",
            "protocol": "openai",
            "workflowVersion": "0.1.1",
            "authMode": "api_key",
            "streaming": True,
            "inputSchema": {"type": "object"},
        }
    )

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Publish Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "publish endpoint identities that are not valid for persistence" in (
        _workflow_detail_message(response)
    )
    assert any(
        issue.get("category") == "publish_identity" for issue in _workflow_detail_issues(response)
    )


def test_create_workflow_rejects_invalid_node_contract_schema(client: TestClient) -> None:
    definition = _valid_definition()
    definition["nodes"][1]["inputSchema"] = {
        "type": "unsupported",
    }

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Node Contract Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "inputSchema.type" in _workflow_detail_message(response)
    issues = _workflow_detail_issues(response)
    assert any(
        issue.get("category") == "schema"
        and issue.get("path") == "nodes.1.inputSchema.type"
        and issue.get("field") == "type"
        for issue in issues
    )


def test_validate_workflow_definition_preflight_returns_normalized_definition(
    client: TestClient,
) -> None:
    created = client.post(
        "/api/workflows",
        json={"name": "Preflight Workflow", "definition": _valid_definition()},
    )
    assert created.status_code == 201
    workflow_id = created.json()["id"]

    definition = _valid_definition()
    definition["nodes"][1]["runtimePolicy"] = {
        "execution": {
            "class": "inline",
        }
    }

    response = client.post(
        f"/api/workflows/{workflow_id}/validate-definition",
        json={"definition": definition},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["next_version"] == "0.1.1"
    assert body["definition"]["nodes"][1]["runtimePolicy"]["execution"]["class"] == "inline"
    assert body["issues"] == []


def test_validate_workflow_definition_preflight_rejects_invalid_publish_reference(
    client: TestClient,
) -> None:
    created = client.post(
        "/api/workflows",
        json={"name": "Broken Preflight Workflow", "definition": _valid_definition()},
    )
    assert created.status_code == 201
    workflow_id = created.json()["id"]

    definition = _valid_publish_definition()
    definition["publish"][0]["workflowVersion"] = "9.9.9"

    response = client.post(
        f"/api/workflows/{workflow_id}/validate-definition",
        json={"definition": definition},
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "unknown publish workflow versions" in detail["message"]
    assert detail["issues"][0]["category"] == "publish_version"
    assert "workflow version '9.9.9'" in detail["issues"][0]["message"]


def test_validate_workflow_definition_preflight_rejects_duplicate_publish_identities(
    client: TestClient,
) -> None:
    created = client.post(
        "/api/workflows",
        json={"name": "Publish Identity Preflight Workflow", "definition": _valid_definition()},
    )
    assert created.status_code == 201
    workflow_id = created.json()["id"]

    response = client.post(
        f"/api/workflows/{workflow_id}/validate-definition",
        json={"definition": _invalid_publish_identity_definition()},
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "publish endpoint identities" in detail["message"]
    assert any(issue["category"] == "publish_identity" for issue in detail["issues"])


def test_create_workflow_rejects_invalid_publish_contract_schema(
    client: TestClient,
) -> None:
    definition = _valid_publish_definition()
    definition["publish"][0]["outputSchema"] = {
        "type": "object",
        "required": ["answer", "answer"],
    }

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Publish Contract Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "outputSchema.required" in _workflow_detail_message(response)


def test_create_workflow_rejects_tool_binding_conflicts(client: TestClient) -> None:
    definition = _valid_definition()
    definition["nodes"][1]["config"] = {
        "toolId": "native.search",
        "tool": {
            "toolId": "compat:dify:plugin:search",
            "ecosystem": "compat:dify",
        },
    }

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Tool Conflict Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "cannot define both config.tool and config.toolId" in _workflow_detail_message(response)


def test_create_workflow_rejects_mcp_query_artifact_types_without_authorization(
    client: TestClient,
) -> None:
    definition = _valid_mcp_definition()
    reader_node = next(node for node in definition["nodes"] if node["id"] == "reader")
    reader_node["config"]["query"]["artifactTypes"] = ["file"]

    response = client.post(
        "/api/workflows",
        json={"name": "Broken MCP Artifact Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "requests unauthorized artifact types" in _workflow_detail_message(response)


def test_create_workflow_rejects_invalid_branch_edge_conditions(client: TestClient) -> None:
    definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "branch",
                "type": "condition",
                "name": "Branch",
                "config": {"expression": "trigger_input.priority == 'high'"},
            },
            {
                "id": "search_path",
                "type": "tool",
                "name": "Search Path",
                "config": {"mock_output": {"answer": "search"}},
            },
            {
                "id": "default_path",
                "type": "tool",
                "name": "Default Path",
                "config": {"mock_output": {"answer": "default"}},
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
    }

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Branch Edge Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "true'/'false' branch conditions" in _workflow_detail_message(response)


def test_create_workflow_rejects_branch_duplicate_fallback_edges(client: TestClient) -> None:
    definition = _valid_selector_definition()
    definition["edges"].append(
        {"id": "e6", "sourceNodeId": "branch", "targetNodeId": "output"}
    )

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Fallback Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "at most one fallback outgoing edge" in _workflow_detail_message(response)


def test_create_workflow_rejects_non_branch_custom_edge_condition(client: TestClient) -> None:
    definition = _valid_definition()
    definition["edges"][1]["condition"] = "search"

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Non-Branch Edge Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "uses unsupported condition" in _workflow_detail_message(response)
