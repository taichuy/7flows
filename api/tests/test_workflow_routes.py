from fastapi.testclient import TestClient


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
    assert "trigger node" in response.json()["detail"]


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

    versions_response = client.get(f"/api/workflows/{sample_workflow.id}/versions")
    assert versions_response.status_code == 200
    assert [version["version"] for version in versions_response.json()] == ["0.1.1", "0.1.0"]


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
    assert "maxAttempts" in response.json()["detail"]


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
    assert "unauthorized source nodes" in response.json()["detail"]


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
    assert "Only condition/router nodes may define config.selector" in response.json()["detail"]


def test_create_workflow_rejects_expression_on_non_branch_node(client: TestClient) -> None:
    definition = _valid_definition()
    definition["nodes"][1]["config"]["expression"] = "trigger_input.priority == 'high'"

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Expression Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "Only condition/router nodes may define config.expression" in response.json()["detail"]


def test_create_workflow_rejects_unsafe_edge_condition_expression(client: TestClient) -> None:
    definition = _valid_edge_expression_definition()
    definition["edges"][1]["conditionExpression"] = "__import__('os')"

    response = client.post(
        "/api/workflows",
        json={"name": "Unsafe Edge Expression Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "Unsupported expression syntax 'Call'" in response.json()["detail"]


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
    assert "join.requiredNodeIds references non-incoming sources" in response.json()["detail"]


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
    assert "runtime-managed input roots" in response.json()["detail"]


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
    assert "String should have at least 1 character" in response.json()["detail"]


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
    assert "Workflow variable names must be unique" in response.json()["detail"]


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
    assert "Workflow published endpoint ids must be unique" in response.json()["detail"]


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
    assert "cannot define both config.tool and config.toolId" in response.json()["detail"]


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
    assert "requests unauthorized artifact types" in response.json()["detail"]


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
            {"id": "e2", "sourceNodeId": "branch", "targetNodeId": "search_path", "condition": "search"},
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
    assert "true'/'false' branch conditions" in response.json()["detail"]


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
    assert "at most one fallback outgoing edge" in response.json()["detail"]


def test_create_workflow_rejects_non_branch_custom_edge_condition(client: TestClient) -> None:
    definition = _valid_definition()
    definition["edges"][1]["condition"] = "search"

    response = client.post(
        "/api/workflows",
        json={"name": "Broken Non-Branch Edge Workflow", "definition": definition},
    )

    assert response.status_code == 422
    assert "uses unsupported condition" in response.json()["detail"]
