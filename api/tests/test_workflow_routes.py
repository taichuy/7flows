from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.models.run import NodeRun, Run, RunEvent
from app.models.workflow import Workflow, WorkflowVersion
from app.schemas.plugin import PluginToolItem
from app.schemas.workflow_published_endpoint import WorkflowPublishedEndpointDefinition
from app.services import workflow_definitions, workflow_library, workflow_views
from app.services.plugin_runtime import PluginRegistry, PluginToolDefinition
from app.services.sandbox_backends import (
    SandboxBackendCapability,
    SandboxBackendClient,
    SandboxBackendHealth,
    SandboxBackendHealthChecker,
    SandboxBackendRegistration,
    SandboxBackendRegistry,
)


def _sandbox_backend_client(
    *,
    execution_classes: tuple[str, ...],
    dependency_modes: tuple[str, ...] = (),
    supports_tool_execution: bool = False,
    supports_builtin_package_sets: bool = False,
    supports_backend_extensions: bool = False,
) -> SandboxBackendClient:
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
                supported_dependency_modes=dependency_modes,
                supports_tool_execution=supports_tool_execution,
                supports_builtin_package_sets=supports_builtin_package_sets,
                supports_backend_extensions=supports_backend_extensions,
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


class _FakeWorkflowLibraryService:
    def __init__(self, tools: list[PluginToolItem]) -> None:
        self._tools = tools

    def list_tool_items(self, _db, *, workspace_id: str) -> list[PluginToolItem]:
        assert workspace_id == "default"
        return self._tools


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


def _condition_definition(*, runtime_policy: dict | None = None) -> dict:
    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "branch",
                "type": "condition",
                "name": "Branch",
                "config": {"selected": "true"},
                "runtimePolicy": runtime_policy,
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
    }


def _skill_bound_agent_definition(
    skill_id: str,
    *,
    skill_binding: dict | None = None,
) -> dict:
    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "agent",
                "type": "llm_agent",
                "name": "Agent",
                "config": {
                    "prompt": "Use the bound skill",
                    "skillIds": [skill_id],
                    **({"skillBinding": skill_binding} if skill_binding is not None else {}),
                },
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "agent"},
            {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "output"},
        ],
    }


def test_create_workflow_rejects_missing_skill_reference(client: TestClient) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Skill Guard Workflow",
            "definition": _skill_bound_agent_definition("skill-missing"),
        },
    )

    assert response.status_code == 422
    assert "missing skill documents" in _workflow_detail_message(response)
    issues = _workflow_detail_issues(response)
    assert any(issue["category"] == "skill_reference" for issue in issues)
    assert any(issue.get("field") == "skillIds" for issue in issues)


def test_create_workflow_rejects_missing_skill_binding_reference(client: TestClient) -> None:
    skill_response = client.post(
        "/api/skills",
        json={
            "id": "skill-research-brief",
            "workspace_id": "default",
            "name": "Research Brief",
            "description": "Brief writing guide.",
            "body": "Summarize findings and open questions.",
            "references": [
                {
                    "id": "ref-existing",
                    "name": "Existing Ref",
                    "description": "Present in catalog.",
                    "body": "Use the current reference body.",
                }
            ],
        },
    )
    assert skill_response.status_code == 201

    response = client.post(
        "/api/workflows",
        json={
            "name": "Skill Binding Guard Workflow",
            "definition": _skill_bound_agent_definition(
                "skill-research-brief",
                skill_binding={
                    "enabledPhases": ["main_plan"],
                    "references": [
                        {
                            "skillId": "skill-research-brief",
                            "referenceId": "ref-missing",
                            "phases": ["main_plan"],
                        }
                    ],
                },
            ),
        },
    )

    assert response.status_code == 422
    assert "missing skill reference" in _workflow_detail_message(response)
    issues = _workflow_detail_issues(response)
    assert any(issue["category"] == "skill_reference" for issue in issues)
    assert any(issue.get("field") == "skillBinding.references" for issue in issues)


def test_create_workflow_accepts_skill_binding_with_case_preserved_ids(
    client: TestClient,
) -> None:
    skill_response = client.post(
        "/api/skills",
        json={
            "id": "SkillResearchBrief",
            "workspace_id": "default",
            "name": "Research Brief",
            "description": "Brief writing guide.",
            "body": "Summarize findings and open questions.",
            "references": [
                {
                    "id": "RefExisting",
                    "name": "Existing Ref",
                    "description": "Present in catalog.",
                    "body": "Use the current reference body.",
                }
            ],
        },
    )
    assert skill_response.status_code == 201

    response = client.post(
        "/api/workflows",
        json={
            "name": "Skill Binding Case Workflow",
            "definition": _skill_bound_agent_definition(
                "SkillResearchBrief",
                skill_binding={
                    "enabledPhases": ["main_plan"],
                    "references": [
                        {
                            "skillId": "SkillResearchBrief",
                            "referenceId": "RefExisting",
                            "phases": ["main_plan"],
                        }
                    ],
                },
            ),
        },
    )

    assert response.status_code == 201
    detail = response.json()
    references = detail["definition"]["nodes"][1]["config"]["skillBinding"]["references"]
    assert references == [
        {
            "skillId": "SkillResearchBrief",
            "referenceId": "RefExisting",
            "phases": ["main_plan"],
        }
    ]


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


