import json
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes import runs as run_routes
from app.models.run import Run, RunCallbackTicket, RunEvent
from app.models.workflow import Workflow, WorkflowVersion
from app.schemas.explanations import SignalFollowUpExplanation
from app.schemas.operator_follow_up import (
    OperatorRunFollowUpSummary,
    OperatorRunSnapshot,
    OperatorRunSnapshotSample,
)
from app.schemas.sensitive_access import CallbackBlockerDeltaSummary
from app.services.compiled_blueprints import CompiledBlueprintService
from app.services.plugin_runtime import PluginCallProxy, PluginRegistry, PluginToolDefinition
from app.services.run_resume_scheduler import RunResumeScheduler
from app.services.runtime import RuntimeService
from app.services.sandbox_backends import (
    SandboxBackendCapability,
    SandboxBackendClient,
    SandboxBackendHealth,
    SandboxBackendRegistration,
    SandboxBackendRegistry,
)


class _StaticSandboxHealthChecker:
    def __init__(self, healths: list[SandboxBackendHealth]) -> None:
        self._healths = healths

    def probe_all(self, registry: SandboxBackendRegistry) -> list[SandboxBackendHealth]:
        return list(self._healths)


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
    assert body["compiled_blueprint_id"] is not None
    assert body["status"] == "succeeded"
    assert len(body["node_runs"]) == 3
    assert body["events"][-1]["event_type"] == "run.completed"

    run_id = body["id"]
    stored_response = client.get(f"/api/runs/{run_id}")
    assert stored_response.status_code == 200
    stored_body = stored_response.json()
    assert stored_body["id"] == run_id
    assert stored_body["event_count"] == len(body["events"])
    assert stored_body["event_type_counts"]["run.completed"] == 1
    assert stored_body["first_event_at"] == body["events"][0]["created_at"]
    assert stored_body["last_event_at"] == body["events"][-1]["created_at"]


def test_get_run_execution_view_includes_execution_policy(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "execution view"}},
    )

    assert response.status_code == 201
    run_id = response.json()["id"]

    execution_view_response = client.get(f"/api/runs/{run_id}/execution-view")

    assert execution_view_response.status_code == 200
    execution_view = execution_view_response.json()
    nodes_by_id = {node["node_id"]: node for node in execution_view["nodes"]}
    assert nodes_by_id["trigger"]["execution_class"] == "inline"
    assert nodes_by_id["trigger"]["execution_source"] == "default"
    assert nodes_by_id["mock_tool"]["execution_class"] == "inline"
    assert nodes_by_id["mock_tool"]["execution_source"] == "default"


def test_get_run_execution_view_includes_sandbox_backend_binding_summary(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "sandbox binding summary"}},
    )

    assert response.status_code == 201
    run_body = response.json()
    run_id = run_body["id"]
    tool_node_run = next(node for node in run_body["node_runs"] if node["node_id"] == "mock_tool")

    sqlite_session.add(
        RunEvent(
            run_id=run_id,
            node_run_id=tool_node_run["id"],
            event_type="tool.execution.dispatched",
            payload={
                "node_id": "mock_tool",
                "tool_id": "mock_tool",
                "tool_name": "mock_tool",
                "requested_execution_class": "microvm",
                "effective_execution_class": "microvm",
                "execution_source": "runtime_policy",
                "requested_execution_profile": "strict",
                "requested_execution_timeout_ms": 5000,
                "requested_network_policy": "isolated",
                "requested_filesystem_policy": "ephemeral",
                "requested_dependency_mode": "builtin",
                "requested_builtin_package_set": "research-default",
                "requested_backend_extensions": {
                    "image": "python:3.12",
                    "mount": "workspace",
                },
                "executor_ref": "tool:compat-adapter:dify-default",
                "sandbox_backend_id": "sandbox-default",
                "sandbox_backend_executor_ref": "sandbox-backend:sandbox-default",
            },
        )
    )
    run = sqlite_session.get(Run, run_id)
    assert run is not None
    run.current_node_id = "mock_tool"
    run.status = "running"
    sqlite_session.commit()

    execution_view_response = client.get(f"/api/runs/{run_id}/execution-view")

    assert execution_view_response.status_code == 200
    body = execution_view_response.json()
    assert body["summary"]["execution_sandbox_backend_counts"] == {"sandbox-default": 1}

    node = next(item for item in body["nodes"] if item["node_id"] == "mock_tool")
    assert node["requested_execution_class"] == "microvm"
    assert node["requested_execution_source"] == "runtime_policy"
    assert node["requested_execution_profile"] == "strict"
    assert node["requested_execution_timeout_ms"] == 5000
    assert node["requested_execution_network_policy"] == "isolated"
    assert node["requested_execution_filesystem_policy"] == "ephemeral"
    assert node["requested_execution_dependency_mode"] == "builtin"
    assert node["requested_execution_builtin_package_set"] == "research-default"
    assert node["requested_execution_dependency_ref"] is None
    assert node["requested_execution_backend_extensions"] == {
        "image": "python:3.12",
        "mount": "workspace",
    }
    assert node["effective_execution_class"] == "microvm"
    assert node["execution_executor_ref"] == "tool:compat-adapter:dify-default"
    assert node["execution_sandbox_backend_id"] == "sandbox-default"
    assert (
        node["execution_sandbox_backend_executor_ref"]
        == "sandbox-backend:sandbox-default"
    )

    run_detail_response = client.get(
        f"/api/runs/{run_id}", params={"include_events": "false"}
    )

    assert run_detail_response.status_code == 200
    run_detail_body = run_detail_response.json()
    assert run_detail_body["execution_focus_reason"] == "current_node"
    focus_node = run_detail_body["execution_focus_node"]
    assert focus_node["node_run_id"] == tool_node_run["id"]
    assert focus_node["node_id"] == "mock_tool"
    assert focus_node["node_name"] == "Mock Tool"
    assert focus_node["node_type"] == "tool"
    assert focus_node["status"] == "succeeded"
    assert focus_node["execution_class"] == "inline"
    assert focus_node["execution_source"] == "default"
    assert focus_node["requested_execution_class"] == "microvm"
    assert focus_node["requested_execution_source"] == "runtime_policy"
    assert focus_node["requested_execution_profile"] == "strict"
    assert focus_node["requested_execution_timeout_ms"] == 5000
    assert focus_node["requested_execution_network_policy"] == "isolated"
    assert focus_node["requested_execution_filesystem_policy"] == "ephemeral"
    assert focus_node["requested_execution_dependency_mode"] == "builtin"
    assert focus_node["requested_execution_builtin_package_set"] == "research-default"
    assert focus_node["requested_execution_dependency_ref"] is None
    assert focus_node["requested_execution_backend_extensions"] == {
        "image": "python:3.12",
        "mount": "workspace",
    }
    assert focus_node["effective_execution_class"] == "microvm"
    assert focus_node["execution_executor_ref"] == "tool:compat-adapter:dify-default"
    assert focus_node["execution_sandbox_backend_id"] == "sandbox-default"
    assert (
        focus_node["execution_sandbox_backend_executor_ref"]
        == "sandbox-backend:sandbox-default"
    )
    assert focus_node["execution_blocking_reason"] is None
    assert focus_node["execution_fallback_reason"] is None


