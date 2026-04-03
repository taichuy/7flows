import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.workspace_starter import WorkspaceStarterTemplateRecord
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

pytestmark = pytest.mark.usefixtures(
    "workspace_console_auth", "default_console_route_headers"
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


def _valid_definition() -> dict:
    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "output"},
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


def _sandbox_dependency_definition(
    *,
    dependency_mode: str,
    builtin_package_set: str | None = None,
    dependency_ref: str | None = None,
    backend_extensions: dict | None = None,
) -> dict:
    execution: dict[str, object] = {
        "class": "subprocess",
        "dependencyMode": dependency_mode,
    }
    if builtin_package_set is not None:
        execution["builtinPackageSet"] = builtin_package_set
    if dependency_ref is not None:
        execution["dependencyRef"] = dependency_ref
    if backend_extensions is not None:
        execution["backendExtensions"] = backend_extensions

    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "sandbox",
                "type": "sandbox_code",
                "name": "Sandbox Code",
                "config": {"language": "python", "code": "print('ok')"},
                "runtimePolicy": {"execution": execution},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "sandbox"},
            {"id": "e2", "sourceNodeId": "sandbox", "targetNodeId": "output"},
        ],
    }


def _agent_tool_policy_definition(
    *,
    tool_id: str,
    execution_class: str | None = "microvm",
) -> dict:
    tool_policy: dict[str, object] = {
        "allowedToolIds": [tool_id],
    }
    if execution_class is not None:
        tool_policy["execution"] = {"class": execution_class}

    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "agent",
                "type": "llm_agent",
                "name": "Agent",
                "config": {
                    "prompt": "Plan with tools",
                    "toolPolicy": tool_policy,
                },
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "agent"},
            {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "output"},
        ],
    }


def _bound_tool_definition(*, tool_id: str, ecosystem: str, adapter_id: str | None = None) -> dict:
    tool_binding: dict[str, str] = {"toolId": tool_id, "ecosystem": ecosystem}
    if adapter_id is not None:
        tool_binding["adapterId"] = adapter_id
    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "tool_node",
                "type": "tool",
                "name": "Tool",
                "config": {"tool": tool_binding},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool_node"},
            {"id": "e2", "sourceNodeId": "tool_node", "targetNodeId": "output"},
        ],
    }


def _create_workspace_starter(
    client: TestClient,
    *,
    name: str,
    business_track: str,
    description: str,
    definition: dict | None = None,
) -> dict:
    response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": name,
            "description": description,
            "business_track": business_track,
            "default_workflow_name": f"{name} Workflow",
            "workflow_focus": f"{name} focus",
            "recommended_next_step": f"{name} next",
            "tags": [name.lower(), business_track],
            "definition": definition or _valid_definition(),
            "created_from_workflow_id": "wf-demo",
            "created_from_workflow_version": "0.1.0",
        },
    )

    assert response.status_code == 201
    return response.json()


def _validation_detail(body: dict) -> tuple[str, list[dict[str, str]]]:
    detail = body["detail"]
    assert isinstance(detail, dict)
    return detail["message"], detail["issues"]


def _invalid_variable_definition() -> dict:
    definition = _valid_definition()
    definition["variables"] = [
        {"name": "shared_input", "type": "string"},
        {"name": " shared_input ", "type": "number"},
        {"name": "   ", "type": "string"},
    ]
    return definition


def _skill_bound_definition(
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


def test_workspace_starter_create_rejects_missing_skill_reference(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Skill Guard Starter",
            "description": "Starter with missing skill",
            "business_track": "编排节点能力",
            "default_workflow_name": "Skill Guard Workflow",
            "workflow_focus": "Skill validation",
            "recommended_next_step": "Create the missing skill first",
            "tags": ["skill", "guard"],
            "definition": _skill_bound_definition("skill-missing"),
        },
    )

    assert response.status_code == 422
    message, issues = _validation_detail(response.json())
    assert "missing skill documents" in message
    assert any(issue["category"] == "skill_reference" for issue in issues)
    assert any(issue.get("field") == "skillIds" for issue in issues)


def test_workspace_starter_create_rejects_missing_skill_binding_reference(
    client: TestClient,
) -> None:
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
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Skill Binding Guard Starter",
            "description": "Starter with missing skill reference binding",
            "business_track": "编排节点能力",
            "default_workflow_name": "Skill Binding Workflow",
            "workflow_focus": "Skill binding validation",
            "recommended_next_step": "Fix the missing reference binding first",
            "tags": ["skill", "binding"],
            "definition": _skill_bound_definition(
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
    message, issues = _validation_detail(response.json())
    assert "missing skill reference" in message
    assert any(issue["category"] == "skill_reference" for issue in issues)
    assert any(issue.get("field") == "skillBinding.references" for issue in issues)


def _invalid_publish_identity_definition() -> dict:
    definition = _valid_definition()
    definition["publish"] = [
        {
            "id": "starter-api",
            "name": "Starter API",
            "alias": "Starter.Chat",
            "path": "/starter/chat",
            "protocol": "native",
            "workflowVersion": "0.1.0",
            "authMode": "internal",
            "streaming": False,
            "inputSchema": {"type": "object"},
        },
        {
            "id": "starter-api",
            "name": "Starter API Duplicate",
            "alias": "starter.chat",
            "path": "starter/chat/",
            "protocol": "openai",
            "workflowVersion": "0.1.0",
            "authMode": "api_key",
            "streaming": True,
            "inputSchema": {"type": "object"},
        },
    ]
    return definition


def _non_portable_publish_version_definition() -> dict:
    definition = _valid_definition()
    definition["publish"] = [
        {
            "id": "starter-api",
            "name": "Starter API",
            "alias": "starter.chat",
            "path": "/starter/chat",
            "protocol": "native",
            "workflowVersion": "0.1.0",
            "authMode": "internal",
            "streaming": False,
            "inputSchema": {"type": "object"},
        }
    ]
    return definition


def test_workspace_starter_create_rejects_unsupported_agent_tool_execution(
    client: TestClient,
) -> None:
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
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Execution Guard Starter Ready",
            "description": "Template for execution guard",
            "business_track": "编排节点能力",
            "default_workflow_name": "Execution Guard Workflow",
            "workflow_focus": "Execution guard focus",
            "recommended_next_step": "Fix adapter capability mismatch",
            "tags": ["execution", "guard"],
            "definition": _agent_tool_policy_definition(
                tool_id="compat:dify:plugin:demo/search"
            ),
        },
    )

    assert response.status_code == 422
    message, issues = _validation_detail(response.json())
    assert "tool execution capabilities" in message
    assert "microvm" in message
    assert any(issue["category"] == "tool_execution" for issue in issues)