def _unsupported_publish_auth_mode_definition() -> dict:
    definition = _valid_publish_definition()
    definition["publish"][0]["authMode"] = "token"
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


def test_create_workflow_rejects_unsupported_publish_auth_mode(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Invalid Publish Auth Workflow",
            "definition": _unsupported_publish_auth_mode_definition(),
        },
    )

    assert response.status_code == 422
    message = _workflow_detail_message(response)
    issues = _workflow_detail_issues(response)
    assert "publish auth modes" in message
    assert any(issue["category"] == "publish_draft" for issue in issues)
    assert any(issue.get("path") == "publish.0.authMode" for issue in issues)


def test_workflow_published_endpoint_schema_only_advertises_supported_auth_modes() -> None:
    schema = WorkflowPublishedEndpointDefinition.model_json_schema()

    assert schema["properties"]["authMode"]["enum"] == ["api_key", "internal"]


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
    assert body[0]["tool_governance"] == {
        "referenced_tool_ids": [],
        "missing_tool_ids": [],
        "governed_tool_count": 0,
        "strong_isolation_tool_count": 0,
    }
    assert body[1]["node_run_count"] == 2
    assert body[1]["event_count"] == 2
    assert body[1]["last_event_at"] is not None


def test_list_workflow_runs_surfaces_version_specific_tool_governance(
    client: TestClient,
    sqlite_session,
    monkeypatch,
) -> None:
    now = datetime.now(UTC)
    current_definition = _bound_tool_definition(
        tool_id="native.risk-search",
        ecosystem="native",
    )
    missing_definition = _bound_tool_definition(
        tool_id="native.catalog-gap",
        ecosystem="native",
    )
    workflow = Workflow(
        id="wf-run-governance",
        name="Run Governance Workflow",
        version="0.2.0",
        status="draft",
        definition=current_definition,
        created_at=now - timedelta(days=1),
        updated_at=now,
    )
    sqlite_session.add_all(
        [
            workflow,
            WorkflowVersion(
                id="wf-run-governance-v1",
                workflow_id=workflow.id,
                version="0.1.0",
                definition=missing_definition,
                created_at=now - timedelta(days=1),
            ),
            WorkflowVersion(
                id="wf-run-governance-v2",
                workflow_id=workflow.id,
                version="0.2.0",
                definition=current_definition,
                created_at=now,
            ),
            Run(
                id="run-governance-gap",
                workflow_id=workflow.id,
                workflow_version="0.1.0",
                status="failed",
                input_payload={},
                checkpoint_payload={},
                created_at=now,
            ),
        ]
    )
    sqlite_session.commit()

    monkeypatch.setattr(
        workflow_views,
        "get_workflow_library_service",
        lambda: _FakeWorkflowLibraryService(
            [
                PluginToolItem(
                    id="native.risk-search",
                    name="Risk Search",
                    ecosystem="native",
                    description="Governed native tool.",
                    source="native",
                    callable=True,
                )
            ]
        ),
    )

    response = client.get(f"/api/workflows/{workflow.id}/runs")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == "run-governance-gap"
    assert body[0]["tool_governance"] == {
        "referenced_tool_ids": ["native.catalog-gap"],
        "missing_tool_ids": ["native.catalog-gap"],
        "governed_tool_count": 0,
        "strong_isolation_tool_count": 0,
    }


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


def test_create_workflow_rejects_default_sandbox_code_when_backend_unavailable(
    client: TestClient,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        workflow_definitions,
        "get_sandbox_backend_client",
        lambda: _sandbox_backend_client(execution_classes=("microvm",)),
    )

    response = client.post(
        "/api/workflows",
        json={
            "name": "Blocked Sandbox Code Workflow",
            "definition": _sandbox_code_definition(),
        },
    )

    assert response.status_code == 422
    detail = _workflow_detail_message(response)
    assert "Sandbox code node 'sandbox:Sandbox'" in detail
    assert "execution class 'sandbox'" in detail
    assert "no compatible sandbox backend is currently available" in detail.lower()