def test_get_run_execution_view_blocks_unsupported_subprocess_for_generic_nodes(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-execution-view-subprocess-blocked",
        name="Execution View Subprocess Blocked",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "branch",
                    "type": "condition",
                    "name": "Branch",
                    "config": {"selected": "true"},
                    "runtimePolicy": {
                        "execution": {"class": "subprocess", "profile": "strict"}
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "branch"},
                {"id": "e2", "sourceNodeId": "branch", "targetNodeId": "output"},
            ],
        },
    )
    workflow_version = WorkflowVersion(
        id="wf-execution-view-subprocess-blocked-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=workflow.definition,
        created_at=datetime.now(UTC),
    )
    sqlite_session.add(workflow)
    sqlite_session.add(workflow_version)
    CompiledBlueprintService().ensure_for_workflow_version(sqlite_session, workflow_version)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"message": "subprocess blocked summary"}},
    )
    assert response.status_code == 422
    persisted_run = run_routes.runtime_service.list_workflow_runs(sqlite_session, workflow.id)[0]
    run_id = persisted_run.id

    execution_view_response = client.get(f"/api/runs/{run_id}/execution-view")

    assert execution_view_response.status_code == 200
    body = execution_view_response.json()
    assert body["summary"]["execution_dispatched_node_count"] == 0
    assert body["summary"]["execution_fallback_node_count"] == 0
    assert body["summary"]["execution_blocked_node_count"] == 0
    assert body["summary"]["execution_unavailable_node_count"] == 1
    assert body["summary"]["execution_requested_class_counts"] == {"subprocess": 1}
    assert body["summary"]["execution_effective_class_counts"] == {}
    assert body["summary"]["execution_executor_ref_counts"] == {}
    assert body["blocking_node_run_id"] is None
    assert body["execution_focus_reason"] == "blocked_execution"
    assert body["execution_focus_node"]["node_id"] == "branch"
    assert body["execution_focus_explanation"] == {
        "primary_signal": (
            "执行阻断：当前 condition 节点尚未实现请求的 subprocess execution class。"
        ),
        "follow_up": (
            "下一步：先把 execution class 调回 inline，"
            "或补齐对应 execution adapter；显式 execution-class 请求不要静默降级。"
        ),
    }

    node = next(item for item in body["nodes"] if item["node_id"] == "branch")
    assert node["execution_class"] == "subprocess"
    assert node["effective_execution_class"] is None
    assert node["execution_executor_ref"] is None
    assert node["execution_dispatched_count"] == 0
    assert node["execution_fallback_count"] == 0
    assert node["execution_blocked_count"] == 0
    assert node["execution_unavailable_count"] == 1
    assert node["execution_fallback_reason"] is None
    assert "does not implement requested execution class 'subprocess'" in (
        node["execution_blocking_reason"] or ""
    )

    run_detail_response = client.get(
        f"/api/runs/{run_id}", params={"include_events": "false"}
    )

    assert run_detail_response.status_code == 200
    run_detail_body = run_detail_response.json()
    assert run_detail_body["blocking_node_run_id"] is None
    assert run_detail_body["execution_focus_reason"] == "blocked_execution"
    assert run_detail_body["execution_focus_node"]["node_id"] == "branch"
    assert run_detail_body["execution_focus_node"]["node_type"] == "condition"
    assert run_detail_body["execution_focus_explanation"] == {
        "primary_signal": (
            "执行阻断：当前 condition 节点尚未实现请求的 subprocess execution class。"
        ),
        "follow_up": (
            "下一步：先把 execution class 调回 inline，"
            "或补齐对应 execution adapter；显式 execution-class 请求不要静默降级。"
        ),
    }


def test_get_run_execution_view_blocks_unsupported_strong_isolation_for_generic_nodes(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-execution-view-strong-isolation",
        name="Execution View Strong Isolation",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "branch",
                    "type": "condition",
                    "name": "Branch",
                    "config": {"selected": "true"},
                    "runtimePolicy": {
                        "execution": {"class": "microvm", "profile": "strict"}
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "branch"},
                {"id": "e2", "sourceNodeId": "branch", "targetNodeId": "output"},
            ],
        },
    )
    workflow_version = WorkflowVersion(
        id="wf-execution-view-strong-isolation-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=workflow.definition,
        created_at=datetime.now(UTC),
    )
    sqlite_session.add(workflow)
    sqlite_session.add(workflow_version)
    CompiledBlueprintService().ensure_for_workflow_version(sqlite_session, workflow_version)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"message": "strong isolation summary"}},
    )
    assert response.status_code == 422

    persisted_run = run_routes.runtime_service.list_workflow_runs(sqlite_session, workflow.id)[0]
    execution_view_response = client.get(f"/api/runs/{persisted_run.id}/execution-view")

    assert execution_view_response.status_code == 200
    body = execution_view_response.json()
    assert body["summary"]["execution_dispatched_node_count"] == 0
    assert body["summary"]["execution_fallback_node_count"] == 0
    assert body["summary"]["execution_blocked_node_count"] == 0
    assert body["summary"]["execution_unavailable_node_count"] == 1
    assert body["summary"]["execution_requested_class_counts"] == {"microvm": 1}
    assert body["summary"]["execution_effective_class_counts"] == {}
    assert body["summary"]["execution_executor_ref_counts"] == {}
    assert body["execution_focus_explanation"] == {
        "primary_signal": "执行阻断：当前 condition 节点尚未实现请求的强隔离 execution class。",
        "follow_up": (
            "下一步：先把 execution class 调回当前实现支持范围，"
            "或补齐对应 execution adapter；在此之前继续保持 fail-closed。"
        ),
    }

    node = next(item for item in body["nodes"] if item["node_id"] == "branch")
    assert node["execution_class"] == "microvm"
    assert node["effective_execution_class"] is None
    assert node["execution_focus_explanation"] == {
        "primary_signal": "执行阻断：当前 condition 节点尚未实现请求的强隔离 execution class。",
        "follow_up": (
            "下一步：先把 execution class 调回当前实现支持范围，"
            "或补齐对应 execution adapter；在此之前继续保持 fail-closed。"
        ),
    }
    assert node["execution_dispatched_count"] == 0
    assert node["execution_fallback_count"] == 0
    assert node["execution_blocked_count"] == 0
    assert node["execution_unavailable_count"] == 1
    assert "Strong-isolation paths must fail closed" in (
        node["execution_blocking_reason"] or ""
    )


def test_get_run_execution_view_summarizes_unavailable_sandbox_execution(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-execution-view-sandbox",
        name="Execution View Sandbox",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "sandbox",
                    "type": "sandbox_code",
                    "name": "Sandbox",
                    "config": {"language": "python", "code": 'result = {"answer": "blocked"}'},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "sandbox"},
                {"id": "e2", "sourceNodeId": "sandbox", "targetNodeId": "output"},
            ],
        },
    )
    workflow_version = WorkflowVersion(
        id="wf-execution-view-sandbox-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=workflow.definition,
        created_at=datetime.now(UTC),
    )
    sqlite_session.add(workflow)
    sqlite_session.add(workflow_version)
    CompiledBlueprintService().ensure_for_workflow_version(sqlite_session, workflow_version)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"message": "sandbox summary"}},
    )
    assert response.status_code == 422

    persisted_run = run_routes.runtime_service.list_workflow_runs(sqlite_session, workflow.id)[0]
    execution_view_response = client.get(f"/api/runs/{persisted_run.id}/execution-view")

    assert execution_view_response.status_code == 200
    body = execution_view_response.json()
    assert body["summary"]["execution_dispatched_node_count"] == 0
    assert body["summary"]["execution_fallback_node_count"] == 0
    assert body["summary"]["execution_blocked_node_count"] == 0
    assert body["summary"]["execution_unavailable_node_count"] == 1
    assert body["summary"]["execution_requested_class_counts"] == {"sandbox": 1}
    assert body["summary"]["execution_effective_class_counts"] == {}
    assert body["summary"]["execution_executor_ref_counts"] == {}

    node = next(item for item in body["nodes"] if item["node_id"] == "sandbox")
    assert node["execution_class"] == "sandbox"
    assert node["effective_execution_class"] is None
    assert node["execution_dispatched_count"] == 0
    assert node["execution_fallback_count"] == 0
    assert node["execution_blocked_count"] == 0
    assert node["execution_unavailable_count"] == 1
    assert "sandbox backend" in (node["execution_blocking_reason"] or "")