def test_workspace_starter_create_rejects_unscoped_agent_tool_execution_target(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Execution Scope Guard Starter",
            "description": "Template for unscoped execution target guard",
            "business_track": "编排节点能力",
            "default_workflow_name": "Execution Scope Guard Workflow",
            "workflow_focus": "Execution scope guard focus",
            "recommended_next_step": "Scope allowed tools before forcing isolation",
            "tags": ["execution", "scope"],
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
    message, issues = _validation_detail(response.json())
    assert "without narrowing toolPolicy.allowedToolIds" in message
    assert "execution-incompatible tools:" in message
    assert any(issue["category"] == "tool_execution" for issue in issues)


def test_workspace_starter_create_rejects_supported_agent_tool_execution_until_tool_runner_exists(
    client: TestClient,
    monkeypatch,
) -> None:
    adapter_response = client.post(
        "/api/plugins/adapters",
        json={
            "id": "dify-ready-microvm",
            "ecosystem": "compat:dify-ready",
            "endpoint": "http://adapter.local/dify",
            "supported_execution_classes": ["subprocess", "microvm"],
        },
    )
    assert adapter_response.status_code == 201

    tool_response = client.post(
        "/api/plugins/tools",
        json={
            "id": "compat:dify-ready:plugin:demo/search",
            "name": "Demo Search",
            "ecosystem": "compat:dify-ready",
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
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Execution Guard Starter Ready",
            "description": "Template for execution guard",
            "business_track": "编排节点能力",
            "default_workflow_name": "Execution Guard Workflow",
            "workflow_focus": "Execution guard focus",
            "recommended_next_step": "Wire sandbox backend contract",
            "tags": ["execution", "guard"],
            "definition": _agent_tool_policy_definition(
                tool_id="compat:dify-ready:plugin:demo/search"
            ),
        },
    )

    assert response.status_code == 422
    message, _issues = _validation_detail(response.json())
    assert "sandbox-backed tool execution" in message
    assert "must fail closed" in message


def test_workspace_starter_create_allows_compat_tool_execution_when_backend_supports_tool_runner(
    client: TestClient,
    monkeypatch,
) -> None:
    adapter_response = client.post(
        "/api/plugins/adapters",
        json={
            "id": "dify-ready-microvm-runner",
            "ecosystem": "compat:dify-ready-runner",
            "endpoint": "http://adapter.local/dify-ready-runner",
            "supported_execution_classes": ["subprocess", "microvm"],
        },
    )
    assert adapter_response.status_code == 201

    tool_response = client.post(
        "/api/plugins/tools",
        json={
            "id": "compat:dify-ready-runner:plugin:demo/search",
            "name": "Demo Search Runner Ready",
            "ecosystem": "compat:dify-ready-runner",
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
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Execution Guard Starter Runner Ready",
            "description": "Template for execution guard",
            "business_track": "编排节点能力",
            "default_workflow_name": "Execution Guard Workflow",
            "workflow_focus": "Execution guard focus",
            "recommended_next_step": "Wire sandbox backend contract",
            "tags": ["execution", "guard"],
            "definition": {
                "nodes": [
                    {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                    {
                        "id": "tool_node",
                        "type": "tool",
                        "name": "Tool",
                        "config": {
                            "tool": {
                                "toolId": "compat:dify-ready-runner:plugin:demo/search",
                                "ecosystem": "compat:dify-ready-runner",
                                "adapterId": "dify-ready-microvm-runner",
                            }
                        },
                        "runtimePolicy": {"execution": {"class": "microvm"}},
                    },
                    {"id": "output", "type": "output", "name": "Output", "config": {}},
                ],
                "edges": [
                    {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool_node"},
                    {"id": "e2", "sourceNodeId": "tool_node", "targetNodeId": "output"},
                ],
            },
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Execution Guard Starter Runner Ready"
    assert body["definition"]["nodes"][1]["runtimePolicy"]["execution"]["class"] == "microvm"


def test_workspace_starter_create_rejects_tool_execution_dependency_contract(
    client: TestClient,
    monkeypatch,
) -> None:
    adapter_response = client.post(
        "/api/plugins/adapters",
        json={
            "id": "dify-ready-microvm-deps",
            "ecosystem": "compat:dify-ready-deps",
            "endpoint": "http://adapter.local/dify-deps",
            "supported_execution_classes": ["subprocess", "microvm"],
        },
    )
    assert adapter_response.status_code == 201

    tool_response = client.post(
        "/api/plugins/tools",
        json={
            "id": "compat:dify-ready-deps:plugin:demo/search",
            "name": "Demo Search",
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
        ),
    )

    response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Dependency Contract Starter",
            "description": "Template for dependency contract guard",
            "business_track": "编排节点能力",
            "default_workflow_name": "Dependency Contract Workflow",
            "workflow_focus": "Dependency contract focus",
            "recommended_next_step": "Provision builtin package set support first",
            "tags": ["execution", "dependency"],
            "definition": {
                "nodes": [
                    {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                    {
                        "id": "tool_node",
                        "type": "tool",
                        "name": "Tool",
                        "config": {
                            "tool": {
                                "toolId": "compat:dify-ready-deps:plugin:demo/search",
                                "ecosystem": "compat:dify-ready-deps",
                                "adapterId": "dify-ready-microvm-deps",
                            }
                        },
                        "runtimePolicy": {
                            "execution": {
                                "class": "microvm",
                                "dependencyMode": "builtin",
                                "builtinPackageSet": "py-data-basic",
                            }
                        },
                    },
                    {"id": "output", "type": "output", "name": "Output", "config": {}},
                ],
                "edges": [
                    {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool_node"},
                    {"id": "e2", "sourceNodeId": "tool_node", "targetNodeId": "output"},
                ],
            },
        },
    )

    assert response.status_code == 422
    message, issues = _validation_detail(response.json())
    assert "tool execution capabilities" in message
    assert "no compatible sandbox backend is currently available" in message.lower()
    assert "does not support builtin package set hints" in message
    assert any(issue["category"] == "tool_execution" for issue in issues)


def test_workspace_starter_create_rejects_sensitivity_driven_default_execution(
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
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Sensitive Default Execution Starter",
            "description": "Template for sensitivity-driven execution guard",
            "business_track": "编排节点能力",
            "default_workflow_name": "Sensitive Default Execution Workflow",
            "workflow_focus": "Sensitivity default execution focus",
            "recommended_next_step": "Provision sandbox backend before binding tool",
            "tags": ["execution", "sensitivity"],
            "definition": _bound_tool_definition(
                tool_id="compat:dify-sensitive:plugin:demo/search",
                ecosystem="compat:dify-sensitive",
                adapter_id="dify-sensitive-default",
            ),
        },
    )

    assert response.status_code == 422
    message, issues = _validation_detail(response.json())
    assert "tool execution capabilities" in message
    assert "default execution class 'sandbox'" in message
    assert any(issue["category"] == "tool_execution" for issue in issues)


def test_workspace_starter_create_rejects_allowed_tool_default_microvm_when_backend_unavailable(
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
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Default Execution Guard Starter",
            "description": "Template for default execution guard",
            "business_track": "编排节点能力",
            "default_workflow_name": "Default Execution Guard Workflow",
            "workflow_focus": "Default execution guard focus",
            "recommended_next_step": "Provision microvm sandbox backend",
            "tags": ["execution", "default"],
            "definition": _agent_tool_policy_definition(
                tool_id="compat:dify-default:plugin:demo/search",
                execution_class=None,
            ),
        },
    )

    assert response.status_code == 422
    message, issues = _validation_detail(response.json())
    assert "toolPolicy.allowedToolIds" in message
    assert "default execution class 'microvm'" in message
    assert "no compatible sandbox backend is currently available" in message.lower()
    assert any(issue["category"] == "tool_execution" for issue in issues)


def test_workspace_starter_create_allows_native_default_sandbox_with_tool_runner(
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
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Native Default Runner Ready Starter",
            "description": "Template for native runner-ready default execution",
            "business_track": "编排节点能力",
            "default_workflow_name": "Native Default Runner Ready Workflow",
            "workflow_focus": "Native default execution focus",
            "recommended_next_step": "Bind sandbox runner-backed native tool",
            "tags": ["execution", "native"],
            "definition": _bound_tool_definition(
                tool_id="native.risk-search-default-runner-ready",
                ecosystem="native",
            ),
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Native Default Runner Ready Starter"
    assert body["definition"]["nodes"][1]["config"]["tool"]["toolId"] == (
        "native.risk-search-default-runner-ready"
    )


def test_workspace_starter_create_rejects_invalid_variables(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Invalid Variables Starter",
            "description": "Should reject duplicate variable names",
            "business_track": "应用新建编排",
            "default_workflow_name": "Invalid Variables Workflow",
            "workflow_focus": "Variable validation",
            "recommended_next_step": "Deduplicate variable names",
            "tags": ["variables"],
            "definition": _invalid_variable_definition(),
        },
    )

    assert response.status_code == 422
    message, issues = _validation_detail(response.json())
    assert "workflow variables that are not valid for persistence" in message
    assert any(issue["category"] == "variables" for issue in issues)
    assert any(issue.get("path") == "variables.0.name" for issue in issues)


def test_workspace_starter_create_rejects_duplicate_publish_identities(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Invalid Publish Identity Starter",
            "description": "Should reject duplicate publish identities",
            "business_track": "API 调用开放",
            "default_workflow_name": "Invalid Publish Identity Starter Workflow",
            "workflow_focus": "Publish identity validation",
            "recommended_next_step": "Deduplicate endpoint id / alias / path",
            "tags": ["publish", "identity"],
            "definition": _invalid_publish_identity_definition(),
        },
    )

    assert response.status_code == 422
    message, issues = _validation_detail(response.json())
    assert "publish endpoint identities that are not valid for persistence" in message
    assert any(issue["category"] == "publish_identity" for issue in issues)
    assert any(issue.get("path") == "publish.0.id" for issue in issues)
    assert any(issue.get("path") == "publish.1.alias" for issue in issues)


def test_workspace_starter_create_rejects_non_portable_publish_version_pins(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Pinned Publish Version Starter",
            "description": "Should reject publish workflowVersion pins in starter snapshots",
            "business_track": "API 调用开放",
            "default_workflow_name": "Pinned Publish Version Workflow",
            "workflow_focus": "Starter portability validation",
            "recommended_next_step": "Clear workflowVersion before saving starter",
            "tags": ["publish", "starter"],
            "definition": _non_portable_publish_version_definition(),
            "created_from_workflow_id": "wf-demo",
            "created_from_workflow_version": "0.1.0",
        },
    )

    assert response.status_code == 422
    message, issues = _validation_detail(response.json())
    assert "not portable for starter reuse" in message
    assert any(issue["category"] == "starter_portability" for issue in issues)
    assert any(issue.get("path") == "publish.0.workflowVersion" for issue in issues)


def test_workspace_starter_list_supports_filters_and_search(client: TestClient) -> None:
    app_template = _create_workspace_starter(
        client,
        name="App Starter",
        business_track="应用新建编排",
        description="Template for application creation",
    )
    _create_workspace_starter(
        client,
        name="API Response Starter",
        business_track="API 调用开放",
        description="Template for API publishing",
    )

    filtered_response = client.get(
        "/api/workspace-starters",
        params={"business_track": "应用新建编排", "search": "application"},
    )

    assert filtered_response.status_code == 200
    filtered_items = filtered_response.json()
    assert [item["id"] for item in filtered_items] == [app_template["id"]]


def test_workspace_starter_detail_returns_single_template(client: TestClient) -> None:
    created = _create_workspace_starter(
        client,
        name="Detail Starter",
        business_track="编排节点能力",
        description="Template for node orchestration",
    )

    response = client.get(f"/api/workspace-starters/{created['id']}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == created["id"]
    assert body["name"] == "Detail Starter"
    assert body["definition"]["nodes"][0]["id"] == "trigger"


def test_workspace_starter_routes_surface_source_governance(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Governed Workspace Starter",
            "description": "Starter backed by a source workflow.",
            "business_track": "编排节点能力",
            "default_workflow_name": sample_workflow.name,
            "workflow_focus": "Keep starter governance aligned with the source workflow.",
            "recommended_next_step": "Review source governance before reusing the starter.",
            "tags": ["governed", "workspace starter"],
            "created_from_workflow_id": sample_workflow.id,
            "created_from_workflow_version": sample_workflow.version,
            "definition": sample_workflow.definition,
        },
    )
    assert response.status_code == 201
    created = response.json()

    sample_workflow.version = "0.2.0"
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "mock_tool",
                "type": "tool",
                "name": "Renamed Mock Tool",
                "config": {"mock_output": {"answer": "updated"}},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "mock_tool"},
            {"id": "e2", "sourceNodeId": "mock_tool", "targetNodeId": "output"},
        ],
    }
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    list_response = client.get("/api/workspace-starters")
    detail_response = client.get(f"/api/workspace-starters/{created['id']}")

    assert list_response.status_code == 200
    assert detail_response.status_code == 200

    listed_item = next(
        item for item in list_response.json() if item["id"] == created["id"]
    )
    for item in (listed_item, detail_response.json()):
        source_governance = item["source_governance"]
        assert source_governance["kind"] == "drifted"
        assert source_governance["status_label"] == "建议 refresh"
        assert source_governance["source_workflow_id"] == sample_workflow.id
        assert source_governance["template_version"] == "0.1.0"
        assert source_governance["source_version"] == "0.2.0"
        assert source_governance["action_decision"]["recommended_action"] == "refresh"
        assert "来源 workflow 0.2.0" in source_governance["outcome_explanation"]["primary_signal"]