def test_create_workflow_accepts_subprocess_sandbox_code_without_ready_backend(
    client: TestClient,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        workflow_definitions,
        "get_sandbox_backend_client",
        lambda: _sandbox_backend_client(execution_classes=("microvm",)),
    )

    response = client.post(
        "/api/workflows",
        json={
            "name": "Host Sandbox Code Workflow",
            "definition": _sandbox_code_definition(
                runtime_policy={"execution": {"class": "subprocess"}}
            ),
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["definition"]["nodes"][1]["runtimePolicy"]["execution"] == {
        "class": "subprocess"
    }


def test_create_workflow_rejects_sandbox_code_dependency_contract_without_backend_support(
    client: TestClient,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        workflow_definitions,
        "get_sandbox_backend_client",
        lambda: _sandbox_backend_client(
            execution_classes=("microvm",),
            dependency_modes=("builtin",),
        ),
    )

    response = client.post(
        "/api/workflows",
        json={
            "name": "Sandbox Code Dependency Workflow",
            "definition": _sandbox_code_definition(
                config={
                    "dependencyMode": "builtin",
                    "builtinPackageSet": "py-data-basic",
                },
                runtime_policy={"execution": {"class": "microvm", "dependencyMode": "builtin"}},
            ),
        },
    )

    assert response.status_code == 422
    detail = _workflow_detail_message(response)
    assert "Sandbox code node 'sandbox:Sandbox'" in detail
    assert "builtin package set" in detail.lower()


def test_create_workflow_rejects_sandbox_code_runtime_policy_deps_without_backend_support(
    client: TestClient,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        workflow_definitions,
        "get_sandbox_backend_client",
        lambda: _sandbox_backend_client(
            execution_classes=("microvm",),
            dependency_modes=("builtin",),
        ),
    )

    response = client.post(
        "/api/workflows",
        json={
            "name": "Sandbox Code Runtime Policy Dependency Workflow",
            "definition": _sandbox_code_definition(
                runtime_policy={
                    "execution": {
                        "class": "microvm",
                        "dependencyMode": "builtin",
                        "builtinPackageSet": "py-data-basic",
                    }
                }
            ),
        },
    )

    assert response.status_code == 422
    detail = _workflow_detail_message(response)
    assert "Sandbox code node 'sandbox:Sandbox'" in detail
    assert "builtin package set" in detail.lower()


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


def test_create_workflow_rejects_supported_tool_execution_class_until_tool_runner_exists(
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

    assert response.status_code == 422
    detail = _workflow_detail_message(response)
    assert "sandbox-backed tool execution" in detail
    assert "must fail closed" in detail


def test_create_workflow_allows_compat_tool_execution_when_backend_supports_tool_runner(
    client: TestClient,
    monkeypatch,
) -> None:
    adapter_response = client.post(
        "/api/plugins/adapters",
        json={
            "id": "dify-microvm-runner-ready",
            "ecosystem": "compat:dify-runner-ready",
            "endpoint": "http://adapter.local/dify-microvm-runner-ready",
            "supported_execution_classes": ["subprocess", "microvm"],
        },
    )
    assert adapter_response.status_code == 201

    tool_response = client.post(
        "/api/plugins/tools",
        json={
            "id": "compat:dify-runner-ready:plugin:demo/search",
            "name": "Runner Ready Search",
            "ecosystem": "compat:dify-runner-ready",
            "description": "Search via adapter",
            "input_schema": {"type": "object"},
            "output_schema": {"type": "object"},
        },
    )
    assert tool_response.status_code == 201
    monkeypatch.setattr(
        workflow_definitions,
        "get_sandbox_backend_client",
        lambda: _sandbox_backend_client(
            execution_classes=("microvm",),
            supports_tool_execution=True,
        ),
    )

    response = client.post(
        "/api/workflows",
        json={
            "name": "Runner Ready Tool Execution Workflow",
            "definition": _bound_tool_definition(
                tool_id="compat:dify-runner-ready:plugin:demo/search",
                ecosystem="compat:dify-runner-ready",
                adapter_id="dify-microvm-runner-ready",
                runtime_policy={"execution": {"class": "microvm"}},
            ),
        },
    )

    assert response.status_code == 201
    assert response.json()["definition_issues"] == []


def test_create_workflow_rejects_tool_execution_dependency_contract_without_backend_support(
    client: TestClient,
    monkeypatch,
) -> None:
    adapter_response = client.post(
        "/api/plugins/adapters",
        json={
            "id": "dify-microvm-deps",
            "ecosystem": "compat:dify-deps",
            "endpoint": "http://adapter.local/dify-deps",
            "supported_execution_classes": ["subprocess", "microvm"],
        },
    )
    assert adapter_response.status_code == 201

    tool_response = client.post(
        "/api/plugins/tools",
        json={
            "id": "compat:dify-deps:plugin:demo/search",
            "name": "Demo Search Deps",
            "ecosystem": "compat:dify-deps",
            "description": "Search via adapter",
            "input_schema": {"type": "object"},
            "output_schema": {"type": "object"},
        },
    )
    assert tool_response.status_code == 201
    monkeypatch.setattr(
        workflow_definitions,
        "get_sandbox_backend_client",
        lambda: _sandbox_backend_client(
            execution_classes=("microvm",),
            dependency_modes=("builtin",),
        ),
    )

    response = client.post(
        "/api/workflows",
        json={
            "name": "Dependency Contract Workflow",
            "definition": _bound_tool_definition(
                tool_id="compat:dify-deps:plugin:demo/search",
                ecosystem="compat:dify-deps",
                adapter_id="dify-microvm-deps",
                runtime_policy={
                    "execution": {
                        "class": "microvm",
                        "dependencyMode": "builtin",
                        "builtinPackageSet": "py-data-basic",
                    }
                },
            ),
        },
    )

    assert response.status_code == 422
    detail = _workflow_detail_message(response)
    assert "tool execution capabilities" in detail
    assert "no compatible sandbox backend is currently available" in detail.lower()
    assert "does not support builtin package set hints" in detail


def test_create_workflow_rejects_tool_execution_dependency_contract_until_tool_runner_exists(
    client: TestClient,
    monkeypatch,
) -> None:
    adapter_response = client.post(
        "/api/plugins/adapters",
        json={
            "id": "dify-microvm-ready-deps",
            "ecosystem": "compat:dify-ready-deps",
            "endpoint": "http://adapter.local/dify-ready-deps",
            "supported_execution_classes": ["subprocess", "microvm"],
        },
    )
    assert adapter_response.status_code == 201

    tool_response = client.post(
        "/api/plugins/tools",
        json={
            "id": "compat:dify-ready-deps:plugin:demo/search",
            "name": "Demo Search Ready Deps",
            "ecosystem": "compat:dify-ready-deps",
            "description": "Search via adapter",
            "input_schema": {"type": "object"},
            "output_schema": {"type": "object"},
        },
    )
    assert tool_response.status_code == 201
    monkeypatch.setattr(
        workflow_definitions,
        "get_sandbox_backend_client",
        lambda: _sandbox_backend_client(
            execution_classes=("microvm",),
            dependency_modes=("builtin",),
            supports_builtin_package_sets=True,
            supports_backend_extensions=True,
        ),
    )

    response = client.post(
        "/api/workflows",
        json={
            "name": "Dependency Contract Ready Workflow",
            "definition": _bound_tool_definition(
                tool_id="compat:dify-ready-deps:plugin:demo/search",
                ecosystem="compat:dify-ready-deps",
                adapter_id="dify-microvm-ready-deps",
                runtime_policy={
                    "execution": {
                        "class": "microvm",
                        "dependencyMode": "builtin",
                        "builtinPackageSet": "py-data-basic",
                        "backendExtensions": {"mountPreset": "analytics"},
                    }
                },
            ),
        },
    )

    assert response.status_code == 422
    detail = _workflow_detail_message(response)
    assert "sandbox-backed tool execution" in detail
    assert "must fail closed" in detail


def test_create_workflow_rejects_sensitivity_driven_default_execution_when_adapter_not_ready(
    client: TestClient,
) -> None:
    adapter_response = client.post(
        "/api/plugins/adapters",
        json={
            "id": "dify-sensitive-default",
            "ecosystem": "compat:dify-sensitive",
            "endpoint": "http://adapter.local/dify-sensitive",
            "supported_execution_classes": ["subprocess"],
        },
    )
    assert adapter_response.status_code == 201

    tool_response = client.post(
        "/api/plugins/tools",
        json={
            "id": "compat:dify-sensitive:plugin:demo/search",
            "name": "Sensitive Search",
            "ecosystem": "compat:dify-sensitive",
            "description": "Search via adapter",
            "input_schema": {"type": "object"},
            "output_schema": {"type": "object"},
        },
    )
    assert tool_response.status_code == 201

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Sensitive Search Capability",
            "sensitivity_level": "L2",
            "source": "local_capability",
            "metadata": {
                "tool_id": "compat:dify-sensitive:plugin:demo/search",
                "ecosystem": "compat:dify-sensitive",
                "adapter_id": "dify-sensitive-default",
            },
        },
    )
    assert resource_response.status_code == 201

    response = client.post(
        "/api/workflows",
        json={
            "name": "Sensitivity Driven Default Execution Workflow",
            "definition": _bound_tool_definition(
                tool_id="compat:dify-sensitive:plugin:demo/search",
                ecosystem="compat:dify-sensitive",
                adapter_id="dify-sensitive-default",
            ),
        },
    )

    assert response.status_code == 422
    detail = _workflow_detail_message(response)
    assert "tool execution capabilities" in detail
    assert "default execution class 'sandbox'" in detail
    assert "dify-sensitive-default" in detail


def test_create_workflow_rejects_native_tool_declared_sandbox_execution_until_tool_runner_exists(
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

    assert response.status_code == 422
    detail = _workflow_detail_message(response)
    assert "sandbox-backed tool execution" in detail
    assert "must fail closed" in detail


def test_create_workflow_allows_native_tool_execution_when_backend_supports_tool_runner(
    client: TestClient,
    monkeypatch,
) -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="native.risk-search-runner-ready",
            name="Risk Search Runner Ready",
            supported_execution_classes=("inline", "sandbox"),
        )
    )
    monkeypatch.setattr(workflow_library, "get_plugin_registry", lambda: registry)
    monkeypatch.setattr(workflow_definitions, "get_plugin_registry", lambda: registry)
    monkeypatch.setattr(
        workflow_definitions,
        "get_sandbox_backend_client",
        lambda: _sandbox_backend_client(
            execution_classes=("sandbox",),
            supports_tool_execution=True,
        ),
    )

    response = client.post(
        "/api/workflows",
        json={
            "name": "Native Runner Ready Workflow",
            "definition": _bound_tool_definition(
                tool_id="native.risk-search-runner-ready",
                ecosystem="native",
                runtime_policy={"execution": {"class": "sandbox"}},
            ),
        },
    )

    assert response.status_code == 201
    assert response.json()["definition_issues"] == []


