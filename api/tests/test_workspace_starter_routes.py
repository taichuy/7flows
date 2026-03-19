from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services import workflow_definitions
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
    assert history_items[0]["payload"] == {
        "source_workflow_id": "wf-demo",
        "previous_workflow_version": "0.1.0",
        "source_workflow_version": "0.1.1",
        "changed": True,
    }


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
            "reason": "delete_requires_archive",
            "detail": "Archive the workspace starter before deleting it.",
        }
    ]
    assert delete_result["skipped_reason_summary"] == [
        {
            "reason": "delete_requires_archive",
            "count": 1,
            "detail": "Archive the workspace starter before deleting it.",
        }
    ]

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
    assert refresh_result["skipped_items"] == [
        {
            "template_id": derived["id"],
            "name": "Bulk Invalid Source Starter",
            "reason": "source_workflow_invalid",
            "detail": refresh_result["skipped_items"][0]["detail"],
        }
    ]
    assert "not currently available for persistence" in refresh_result["skipped_items"][0]["detail"]
    assert refresh_result["skipped_reason_summary"] == [
        {
            "reason": "source_workflow_invalid",
            "count": 1,
            "detail": refresh_result["skipped_items"][0]["detail"],
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
    assert rebase_result["skipped_items"] == [
        {
            "template_id": derived["id"],
            "name": "Bulk Invalid Rebase Starter",
            "reason": "source_workflow_invalid",
            "detail": rebase_result["skipped_items"][0]["detail"],
        }
    ]
    assert "not currently available for persistence" in rebase_result["skipped_items"][0]["detail"]
    assert rebase_result["skipped_reason_summary"] == [
        {
            "reason": "source_workflow_invalid",
            "count": 1,
            "detail": rebase_result["skipped_items"][0]["detail"],
        }
    ]