def test_workspace_starter_list_filters_by_source_governance_and_follow_up(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    drifted = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Drifted Governance Starter",
            "description": "Starter that should drift after source update.",
            "business_track": "编排节点能力",
            "default_workflow_name": sample_workflow.name,
            "workflow_focus": "Drifted governance filter",
            "recommended_next_step": "Refresh after source update.",
            "tags": ["drifted", "governance"],
            "created_from_workflow_id": sample_workflow.id,
            "created_from_workflow_version": sample_workflow.version,
            "definition": sample_workflow.definition,
        },
    )
    assert drifted.status_code == 201
    drifted_id = drifted.json()["id"]

    sample_workflow.version = "0.2.0"
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "mock_tool",
                "type": "tool",
                "name": "Renamed Mock Tool",
                "config": {"mock_output": {"answer": "updated"}},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "mock_tool"},
            {"id": "e2", "sourceNodeId": "mock_tool", "targetNodeId": "output"},
        ],
    }
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    synced = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Synced Governance Starter",
            "description": "Starter that stays aligned with source workflow.",
            "business_track": "编排节点能力",
            "default_workflow_name": sample_workflow.name,
            "workflow_focus": "Synced governance filter",
            "recommended_next_step": "Reuse starter directly.",
            "tags": ["synced", "governance"],
            "created_from_workflow_id": sample_workflow.id,
            "created_from_workflow_version": sample_workflow.version,
            "definition": sample_workflow.definition,
        },
    )
    assert synced.status_code == 201
    synced_id = synced.json()["id"]

    no_source = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Manual Governance Starter",
            "description": "Starter without source workflow binding.",
            "business_track": "应用新建编排",
            "default_workflow_name": "Manual Governance Workflow",
            "workflow_focus": "No source governance filter",
            "recommended_next_step": "Reuse independent snapshot.",
            "tags": ["manual", "snapshot"],
            "definition": sample_workflow.definition,
        },
    )
    assert no_source.status_code == 201
    no_source_id = no_source.json()["id"]

    missing_source = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Missing Source Governance Starter",
            "description": "Starter with missing source workflow.",
            "business_track": "API 调用开放",
            "default_workflow_name": "Missing Governance Workflow",
            "workflow_focus": "Missing source governance filter",
            "recommended_next_step": "Repair missing binding.",
            "tags": ["missing", "governance"],
            "created_from_workflow_id": "wf-missing-governance",
            "created_from_workflow_version": "0.1.0",
            "definition": sample_workflow.definition,
        },
    )
    assert missing_source.status_code == 201
    missing_source_id = missing_source.json()["id"]

    drifted_response = client.get(
        "/api/workspace-starters",
        params={"source_governance_kind": "drifted"},
    )
    assert drifted_response.status_code == 200
    assert [item["id"] for item in drifted_response.json()] == [drifted_id]

    synced_response = client.get(
        "/api/workspace-starters",
        params={"source_governance_kind": "synced"},
    )
    assert synced_response.status_code == 200
    assert [item["id"] for item in synced_response.json()] == [synced_id]

    no_source_response = client.get(
        "/api/workspace-starters",
        params={"source_governance_kind": "no_source"},
    )
    assert no_source_response.status_code == 200
    assert [item["id"] for item in no_source_response.json()] == [no_source_id]

    follow_up_response = client.get(
        "/api/workspace-starters",
        params={"needs_follow_up": "true"},
    )
    assert follow_up_response.status_code == 200
    follow_up_items = follow_up_response.json()
    assert {item["id"] for item in follow_up_items} == {drifted_id, missing_source_id}
    assert {item["source_governance"]["kind"] for item in follow_up_items} == {
        "drifted",
        "missing_source",
    }


def test_workspace_starter_governance_summary_returns_breakdown_and_follow_up_queue(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    drifted = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Summary Drifted Starter",
            "description": "Starter included in governance summary drift count.",
            "business_track": "编排节点能力",
            "default_workflow_name": sample_workflow.name,
            "workflow_focus": "Governance summary drift",
            "recommended_next_step": "Refresh from source.",
            "tags": ["summary", "drifted"],
            "created_from_workflow_id": sample_workflow.id,
            "created_from_workflow_version": sample_workflow.version,
            "definition": sample_workflow.definition,
        },
    )
    assert drifted.status_code == 201
    drifted_id = drifted.json()["id"]

    sample_workflow.version = "0.2.0"
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "mock_tool",
                "type": "tool",
                "name": "Summary Updated Tool",
                "config": {"mock_output": {"answer": "updated"}},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "mock_tool"},
            {"id": "e2", "sourceNodeId": "mock_tool", "targetNodeId": "output"},
        ],
    }
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    synced = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Summary Synced Starter",
            "description": "Starter included in synced governance summary.",
            "business_track": "编排节点能力",
            "default_workflow_name": sample_workflow.name,
            "workflow_focus": "Governance summary synced",
            "recommended_next_step": "Reuse starter directly.",
            "tags": ["summary", "synced"],
            "created_from_workflow_id": sample_workflow.id,
            "created_from_workflow_version": sample_workflow.version,
            "definition": sample_workflow.definition,
        },
    )
    assert synced.status_code == 201

    no_source = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Summary Manual Starter",
            "description": "Starter included in no-source governance summary.",
            "business_track": "应用新建编排",
            "default_workflow_name": "Summary Manual Workflow",
            "workflow_focus": "Governance summary no source",
            "recommended_next_step": "Reuse snapshot.",
            "tags": ["summary", "manual"],
            "definition": sample_workflow.definition,
        },
    )
    assert no_source.status_code == 201

    missing_source = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Summary Missing Starter",
            "description": "Starter included in missing-source governance summary.",
            "business_track": "API 调用开放",
            "default_workflow_name": "Summary Missing Workflow",
            "workflow_focus": "Governance summary missing source",
            "recommended_next_step": "Repair source binding.",
            "tags": ["summary", "missing"],
            "created_from_workflow_id": "wf-summary-missing",
            "created_from_workflow_version": "0.1.0",
            "definition": sample_workflow.definition,
        },
    )
    assert missing_source.status_code == 201
    missing_source_id = missing_source.json()["id"]

    summary_response = client.get("/api/workspace-starters/governance-summary")
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["workspace_id"] == "default"
    assert summary["total_count"] == 4
    assert summary["attention_count"] == 2
    assert summary["counts"] == {
        "no_source": 1,
        "missing_source": 1,
        "synced": 1,
        "drifted": 1,
    }
    assert set(summary["follow_up_template_ids"]) == {drifted_id, missing_source_id}
    assert "来源漂移 1 个" in summary["summary"]
    assert "来源缺失 1 个" in summary["summary"]
    assert summary["chips"] == ["来源漂移 1", "来源缺失 1", "无来源 1", "已对齐 1"]

    follow_up_summary_response = client.get(
        "/api/workspace-starters/governance-summary",
        params={"needs_follow_up": "true"},
    )
    assert follow_up_summary_response.status_code == 200
    follow_up_summary = follow_up_summary_response.json()
    assert follow_up_summary["total_count"] == 2
    assert follow_up_summary["attention_count"] == 2
    assert follow_up_summary["counts"] == {
        "no_source": 0,
        "missing_source": 1,
        "synced": 0,
        "drifted": 1,
    }
    assert set(follow_up_summary["follow_up_template_ids"]) == {
        drifted_id,
        missing_source_id,
    }


def test_workspace_starter_update_persists_metadata_changes(client: TestClient) -> None:
    created = _create_workspace_starter(
        client,
        name="Original Starter",
        business_track="Dify 插件兼容",
        description="Template for compat tools",
    )

    response = client.put(
        f"/api/workspace-starters/{created['id']}",
        json={
            "name": "Updated Starter",
            "description": "Updated governance description",
            "workflow_focus": "Updated workflow focus",
            "recommended_next_step": "Updated next step",
            "tags": ["updated", "workspace starter"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Updated Starter"
    assert body["description"] == "Updated governance description"
    assert body["workflow_focus"] == "Updated workflow focus"
    assert body["recommended_next_step"] == "Updated next step"
    assert body["tags"] == ["updated", "workspace starter"]

    history_response = client.get(f"/api/workspace-starters/{created['id']}/history")
    assert history_response.status_code == 200
    history_items = history_response.json()
    assert [item["action"] for item in history_items[:2]] == ["updated", "created"]
    assert history_items[0]["payload"]["fields"] == [
        "description",
        "name",
        "recommended_next_step",
        "tags",
        "workflow_focus",
    ]


def test_workspace_starter_update_rejects_unavailable_persisted_nodes(
    client: TestClient,
) -> None:
    created = _create_workspace_starter(
        client,
        name="Update Loop Starter",
        business_track="编排节点能力",
        description="Template for invalid update flow",
    )

    response = client.put(
        f"/api/workspace-starters/{created['id']}",
        json={"definition": _planned_loop_definition()},
    )

    assert response.status_code == 422
    message, issues = _validation_detail(response.json())
    assert "not currently available for persistence" in message
    assert "loop" in message
    assert any(issue["category"] == "node_support" for issue in issues)


def test_workspace_starter_update_rejects_non_portable_publish_version_pins(
    client: TestClient,
) -> None:
    created = _create_workspace_starter(
        client,
        name="Portable Starter",
        business_track="API 调用开放",
        description="Template for invalid publish pin update",
    )

    response = client.put(
        f"/api/workspace-starters/{created['id']}",
        json={"definition": _non_portable_publish_version_definition()},
    )

    assert response.status_code == 422
    message, issues = _validation_detail(response.json())
    assert "not portable for starter reuse" in message
    assert any(issue["category"] == "starter_portability" for issue in issues)
    assert any(issue.get("path") == "publish.0.workflowVersion" for issue in issues)


def test_workspace_starter_create_rejects_unavailable_persisted_nodes(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Loop Starter",
            "description": "Should be rejected before persistence",
            "business_track": "编排节点能力",
            "default_workflow_name": "Loop Starter Workflow",
            "workflow_focus": "Loop focus",
            "recommended_next_step": "Replace planned nodes",
            "tags": ["loop"],
            "definition": _planned_loop_definition(),
        },
    )

    assert response.status_code == 422
    message, issues = _validation_detail(response.json())
    assert "not currently available for persistence" in message
    assert "loop" in message
    assert any(issue["category"] == "node_support" for issue in issues)


def test_workspace_starter_create_rejects_missing_catalog_tool_binding(
    client: TestClient,
) -> None:
    definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "tool",
                "type": "tool",
                "name": "Tool",
                "config": {
                    "tool": {
                        "toolId": "native.missing",
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

    response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Broken Missing Tool Starter",
            "description": "Should reject missing tool catalog references",
            "business_track": "应用新建编排",
            "default_workflow_name": "Broken Missing Tool Starter Workflow",
            "workflow_focus": "Catalog reference validation",
            "recommended_next_step": "Fix tool binding",
            "tags": ["tool", "validation"],
            "definition": definition,
        },
    )

    assert response.status_code == 422
    message, issues = _validation_detail(response.json())
    assert "references missing or drifted tool catalog entries" in message
    assert "native.missing" in message
    assert any(issue["category"] == "tool_reference" for issue in issues)


def test_workspace_starter_create_rejects_unknown_publish_workflow_version(
    client: TestClient,
) -> None:
    definition = _valid_definition()
    definition["publish"] = [
        {
            "id": "native-chat",
            "name": "Native Chat",
            "protocol": "native",
            "workflowVersion": "9.9.9",
            "authMode": "internal",
            "streaming": False,
            "inputSchema": {"type": "object"},
        }
    ]

    response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Broken Publish Version Starter",
            "description": "Should reject publish workflow version drift",
            "business_track": "API 调用开放",
            "default_workflow_name": "Broken Publish Version Starter Workflow",
            "workflow_focus": "Publish version reference validation",
            "recommended_next_step": "Clear workflowVersion or choose a valid one",
            "tags": ["publish", "validation"],
            "definition": definition,
            "created_from_workflow_id": "wf-demo",
            "created_from_workflow_version": "0.1.0",
        },
    )

    assert response.status_code == 422
    message, issues = _validation_detail(response.json())
    assert "references unknown publish workflow versions" in message
    assert "0.1.0, 0.1.1" in message
    assert any(issue["category"] == "publish_version" for issue in issues)