def test_get_run_execution_view_surfaces_selected_backend_for_tool_runner_gap(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch,
) -> None:
    workflow = Workflow(
        id="wf-execution-view-tool-strong-isolation",
        name="Execution View Tool Strong Isolation",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "risk_tool",
                    "type": "tool",
                    "name": "Risk Tool",
                    "config": {
                        "mock_output": {"answer": "blocked"},
                    },
                    "runtimePolicy": {
                        "execution": {
                            "class": "microvm",
                            "profile": "tool-risk",
                            "networkPolicy": "isolated",
                            "filesystemPolicy": "ephemeral",
                        }
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "risk_tool"},
                {"id": "e2", "sourceNodeId": "risk_tool", "targetNodeId": "output"},
            ],
        },
    )
    workflow_version = WorkflowVersion(
        id="wf-execution-view-tool-strong-isolation-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=workflow.definition,
        created_at=datetime.now(UTC),
    )
    sqlite_session.add(workflow)
    sqlite_session.add(workflow_version)
    CompiledBlueprintService().ensure_for_workflow_version(sqlite_session, workflow_version)
    sqlite_session.commit()

    sandbox_registry = SandboxBackendRegistry()
    sandbox_capability = SandboxBackendCapability(
        supported_execution_classes=("microvm",),
        supported_profiles=("tool-risk",),
        supports_network_policy=True,
        supports_filesystem_policy=True,
    )
    sandbox_registry.register_backend(
        SandboxBackendRegistration(
            id="sandbox-default",
            kind="official",
            endpoint="http://sandbox.local",
            enabled=True,
            health_status="healthy",
            capability=sandbox_capability,
        )
    )
    sandbox_backend_client = SandboxBackendClient(
        sandbox_registry,
        health_checker=_StaticSandboxHealthChecker(
            [
                SandboxBackendHealth(
                    id="sandbox-default",
                    kind="official",
                    endpoint="http://sandbox.local",
                    enabled=True,
                    status="healthy",
                    capability=sandbox_capability,
                )
            ]
        ),
    )
    monkeypatch.setattr(
        run_routes,
        "runtime_service",
        RuntimeService(sandbox_backend_client=sandbox_backend_client),
    )

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"message": "tool runner gap"}},
    )
    assert response.status_code == 422

    persisted_run = run_routes.runtime_service.list_workflow_runs(sqlite_session, workflow.id)[0]
    execution_view_response = client.get(f"/api/runs/{persisted_run.id}/execution-view")

    assert execution_view_response.status_code == 200
    body = execution_view_response.json()
    assert body["summary"]["execution_dispatched_node_count"] == 0
    assert body["summary"]["execution_fallback_node_count"] == 0
    assert body["summary"]["execution_blocked_node_count"] == 0
    assert body["summary"]["execution_unavailable_node_count"] == 1
    assert body["summary"]["execution_requested_class_counts"] == {"microvm": 1}
    assert body["summary"]["execution_effective_class_counts"] == {}
    assert body["summary"]["execution_executor_ref_counts"] == {}
    assert body["summary"]["execution_sandbox_backend_counts"] == {"sandbox-default": 1}
    assert body["execution_focus_explanation"] == {
        "primary_signal": "执行阻断：当前 tool 路径还不能真实兑现请求的强隔离 execution class。",
        "follow_up": (
            "下一步：先把 tool execution class 调回当前宿主执行支持范围，"
            "或后续补齐 sandbox tool runner；在此之前继续保持 fail-closed。"
        ),
    }

    node = next(item for item in body["nodes"] if item["node_id"] == "risk_tool")
    assert node["execution_class"] == "microvm"
    assert node["effective_execution_class"] is None
    assert node["execution_focus_explanation"] == {
        "primary_signal": "执行阻断：当前 tool 路径还不能真实兑现请求的强隔离 execution class。",
        "follow_up": (
            "下一步：先把 tool execution class 调回当前宿主执行支持范围，"
            "或后续补齐 sandbox tool runner；在此之前继续保持 fail-closed。"
        ),
    }
    assert node["execution_dispatched_count"] == 0
    assert node["execution_fallback_count"] == 0
    assert node["execution_blocked_count"] == 0
    assert node["execution_unavailable_count"] == 1
    assert node["execution_sandbox_backend_id"] == "sandbox-default"
    assert (
        node["execution_sandbox_backend_executor_ref"]
        == "sandbox-backend:sandbox-default"
    )
    assert "sandbox-backed tool execution" in (node["execution_blocking_reason"] or "")
    assert "sandbox-default" in (node["execution_blocking_reason"] or "")


def test_get_run_supports_summary_mode_without_events(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "summary only"}},
    )

    assert response.status_code == 201
    body = response.json()
    run_id = body["id"]

    summary_response = client.get(f"/api/runs/{run_id}", params={"include_events": "false"})

    assert summary_response.status_code == 200
    summary_body = summary_response.json()
    assert summary_body["id"] == run_id
    assert summary_body["compiled_blueprint_id"] == body["compiled_blueprint_id"]
    assert summary_body["event_count"] == len(body["events"])
    assert summary_body["event_type_counts"]["run.started"] == 1
    assert summary_body["event_type_counts"]["run.completed"] == 1
    assert summary_body["first_event_at"] == body["events"][0]["created_at"]
    assert summary_body["last_event_at"] == body["events"][-1]["created_at"]
    assert summary_body["events"] == []


def test_resume_run_route_forwards_source_and_reason(
    client: TestClient,
    sample_workflow: Workflow,
    monkeypatch,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "resume-route"}},
    )

    assert response.status_code == 201
    run_body = response.json()
    run_id = run_body["id"]

    captured: dict[str, str | None] = {}

    def fake_resume_run(
        db,
        target_run_id: str,
        *,
        source: str = "manual",
        reason: str | None = None,
    ):
        captured["run_id"] = target_run_id
        captured["source"] = source
        captured["reason"] = reason
        return run_routes.runtime_service.load_run(db, target_run_id)

    monkeypatch.setattr(run_routes.runtime_service, "resume_run", fake_resume_run)

    resume_response = client.post(
        f"/api/runs/{run_id}/resume",
        json={
            "source": "operator_callback_resume",
            "reason": "operator_manual_resume_attempt",
        },
    )

    assert resume_response.status_code == 200
    assert captured == {
        "run_id": run_id,
        "source": "operator_callback_resume",
        "reason": "operator_manual_resume_attempt",
    }
    resume_body = resume_response.json()
    assert resume_body["run"]["id"] == run_id
    assert resume_body["outcome_explanation"] is not None
    assert resume_body["run_snapshot"] is not None
    assert resume_body["run_follow_up"] is not None
    assert resume_body["run_follow_up"]["affected_run_count"] == 1