def test_create_workflow_rejects_tool_default_sandbox_when_backend_unavailable(
    client: TestClient,
    monkeypatch,
) -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="native.risk-search-default",
            name="Risk Search Default",
            supported_execution_classes=("inline", "sandbox"),
            default_execution_class="sandbox",
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
        lambda: _sandbox_backend_client(execution_classes=("microvm",)),
    )

    response = client.post(
        "/api/workflows",
        json={
            "name": "Native Default Sandbox Workflow",
            "definition": _bound_tool_definition(
                tool_id="native.risk-search-default",
                ecosystem="native",
            ),
        },
    )

    assert response.status_code == 422
    detail = _workflow_detail_message(response)
    assert "default execution class 'sandbox'" in detail
    assert "no compatible sandbox backend is currently available" in detail.lower()


def test_create_workflow_allows_native_tool_default_sandbox_when_backend_supports_tool_runner(
    client: TestClient,
    monkeypatch,
) -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="native.risk-search-default-runner-ready",
            name="Risk Search Default Runner Ready",
            supported_execution_classes=("inline", "sandbox"),
            default_execution_class="sandbox",
        )
    )
    monkeypatch.setattr(workflow_library, "get_plugin_registry", lambda: registry)
    monkeypatch.setattr(workflow_definitions, "get_plugin_registry", lambda: registry)
    monkeypatch.setattr(
        workflow_definitions,
        "get_sandbox_backend_client",
        lambda: _sandbox_backend_client(
            execution_classes=("sandbox",),
            supports_tool_execution=True,
        ),
    )

    response = client.post(
        "/api/workflows",
        json={
            "name": "Native Default Runner Ready Workflow",
            "definition": _bound_tool_definition(
                tool_id="native.risk-search-default-runner-ready",
                ecosystem="native",
            ),
        },
    )

    assert response.status_code == 201
    assert response.json()["definition_issues"] == []