def test_workspace_starter_rebase_rejects_source_workflow_with_unavailable_nodes(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    created = _create_workspace_starter(
        client,
        name="Rebase Invalid Source Starter",
        business_track="编排节点能力",
        description="Template for invalid source rebase flow",
    )

    sample_workflow.version = "0.1.4"
    sample_workflow.definition = _planned_loop_definition()
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    response = client.post(f"/api/workspace-starters/{created['id']}/rebase")

    assert response.status_code == 422
    message, issues = _validation_detail(response.json())
    assert "not currently available for persistence" in message
    assert "loop" in message
    assert any(issue["category"] == "node_support" for issue in issues)


def test_workspace_starter_refresh_rejects_source_workflow_with_unavailable_nodes(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    created = _create_workspace_starter(
        client,
        name="Refresh Invalid Source Starter",
        business_track="编排节点能力",
        description="Template for invalid source refresh flow",
    )

    sample_workflow.version = "0.1.4"
    sample_workflow.definition = _planned_loop_definition()
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    response = client.post(f"/api/workspace-starters/{created['id']}/refresh")

    assert response.status_code == 422
    message, issues = _validation_detail(response.json())
    assert "not currently available for persistence" in message
    assert "loop" in message
    assert any(issue["category"] == "node_support" for issue in issues)


def test_workspace_starter_archive_and_restore_change_visibility(
    client: TestClient,
) -> None:
    created = _create_workspace_starter(
        client,
        name="Archive Starter",
        business_track="应用新建编排",
        description="Template for archive flow",
    )

    archive_response = client.post(f"/api/workspace-starters/{created['id']}/archive")
    assert archive_response.status_code == 200
    archived = archive_response.json()
    assert archived["archived"] is True
    assert archived["archived_at"] is not None

    default_list = client.get("/api/workspace-starters")
    assert default_list.status_code == 200
    assert default_list.json() == []

    archived_list = client.get(
        "/api/workspace-starters",
        params={"archived_only": True},
    )
    assert archived_list.status_code == 200
    assert [item["id"] for item in archived_list.json()] == [created["id"]]

    restore_response = client.post(f"/api/workspace-starters/{created['id']}/restore")
    assert restore_response.status_code == 200
    restored = restore_response.json()
    assert restored["archived"] is False
    assert restored["archived_at"] is None

    active_list = client.get("/api/workspace-starters")
    assert active_list.status_code == 200
    assert [item["id"] for item in active_list.json()] == [created["id"]]

    history_response = client.get(f"/api/workspace-starters/{created['id']}/history")
    assert history_response.status_code == 200
    history_items = history_response.json()
    assert [item["action"] for item in history_items[:3]] == [
        "restored",
        "archived",
        "created",
    ]


def test_workspace_starter_refresh_updates_snapshot_and_records_history(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    created = _create_workspace_starter(
        client,
        name="Refresh Starter",
        business_track="编排节点能力",
        description="Template for refresh flow",
    )

    sample_workflow.version = "0.1.1"
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "agent",
                "type": "llm_agent",
                "name": "Agent",
                "config": {"prompt": "Refresh me"},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "agent"},
            {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "output"},
        ],
    }
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    refresh_response = client.post(f"/api/workspace-starters/{created['id']}/refresh")
    assert refresh_response.status_code == 200
    refreshed = refresh_response.json()
    assert refreshed["created_from_workflow_version"] == "0.1.1"
    assert [node["id"] for node in refreshed["definition"]["nodes"]] == [
        "trigger",
        "agent",
        "output",
    ]

    history_response = client.get(f"/api/workspace-starters/{created['id']}/history")
    assert history_response.status_code == 200
    history_items = history_response.json()
    assert history_items[0]["action"] == "refreshed"
    assert history_items[0]["payload"]["source_workflow_id"] == "wf-demo"
    assert history_items[0]["payload"]["previous_workflow_version"] == "0.1.0"
    assert history_items[0]["payload"]["source_workflow_version"] == "0.1.1"
    assert history_items[0]["payload"]["changed"] is True
    assert history_items[0]["payload"]["action_decision"] == {
        "recommended_action": "rebase",
        "status_label": "建议 rebase",
        "summary": (
            "当前 drift 同时影响 starter 快照和默认 workflow 名称。若希望"
            "模板命名与来源一起对齐，优先执行 rebase；如果只想先同步 "
            "definition / version 并保留当前模板名称，可先 refresh。"
        ),
        "can_refresh": True,
        "can_rebase": True,
        "fact_chips": [
            "template 0.1.0",
            "source 0.1.1",
            "structure drift 3",
            "name drift",
            "rebase 3",
        ],
    }


def test_workspace_starter_refresh_records_sandbox_dependency_drift_in_history(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    created = _create_workspace_starter(
        client,
        name="Refresh Sandbox Starter",
        business_track="编排节点能力",
        description="Template for sandbox refresh flow",
        definition=_sandbox_dependency_definition(
            dependency_mode="builtin",
            builtin_package_set="py-data-basic",
        ),
    )

    sample_workflow.version = "0.1.1"
    sample_workflow.definition = _sandbox_dependency_definition(
        dependency_mode="dependency_ref",
        dependency_ref="deps://analytics-v2",
        backend_extensions={"mountPreset": "analytics"},
    )
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    refresh_response = client.post(f"/api/workspace-starters/{created['id']}/refresh")
    assert refresh_response.status_code == 200

    history_response = client.get(f"/api/workspace-starters/{created['id']}/history")
    assert history_response.status_code == 200
    history_items = history_response.json()
    assert history_items[0]["action"] == "refreshed"
    assert history_items[0]["payload"]["action_decision"]["recommended_action"] == "rebase"
    assert history_items[0]["payload"]["action_decision"]["can_refresh"] is True
    assert history_items[0]["payload"]["action_decision"]["can_rebase"] is True
    assert history_items[0]["payload"]["sandbox_dependency_changes"] == {
        "template_count": 1,
        "source_count": 1,
        "added_count": 0,
        "removed_count": 0,
        "changed_count": 1,
    }
    assert history_items[0]["payload"]["sandbox_dependency_nodes"] == ["sandbox"]


def test_workspace_starter_source_diff_reports_node_edge_and_name_drift(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    created = _create_workspace_starter(
        client,
        name="Diff Starter",
        business_track="编排节点能力",
        description="Template for diff flow",
    )

    sample_workflow.name = "Demo Workflow v2"
    sample_workflow.version = "0.1.1"
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "mock_tool",
                "type": "tool",
                "name": "Mock Tool",
                "config": {"mock_output": {"answer": "updated"}},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
            {
                "id": "auditor",
                "type": "llm_agent",
                "name": "Auditor",
                "config": {"prompt": "Check output"},
            },
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "mock_tool"},
            {"id": "e2", "sourceNodeId": "mock_tool", "targetNodeId": "auditor"},
            {"id": "e3", "sourceNodeId": "auditor", "targetNodeId": "output"},
        ],
    }
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    response = client.get(f"/api/workspace-starters/{created['id']}/source-diff")

    assert response.status_code == 200
    body = response.json()
    assert body["changed"] is True
    assert body["workflow_name_changed"] is True
    assert body["action_decision"]["recommended_action"] == "rebase"
    assert body["action_decision"]["can_refresh"] is True
    assert body["action_decision"]["can_rebase"] is True
    assert body["rebase_fields"] == [
        "definition",
        "created_from_workflow_version",
        "default_workflow_name",
    ]
    assert body["node_summary"] == {
        "template_count": 2,
        "source_count": 4,
        "added_count": 2,
        "removed_count": 0,
        "changed_count": 0,
    }
    assert body["edge_summary"] == {
        "template_count": 1,
        "source_count": 3,
        "added_count": 2,
        "removed_count": 0,
        "changed_count": 1,
    }
    assert [entry["id"] for entry in body["node_entries"]] == ["auditor", "mock_tool"]
    assert [entry["status"] for entry in body["node_entries"]] == ["added", "added"]
    changed_edge = next(
        entry for entry in body["edge_entries"] if entry["id"] == "e1"
    )
    assert changed_edge["changed_fields"] == ["targetNodeId"]