def test_resume_run_route_returns_operator_follow_up_summary(
    client: TestClient,
    sample_workflow: Workflow,
    monkeypatch,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "resume-summary"}},
    )

    assert response.status_code == 201
    run_id = response.json()["id"]

    def fake_resume_run(
        db,
        target_run_id: str,
        *,
        source: str = "manual",
        reason: str | None = None,
    ):
        return run_routes.runtime_service.load_run(db, target_run_id)

    def fake_build_operator_run_follow_up_summary(db, run_ids):
        assert run_ids == [run_id]
        return OperatorRunFollowUpSummary(
            affected_run_count=1,
            sampled_run_count=1,
            waiting_run_count=1,
            sampled_runs=[
                OperatorRunSnapshotSample(
                    run_id=run_id,
                    snapshot=OperatorRunSnapshot(
                        workflow_id=sample_workflow.id,
                        status="waiting",
                        current_node_id="mock_tool",
                        waiting_reason="waiting_callback",
                    ),
                )
            ],
            explanation=SignalFollowUpExplanation(
                primary_signal="本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
                follow_up="run sample：当前 run 状态：waiting。 当前节点：mock_tool。",
            ),
        )

    monkeypatch.setattr(run_routes.runtime_service, "resume_run", fake_resume_run)
    monkeypatch.setattr(
        run_routes,
        "build_operator_run_follow_up_summary",
        fake_build_operator_run_follow_up_summary,
    )
    monkeypatch.setattr(
        run_routes,
        "load_operator_run_snapshot",
        lambda db, target_run_id: OperatorRunSnapshot(
            workflow_id=sample_workflow.id,
            status="waiting",
            current_node_id="mock_tool",
            waiting_reason="waiting_callback",
        ),
    )
    captured_snapshots: list[str] = []

    def fake_capture_callback_blocker_snapshot(
        db,
        *,
        run_id: str | None,
        node_run_id: str | None = None,
    ):
        assert node_run_id is None
        captured_snapshots.append(run_id or "")
        return f"snapshot:{run_id}"

    def fake_build_callback_blocker_delta_summary(*, before, after):
        assert before == f"snapshot:{run_id}"
        assert after == f"snapshot:{run_id}"
        return CallbackBlockerDeltaSummary(
            sampled_scope_count=1,
            changed_scope_count=1,
            cleared_scope_count=0,
            fully_cleared_scope_count=0,
            still_blocked_scope_count=1,
            summary=(
                "阻塞变化：当前仍是 waiting external callback。 "
                "建议动作仍是“Wait for callback result”。"
            ),
        )

    monkeypatch.setattr(
        run_routes,
        "capture_callback_blocker_snapshot",
        fake_capture_callback_blocker_snapshot,
    )
    monkeypatch.setattr(
        run_routes,
        "build_callback_blocker_delta_summary",
        fake_build_callback_blocker_delta_summary,
    )

    resume_response = client.post(
        f"/api/runs/{run_id}/resume",
        json={
            "source": "operator_callback_resume",
            "reason": "operator_manual_resume_attempt",
        },
    )

    assert resume_response.status_code == 200
    body = resume_response.json()
    assert body["run"]["id"] == run_id
    assert body["outcome_explanation"] == {
        "primary_signal": "已发起手动恢复，但 run 仍处于 waiting。",
        "follow_up": (
            "请继续检查 callback ticket、审批进度或定时恢复是否仍在阻塞。 "
            "run sample：当前 run 状态：waiting。 当前节点：mock_tool。"
        ),
    }
    assert body["callback_blocker_delta"] == {
        "sampled_scope_count": 1,
        "changed_scope_count": 1,
        "cleared_scope_count": 0,
        "fully_cleared_scope_count": 0,
        "still_blocked_scope_count": 1,
        "summary": (
            "阻塞变化：当前仍是 waiting external callback。 "
            "建议动作仍是“Wait for callback result”。"
        ),
    }
    assert body["run_snapshot"] == {
        "workflow_id": sample_workflow.id,
        "status": "waiting",
        "current_node_id": "mock_tool",
        "waiting_reason": "waiting_callback",
        "execution_focus_reason": None,
        "execution_focus_node_id": None,
        "execution_focus_node_run_id": None,
        "execution_focus_node_name": None,
        "execution_focus_node_type": None,
        "execution_focus_explanation": None,
        "callback_waiting_explanation": None,
        "callback_waiting_lifecycle": None,
        "scheduled_resume_delay_seconds": None,
        "scheduled_resume_reason": None,
        "scheduled_resume_source": None,
        "scheduled_waiting_status": None,
        "scheduled_resume_scheduled_at": None,
        "scheduled_resume_due_at": None,
        "scheduled_resume_requeued_at": None,
        "scheduled_resume_requeue_source": None,
        "execution_focus_artifact_count": 0,
        "execution_focus_artifact_ref_count": 0,
        "execution_focus_tool_call_count": 0,
        "execution_focus_raw_ref_count": 0,
        "execution_focus_artifact_refs": [],
        "execution_focus_artifacts": [],
        "execution_focus_tool_calls": [],
        "execution_focus_skill_trace": None,
    }
    assert body["run_follow_up"]["affected_run_count"] == 1
    assert body["run_follow_up"]["sampled_runs"][0]["snapshot"]["status"] == "waiting"
    assert captured_snapshots == [run_id, run_id]