def test_create_workflow_rejects_allowed_tool_default_microvm_when_backend_unavailable(
    client: TestClient,
    monkeypatch,
) -> None:
    adapter_response = client.post(
        "/api/plugins/adapters",
        json={
            "id": "dify-default-microvm",
            "ecosystem": "compat:dify-default",
            "endpoint": "http://adapter.local/dify-default",
            "supported_execution_classes": ["subprocess", "microvm"],
        },
    )
    assert adapter_response.status_code == 201

    tool_response = client.post(
        "/api/plugins/tools",
        json={
            "id": "compat:dify-default:plugin:demo/search",
            "name": "Demo Search Default",
            "ecosystem": "compat:dify-default",
            "description": "Search via adapter",
            "input_schema": {"type": "object"},
            "output_schema": {"type": "object"},
            "supported_execution_classes": ["subprocess", "microvm"],
            "default_execution_class": "microvm",
        },
    )
    assert tool_response.status_code == 201
    monkeypatch.setattr(
        workflow_definitions,
        "get_sandbox_backend_client",
        lambda: _sandbox_backend_client(execution_classes=("sandbox",)),
    )

    response = client.post(
        "/api/workflows",
        json={
            "name": "Agent Default Microvm Workflow",
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
                                "allowedToolIds": ["compat:dify-default:plugin:demo/search"],
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
    assert "toolPolicy.allowedToolIds" in detail
    assert "default execution class 'microvm'" in detail
    assert "no compatible sandbox backend is currently available" in detail.lower()
    issues = _workflow_detail_issues(response)
    assert any(
        issue.get("category") == "tool_execution"
        and issue.get("path") == "nodes.1.config.toolPolicy.allowedToolIds"
        and issue.get("field") == "allowedToolIds"
        and "no compatible sandbox backend is currently available"
        in issue.get("message", "").lower()
        for issue in issues
    )


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


def test_validate_workflow_definition_preflight_rejects_unsupported_condition_execution_class(
    client: TestClient,
) -> None:
    created = client.post(
        "/api/workflows",
        json={"name": "Condition Execution Workflow", "definition": _valid_definition()},
    )
    assert created.status_code == 201
    workflow_id = created.json()["id"]

    response = client.post(
        f"/api/workflows/{workflow_id}/validate-definition",
        json={
            "definition": _condition_definition(
                runtime_policy={"execution": {"class": "microvm"}}
            )
        },
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "node execution capabilities" in detail["message"]
    assert any(
        issue["category"] == "node_execution"
        and issue["path"] == "nodes.1.runtimePolicy.execution"
        and issue["field"] == "execution"
        and "strong-isolation execution class 'microvm'" in issue["message"]
        for issue in detail["issues"]
    )


def test_validate_workflow_definition_preflight_accepts_condition_subprocess_execution(
    client: TestClient,
) -> None:
    created = client.post(
        "/api/workflows",
        json={"name": "Condition Subprocess Workflow", "definition": _valid_definition()},
    )
    assert created.status_code == 201
    workflow_id = created.json()["id"]

    response = client.post(
        f"/api/workflows/{workflow_id}/validate-definition",
        json={
            "definition": _condition_definition(
                runtime_policy={"execution": {"class": "subprocess"}}
            )
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["issues"] == []
    assert (
        body["definition"]["nodes"][1]["runtimePolicy"]["execution"]["class"] == "subprocess"
    )


def test_get_workflow_detail_surfaces_definition_issues_for_persisted_tool_runner_gap(
    client: TestClient,
    sqlite_session,
    monkeypatch,
) -> None:
    adapter_response = client.post(
        "/api/plugins/adapters",
        json={
            "id": "dify-microvm-detail",
            "ecosystem": "compat:dify",
            "endpoint": "http://adapter.local/dify-microvm-detail",
            "supported_execution_classes": ["subprocess", "microvm"],
        },
    )
    assert adapter_response.status_code == 201

    tool_response = client.post(
        "/api/plugins/tools",
        json={
            "id": "compat:dify:plugin:demo/detail-search",
            "name": "Detail Search",
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

    created = client.post(
        "/api/workflows",
        json={
            "name": "Detail Execution Drift Workflow",
            "definition": _bound_tool_definition(
                tool_id="compat:dify:plugin:demo/detail-search",
                ecosystem="compat:dify",
                adapter_id="dify-microvm-detail",
                runtime_policy={"execution": {"class": "subprocess"}},
            ),
        },
    )
    assert created.status_code == 201
    assert created.json()["definition_issues"] == []
    workflow_id = created.json()["id"]

    workflow = sqlite_session.get(Workflow, workflow_id)
    assert workflow is not None
    workflow.definition = _bound_tool_definition(
        tool_id="compat:dify:plugin:demo/detail-search",
        ecosystem="compat:dify",
        adapter_id="dify-microvm-detail",
        runtime_policy={"execution": {"class": "microvm"}},
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.get(f"/api/workflows/{workflow_id}")

    assert response.status_code == 200
    body = response.json()
    assert any(
        issue.get("category") == "tool_execution"
        and issue.get("path") == "nodes.1.runtimePolicy.execution"
        and issue.get("field") == "execution"
        and "sandbox-backed tool execution" in issue.get("message", "")
        for issue in body["definition_issues"]
    )


def test_get_workflow_detail_accepts_persisted_condition_subprocess_execution(
    client: TestClient,
    sqlite_session,
) -> None:
    created = client.post(
        "/api/workflows",
        json={
            "name": "Condition Execution Drift Workflow",
            "definition": _condition_definition(),
        },
    )
    assert created.status_code == 201
    workflow_id = created.json()["id"]

    workflow = sqlite_session.get(Workflow, workflow_id)
    assert workflow is not None
    workflow.definition = _condition_definition(
        runtime_policy={"execution": {"class": "subprocess"}}
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.get(f"/api/workflows/{workflow_id}")

    assert response.status_code == 200
    body = response.json()
    assert not any(
        issue.get("category") == "node_execution"
        and issue.get("path") == "nodes.1.runtimePolicy.execution"
        for issue in body["definition_issues"]
    )


def test_get_workflow_detail_surfaces_definition_issues_for_persisted_publish_auth_mode_gap(
    client: TestClient,
    sqlite_session,
) -> None:
    created = client.post(
        "/api/workflows",
        json={
            "name": "Publish Auth Drift Workflow",
            "definition": _valid_publish_definition(),
        },
    )
    assert created.status_code == 201
    workflow_id = created.json()["id"]

    workflow = sqlite_session.get(Workflow, workflow_id)
    assert workflow is not None
    workflow.definition = _unsupported_publish_auth_mode_definition()
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.get(f"/api/workflows/{workflow_id}")

    assert response.status_code == 200
    body = response.json()
    assert any(
        issue.get("category") == "publish_draft"
        and issue.get("path") == "publish.0.authMode"
        and issue.get("field") == "authMode"
        for issue in body["definition_issues"]
    )


def test_list_workflows_surfaces_definition_issues_for_persisted_publish_auth_mode_gap(
    client: TestClient,
    sqlite_session,
) -> None:
    created = client.post(
        "/api/workflows",
        json={
            "name": "Publish Auth Inventory Workflow",
            "definition": _valid_publish_definition(),
        },
    )
    assert created.status_code == 201
    workflow_id = created.json()["id"]

    workflow = sqlite_session.get(Workflow, workflow_id)
    assert workflow is not None
    workflow.definition = _unsupported_publish_auth_mode_definition()
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.get("/api/workflows")

    assert response.status_code == 200
    body = response.json()
    workflow_item = next(item for item in body if item["id"] == workflow_id)
    assert any(
        issue.get("category") == "publish_draft"
        and issue.get("path") == "publish.0.authMode"
        and issue.get("field") == "authMode"
        for issue in workflow_item["definition_issues"]
    )


def test_list_workflows_can_filter_legacy_publish_auth_definition_issues(
    client: TestClient,
    sqlite_session,
) -> None:
    blocked = client.post(
        "/api/workflows",
        json={
            "name": "Publish Auth Cleanup Workflow",
            "definition": _valid_publish_definition(),
        },
    )
    assert blocked.status_code == 201
    blocked_workflow_id = blocked.json()["id"]

    clean = client.post(
        "/api/workflows",
        json={
            "name": "Clean Publish Workflow",
            "definition": _valid_publish_definition(),
        },
    )
    assert clean.status_code == 201

    blocked_workflow = sqlite_session.get(Workflow, blocked_workflow_id)
    assert blocked_workflow is not None
    blocked_workflow.definition = _unsupported_publish_auth_mode_definition()
    sqlite_session.add(blocked_workflow)
    sqlite_session.commit()

    response = client.get("/api/workflows?definition_issue=legacy_publish_auth")

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == [blocked_workflow_id]
    assert any(
        issue.get("category") == "publish_draft"
        and issue.get("path") == "publish.0.authMode"
        and issue.get("field") == "authMode"
        for issue in body[0]["definition_issues"]
    )


def test_list_workflows_can_filter_missing_tool_definition_issues(
    client: TestClient,
    sqlite_session,
    monkeypatch,
) -> None:
    missing_tool_definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "tool",
                "type": "tool",
                "name": "Risk Search",
                "config": {
                    "tool": {
                        "toolId": "native.risk-search",
                        "ecosystem": "native",
                    }
                },
            },
            {
                "id": "agent",
                "type": "llm_agent",
                "name": "Agent",
                "config": {
                    "toolPolicy": {
                        "allowedToolIds": [
                            "native.risk-search",
                            "native.catalog-gap",
                        ]
                    }
                },
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool"},
            {"id": "e2", "sourceNodeId": "tool", "targetNodeId": "agent"},
            {"id": "e3", "sourceNodeId": "agent", "targetNodeId": "output"},
        ],
    }
    clean_definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "tool",
                "type": "tool",
                "name": "Risk Search",
                "config": {
                    "tool": {
                        "toolId": "native.risk-search",
                        "ecosystem": "native",
                    }
                },
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool"},
            {"id": "e2", "sourceNodeId": "tool", "targetNodeId": "output"},
        ],
    }
    missing_workflow = Workflow(
        id="wf-missing-tool",
        name="Missing Tool Workflow",
        version="0.1.0",
        status="draft",
        definition=missing_tool_definition,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    clean_workflow = Workflow(
        id="wf-clean-tool",
        name="Clean Tool Workflow",
        version="0.1.0",
        status="draft",
        definition=clean_definition,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    sqlite_session.add_all([missing_workflow, clean_workflow])
    sqlite_session.commit()

    monkeypatch.setattr(
        workflow_views,
        "get_workflow_library_service",
        lambda: _FakeWorkflowLibraryService(
            [
                PluginToolItem(
                    id="native.risk-search",
                    name="Risk Search",
                    ecosystem="native",
                    description="Governed native tool.",
                    source="native",
                    callable=True,
                    supported_execution_classes=["inline", "sandbox"],
                    default_execution_class="sandbox",
                    sensitivity_level="L2",
                )
            ]
        ),
    )

    response = client.get("/api/workflows?definition_issue=missing_tool")

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == [missing_workflow.id]
    assert body[0]["tool_governance"]["missing_tool_ids"] == ["native.catalog-gap"]


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


def test_validate_workflow_definition_preflight_rejects_unsupported_publish_auth_mode(
    client: TestClient,
) -> None:
    created = client.post(
        "/api/workflows",
        json={"name": "Publish Auth Preflight Workflow", "definition": _valid_definition()},
    )
    assert created.status_code == 201
    workflow_id = created.json()["id"]

    response = client.post(
        f"/api/workflows/{workflow_id}/validate-definition",
        json={"definition": _unsupported_publish_auth_mode_definition()},
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "publish auth modes" in detail["message"]
    assert "Publish auth contract: supported api_key / internal; legacy token." in detail[
        "message"
    ]
    assert "先把 workflow draft endpoint 切回 api_key/internal 并保存" in detail["message"]
    assert any(
        issue["category"] == "publish_draft"
        and issue["path"] == "publish.0.authMode"
        and issue["field"] == "authMode"
        for issue in detail["issues"]
    )
    assert any(
        "Publish auth contract: supported api_key / internal; legacy token."
        in issue["message"]
        for issue in detail["issues"]
    )


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


def test_workflow_routes_expose_tool_governance_summary(
    client: TestClient,
    sqlite_session,
    monkeypatch,
) -> None:
    definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "tool",
                "type": "tool",
                "name": "Risk Search",
                "config": {
                    "tool": {
                        "toolId": "native.risk-search",
                        "ecosystem": "native",
                    }
                },
            },
            {
                "id": "agent",
                "type": "llm_agent",
                "name": "Agent",
                "config": {
                    "toolPolicy": {
                        "allowedToolIds": [
                            "native.risk-search",
                            "native.catalog-gap",
                        ]
                    }
                },
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool"},
            {"id": "e2", "sourceNodeId": "tool", "targetNodeId": "agent"},
            {"id": "e3", "sourceNodeId": "agent", "targetNodeId": "output"},
        ],
    }
    workflow = Workflow(
        id="wf-governance",
        name="Governance Workflow",
        version="0.1.0",
        status="draft",
        definition=definition,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    workflow_version = WorkflowVersion(
        id="wf-governance-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=definition,
        created_at=datetime.now(UTC),
    )
    sqlite_session.add(workflow)
    sqlite_session.add(workflow_version)
    sqlite_session.commit()

    monkeypatch.setattr(
        workflow_views,
        "get_workflow_library_service",
        lambda: _FakeWorkflowLibraryService(
            [
                PluginToolItem(
                    id="native.risk-search",
                    name="Risk Search",
                    ecosystem="native",
                    description="Governed native tool.",
                    source="native",
                    callable=True,
                    supported_execution_classes=["inline", "sandbox"],
                    default_execution_class="sandbox",
                    sensitivity_level="L2",
                )
            ]
        ),
    )

    list_response = client.get("/api/workflows")

    assert list_response.status_code == 200
    list_body = list_response.json()
    assert len(list_body) == 1
    assert list_body[0]["id"] == workflow.id
    assert list_body[0]["node_count"] == 4
    assert list_body[0]["tool_governance"] == {
        "referenced_tool_ids": ["native.risk-search", "native.catalog-gap"],
        "missing_tool_ids": ["native.catalog-gap"],
        "governed_tool_count": 1,
        "strong_isolation_tool_count": 1,
    }

    detail_response = client.get(f"/api/workflows/{workflow.id}")

    assert detail_response.status_code == 200
    detail_body = detail_response.json()
    assert detail_body["node_count"] == 4
    assert detail_body["tool_governance"] == list_body[0]["tool_governance"]
    assert len(detail_body["versions"]) == 1