def test_workspace_starter_source_diff_recommends_rebase_for_name_only_drift(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Name Drift Starter",
            "description": "Template for name-only source drift",
            "business_track": "应用新建编排",
            "default_workflow_name": sample_workflow.name,
            "workflow_focus": "name drift focus",
            "recommended_next_step": "name drift next",
            "tags": ["name-drift"],
            "definition": sample_workflow.definition,
            "created_from_workflow_id": sample_workflow.id,
            "created_from_workflow_version": sample_workflow.version,
        },
    )
    assert response.status_code == 201
    created = response.json()

    sample_workflow.name = "Demo Workflow v2"
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    response = client.get(f"/api/workspace-starters/{created['id']}/source-diff")

    assert response.status_code == 200
    body = response.json()
    assert body["changed"] is True
    assert body["workflow_name_changed"] is True
    assert body["rebase_fields"] == ["default_workflow_name"]
    assert body["action_decision"] == {
        "recommended_action": "rebase",
        "status_label": "建议 rebase",
        "summary": (
            "当前只漂移默认 workflow 名称；refresh 不会改名，如需让 starter 命名"
            "跟随来源，请执行 rebase。"
        ),
        "can_refresh": False,
        "can_rebase": True,
        "fact_chips": [
            "template 0.1.0",
            "source 0.1.0",
            "name drift",
            "rebase 1",
        ],
    }


def test_workspace_starter_source_diff_surfaces_sandbox_dependency_drift(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    created = _create_workspace_starter(
        client,
        name="Sandbox Drift Starter",
        business_track="编排节点能力",
        description="Template for sandbox source diff",
        definition=_sandbox_dependency_definition(
            dependency_mode="builtin",
            builtin_package_set="py-data-basic",
        ),
    )

    sample_workflow.version = "0.1.1"
    sample_workflow.definition = _sandbox_dependency_definition(
        dependency_mode="dependency_ref",
        dependency_ref="deps://analytics-v2",
        backend_extensions={"mountPreset": "analytics"},
    )
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    response = client.get(f"/api/workspace-starters/{created['id']}/source-diff")

    assert response.status_code == 200
    body = response.json()
    assert body["action_decision"]["recommended_action"] == "rebase"
    assert body["action_decision"]["can_refresh"] is True
    assert body["action_decision"]["can_rebase"] is True
    assert "sandbox drift 1" in body["action_decision"]["fact_chips"]
    assert body["sandbox_dependency_summary"] == {
        "template_count": 1,
        "source_count": 1,
        "added_count": 0,
        "removed_count": 0,
        "changed_count": 1,
    }
    sandbox_entry = body["sandbox_dependency_entries"][0]
    assert sandbox_entry["id"] == "sandbox"
    assert sandbox_entry["status"] == "changed"
    assert sandbox_entry["changed_fields"] == [
        "backendExtensions",
        "builtinPackageSet",
        "dependencyMode",
        "dependencyRef",
    ]
    assert sandbox_entry["template_facts"] == [
        "execution = subprocess",
        "dependencyMode = builtin",
        "builtinPackageSet = py-data-basic",
    ]
    assert sandbox_entry["source_facts"] == [
        "execution = subprocess",
        "dependencyMode = dependency_ref",
        "dependencyRef = deps://analytics-v2",
        "backendExtensions = mountPreset",
    ]


def test_workspace_starter_rebase_syncs_source_derived_fields_and_records_history(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    created = _create_workspace_starter(
        client,
        name="Rebase Starter",
        business_track="应用新建编排",
        description="Template for rebase flow",
    )

    sample_workflow.name = "Rebased Demo Workflow"
    sample_workflow.version = "0.1.2"
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "planner",
                "type": "llm_agent",
                "name": "Planner",
                "config": {"prompt": "Plan next step"},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
            {"id": "e2", "sourceNodeId": "planner", "targetNodeId": "output"},
        ],
    }
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    response = client.post(f"/api/workspace-starters/{created['id']}/rebase")

    assert response.status_code == 200
    body = response.json()
    assert body["created_from_workflow_version"] == "0.1.2"
    assert body["default_workflow_name"] == "Rebased Demo Workflow"
    assert [node["id"] for node in body["definition"]["nodes"]] == [
        "trigger",
        "planner",
        "output",
    ]

    diff_response = client.get(f"/api/workspace-starters/{created['id']}/source-diff")
    assert diff_response.status_code == 200
    diff_body = diff_response.json()
    assert diff_body["changed"] is False
    assert diff_body["rebase_fields"] == []
    assert diff_body["action_decision"] == {
        "recommended_action": "none",
        "status_label": "已对齐",
        "summary": "当前模板快照和来源 workflow 已对齐，无需 refresh 或 rebase。",
        "can_refresh": False,
        "can_rebase": False,
        "fact_chips": [
            "template 0.1.2",
            "source 0.1.2",
        ],
    }

    history_response = client.get(f"/api/workspace-starters/{created['id']}/history")
    assert history_response.status_code == 200
    history_items = history_response.json()
    assert history_items[0]["action"] == "rebased"
    assert history_items[0]["payload"]["changed"] is True
    assert history_items[0]["payload"]["rebase_fields"] == [
        "definition",
        "created_from_workflow_version",
        "default_workflow_name",
    ]
    assert history_items[0]["payload"]["action_decision"]["recommended_action"] == "rebase"
    assert history_items[0]["payload"]["action_decision"]["can_refresh"] is True
    assert history_items[0]["payload"]["action_decision"]["can_rebase"] is True


def test_workspace_starter_delete_requires_archive_first(client: TestClient) -> None:
    created = _create_workspace_starter(
        client,
        name="Delete Starter",
        business_track="API 调用开放",
        description="Template for delete flow",
    )

    conflict_response = client.delete(f"/api/workspace-starters/{created['id']}")
    assert conflict_response.status_code == 409

    archive_response = client.post(f"/api/workspace-starters/{created['id']}/archive")
    assert archive_response.status_code == 200

    delete_response = client.delete(f"/api/workspace-starters/{created['id']}")
    assert delete_response.status_code == 204

    detail_response = client.get(
        f"/api/workspace-starters/{created['id']}",
    )
    assert detail_response.status_code == 404


def test_workspace_starter_bulk_delete_requires_archive_and_removes_archived_items(
    client: TestClient,
) -> None:
    active = _create_workspace_starter(
        client,
        name="Bulk Delete Active Starter",
        business_track="应用新建编排",
        description="Template that still needs archive before delete",
    )
    archived = _create_workspace_starter(
        client,
        name="Bulk Delete Archived Starter",
        business_track="API 调用开放",
        description="Template ready for bulk delete",
    )
    archive_response = client.post(f"/api/workspace-starters/{archived['id']}/archive")
    assert archive_response.status_code == 200

    delete_response = client.post(
        "/api/workspace-starters/bulk",
        json={
            "workspace_id": "default",
            "action": "delete",
            "template_ids": [active["id"], archived["id"]],
        },
    )

    assert delete_response.status_code == 200
    delete_result = delete_response.json()
    assert delete_result["updated_count"] == 1
    assert delete_result["deleted_items"] == [
        {"template_id": archived["id"], "name": "Bulk Delete Archived Starter"}
    ]
    assert delete_result["skipped_items"] == [
        {
            "template_id": active["id"],
            "name": "Bulk Delete Active Starter",
            "archived": False,
            "reason": "delete_requires_archive",
            "detail": "Archive the workspace starter before deleting it.",
            "source_workflow_id": "wf-demo",
            "source_workflow_version": "0.1.0",
            "action_decision": None,
            "sandbox_dependency_changes": None,
            "sandbox_dependency_nodes": [],
        }
    ]
    assert delete_result["skipped_reason_summary"] == [
        {
            "reason": "delete_requires_archive",
            "count": 1,
            "detail": "Archive the workspace starter before deleting it.",
        }
    ]
    assert delete_result["receipt_items"] == [
        {
            "template_id": active["id"],
            "name": "Bulk Delete Active Starter",
            "outcome": "skipped",
            "archived": False,
            "reason": "delete_requires_archive",
            "detail": "Archive the workspace starter before deleting it.",
            "source_workflow_id": "wf-demo",
            "source_workflow_version": "0.1.0",
            "action_decision": None,
            "sandbox_dependency_changes": None,
            "sandbox_dependency_nodes": [],
            "tool_governance": {
                "referenced_tool_ids": [],
                "missing_tool_ids": [],
                "governed_tool_count": 0,
                "strong_isolation_tool_count": 0,
            },
            "changed": False,
            "rebase_fields": [],
        },
        {
            "template_id": archived["id"],
            "name": "Bulk Delete Archived Starter",
            "outcome": "deleted",
            "archived": True,
            "reason": None,
            "detail": "已批量删除 workspace starter。",
            "source_workflow_id": "wf-demo",
            "source_workflow_version": "0.1.0",
            "action_decision": None,
            "sandbox_dependency_changes": None,
            "sandbox_dependency_nodes": [],
            "tool_governance": {
                "referenced_tool_ids": [],
                "missing_tool_ids": [],
                "governed_tool_count": 0,
                "strong_isolation_tool_count": 0,
            },
            "changed": True,
            "rebase_fields": [],
        },
    ]
    assert delete_result["outcome_explanation"]["primary_signal"] == (
        "本次批量删除请求 2 个 starter；实际处理 1 个（其中删除 1 个）。 "
        "结果回执里还有 1 个跳过项（需先归档 1）。"
    )
    assert delete_result["outcome_explanation"]["follow_up"] == (
        "删除失败的 starter 需要先归档，再重新执行批量删除。"
    )
    assert delete_result["follow_up_template_ids"] == [active["id"]]

    active_detail = client.get(f"/api/workspace-starters/{active['id']}")
    assert active_detail.status_code == 200

    deleted_detail = client.get(f"/api/workspace-starters/{archived['id']}")
    assert deleted_detail.status_code == 404