def _parse_trace_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_get_run_trace_supports_machine_filters(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "trace me"}},
    )

    assert response.status_code == 201
    body = response.json()
    run_id = body["id"]
    first_node_run_id = body["node_runs"][0]["id"]

    trace_response = client.get(f"/api/runs/{run_id}/trace", params={"limit": 2})

    assert trace_response.status_code == 200
    trace_body = trace_response.json()
    assert trace_body["run_id"] == run_id
    assert trace_body["filters"] == {
        "cursor": None,
        "event_type": None,
        "node_run_id": None,
        "created_after": None,
        "created_before": None,
        "payload_key": None,
        "before_event_id": None,
        "after_event_id": None,
        "limit": 2,
        "order": "asc",
    }
    assert trace_body["summary"]["total_event_count"] == len(body["events"])
    assert trace_body["summary"]["matched_event_count"] == len(body["events"])
    assert trace_body["summary"]["returned_event_count"] == 2
    assert trace_body["summary"]["has_more"] is True
    assert _parse_trace_datetime(trace_body["summary"]["trace_started_at"]).replace(
        tzinfo=None
    ) == _parse_trace_datetime(body["events"][0]["created_at"]).replace(tzinfo=None)
    assert _parse_trace_datetime(trace_body["summary"]["trace_finished_at"]).replace(
        tzinfo=None
    ) == _parse_trace_datetime(body["events"][-1]["created_at"]).replace(tzinfo=None)
    assert _parse_trace_datetime(trace_body["summary"]["matched_started_at"]).replace(
        tzinfo=None
    ) == _parse_trace_datetime(body["events"][0]["created_at"]).replace(tzinfo=None)
    assert _parse_trace_datetime(trace_body["summary"]["matched_finished_at"]).replace(
        tzinfo=None
    ) == _parse_trace_datetime(body["events"][-1]["created_at"]).replace(tzinfo=None)
    assert _parse_trace_datetime(trace_body["summary"]["returned_started_at"]).replace(
        tzinfo=None
    ) == _parse_trace_datetime(body["events"][0]["created_at"]).replace(tzinfo=None)
    assert _parse_trace_datetime(trace_body["summary"]["returned_finished_at"]).replace(
        tzinfo=None
    ) == _parse_trace_datetime(body["events"][1]["created_at"]).replace(tzinfo=None)
    assert trace_body["summary"]["returned_duration_ms"] >= 0
    assert "input" in trace_body["summary"]["available_payload_keys"]
    assert "type" in trace_body["summary"]["available_payload_keys"]
    assert trace_body["summary"]["first_event_id"] == body["events"][0]["id"]
    assert trace_body["summary"]["last_event_id"] == body["events"][1]["id"]
    assert trace_body["summary"]["prev_cursor"] is None
    assert isinstance(trace_body["summary"]["next_cursor"], str)
    assert len(trace_body["events"]) == 2
    assert trace_body["events"][0]["sequence"] == 1
    assert trace_body["events"][0]["replay_offset_ms"] == 0
    assert trace_body["events"][1]["sequence"] == 2
    assert trace_body["events"][1]["replay_offset_ms"] >= 0

    next_page_response = client.get(
        f"/api/runs/{run_id}/trace",
        params={"cursor": trace_body["summary"]["next_cursor"]},
    )

    assert next_page_response.status_code == 200
    next_page_body = next_page_response.json()
    assert next_page_body["filters"]["cursor"] == trace_body["summary"]["next_cursor"]
    assert next_page_body["filters"]["after_event_id"] == body["events"][1]["id"]
    assert next_page_body["filters"]["order"] == "asc"
    assert next_page_body["events"][0]["id"] == body["events"][2]["id"]

    filtered_response = client.get(
        f"/api/runs/{run_id}/trace",
        params={"node_run_id": first_node_run_id, "event_type": "node.started"},
    )

    assert filtered_response.status_code == 200
    filtered_body = filtered_response.json()
    assert filtered_body["summary"]["matched_event_count"] == 1
    assert filtered_body["summary"]["returned_event_count"] == 1
    assert filtered_body["summary"]["returned_duration_ms"] == 0
    assert filtered_body["summary"]["next_cursor"] is None
    assert filtered_body["summary"]["prev_cursor"] is None
    assert filtered_body["events"] == [
        {
            "id": body["events"][1]["id"],
            "run_id": run_id,
            "node_run_id": first_node_run_id,
            "event_type": "node.started",
            "payload": body["events"][1]["payload"],
            "created_at": filtered_body["events"][0]["created_at"],
            "sequence": 2,
            "replay_offset_ms": filtered_body["events"][0]["replay_offset_ms"],
        }
    ]
    assert _parse_trace_datetime(filtered_body["events"][0]["created_at"]).replace(
        tzinfo=None
    ) == _parse_trace_datetime(body["events"][1]["created_at"]).replace(tzinfo=None)
    assert filtered_body["events"][0]["replay_offset_ms"] >= 0


def test_get_run_trace_supports_cursor_and_desc_order(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "trace order"}},
    )

    assert response.status_code == 201
    body = response.json()
    run_id = body["id"]
    anchor_event_id = body["events"][-1]["id"]

    trace_response = client.get(
        f"/api/runs/{run_id}/trace",
        params={"before_event_id": anchor_event_id, "order": "desc", "limit": 3},
    )

    assert trace_response.status_code == 200
    trace_body = trace_response.json()
    expected_events = list(reversed(body["events"][:-1]))[:3]
    assert [event["id"] for event in trace_body["events"]] == [
        event["id"] for event in expected_events
    ]
    assert [event["sequence"] for event in trace_body["events"]] == [
        len(body["events"]) - 1,
        len(body["events"]) - 2,
        len(body["events"]) - 3,
    ]
    assert trace_body["summary"]["returned_started_at"] == trace_body["events"][-1]["created_at"]
    assert trace_body["summary"]["returned_finished_at"] == trace_body["events"][0]["created_at"]
    assert trace_body["summary"]["returned_duration_ms"] >= 0
    assert isinstance(trace_body["summary"]["next_cursor"], str)
    assert isinstance(trace_body["summary"]["prev_cursor"], str)
    assert trace_body["filters"]["before_event_id"] == anchor_event_id
    assert trace_body["filters"]["order"] == "desc"

    prev_page_response = client.get(
        f"/api/runs/{run_id}/trace",
        params={"cursor": trace_body["summary"]["prev_cursor"]},
    )

    assert prev_page_response.status_code == 200
    prev_page_body = prev_page_response.json()
    assert prev_page_body["filters"]["cursor"] == trace_body["summary"]["prev_cursor"]
    assert prev_page_body["filters"]["after_event_id"] == expected_events[0]["id"]
    assert prev_page_body["filters"]["order"] == "asc"
    assert prev_page_body["events"][0]["id"] == body["events"][-1]["id"]


def test_get_run_trace_supports_time_range_and_payload_key_search(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    run = Run(
        id="run-trace-time-payload",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="succeeded",
        input_payload={"message": "trace filters"},
        output_payload={"answer": "done"},
        created_at=datetime(2026, 3, 10, 8, 0, tzinfo=UTC),
    )
    sqlite_session.add(run)
    sqlite_session.flush()

    base_time = datetime(2026, 3, 10, 8, 0, tzinfo=UTC)
    sqlite_session.add_all(
        [
            RunEvent(
                run_id=run.id,
                event_type="run.started",
                payload={"input": {"message": "trace filters"}},
                created_at=base_time,
            ),
            RunEvent(
                run_id=run.id,
                node_run_id="node-planner",
                event_type="node.output.completed",
                payload={"node_id": "planner", "output": {"summary": "draft"}},
                created_at=base_time + timedelta(minutes=1),
            ),
            RunEvent(
                run_id=run.id,
                node_run_id="node-reader",
                event_type="node.context.read",
                payload={
                    "node_id": "reader",
                    "results": [{"nodeId": "planner", "artifactType": "json"}],
                },
                created_at=base_time + timedelta(minutes=2),
            ),
            RunEvent(
                run_id=run.id,
                node_run_id="node-output",
                event_type="node.output.completed",
                payload={"node_id": "output", "output": {"final": {"answer": "done"}}},
                created_at=base_time + timedelta(minutes=3),
            ),
        ]
    )
    sqlite_session.commit()

    trace_response = client.get(
        f"/api/runs/{run.id}/trace",
        params={
            "created_after": (base_time + timedelta(minutes=1, seconds=30)).isoformat(),
            "created_before": (base_time + timedelta(minutes=3, seconds=30)).isoformat(),
            "payload_key": "artifactType",
        },
    )

    assert trace_response.status_code == 200
    trace_body = trace_response.json()
    assert trace_body["filters"]["payload_key"] == "artifactType"
    assert trace_body["summary"]["matched_event_count"] == 1
    assert trace_body["summary"]["returned_event_count"] == 1
    assert _parse_trace_datetime(trace_body["summary"]["trace_started_at"]).replace(
        tzinfo=None
    ) == base_time.replace(tzinfo=None)
    assert _parse_trace_datetime(trace_body["summary"]["trace_finished_at"]).replace(
        tzinfo=None
    ) == (base_time + timedelta(minutes=3)).replace(tzinfo=None)
    assert trace_body["summary"]["matched_started_at"] == trace_body["events"][0]["created_at"]
    assert trace_body["summary"]["matched_finished_at"] == trace_body["events"][0]["created_at"]
    assert trace_body["summary"]["returned_started_at"] == trace_body["events"][0]["created_at"]
    assert trace_body["summary"]["returned_finished_at"] == trace_body["events"][0]["created_at"]
    assert trace_body["summary"]["returned_duration_ms"] == 0
    assert trace_body["summary"]["next_cursor"] is None
    assert trace_body["summary"]["prev_cursor"] is None
    expected_event_id = sqlite_session.scalars(
        select(RunEvent.id).where(
            RunEvent.run_id == run.id,
            RunEvent.event_type == "node.context.read",
        )
    ).one()
    assert trace_body["events"] == [
        {
            "id": expected_event_id,
            "run_id": run.id,
            "node_run_id": "node-reader",
            "event_type": "node.context.read",
            "payload": {
                "node_id": "reader",
                "results": [{"nodeId": "planner", "artifactType": "json"}],
            },
            "created_at": trace_body["events"][0]["created_at"],
            "sequence": 3,
            "replay_offset_ms": 120000,
        }
    ]
    trace_created_at = _parse_trace_datetime(trace_body["events"][0]["created_at"])
    assert trace_created_at.replace(tzinfo=None) == (base_time + timedelta(minutes=2)).replace(
        tzinfo=None
    )
    assert "artifactType" in trace_body["summary"]["available_payload_keys"]
    assert "results.artifactType" in trace_body["summary"]["available_payload_keys"]


def test_get_run_trace_rejects_invalid_time_range(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "time guard"}},
    )

    assert response.status_code == 201
    run_id = response.json()["id"]

    trace_response = client.get(
        f"/api/runs/{run_id}/trace",
        params={
            "created_after": "2026-03-10T09:00:00+00:00",
            "created_before": "2026-03-10T08:00:00+00:00",
        },
    )

    assert trace_response.status_code == 422
    assert trace_response.json() == {
        "detail": "created_after must be earlier than or equal to created_before."
    }


