from fastapi.testclient import TestClient

from app.services.plugin_runtime import PluginToolDefinition, reset_plugin_registry
from tests.workflow_publish_helpers import waiting_agent_publishable_definition


def test_published_native_async_route_accepts_waiting_run(client: TestClient) -> None:
    registry = reset_plugin_registry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda _: {
            "status": "waiting",
            "content_type": "json",
            "summary": "awaiting callback",
            "structured": {"ticket": "tool-async-789"},
            "meta": {
                "tool_name": "Native Search",
                "waiting_reason": "callback pending",
                "waiting_status": "waiting_callback",
            },
        },
    )

    try:
        create_response = client.post(
            "/api/workflows",
            json={
                "name": "Published Native Async Workflow",
                "definition": waiting_agent_publishable_definition(
                    alias="native.async.workflow",
                    path="/native/async",
                    endpoint_id="native-async",
                    endpoint_name="Native Async",
                    protocol="native",
                    cache={"ttl": 300, "maxEntries": 4},
                ),
            },
        )
        assert create_response.status_code == 201
        workflow_id = create_response.json()["id"]

        bindings_response = client.get(
            f"/api/workflows/{workflow_id}/published-endpoints",
            params={"include_all_versions": "true"},
        )
        assert bindings_response.status_code == 200
        binding = bindings_response.json()[0]

        publish_response = client.patch(
            f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/lifecycle",
            json={"status": "published"},
        )
        assert publish_response.status_code == 200

        workflow_response = client.post(
            f"/v1/workflows/{workflow_id}/published-endpoints/native-async/run-async",
            json={"input_payload": {"source": "workflow"}},
        )
        assert workflow_response.status_code == 202
        assert workflow_response.headers["X-7Flows-Cache"] == "BYPASS"
        assert workflow_response.headers["X-7Flows-Run-Status"] == "WAITING"
        workflow_body = workflow_response.json()
        assert workflow_body["run"]["status"] == "waiting"
        assert workflow_body["run"]["output_payload"] is None
        assert workflow_body["run"]["current_node_id"] == "agent"
        first_run_id = workflow_body["run"]["id"]

        alias_response = client.post(
            "/v1/published-aliases/native.async.workflow/run-async",
            json={"input_payload": {"source": "alias"}},
        )
        assert alias_response.status_code == 202
        assert alias_response.headers["X-7Flows-Cache"] == "BYPASS"
        assert alias_response.headers["X-7Flows-Run-Status"] == "WAITING"
        assert alias_response.json()["endpoint_alias"] == "native.async.workflow"
        assert alias_response.json()["run"]["status"] == "waiting"

        path_response = client.post(
            "/v1/published-paths-async/native/async",
            json={"input_payload": {"source": "path"}},
        )
        assert path_response.status_code == 202
        assert path_response.headers["X-7Flows-Cache"] == "BYPASS"
        assert path_response.headers["X-7Flows-Run-Status"] == "WAITING"
        assert path_response.json()["route_path"] == "/native/async"
        assert path_response.json()["run"]["status"] == "waiting"

        repeated_workflow_response = client.post(
            f"/v1/workflows/{workflow_id}/published-endpoints/native-async/run-async",
            json={"input_payload": {"source": "workflow"}},
        )
        assert repeated_workflow_response.status_code == 202
        assert repeated_workflow_response.headers["X-7Flows-Cache"] == "BYPASS"
        repeated_workflow_body = repeated_workflow_response.json()
        assert repeated_workflow_body["run"]["status"] == "waiting"
        assert repeated_workflow_body["run"]["id"] != first_run_id

        activity_response = client.get(
            f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations"
        )
        assert activity_response.status_code == 200
        activity = activity_response.json()
        assert activity["summary"]["total_count"] == 4
        assert activity["summary"]["succeeded_count"] == 4
        assert activity["summary"]["last_run_status"] == "waiting"
        assert [item["request_source"] for item in activity["items"]] == [
            "workflow",
            "path",
            "alias",
            "workflow",
        ]
        assert all(item["status"] == "succeeded" for item in activity["items"])
        assert all(item["run_status"] == "waiting" for item in activity["items"])
        assert [item["request_surface"] for item in activity["items"]] == [
            "native.workflow.async",
            "native.path.async",
            "native.alias.async",
            "native.workflow.async",
        ]
        assert {
            item["value"]: item["count"]
            for item in activity["facets"]["request_surface_counts"]
        } == {
            "native.workflow.async": 2,
            "native.alias.async": 1,
            "native.path.async": 1,
        }
        assert {
            item["value"]: item["count"]
            for item in activity["facets"]["cache_status_counts"]
        } == {
            "hit": 0,
            "miss": 0,
            "bypass": 4,
        }
        assert {
            item["value"]: item["count"]
            for item in activity["facets"]["run_status_counts"]
        } == {
            "waiting": 4,
        }
        assert activity["facets"]["timeline"][0]["run_status_counts"] == [
            {"value": "waiting", "count": 4}
        ]

        filtered_surface_response = client.get(
            f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations",
            params={"request_surface": "native.workflow.async"},
        )
        assert filtered_surface_response.status_code == 200
        filtered_surface = filtered_surface_response.json()
        assert filtered_surface["summary"]["total_count"] == 2
        assert [item["request_surface"] for item in filtered_surface["items"]] == [
            "native.workflow.async",
            "native.workflow.async",
        ]

        filtered_run_status_response = client.get(
            f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations",
            params={"run_status": "waiting"},
        )
        assert filtered_run_status_response.status_code == 200
        filtered_run_status = filtered_run_status_response.json()
        assert filtered_run_status["filters"]["run_status"] == "waiting"
        assert filtered_run_status["summary"]["total_count"] == 4
        assert all(item["run_status"] == "waiting" for item in filtered_run_status["items"])
    finally:
        reset_plugin_registry()