def test_workspace_starter_bulk_archive_and_restore_returns_summary(
    client: TestClient,
) -> None:
    active = _create_workspace_starter(
        client,
        name="Bulk Active Starter",
        business_track="应用新建编排",
        description="Template for bulk archive flow",
    )
    archived = _create_workspace_starter(
        client,
        name="Bulk Archived Starter",
        business_track="编排节点能力",
        description="Template for bulk restore flow",
    )
    archive_response = client.post(f"/api/workspace-starters/{archived['id']}/archive")
    assert archive_response.status_code == 200

    archive_bulk_response = client.post(
        "/api/workspace-starters/bulk",
        json={
            "workspace_id": "default",
            "action": "archive",
            "template_ids": [active["id"], archived["id"], "missing-template"],
        },
    )
    assert archive_bulk_response.status_code == 200
    archive_result = archive_bulk_response.json()
    assert archive_result["updated_count"] == 1
    assert archive_result["skipped_count"] == 2
    assert [item["id"] for item in archive_result["updated_items"]] == [active["id"]]
    assert {item["reason"] for item in archive_result["skipped_items"]} == {
        "already_archived",
        "not_found",
    }
    assert archive_result["skipped_reason_summary"] == [
        {
            "reason": "already_archived",
            "count": 1,
            "detail": "Workspace starter is already archived.",
        },
        {
            "reason": "not_found",
            "count": 1,
            "detail": "Workspace starter template not found.",
        },
    ]

    restore_bulk_response = client.post(
        "/api/workspace-starters/bulk",
        json={
            "workspace_id": "default",
            "action": "restore",
            "template_ids": [active["id"], archived["id"]],
        },
    )
    assert restore_bulk_response.status_code == 200
    restore_result = restore_bulk_response.json()
    assert restore_result["updated_count"] == 2
    assert restore_result["skipped_count"] == 0
    assert restore_result["skipped_reason_summary"] == []

    history_response = client.get(f"/api/workspace-starters/{active['id']}/history")
    assert history_response.status_code == 200
    history_items = history_response.json()
    assert history_items[0]["action"] == "restored"
    assert history_items[0]["payload"]["bulk"] is True


def test_workspace_starter_bulk_refresh_and_rebase_skip_invalid_sources(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    derived = _create_workspace_starter(
        client,
        name="Bulk Derived Starter",
        business_track="编排节点能力",
        description="Template for bulk refresh flow",
    )
    manual = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Bulk Manual Starter",
            "description": "Manual template with no source workflow",
            "business_track": "API 调用开放",
            "default_workflow_name": "Manual Workflow",
            "workflow_focus": "Manual focus",
            "recommended_next_step": "Manual next",
            "tags": ["manual"],
            "definition": _valid_definition(),
        },
    )
    assert manual.status_code == 201
    manual_body = manual.json()

    sample_workflow.name = "Bulk Source Workflow"
    sample_workflow.version = "0.1.3"
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "planner",
                "type": "llm_agent",
                "name": "Planner",
                "config": {"prompt": "Plan in bulk"},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
            {"id": "e2", "sourceNodeId": "planner", "targetNodeId": "output"},
        ],
    }
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    refresh_response = client.post(
        "/api/workspace-starters/bulk",
        json={
            "workspace_id": "default",
            "action": "refresh",
            "template_ids": [derived["id"], manual_body["id"]],
        },
    )
    assert refresh_response.status_code == 200
    refresh_result = refresh_response.json()
    assert refresh_result["updated_count"] == 1
    assert refresh_result["skipped_count"] == 1
    assert refresh_result["updated_items"][0]["created_from_workflow_version"] == "0.1.3"
    assert refresh_result["skipped_items"][0]["reason"] == "no_source_workflow"
    assert refresh_result["skipped_reason_summary"] == [
        {
            "reason": "no_source_workflow",
            "count": 1,
            "detail": "Workspace starter has no source workflow.",
        }
    ]

    rebase_response = client.post(
        "/api/workspace-starters/bulk",
        json={
            "workspace_id": "default",
            "action": "rebase",
            "template_ids": [derived["id"]],
        },
    )
    assert rebase_response.status_code == 200
    rebase_result = rebase_response.json()
    assert rebase_result["updated_count"] == 1
    assert rebase_result["updated_items"][0]["default_workflow_name"] == "Bulk Source Workflow"
    assert rebase_result["deleted_items"] == []