def test_get_run_trace_returns_404_for_missing_run(client: TestClient) -> None:
    response = client.get("/api/runs/run-missing/trace")

    assert response.status_code == 404
    assert response.json() == {"detail": "Run not found."}


def test_get_run_trace_rejects_invalid_cursor(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "cursor guard"}},
    )

    assert response.status_code == 201
    run_id = response.json()["id"]

    trace_response = client.get(
        f"/api/runs/{run_id}/trace",
        params={"cursor": "not-a-valid-cursor"},
    )

    assert trace_response.status_code == 422
    assert trace_response.json() == {"detail": "cursor is invalid."}


def test_export_run_trace_supports_json_and_jsonl(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    response = client.post(
        f"/api/workflows/{sample_workflow.id}/runs",
        json={"input_payload": {"message": "export trace"}},
    )

    assert response.status_code == 201
    body = response.json()
    run_id = body["id"]

    export_json_response = client.get(
        f"/api/runs/{run_id}/trace/export",
        params={"event_type": "node.started", "format": "json"},
    )

    assert export_json_response.status_code == 200
    assert export_json_response.headers["content-type"].startswith("application/json")
    assert (
        export_json_response.headers["content-disposition"]
        == f'attachment; filename="run-{run_id}-trace.json"'
    )
    export_json_body = export_json_response.json()
    assert export_json_body["filters"]["event_type"] == "node.started"
    assert export_json_body["summary"]["matched_event_count"] == 3
    assert all(event["event_type"] == "node.started" for event in export_json_body["events"])

    export_jsonl_response = client.get(
        f"/api/runs/{run_id}/trace/export",
        params={
            "node_run_id": body["node_runs"][0]["id"],
            "event_type": "node.started",
            "format": "jsonl",
        },
    )

    assert export_jsonl_response.status_code == 200
    assert export_jsonl_response.headers["content-type"].startswith("application/x-ndjson")
    assert (
        export_jsonl_response.headers["content-disposition"]
        == f'attachment; filename="run-{run_id}-trace.jsonl"'
    )
    export_lines = [
        json.loads(line)
        for line in export_jsonl_response.text.splitlines()
        if line.strip()
    ]
    assert export_lines[0]["record_type"] == "trace"
    assert export_lines[0]["filters"]["node_run_id"] == body["node_runs"][0]["id"]
    assert export_lines[0]["filters"]["event_type"] == "node.started"
    assert export_lines[0]["summary"]["matched_event_count"] == 1
    assert len(export_lines) == 2
    assert export_lines[1]["record_type"] == "event"
    assert export_lines[1]["node_run_id"] == body["node_runs"][0]["id"]
    assert export_lines[1]["event_type"] == "node.started"


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


def test_execute_workflow_route_exposes_retry_events(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-retry",
        name="Route Retry Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "flaky_tool",
                    "type": "tool",
                    "name": "Flaky Tool",
                    "config": {
                        "mock_error_sequence": ["route temporary"],
                        "mock_output": {"answer": "route recovered"},
                    },
                    "runtimePolicy": {
                        "retry": {
                            "maxAttempts": 2,
                            "backoffSeconds": 0,
                        }
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "flaky_tool"},
                {"id": "e2", "sourceNodeId": "flaky_tool", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"message": "retry route"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["output_payload"] == {"flaky_tool": {"answer": "route recovered"}}
    assert [event["event_type"] for event in body["events"]].count("node.retrying") == 1


def test_execute_workflow_route_supports_selector_driven_branching(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-selector",
        name="Route Selector Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "branch",
                    "type": "router",
                    "name": "Branch",
                    "config": {
                        "selector": {
                            "rules": [
                                {
                                    "key": "search",
                                    "path": "trigger_input.intent",
                                    "operator": "eq",
                                    "value": "search",
                                }
                            ]
                        }
                    },
                },
                {
                    "id": "search_path",
                    "type": "tool",
                    "name": "Search Path",
                    "config": {"mock_output": {"answer": "search mode"}},
                },
                {
                    "id": "default_path",
                    "type": "tool",
                    "name": "Default Path",
                    "config": {"mock_output": {"answer": "default mode"}},
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
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"intent": "search"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["output_payload"] == {"search_path": {"answer": "search mode"}}
    assert {node_run["node_id"]: node_run["status"] for node_run in body["node_runs"]} == {
        "trigger": "succeeded",
        "branch": "succeeded",
        "search_path": "succeeded",
        "default_path": "skipped",
        "output": "succeeded",
    }


def test_execute_workflow_route_supports_expression_driven_branching(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-expression",
        name="Route Expression Workflow",
        version="0.1.0",
        status="draft",
        definition={
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
                    "config": {"mock_output": {"answer": "search mode"}},
                },
                {
                    "id": "default_path",
                    "type": "tool",
                    "name": "Default Path",
                    "config": {"mock_output": {"answer": "default mode"}},
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
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"intent": "search"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["output_payload"] == {"search_path": {"answer": "search mode"}}
    branch_run = next(node_run for node_run in body["node_runs"] if node_run["node_id"] == "branch")
    assert branch_run["output_payload"]["selected"] == "search"
    assert branch_run["output_payload"]["expression"]["defaultUsed"] is False


def test_execute_workflow_route_supports_edge_condition_expression(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-edge-expression",
        name="Route Edge Expression Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "scorer",
                    "type": "tool",
                    "name": "Scorer",
                    "config": {"mock_output": {"approved": True, "score": 97}},
                },
                {
                    "id": "approve",
                    "type": "tool",
                    "name": "Approve",
                    "config": {"mock_output": {"answer": "approved route"}},
                },
                {
                    "id": "reject",
                    "type": "tool",
                    "name": "Reject",
                    "config": {"mock_output": {"answer": "rejected route"}},
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
                {
                    "id": "e3",
                    "sourceNodeId": "scorer",
                    "targetNodeId": "reject",
                    "conditionExpression": "not source_output.approved",
                },
                {"id": "e4", "sourceNodeId": "approve", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "reject", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"message": "edge expr route"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["output_payload"] == {"approve": {"answer": "approved route"}}
    assert {node_run["node_id"]: node_run["status"] for node_run in body["node_runs"]} == {
        "trigger": "succeeded",
        "scorer": "succeeded",
        "approve": "succeeded",
        "reject": "skipped",
        "output": "succeeded",
    }


def test_execute_workflow_route_supports_join_all_policy(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-join-all",
        name="Route Join All Workflow",
        version="0.1.0",
        status="draft",
        definition={
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
                    "config": {"mock_output": {"answer": "route combined"}},
                    "runtimePolicy": {"join": {"mode": "all"}},
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
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"message": "join route"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "succeeded"
    joiner_run = next(node_run for node_run in body["node_runs"] if node_run["node_id"] == "joiner")
    assert joiner_run["input_payload"]["join"]["expectedSourceIds"] == ["planner", "researcher"]
    assert joiner_run["input_payload"]["join"]["mergeStrategy"] == "error"
    assert [event["event_type"] for event in body["events"]].count("node.join.ready") == 1


def test_execute_workflow_route_supports_edge_mapping_append_merge_strategy(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-mapping-append",
        name="Route Mapping Append Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "planner",
                    "type": "tool",
                    "name": "Planner",
                    "config": {"mock_output": {"topic": "plan"}},
                },
                {
                    "id": "researcher",
                    "type": "tool",
                    "name": "Researcher",
                    "config": {"mock_output": {"topic": "facts"}},
                },
                {
                    "id": "joiner",
                    "type": "tool",
                    "name": "Joiner",
                    "config": {},
                    "runtimePolicy": {
                        "join": {"mode": "all", "mergeStrategy": "append"}
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
                {"id": "e2", "sourceNodeId": "trigger", "targetNodeId": "researcher"},
                {
                    "id": "e3",
                    "sourceNodeId": "planner",
                    "targetNodeId": "joiner",
                    "mapping": [{"sourceField": "topic", "targetField": "inputs.topics"}],
                },
                {
                    "id": "e4",
                    "sourceNodeId": "researcher",
                    "targetNodeId": "joiner",
                    "mapping": [{"sourceField": "topic", "targetField": "inputs.topics"}],
                },
                {"id": "e5", "sourceNodeId": "joiner", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"message": "mapping append route"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "succeeded"
    joiner_run = next(node_run for node_run in body["node_runs"] if node_run["node_id"] == "joiner")
    assert joiner_run["input_payload"]["inputs"]["topics"] == ["plan", "facts"]


def test_execute_workflow_route_exposes_authorized_context_reads(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-mcp",
        name="Route MCP Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "planner",
                    "type": "tool",
                    "name": "Planner",
                    "config": {"mock_output": {"plan": "route plan"}},
                },
                {
                    "id": "reader",
                    "type": "mcp_query",
                    "name": "Reader",
                    "config": {
                        "contextAccess": {"readableNodeIds": ["planner"]},
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
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    response = client.post(
        f"/api/workflows/{workflow.id}/runs",
        json={"input_payload": {"message": "mcp route"}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["output_payload"] == {
        "reader": {
            "query": {
                "type": "authorized_context",
                "sourceNodeIds": ["planner"],
                "artifactTypes": ["json"],
            },
            "results": [
                {"nodeId": "planner", "artifactType": "json", "content": {"plan": "route plan"}}
            ],
        }
    }
    assert [event["event_type"] for event in body["events"]].count("node.context.read") == 1


def test_receive_run_callback_route_resumes_waiting_callback_run(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-callback",
        name="Route Callback Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "agent",
                    "type": "llm_agent",
                    "name": "Agent",
                    "config": {
                        "assistant": {"enabled": False},
                        "toolPolicy": {"allowedToolIds": ["native.search"]},
                        "mockPlan": {
                            "toolCalls": [
                                {
                                    "toolId": "native.search",
                                    "inputs": {"query": "route-callback"},
                                }
                            ]
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
    )
    workflow_version = WorkflowVersion(
        id="wf-route-callback-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=workflow.definition,
    )
    sqlite_session.add(workflow)
    sqlite_session.add(workflow_version)
    sqlite_session.commit()

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda _request: {
            "status": "waiting",
            "content_type": "json",
            "summary": "waiting for callback",
            "structured": {"externalTicket": "route-123"},
            "meta": {
                "tool_name": "Native Search",
                "waiting_reason": "route callback pending",
                "waiting_status": "waiting_callback",
            },
        },
    )
    first_pass = RuntimeService(plugin_call_proxy=PluginCallProxy(registry)).execute_workflow(
        sqlite_session,
        workflow,
        {"topic": "route-callback"},
    )
    waiting_run = next(node_run for node_run in first_pass.node_runs if node_run.node_id == "agent")
    callback_ticket = waiting_run.checkpoint_payload["callback_ticket"]["ticket"]

    response = client.post(
        f"/api/runs/callbacks/{callback_ticket}",
        json={
            "source": "route_test",
            "result": {
                "status": "success",
                "content_type": "json",
                "summary": "callback delivered",
                "structured": {
                    "documents": ["route done"],
                    "query": "route-callback",
                },
                "meta": {"tool_name": "Native Search"},
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["callback_status"] == "accepted"
    assert body["run_id"] == first_pass.run.id
    assert body["run"]["status"] == "succeeded"
    assert body["run"]["output_payload"]["agent"]["result"] == "callback delivered"
    assert "run.callback.received" in [event["event_type"] for event in body["run"]["events"]]

    duplicate_response = client.post(
        f"/api/runs/callbacks/{callback_ticket}",
        json={
            "source": "route_test",
            "result": {
                "status": "success",
                "content_type": "json",
                "summary": "duplicate delivery",
                "structured": {"documents": ["ignored"]},
                "meta": {},
            },
        },
    )

    assert duplicate_response.status_code == 200
    duplicate_body = duplicate_response.json()
    assert duplicate_body["callback_status"] == "already_consumed"
    assert duplicate_body["run"]["status"] == "succeeded"


def test_receive_run_callback_route_returns_expired_for_stale_ticket(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch,
) -> None:
    workflow = Workflow(
        id="wf-route-callback-expired",
        name="Route Callback Expired Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "agent",
                    "type": "llm_agent",
                    "name": "Agent",
                    "config": {
                        "assistant": {"enabled": False},
                        "toolPolicy": {"allowedToolIds": ["native.search"]},
                        "mockPlan": {
                            "toolCalls": [
                                {
                                    "toolId": "native.search",
                                    "inputs": {"query": "route-expired"},
                                }
                            ]
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
    )
    workflow_version = WorkflowVersion(
        id="wf-route-callback-expired-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=workflow.definition,
    )
    sqlite_session.add(workflow)
    sqlite_session.add(workflow_version)
    sqlite_session.commit()

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda _request: {
            "status": "waiting",
            "content_type": "json",
            "summary": "waiting for callback",
            "structured": {"externalTicket": "route-expired"},
            "meta": {
                "tool_name": "Native Search",
                "waiting_reason": "route callback pending",
                "waiting_status": "waiting_callback",
            },
        },
    )
    first_pass = RuntimeService(plugin_call_proxy=PluginCallProxy(registry)).execute_workflow(
        sqlite_session,
        workflow,
        {"topic": "route-callback"},
    )
    waiting_run = next(node_run for node_run in first_pass.node_runs if node_run.node_id == "agent")
    callback_ticket = waiting_run.checkpoint_payload["callback_ticket"]["ticket"]
    ticket_record = sqlite_session.get(RunCallbackTicket, callback_ticket)
    assert ticket_record is not None
    ticket_record.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    sqlite_session.commit()

    scheduled_resumes = []
    monkeypatch.setattr(
        run_routes.runtime_service,
        "_resume_scheduler",
        RunResumeScheduler(dispatcher=scheduled_resumes.append),
    )

    response = client.post(
        f"/api/runs/callbacks/{callback_ticket}",
        json={
            "source": "route_test",
            "result": {
                "status": "success",
                "content_type": "json",
                "summary": "late callback",
                "structured": {"documents": ["ignored"]},
                "meta": {"tool_name": "Native Search"},
            },
        },
    )

    sqlite_session.refresh(ticket_record)
    sqlite_session.refresh(waiting_run)
    late_event = sqlite_session.scalar(
        select(RunEvent)
        .where(
            RunEvent.run_id == first_pass.run.id,
            RunEvent.event_type == "run.callback.ticket.late",
        )
        .order_by(RunEvent.id.desc())
    )
    resume_event = sqlite_session.scalar(
        select(RunEvent)
        .where(
            RunEvent.run_id == first_pass.run.id,
            RunEvent.event_type == "run.resume.scheduled",
        )
        .order_by(RunEvent.id.desc())
    )
    lifecycle = waiting_run.checkpoint_payload["callback_waiting_lifecycle"]
    assert response.status_code == 200
    body = response.json()
    assert body["callback_status"] == "expired"
    assert body["run"]["status"] == "waiting"
    assert ticket_record.status == "expired"
    assert ticket_record.expired_at is not None
    assert len(scheduled_resumes) == 1
    assert scheduled_resumes[0].run_id == first_pass.run.id
    assert scheduled_resumes[0].delay_seconds == 0.0
    assert scheduled_resumes[0].reason == "route callback pending"
    assert scheduled_resumes[0].source == "route_test"
    assert "callback_ticket" not in waiting_run.checkpoint_payload
    assert waiting_run.checkpoint_payload["scheduled_resume"] == {
        "delay_seconds": 0.0,
        "reason": "route callback pending",
        "source": "route_test",
        "waiting_status": "waiting_callback",
        "backoff_attempt": 1,
        "scheduled_at": waiting_run.checkpoint_payload["scheduled_resume"]["scheduled_at"],
        "due_at": waiting_run.checkpoint_payload["scheduled_resume"]["due_at"],
    }
    assert lifecycle == {
        "wait_cycle_count": 1,
        "issued_ticket_count": 1,
        "expired_ticket_count": 1,
        "consumed_ticket_count": 0,
        "canceled_ticket_count": 0,
        "late_callback_count": 1,
        "resume_schedule_count": 1,
        "max_expired_ticket_count": 3,
        "terminated": False,
        "termination_reason": None,
        "terminated_at": None,
        "last_ticket_status": "expired",
        "last_ticket_reason": "callback_ticket_expired",
        "last_ticket_updated_at": lifecycle["last_ticket_updated_at"],
        "last_late_callback_status": "expired",
        "last_late_callback_reason": "callback_ticket_expired",
        "last_late_callback_at": lifecycle["last_late_callback_at"],
        "last_resume_delay_seconds": 0.0,
        "last_resume_reason": "route callback pending",
        "last_resume_source": "route_test",
        "last_resume_backoff_attempt": 1,
    }
    assert late_event is not None
    assert late_event.payload["ticket"] == callback_ticket
    assert late_event.payload["ticket_status"] == "expired"
    assert late_event.payload["reason"] == "callback_ticket_expired"
    assert late_event.payload["source"] == "route_test"
    assert resume_event is not None
    assert resume_event.payload == {
        "node_id": "agent",
        "delay_seconds": 0.0,
        "reason": "route callback pending",
        "source": "route_test",
        "waiting_status": "waiting_callback",
        "backoff_attempt": 1,
    }


def test_receive_run_callback_route_clears_stale_scheduled_resume_after_run_left_waiting(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-route-callback-left-waiting",
        name="Route Callback Left Waiting Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "agent",
                    "type": "llm_agent",
                    "name": "Agent",
                    "config": {
                        "assistant": {"enabled": False},
                        "toolPolicy": {"allowedToolIds": ["native.search"]},
                        "mockPlan": {
                            "toolCalls": [
                                {
                                    "toolId": "native.search",
                                    "inputs": {"query": "route-left-waiting"},
                                }
                            ]
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
    )
    workflow_version = WorkflowVersion(
        id="wf-route-callback-left-waiting-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=workflow.definition,
    )
    sqlite_session.add(workflow)
    sqlite_session.add(workflow_version)
    sqlite_session.commit()

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda _request: {
            "status": "waiting",
            "content_type": "json",
            "summary": "waiting for callback",
            "structured": {"externalTicket": "route-left-waiting"},
            "meta": {
                "tool_name": "Native Search",
                "waiting_reason": "route callback pending",
                "waiting_status": "waiting_callback",
            },
        },
    )
    first_pass = RuntimeService(plugin_call_proxy=PluginCallProxy(registry)).execute_workflow(
        sqlite_session,
        workflow,
        {"topic": "route-left-waiting"},
    )
    waiting_run = next(node_run for node_run in first_pass.node_runs if node_run.node_id == "agent")
    callback_ticket = waiting_run.checkpoint_payload["callback_ticket"]["ticket"]
    ticket_record = sqlite_session.get(RunCallbackTicket, callback_ticket)

    assert ticket_record is not None

    waiting_run.checkpoint_payload = {
        **dict(waiting_run.checkpoint_payload or {}),
        "scheduled_resume": {
            "delay_seconds": 30.0,
            "reason": "route callback pending",
            "source": "callback_ticket_monitor",
            "waiting_status": "waiting_callback",
            "backoff_attempt": 2,
        },
    }
    first_pass.run.status = "running"
    waiting_run.status = "running"
    sqlite_session.commit()

    response = client.post(
        f"/api/runs/callbacks/{callback_ticket}",
        json={
            "source": "route_test",
            "result": {
                "status": "success",
                "content_type": "json",
                "summary": "late callback after resume",
                "structured": {"documents": ["ignored"]},
                "meta": {"tool_name": "Native Search"},
            },
        },
    )

    sqlite_session.refresh(ticket_record)
    sqlite_session.refresh(waiting_run)
    late_event = sqlite_session.scalar(
        select(RunEvent)
        .where(
            RunEvent.run_id == first_pass.run.id,
            RunEvent.event_type == "run.callback.ticket.late",
        )
        .order_by(RunEvent.id.desc())
    )

    assert response.status_code == 200
    body = response.json()
    assert body["callback_status"] == "ignored"
    assert body["run"]["status"] == "running"
    assert ticket_record.status == "canceled"
    assert ticket_record.canceled_at is not None
    assert "callback_ticket" not in (waiting_run.checkpoint_payload or {})
    assert "scheduled_resume" not in (waiting_run.checkpoint_payload or {})
    assert (
        waiting_run.checkpoint_payload["callback_waiting_lifecycle"]["canceled_ticket_count"] == 1
    )
    assert waiting_run.checkpoint_payload["callback_waiting_lifecycle"]["late_callback_count"] == 1
    assert late_event is not None
    assert late_event.payload["reason"] == "callback_received_after_run_left_waiting"
    assert late_event.payload["source"] == "route_test"