def test_workspace_starter_bulk_refresh_skips_source_workflow_with_unavailable_nodes(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    derived = _create_workspace_starter(
        client,
        name="Bulk Invalid Source Starter",
        business_track="编排节点能力",
        description="Template for invalid source refresh flow",
    )

    sample_workflow.version = "0.1.4"
    sample_workflow.definition = _planned_loop_definition()
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    refresh_response = client.post(
        "/api/workspace-starters/bulk",
        json={
            "workspace_id": "default",
            "action": "refresh",
            "template_ids": [derived["id"]],
        },
    )

    assert refresh_response.status_code == 200
    refresh_result = refresh_response.json()
    assert refresh_result["updated_count"] == 0
    assert refresh_result["skipped_count"] == 1
    skipped_item = refresh_result["skipped_items"][0]
    assert skipped_item["template_id"] == derived["id"]
    assert skipped_item["name"] == "Bulk Invalid Source Starter"
    assert skipped_item["archived"] is False
    assert skipped_item["reason"] == "source_workflow_invalid"
    assert skipped_item["source_workflow_id"] == "wf-demo"
    assert skipped_item["source_workflow_version"] == "0.1.4"
    assert skipped_item["action_decision"]["recommended_action"] == "rebase"
    assert skipped_item["action_decision"]["can_refresh"] is True
    assert skipped_item["action_decision"]["can_rebase"] is True
    assert skipped_item["sandbox_dependency_changes"] is None
    assert skipped_item["sandbox_dependency_nodes"] == []
    assert "not currently available for persistence" in skipped_item["detail"]
    assert refresh_result["skipped_reason_summary"] == [
        {
            "reason": "source_workflow_invalid",
            "count": 1,
            "detail": skipped_item["detail"],
        }
    ]
    assert refresh_result["receipt_items"] == [
        {
            "template_id": derived["id"],
            "name": "Bulk Invalid Source Starter",
            "outcome": "skipped",
            "archived": False,
            "reason": "source_workflow_invalid",
            "detail": skipped_item["detail"],
            "source_workflow_id": "wf-demo",
            "source_workflow_version": "0.1.4",
            "action_decision": skipped_item["action_decision"],
            "sandbox_dependency_changes": None,
            "sandbox_dependency_nodes": [],
            "tool_governance": {
                "referenced_tool_ids": [],
                "missing_tool_ids": [],
                "governed_tool_count": 0,
                "strong_isolation_tool_count": 0,
            },
            "changed": False,
            "rebase_fields": [],
        }
    ]


def test_workspace_starter_bulk_rebase_skips_source_workflow_with_unavailable_nodes(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    derived = _create_workspace_starter(
        client,
        name="Bulk Invalid Rebase Starter",
        business_track="编排节点能力",
        description="Template for invalid source rebase flow",
    )

    sample_workflow.version = "0.1.4"
    sample_workflow.definition = _planned_loop_definition()
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    rebase_response = client.post(
        "/api/workspace-starters/bulk",
        json={
            "workspace_id": "default",
            "action": "rebase",
            "template_ids": [derived["id"]],
        },
    )

    assert rebase_response.status_code == 200
    rebase_result = rebase_response.json()
    assert rebase_result["updated_count"] == 0
    assert rebase_result["skipped_count"] == 1
    skipped_item = rebase_result["skipped_items"][0]
    assert skipped_item["template_id"] == derived["id"]
    assert skipped_item["name"] == "Bulk Invalid Rebase Starter"
    assert skipped_item["archived"] is False
    assert skipped_item["reason"] == "source_workflow_invalid"
    assert skipped_item["source_workflow_id"] == "wf-demo"
    assert skipped_item["source_workflow_version"] == "0.1.4"
    assert skipped_item["action_decision"]["recommended_action"] == "rebase"
    assert skipped_item["action_decision"]["can_refresh"] is True
    assert skipped_item["action_decision"]["can_rebase"] is True
    assert skipped_item["sandbox_dependency_changes"] is None
    assert skipped_item["sandbox_dependency_nodes"] == []
    assert "not currently available for persistence" in skipped_item["detail"]
    assert rebase_result["skipped_reason_summary"] == [
        {
            "reason": "source_workflow_invalid",
            "count": 1,
            "detail": skipped_item["detail"],
        }
    ]
    assert rebase_result["receipt_items"] == [
        {
            "template_id": derived["id"],
            "name": "Bulk Invalid Rebase Starter",
            "outcome": "skipped",
            "archived": False,
            "reason": "source_workflow_invalid",
            "detail": skipped_item["detail"],
            "source_workflow_id": "wf-demo",
            "source_workflow_version": "0.1.4",
            "action_decision": skipped_item["action_decision"],
            "sandbox_dependency_changes": None,
            "sandbox_dependency_nodes": [],
            "tool_governance": {
                "referenced_tool_ids": [],
                "missing_tool_ids": [],
                "governed_tool_count": 0,
                "strong_isolation_tool_count": 0,
            },
            "changed": False,
            "rebase_fields": [],
        }
    ]


def test_workspace_starter_bulk_refresh_returns_sandbox_dependency_summary(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    derived = _create_workspace_starter(
        client,
        name="Bulk Refresh Sandbox Starter",
        business_track="编排节点能力",
        description="Template for bulk sandbox refresh flow",
        definition=_sandbox_dependency_definition(
            dependency_mode="builtin",
            builtin_package_set="py-data-basic",
        ),
    )

    sample_workflow.version = "0.1.5"
    sample_workflow.definition = _sandbox_dependency_definition(
        dependency_mode="dependency_ref",
        dependency_ref="deps://analytics-v2",
        backend_extensions={"mountPreset": "analytics"},
    )
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    refresh_response = client.post(
        "/api/workspace-starters/bulk",
        json={
            "workspace_id": "default",
            "action": "refresh",
            "template_ids": [derived["id"]],
        },
    )

    assert refresh_response.status_code == 200
    refresh_result = refresh_response.json()
    assert refresh_result["sandbox_dependency_changes"] == {
        "template_count": 1,
        "source_count": 1,
        "added_count": 0,
        "removed_count": 0,
        "changed_count": 1,
    }
    assert refresh_result["sandbox_dependency_items"] == [
        {
            "template_id": derived["id"],
            "name": "Bulk Refresh Sandbox Starter",
            "source_workflow_id": "wf-demo",
            "source_workflow_version": "0.1.5",
            "sandbox_dependency_changes": {
                "template_count": 1,
                "source_count": 1,
                "added_count": 0,
                "removed_count": 0,
                "changed_count": 1,
            },
            "sandbox_dependency_nodes": ["sandbox"],
        }
    ]
    receipt_item = refresh_result["receipt_items"][0]
    assert receipt_item["template_id"] == derived["id"]
    assert receipt_item["name"] == "Bulk Refresh Sandbox Starter"
    assert receipt_item["outcome"] == "updated"
    assert receipt_item["archived"] is False
    assert receipt_item["detail"] == "已把 starter 快照应用到最新来源事实。"
    assert receipt_item["source_workflow_id"] == "wf-demo"
    assert receipt_item["source_workflow_version"] == "0.1.5"
    assert receipt_item["action_decision"]["recommended_action"] == "rebase"
    assert receipt_item["action_decision"]["can_refresh"] is True
    assert receipt_item["action_decision"]["can_rebase"] is True
    assert "sandbox drift 1" in receipt_item["action_decision"]["fact_chips"]
    assert receipt_item["sandbox_dependency_changes"] == (
        refresh_result["sandbox_dependency_changes"]
    )
    assert receipt_item["sandbox_dependency_nodes"] == ["sandbox"]
    assert receipt_item["changed"] is True
    assert receipt_item["rebase_fields"] == []
    assert "sandbox 依赖漂移节点已沉淀进同一份 result receipt" in refresh_result[
        "outcome_explanation"
    ]["primary_signal"]
    assert "优先复核 result receipt 中带 sandbox drift 的 starter" in refresh_result[
        "outcome_explanation"
    ]["follow_up"]
    assert refresh_result["follow_up_template_ids"] == [derived["id"]]


def test_workspace_starter_bulk_rebase_returns_sandbox_dependency_summary(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    derived = _create_workspace_starter(
        client,
        name="Bulk Rebase Sandbox Starter",
        business_track="编排节点能力",
        description="Template for bulk sandbox rebase flow",
        definition=_sandbox_dependency_definition(
            dependency_mode="builtin",
            builtin_package_set="py-data-basic",
        ),
    )

    sample_workflow.version = "0.1.6"
    sample_workflow.definition = _sandbox_dependency_definition(
        dependency_mode="dependency_ref",
        dependency_ref="deps://analytics-v3",
        backend_extensions={"mountPreset": "analytics-v3"},
    )
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    rebase_response = client.post(
        "/api/workspace-starters/bulk",
        json={
            "workspace_id": "default",
            "action": "rebase",
            "template_ids": [derived["id"]],
        },
    )

    assert rebase_response.status_code == 200
    rebase_result = rebase_response.json()
    assert rebase_result["sandbox_dependency_changes"] == {
        "template_count": 1,
        "source_count": 1,
        "added_count": 0,
        "removed_count": 0,
        "changed_count": 1,
    }
    assert rebase_result["sandbox_dependency_items"] == [
        {
            "template_id": derived["id"],
            "name": "Bulk Rebase Sandbox Starter",
            "source_workflow_id": "wf-demo",
            "source_workflow_version": "0.1.6",
            "sandbox_dependency_changes": {
                "template_count": 1,
                "source_count": 1,
                "added_count": 0,
                "removed_count": 0,
                "changed_count": 1,
            },
            "sandbox_dependency_nodes": ["sandbox"],
        }
    ]
    receipt_item = rebase_result["receipt_items"][0]
    assert receipt_item["template_id"] == derived["id"]
    assert receipt_item["name"] == "Bulk Rebase Sandbox Starter"
    assert receipt_item["outcome"] == "updated"
    assert receipt_item["archived"] is False
    assert receipt_item["detail"] == "已同步 rebase 所需字段。"
    assert receipt_item["source_workflow_id"] == "wf-demo"
    assert receipt_item["source_workflow_version"] == "0.1.6"
    assert receipt_item["action_decision"]["recommended_action"] == "rebase"
    assert receipt_item["action_decision"]["can_refresh"] is True
    assert receipt_item["action_decision"]["can_rebase"] is True
    assert "sandbox drift 1" in receipt_item["action_decision"]["fact_chips"]
    assert receipt_item["sandbox_dependency_changes"] == rebase_result["sandbox_dependency_changes"]
    assert receipt_item["sandbox_dependency_nodes"] == ["sandbox"]
    assert receipt_item["changed"] is True
    assert sorted(receipt_item["rebase_fields"]) == [
        "created_from_workflow_version",
        "default_workflow_name",
        "definition",
    ]
    assert "sandbox 依赖漂移节点已沉淀进同一份 result receipt" in rebase_result[
        "outcome_explanation"
    ]["primary_signal"]
    assert "优先复核 result receipt 中带 sandbox drift 的 starter" in rebase_result[
        "outcome_explanation"
    ]["follow_up"]
    assert rebase_result["follow_up_template_ids"] == [derived["id"]]


def test_workspace_starter_bulk_preview_summarizes_refresh_and_rebase_candidates(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    refresh_candidate_response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Bulk Preview Refresh Candidate",
            "description": "Template for bulk preview refresh candidate",
            "business_track": "应用新建编排",
            "default_workflow_name": sample_workflow.name,
            "workflow_focus": "bulk preview refresh",
            "recommended_next_step": "bulk preview refresh next",
            "tags": ["bulk-preview", "refresh"],
            "definition": sample_workflow.definition,
            "created_from_workflow_id": sample_workflow.id,
            "created_from_workflow_version": sample_workflow.version,
        },
    )
    assert refresh_candidate_response.status_code == 201
    refresh_candidate = refresh_candidate_response.json()

    sample_workflow.name = "Bulk Preview Workflow v2"
    sample_workflow.version = "0.2.0"
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "mock_tool",
                "type": "tool",
                "name": "Mock Tool",
                "config": {"mock_output": {"answer": "done"}},
            },
            {
                "id": "planner",
                "type": "llm_agent",
                "name": "Planner",
                "config": {"prompt": "Plan preview drift"},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "mock_tool"},
            {"id": "e2", "sourceNodeId": "mock_tool", "targetNodeId": "planner"},
            {"id": "e3", "sourceNodeId": "planner", "targetNodeId": "output"},
        ],
    }
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    aligned_response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Bulk Preview Aligned Starter",
            "description": "Template already aligned with source workflow",
            "business_track": "应用新建编排",
            "default_workflow_name": sample_workflow.name,
            "workflow_focus": "bulk preview aligned",
            "recommended_next_step": "bulk preview aligned next",
            "tags": ["bulk-preview", "aligned"],
            "definition": sample_workflow.definition,
            "created_from_workflow_id": sample_workflow.id,
            "created_from_workflow_version": sample_workflow.version,
        },
    )
    assert aligned_response.status_code == 201
    aligned = aligned_response.json()

    name_only_response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Bulk Preview Name Drift Starter",
            "description": "Template with name-only drift",
            "business_track": "应用新建编排",
            "default_workflow_name": "Demo Workflow",
            "workflow_focus": "bulk preview name drift",
            "recommended_next_step": "bulk preview name drift next",
            "tags": ["bulk-preview", "name-drift"],
            "definition": sample_workflow.definition,
            "created_from_workflow_id": sample_workflow.id,
            "created_from_workflow_version": sample_workflow.version,
        },
    )
    assert name_only_response.status_code == 201
    name_only = name_only_response.json()

    manual_response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Bulk Preview Manual Starter",
            "description": "Manual template without source workflow",
            "business_track": "API 调用开放",
            "default_workflow_name": "Manual Workflow",
            "workflow_focus": "manual preview",
            "recommended_next_step": "manual preview next",
            "tags": ["bulk-preview", "manual"],
            "definition": _valid_definition(),
        },
    )
    assert manual_response.status_code == 201
    manual = manual_response.json()

    missing_response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Bulk Preview Missing Source Starter",
            "description": "Template whose source workflow is missing",
            "business_track": "编排节点能力",
            "default_workflow_name": "Missing Workflow",
            "workflow_focus": "missing source preview",
            "recommended_next_step": "missing source preview next",
            "tags": ["bulk-preview", "missing-source"],
            "definition": _valid_definition(),
            "created_from_workflow_id": "wf-missing",
            "created_from_workflow_version": "0.0.9",
        },
    )
    assert missing_response.status_code == 201
    missing_source = missing_response.json()

    preview_response = client.post(
        "/api/workspace-starters/bulk/preview",
        json={
            "workspace_id": "default",
            "template_ids": [
                refresh_candidate["id"],
                aligned["id"],
                name_only["id"],
                manual["id"],
                missing_source["id"],
                "missing-template",
            ],
        },
    )

    assert preview_response.status_code == 200
    body = preview_response.json()

    refresh_preview = body["previews"]["refresh"]
    assert refresh_preview["candidate_count"] == 1
    assert refresh_preview["blocked_count"] == 5
    assert [item["template_id"] for item in refresh_preview["candidate_items"]] == [
        refresh_candidate["id"]
    ]
    assert refresh_preview["candidate_items"][0]["action_decision"]["can_refresh"] is True
    assert refresh_preview["candidate_items"][0]["action_decision"]["can_rebase"] is True
    assert refresh_preview["blocked_reason_summary"] == [
        {
            "reason": "already_aligned",
            "count": 1,
            "detail": "当前模板快照和来源 workflow 已对齐，无需 refresh 或 rebase。",
        },
        {
            "reason": "name_drift_only",
            "count": 1,
            "detail": (
                "当前只漂移默认 workflow 名称；refresh 不会改名，如需让 starter 命名"
                "跟随来源，请执行 rebase。"
            ),
        },
        {
            "reason": "no_source_workflow",
            "count": 1,
            "detail": "Workspace starter has no source workflow.",
        },
        {
            "reason": "not_found",
            "count": 1,
            "detail": "Workspace starter template not found.",
        },
        {
            "reason": "source_workflow_missing",
            "count": 1,
            "detail": "Source workflow not found.",
        },
    ]

    rebase_preview = body["previews"]["rebase"]
    assert rebase_preview["candidate_count"] == 2
    assert rebase_preview["blocked_count"] == 4
    assert [item["template_id"] for item in rebase_preview["candidate_items"]] == [
        refresh_candidate["id"],
        name_only["id"],
    ]
    assert rebase_preview["candidate_items"][1]["action_decision"] == {
        "recommended_action": "rebase",
        "status_label": "建议 rebase",
        "summary": (
            "当前只漂移默认 workflow 名称；refresh 不会改名，如需让 starter 命名"
            "跟随来源，请执行 rebase。"
        ),
        "can_refresh": False,
        "can_rebase": True,
        "fact_chips": [
            "template 0.2.0",
            "source 0.2.0",
            "name drift",
            "rebase 1",
        ],
    }
    assert rebase_preview["blocked_reason_summary"] == [
        {
            "reason": "already_aligned",
            "count": 1,
            "detail": "当前模板快照和来源 workflow 已对齐，无需 refresh 或 rebase。",
        },
        {
            "reason": "no_source_workflow",
            "count": 1,
            "detail": "Workspace starter has no source workflow.",
        },
        {
            "reason": "not_found",
            "count": 1,
            "detail": "Workspace starter template not found.",
        },
        {
            "reason": "source_workflow_missing",
            "count": 1,
            "detail": "Source workflow not found.",
        },
    ]


def test_workspace_starter_bulk_refresh_reuses_preview_blockers_in_result_receipt(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    refresh_candidate_response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Bulk Result Refresh Candidate",
            "description": "Template for bulk result refresh candidate",
            "business_track": "应用新建编排",
            "default_workflow_name": sample_workflow.name,
            "workflow_focus": "bulk result refresh",
            "recommended_next_step": "bulk result refresh next",
            "tags": ["bulk-result", "refresh"],
            "definition": sample_workflow.definition,
            "created_from_workflow_id": sample_workflow.id,
            "created_from_workflow_version": sample_workflow.version,
        },
    )
    assert refresh_candidate_response.status_code == 201
    refresh_candidate = refresh_candidate_response.json()

    sample_workflow.name = "Bulk Result Workflow v2"
    sample_workflow.version = "0.2.0"
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "mock_tool",
                "type": "tool",
                "name": "Mock Tool",
                "config": {"mock_output": {"answer": "done"}},
            },
            {
                "id": "planner",
                "type": "llm_agent",
                "name": "Planner",
                "config": {"prompt": "Plan result drift"},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "mock_tool"},
            {"id": "e2", "sourceNodeId": "mock_tool", "targetNodeId": "planner"},
            {"id": "e3", "sourceNodeId": "planner", "targetNodeId": "output"},
        ],
    }
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    aligned_response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Bulk Result Aligned Starter",
            "description": "Template already aligned with source workflow",
            "business_track": "应用新建编排",
            "default_workflow_name": sample_workflow.name,
            "workflow_focus": "bulk result aligned",
            "recommended_next_step": "bulk result aligned next",
            "tags": ["bulk-result", "aligned"],
            "definition": sample_workflow.definition,
            "created_from_workflow_id": sample_workflow.id,
            "created_from_workflow_version": sample_workflow.version,
        },
    )
    assert aligned_response.status_code == 201
    aligned = aligned_response.json()

    name_only_response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Bulk Result Name Drift Starter",
            "description": "Template with name-only drift",
            "business_track": "应用新建编排",
            "default_workflow_name": "Demo Workflow",
            "workflow_focus": "bulk result name drift",
            "recommended_next_step": "bulk result name drift next",
            "tags": ["bulk-result", "name-drift"],
            "definition": sample_workflow.definition,
            "created_from_workflow_id": sample_workflow.id,
            "created_from_workflow_version": sample_workflow.version,
        },
    )
    assert name_only_response.status_code == 201
    name_only = name_only_response.json()

    refresh_response = client.post(
        "/api/workspace-starters/bulk",
        json={
            "workspace_id": "default",
            "action": "refresh",
            "template_ids": [refresh_candidate["id"], aligned["id"], name_only["id"]],
        },
    )

    assert refresh_response.status_code == 200
    refresh_result = refresh_response.json()
    assert refresh_result["updated_count"] == 1
    assert refresh_result["skipped_count"] == 2
    assert [item["reason"] for item in refresh_result["skipped_items"]] == [
        "already_aligned",
        "name_drift_only",
    ]
    assert refresh_result["skipped_reason_summary"] == [
        {
            "reason": "already_aligned",
            "count": 1,
            "detail": "当前模板快照和来源 workflow 已对齐，无需 refresh 或 rebase。",
        },
        {
            "reason": "name_drift_only",
            "count": 1,
            "detail": (
                "当前只漂移默认 workflow 名称；refresh 不会改名，如需让 starter 命名"
                "跟随来源，请执行 rebase。"
            ),
        },
    ]
    assert [item["outcome"] for item in refresh_result["receipt_items"]] == [
        "updated",
        "skipped",
        "skipped",
    ]
    assert refresh_result["receipt_items"][0]["source_workflow_version"] == "0.2.0"
    assert refresh_result["receipt_items"][0]["action_decision"]["recommended_action"] == "rebase"
    assert refresh_result["receipt_items"][0]["action_decision"]["can_refresh"] is True
    assert refresh_result["receipt_items"][0]["action_decision"]["can_rebase"] is True
    assert refresh_result["receipt_items"][1]["reason"] == "already_aligned"
    assert refresh_result["receipt_items"][1]["action_decision"]["recommended_action"] == "none"
    assert refresh_result["receipt_items"][2]["reason"] == "name_drift_only"
    assert refresh_result["receipt_items"][2]["action_decision"]["recommended_action"] == "rebase"
    assert "已对齐 1 / 仅名称漂移 1" in refresh_result["outcome_explanation"]["primary_signal"]
    assert "优先对标记为“仅名称漂移”的 starter 执行 rebase" in refresh_result[
        "outcome_explanation"
    ]["follow_up"]
    assert refresh_result["follow_up_template_ids"] == [
        name_only["id"],
        refresh_candidate["id"],
    ]


def test_workspace_starter_bulk_refresh_prioritizes_catalog_gap_follow_up(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    catalog_gap_response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Bulk Result Catalog Gap Starter",
            "description": "Template whose current starter still references a missing tool",
            "business_track": "应用新建编排",
            "default_workflow_name": sample_workflow.name,
            "workflow_focus": "bulk result catalog gap",
            "recommended_next_step": "bulk result catalog gap next",
            "tags": ["bulk-result", "catalog-gap"],
            "definition": sample_workflow.definition,
            "created_from_workflow_id": sample_workflow.id,
            "created_from_workflow_version": sample_workflow.version,
        },
    )
    assert catalog_gap_response.status_code == 201
    catalog_gap = catalog_gap_response.json()

    name_only_response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Bulk Result Catalog Gap Name Drift",
            "description": "Template with name-only drift remains in the same receipt.",
            "business_track": "应用新建编排",
            "default_workflow_name": "Demo Workflow",
            "workflow_focus": "bulk result catalog gap name drift",
            "recommended_next_step": "bulk result catalog gap name drift next",
            "tags": ["bulk-result", "name-drift"],
            "definition": sample_workflow.definition,
            "created_from_workflow_id": sample_workflow.id,
            "created_from_workflow_version": sample_workflow.version,
        },
    )
    assert name_only_response.status_code == 201
    name_only = name_only_response.json()

    missing_tool_definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "catalog_gap_tool",
                "type": "tool",
                "name": "Catalog gap tool",
                "config": {"tool": {"toolId": "native.catalog-gap"}},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "catalog_gap_tool"},
            {"id": "e2", "sourceNodeId": "catalog_gap_tool", "targetNodeId": "output"},
        ],
    }
    catalog_gap_record = sqlite_session.get(
        WorkspaceStarterTemplateRecord,
        catalog_gap["id"],
    )
    assert catalog_gap_record is not None
    catalog_gap_record.definition = missing_tool_definition

    sample_workflow.version = "0.2.0"
    sample_workflow.definition = missing_tool_definition
    sqlite_session.add(catalog_gap_record)
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    refresh_response = client.post(
        "/api/workspace-starters/bulk",
        json={
            "workspace_id": "default",
            "action": "refresh",
            "template_ids": [catalog_gap["id"], name_only["id"]],
        },
    )

    assert refresh_response.status_code == 200
    refresh_result = refresh_response.json()

    assert refresh_result["receipt_items"][0]["reason"] == "source_workflow_invalid"
    assert refresh_result["receipt_items"][0]["tool_governance"] == {
        "referenced_tool_ids": ["native.catalog-gap"],
        "missing_tool_ids": ["native.catalog-gap"],
        "governed_tool_count": 0,
        "strong_isolation_tool_count": 0,
    }
    assert "缺少 catalog tool 绑定" in refresh_result["outcome_explanation"]["primary_signal"]
    assert "补齐 tool binding" in refresh_result["outcome_explanation"]["follow_up"]
    assert refresh_result["follow_up_template_ids"] == [
        catalog_gap["id"],
        name_only["id"],
    ]


def test_workspace_starter_bulk_preview_marks_invalid_source_workflow_as_blocked(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    derived = _create_workspace_starter(
        client,
        name="Bulk Preview Invalid Source Starter",
        business_track="编排节点能力",
        description="Template for invalid source bulk preview",
    )

    sample_workflow.version = "0.1.4"
    sample_workflow.definition = _planned_loop_definition()
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    preview_response = client.post(
        "/api/workspace-starters/bulk/preview",
        json={
            "workspace_id": "default",
            "template_ids": [derived["id"]],
        },
    )

    assert preview_response.status_code == 200
    body = preview_response.json()

    refresh_preview = body["previews"]["refresh"]
    assert refresh_preview["candidate_count"] == 0
    assert refresh_preview["blocked_count"] == 1
    assert refresh_preview["blocked_items"][0]["reason"] == "source_workflow_invalid"
    assert (
        "not currently available for persistence"
        in refresh_preview["blocked_items"][0]["detail"]
    )

    rebase_preview = body["previews"]["rebase"]
    assert rebase_preview["candidate_count"] == 0
    assert rebase_preview["blocked_count"] == 1
    assert rebase_preview["blocked_items"][0]["reason"] == "source_workflow_invalid"
    assert (
        "not currently available for persistence"
        in rebase_preview["blocked_items"][0]["detail"]
    )
