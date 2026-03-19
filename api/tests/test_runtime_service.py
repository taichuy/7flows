import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import NodeRun, Run, RunEvent
from app.models.workflow import Workflow, WorkflowCompiledBlueprint
from app.services.plugin_runtime import PluginCallProxy, PluginRegistry, PluginToolDefinition
from app.services.runtime import RuntimeService, WorkflowExecutionError
from app.services.sandbox_backends import (
    SandboxBackendCapability,
    SandboxBackendClient,
    SandboxBackendRegistry,
    SandboxBackendSelection,
    SandboxExecutionRequest,
    SandboxExecutionResponse,
    SandboxToolExecutionRequest,
)


def test_runtime_service_executes_linear_workflow(
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    service = RuntimeService()

    artifacts = service.execute_workflow(
        sqlite_session,
        sample_workflow,
        {"topic": "hello"},
    )

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.workflow_version == "0.1.0"
    assert artifacts.run.compiled_blueprint_id is not None
    assert artifacts.run.output_payload == {"mock_tool": {"answer": "done"}}
    assert len(artifacts.node_runs) == 3
    event_types = [event.event_type for event in artifacts.events]
    assert event_types[0] == "run.started"
    assert event_types[-1] == "run.completed"
    assert event_types.count("node.started") == 3
    assert event_types.count("node.output.completed") == 3
    assert event_types.count("node.output.delta") == 3
    assert event_types.count("run.output.delta") == 1

    node_deltas = [
        event for event in artifacts.events if event.event_type == "node.output.delta"
    ]
    mock_tool_delta = next(
        event for event in node_deltas if event.payload.get("node_id") == "mock_tool"
    )
    assert mock_tool_delta.payload["delta"] == "done"

    run_delta = next(
        event for event in artifacts.events if event.event_type == "run.output.delta"
    )
    assert isinstance(run_delta.payload["delta"], str)
    assert len(run_delta.payload["delta"]) > 0

    compiled_blueprint = sqlite_session.scalar(
        select(WorkflowCompiledBlueprint).where(
            WorkflowCompiledBlueprint.id == artifacts.run.compiled_blueprint_id
        )
    )
    assert compiled_blueprint is not None
    assert compiled_blueprint.workflow_id == sample_workflow.id
    assert compiled_blueprint.workflow_version == sample_workflow.version


def test_runtime_service_records_effective_execution_policy(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-execution-policy",
        name="Execution Policy Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "tool",
                    "type": "tool",
                    "name": "Tool",
                    "config": {"mock_output": {"answer": "done"}},
                    "runtimePolicy": {
                        "execution": {
                            "class": "subprocess",
                            "profile": "host-fallback",
                            "timeoutMs": 30000,
                            "networkPolicy": "restricted",
                        }
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool"},
                {"id": "e2", "sourceNodeId": "tool", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(
        sqlite_session,
        workflow,
        {"topic": "execution"},
    )

    trigger_run = next(
        node_run for node_run in artifacts.node_runs if node_run.node_id == "trigger"
    )
    tool_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "tool")
    assert trigger_run.input_payload["execution"] == {
        "class": "inline",
        "source": "default",
    }
    assert tool_run.input_payload["execution"] == {
        "class": "subprocess",
        "source": "runtime_policy",
        "profile": "host-fallback",
        "timeoutMs": 30000,
        "networkPolicy": "restricted",
    }

    tool_started = next(
        event
        for event in artifacts.events
        if event.event_type == "node.started" and event.payload.get("node", {}).get("id") == "tool"
    )
    assert tool_started.payload["execution"] == tool_run.input_payload["execution"]


def test_runtime_service_blocks_tool_strong_isolation_until_tool_runner_exists(
    sqlite_session: Session,
) -> None:
    registry = PluginRegistry()
    invoked = False

    def invoker(_request):
        nonlocal invoked
        invoked = True
        return {"documents": ["doc-1"]}

    registry.register_tool(
        PluginToolDefinition(
            id="native.risk-search",
            name="Risk Search",
            supported_execution_classes=("inline", "sandbox"),
        ),
        invoker=invoker,
    )

    workflow = Workflow(
        id="wf-tool-strong-isolation-blocked",
        name="Tool Strong Isolation Blocked Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "tool",
                    "type": "tool",
                    "name": "Tool",
                    "config": {
                        "tool": {
                            "toolId": "native.risk-search",
                            "ecosystem": "native",
                        }
                    },
                    "runtimePolicy": {
                        "execution": {
                            "class": "sandbox",
                            "profile": "risk-reviewed",
                            "timeoutMs": 3000,
                        }
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool"},
                {"id": "e2", "sourceNodeId": "tool", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    with pytest.raises(
        WorkflowExecutionError,
        match="No sandbox backend is registered",
    ):
        RuntimeService(
            plugin_call_proxy=PluginCallProxy(
                registry,
                sandbox_backend_client=SandboxBackendClient(SandboxBackendRegistry()),
            ),
            sandbox_backend_client=SandboxBackendClient(SandboxBackendRegistry()),
        ).execute_workflow(
            sqlite_session,
            workflow,
            {"topic": "blocked"},
        )

    run = sqlite_session.scalars(
        select(Run).where(Run.workflow_id == workflow.id).order_by(Run.created_at.desc())
    ).first()
    assert run is not None
    assert run.status == "failed"

    tool_run = sqlite_session.scalars(
        select(NodeRun)
        .where(NodeRun.run_id == run.id, NodeRun.node_id == "tool")
        .order_by(NodeRun.started_at.desc())
    ).first()
    assert tool_run is not None
    assert tool_run.status == "blocked"
    assert "No sandbox backend is registered" in (tool_run.error_message or "")
    assert invoked is False

    events = sqlite_session.scalars(
        select(RunEvent)
        .where(RunEvent.run_id == run.id, RunEvent.node_run_id == tool_run.id)
        .order_by(RunEvent.id.asc())
    ).all()
    unavailable_event = next(
        event for event in events if event.event_type == "node.execution.unavailable"
    )
    assert unavailable_event.payload["node_id"] == "tool"
    assert unavailable_event.payload["node_type"] == "tool"
    assert unavailable_event.payload["requested_execution_class"] == "sandbox"
    assert "No sandbox backend is registered" in str(unavailable_event.payload["reason"])


def test_runtime_service_executes_native_tool_via_sandbox_runner(
    sqlite_session: Session,
) -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="native.risk-search",
            name="Risk Search",
            ecosystem="native",
            input_schema={
                "type": "object",
                "properties": {"trigger": {"type": "object"}},
                "required": ["trigger"],
                "additionalProperties": False,
            },
            supported_execution_classes=("inline", "sandbox"),
        )
    )

    workflow = Workflow(
        id="wf-tool-strong-isolation-runner",
        name="Tool Strong Isolation Runner Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "tool",
                    "type": "tool",
                    "name": "Tool",
                    "config": {
                        "tool": {
                            "toolId": "native.risk-search",
                            "ecosystem": "native",
                        }
                    },
                    "runtimePolicy": {
                        "execution": {
                            "class": "sandbox",
                            "profile": "risk-reviewed",
                            "timeoutMs": 3000,
                        }
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool"},
                {"id": "e2", "sourceNodeId": "tool", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    sandbox_backend_client = _SandboxBackendClientStub()
    artifacts = RuntimeService(
        plugin_call_proxy=PluginCallProxy(
            registry,
            sandbox_backend_client=sandbox_backend_client,
        ),
        sandbox_backend_client=sandbox_backend_client,
    ).execute_workflow(
        sqlite_session,
        workflow,
        {"topic": "runner"},
    )

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {
        "tool": {
            "documents": ["RUNNER"],
            "requested": "sandbox",
        }
    }
    assert len(sandbox_backend_client.tool_requests) == 1
    assert sandbox_backend_client.tool_requests[0].runner_kind == "native-tool"
    assert sandbox_backend_client.tool_requests[0].profile == "risk-reviewed"

    tool_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "tool")
    assert tool_run.input_payload["execution"] == {
        "class": "sandbox",
        "source": "runtime_policy",
        "profile": "risk-reviewed",
        "timeoutMs": 3000,
    }
    assert tool_run.output_payload == {
        "documents": ["RUNNER"],
        "requested": "sandbox",
    }

    dispatched_event = next(
        event
        for event in artifacts.events
        if event.node_run_id == tool_run.id and event.event_type == "tool.execution.dispatched"
    )
    assert dispatched_event.payload == {
        "node_id": "tool",
        "tool_id": "native.risk-search",
        "tool_name": "native.risk-search",
        "requested_execution_class": "sandbox",
        "effective_execution_class": "sandbox",
        "execution_source": "runtime_policy",
        "requested_execution_profile": "risk-reviewed",
        "requested_execution_timeout_ms": 3000,
        "requested_network_policy": None,
        "requested_filesystem_policy": None,
        "requested_dependency_mode": None,
        "requested_builtin_package_set": None,
        "requested_dependency_ref": None,
        "requested_backend_extensions": None,
        "executor_ref": "tool:native-sandbox",
        "sandbox_backend_id": "sandbox-default",
        "sandbox_backend_executor_ref": "sandbox-backend:sandbox-default",
    }


def test_runtime_service_blocks_sandbox_code_without_registered_backend(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-sandbox-code",
        name="Sandbox Code Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "sandbox",
                    "type": "sandbox_code",
                    "name": "Sandbox",
                    "config": {
                        "language": "python",
                        "code": (
                            'topic = node_input["trigger_input"]["topic"]\n'
                            'result = {"answer": topic.upper(), "requested": '
                            'node_input["execution"]["class"]}'
                        ),
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "sandbox"},
                {"id": "e2", "sourceNodeId": "sandbox", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    service = RuntimeService()
    with pytest.raises(
        WorkflowExecutionError,
        match="No compatible sandbox backend is currently available",
    ):
        service.execute_workflow(
            sqlite_session,
            workflow,
            {"topic": "sandbox"},
        )

    persisted_run = service.list_workflow_runs(sqlite_session, workflow.id)[0]
    artifacts = service.load_run(sqlite_session, persisted_run.id)
    assert artifacts is not None
    assert artifacts.run.status == "failed"
    sandbox_run = next(
        node_run for node_run in artifacts.node_runs if node_run.node_id == "sandbox"
    )
    assert sandbox_run.status == "blocked"
    assert sandbox_run.input_payload["execution"] == {
        "class": "sandbox",
        "source": "default",
    }
    assert "sandbox backend" in (sandbox_run.error_message or "")

    unavailable_event = next(
        event
        for event in artifacts.events
        if event.node_run_id == sandbox_run.id and event.event_type == "node.execution.unavailable"
    )
    assert unavailable_event.payload == {
        "node_id": "sandbox",
        "node_type": "sandbox_code",
        "requested_execution_class": "sandbox",
        "reason": sandbox_run.error_message,
    }


def test_runtime_service_executes_sandbox_code_via_explicit_subprocess_mvp(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-sandbox-code-subprocess",
        name="Sandbox Code Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "sandbox",
                    "type": "sandbox_code",
                    "name": "Sandbox",
                    "config": {
                        "language": "python",
                        "code": (
                            'topic = node_input["trigger_input"]["topic"]\n'
                            'result = {"answer": topic.upper(), "requested": '
                            'node_input["execution"]["class"]}'
                        ),
                    },
                    "runtimePolicy": {"execution": {"class": "subprocess"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "sandbox"},
                {"id": "e2", "sourceNodeId": "sandbox", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(
        sqlite_session,
        workflow,
        {"topic": "sandbox"},
    )

    sandbox_run = next(
        node_run for node_run in artifacts.node_runs if node_run.node_id == "sandbox"
    )
    assert sandbox_run.input_payload["execution"] == {
        "class": "subprocess",
        "source": "runtime_policy",
    }
    assert sandbox_run.output_payload == {
        "answer": "SANDBOX",
        "requested": "subprocess",
    }
    assert len(sandbox_run.artifact_refs or []) == 1

    sandbox_artifact = next(
        artifact for artifact in artifacts.artifacts if artifact.node_run_id == sandbox_run.id
    )
    assert sandbox_artifact.artifact_kind == "sandbox_result"
    assert sandbox_artifact.payload == {
        "language": "python",
        "result": {"answer": "SANDBOX", "requested": "subprocess"},
        "stdout": "",
        "stderr": "",
        "requestedExecutionClass": "subprocess",
        "effectiveExecutionClass": "subprocess",
        "executorRef": "host_subprocess_python",
    }


class _SandboxBackendClientStub(SandboxBackendClient):
    def __init__(self) -> None:
        self.requests: list[SandboxExecutionRequest] = []
        self.tool_requests: list[SandboxToolExecutionRequest] = []

    def describe_execution_backend(
        self,
        request: SandboxExecutionRequest,
    ) -> SandboxBackendSelection:
        return SandboxBackendSelection(
            available=True,
            backend_id="sandbox-default",
            executor_ref="sandbox-backend:sandbox-default",
            capability=SandboxBackendCapability(
                supported_execution_classes=("sandbox",),
                supported_languages=("python",),
                supported_dependency_modes=("builtin",),
                supports_builtin_package_sets=True,
                supports_network_policy=True,
                supports_filesystem_policy=True,
            ),
            health_status="healthy",
        )

    def execute(self, request: SandboxExecutionRequest) -> SandboxExecutionResponse:
        self.requests.append(request)
        return SandboxExecutionResponse(
            backend_id="sandbox-default",
            executor_ref="sandbox-backend:sandbox-default",
            effective_execution_class="sandbox",
            result={
                "answer": request.node_input["trigger_input"]["topic"].upper(),
                "requested": request.execution_class,
            },
            stdout="sandbox stdout",
            stderr="",
        )

    def describe_tool_execution_backend(
        self,
        *,
        execution_class: str,
        profile: str | None = None,
        dependency_mode: str | None = None,
        builtin_package_set: str | None = None,
        network_policy: str | None = None,
        filesystem_policy: str | None = None,
        backend_extensions: dict | None = None,
    ) -> SandboxBackendSelection:
        return SandboxBackendSelection(
            available=True,
            backend_id="sandbox-default",
            executor_ref="sandbox-backend:sandbox-default",
            capability=SandboxBackendCapability(
                supported_execution_classes=(execution_class,),
                supported_profiles=((profile,) if profile is not None else ()),
                supported_dependency_modes=(
                    (dependency_mode,) if dependency_mode is not None else ()
                ),
                supports_tool_execution=True,
                supports_builtin_package_sets=True,
                supports_network_policy=True,
                supports_filesystem_policy=True,
            ),
            health_status="healthy",
        )

    def execute_tool(self, request: SandboxToolExecutionRequest) -> SandboxExecutionResponse:
        self.tool_requests.append(request)
        return SandboxExecutionResponse(
            backend_id="sandbox-default",
            executor_ref="sandbox-backend:sandbox-default:tool-runner",
            effective_execution_class=request.execution_class,
            result={
                "status": "success",
                "output": {
                    "documents": [request.inputs["trigger"]["topic"].upper()],
                    "requested": request.execution_class,
                },
                "logs": ["sandbox tool runner invoked"],
                "durationMs": 19,
            },
            stdout="",
            stderr="",
        )


def test_runtime_service_executes_sandbox_code_via_registered_backend(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-sandbox-code-remote",
        name="Sandbox Backend Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "sandbox",
                    "type": "sandbox_code",
                    "name": "Sandbox",
                    "config": {
                        "language": "python",
                        "code": 'result = {"answer": "unused"}',
                        "dependencyMode": "builtin",
                        "builtinPackageSet": "py-data-basic",
                    },
                    "runtimePolicy": {
                        "execution": {
                            "class": "sandbox",
                            "profile": "python-safe",
                            "timeoutMs": 15000,
                            "networkPolicy": "restricted",
                            "filesystemPolicy": "ephemeral",
                        }
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "sandbox"},
                {"id": "e2", "sourceNodeId": "sandbox", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    sandbox_backend_client = _SandboxBackendClientStub()
    artifacts = RuntimeService(sandbox_backend_client=sandbox_backend_client).execute_workflow(
        sqlite_session,
        workflow,
        {"topic": "remote"},
    )

    sandbox_run = next(
        node_run for node_run in artifacts.node_runs if node_run.node_id == "sandbox"
    )
    assert sandbox_run.output_payload == {
        "answer": "REMOTE",
        "requested": "sandbox",
    }
    assert len(sandbox_backend_client.requests) == 1
    assert sandbox_backend_client.requests[0].profile == "python-safe"
    assert sandbox_backend_client.requests[0].dependency_mode == "builtin"
    assert sandbox_backend_client.requests[0].builtin_package_set == "py-data-basic"
    assert sandbox_backend_client.requests[0].network_policy == "restricted"
    assert sandbox_backend_client.requests[0].filesystem_policy == "ephemeral"

    dispatched_event = next(
        event
        for event in artifacts.events
        if event.node_run_id == sandbox_run.id and event.event_type == "node.execution.dispatched"
    )
    assert dispatched_event.payload == {
        "node_id": "sandbox",
        "node_type": "sandbox_code",
        "requested_execution_class": "sandbox",
        "effective_execution_class": "sandbox",
        "executor_ref": "sandbox-backend:sandbox-default",
    }

    sandbox_artifact = next(
        artifact for artifact in artifacts.artifacts if artifact.node_run_id == sandbox_run.id
    )
    assert sandbox_artifact.payload == {
        "language": "python",
        "result": {"answer": "REMOTE", "requested": "sandbox"},
        "stdout": "sandbox stdout",
        "stderr": "",
        "requestedExecutionClass": "sandbox",
        "effectiveExecutionClass": "sandbox",
        "executorRef": "sandbox-backend:sandbox-default",
        "backendId": "sandbox-default",
        "dependencyMode": "builtin",
        "builtinPackageSet": "py-data-basic",
    }


def test_runtime_service_sandbox_code_uses_runtime_policy_dependency_contract(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-sandbox-runtime-policy-deps",
        name="Sandbox Runtime Policy Dependency Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "sandbox",
                    "type": "sandbox_code",
                    "name": "Sandbox",
                    "config": {
                        "language": "python",
                        "code": 'result = {"answer": "remote"}',
                    },
                    "runtimePolicy": {
                        "execution": {
                            "class": "sandbox",
                            "dependencyMode": "builtin",
                            "builtinPackageSet": "py-data-basic",
                            "backendExtensions": {
                                "mountPreset": "analytics",
                            },
                        }
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "sandbox"},
                {"id": "e2", "sourceNodeId": "sandbox", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    sandbox_backend_client = _SandboxBackendClientStub()
    RuntimeService(sandbox_backend_client=sandbox_backend_client).execute_workflow(
        sqlite_session,
        workflow,
        {"topic": "remote"},
    )

    assert len(sandbox_backend_client.requests) == 1
    assert sandbox_backend_client.requests[0].dependency_mode == "builtin"
    assert sandbox_backend_client.requests[0].builtin_package_set == "py-data-basic"
    assert sandbox_backend_client.requests[0].backend_extensions == {
        "mountPreset": "analytics"
    }


class _DependencyMismatchSandboxBackendClientStub:
    def __init__(self) -> None:
        self.describe_requests: list[SandboxExecutionRequest] = []

    def describe_execution_backend(
        self,
        request: SandboxExecutionRequest,
    ) -> SandboxBackendSelection:
        self.describe_requests.append(request)
        return SandboxBackendSelection(
            available=False,
            reason=(
                "No compatible sandbox backend is currently available for the requested "
                "execution class 'sandbox'. sandbox-default: does not support "
                "dependency mode 'dependency_ref'"
            ),
        )

    def execute(self, request: SandboxExecutionRequest) -> SandboxExecutionResponse:
        raise AssertionError("execute should not be called when dependency capability is missing")


def test_runtime_service_fail_closes_sandbox_code_on_dependency_mode_mismatch(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-sandbox-code-dependency-mismatch",
        name="Sandbox Dependency Mismatch Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "sandbox",
                    "type": "sandbox_code",
                    "name": "Sandbox",
                    "config": {
                        "language": "python",
                        "code": 'result = {"answer": "unused"}',
                        "dependencyMode": "dependency_ref",
                        "dependencyRef": "bundle:finance-safe-v1",
                    },
                    "runtimePolicy": {
                        "execution": {
                            "class": "sandbox",
                        }
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "sandbox"},
                {"id": "e2", "sourceNodeId": "sandbox", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    sandbox_backend_client = _DependencyMismatchSandboxBackendClientStub()

    with pytest.raises(
        WorkflowExecutionError,
        match="does not support dependency mode 'dependency_ref'",
    ):
        RuntimeService(sandbox_backend_client=sandbox_backend_client).execute_workflow(
            sqlite_session,
            workflow,
            {"topic": "remote"},
        )

    assert len(sandbox_backend_client.describe_requests) == 1
    describe_request = sandbox_backend_client.describe_requests[0]
    assert describe_request.execution_class == "sandbox"
    assert describe_request.dependency_mode == "dependency_ref"
    assert describe_request.dependency_ref == "bundle:finance-safe-v1"


class _BackendExtensionsMismatchSandboxBackendClientStub:
    def __init__(self) -> None:
        self.describe_requests: list[SandboxExecutionRequest] = []

    def describe_execution_backend(
        self,
        request: SandboxExecutionRequest,
    ) -> SandboxBackendSelection:
        self.describe_requests.append(request)
        return SandboxBackendSelection(
            available=False,
            reason=(
                "No compatible sandbox backend is currently available for the requested "
                "execution class 'sandbox'. sandbox-default: does not support "
                "backendExtensions payloads"
            ),
        )

    def execute(self, request: SandboxExecutionRequest) -> SandboxExecutionResponse:
        raise AssertionError("execute should not be called when backend extensions are unsupported")


def test_runtime_service_fail_closes_sandbox_code_on_backend_extensions_mismatch(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-sandbox-code-backend-extensions-mismatch",
        name="Sandbox Backend Extensions Mismatch Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "sandbox",
                    "type": "sandbox_code",
                    "name": "Sandbox",
                    "config": {
                        "language": "python",
                        "code": 'result = {"answer": "unused"}',
                        "backendExtensions": {
                            "image": "python-safe:3.11",
                            "bundle": "finance-safe-v1",
                        },
                    },
                    "runtimePolicy": {
                        "execution": {
                            "class": "sandbox",
                        }
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "sandbox"},
                {"id": "e2", "sourceNodeId": "sandbox", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    sandbox_backend_client = _BackendExtensionsMismatchSandboxBackendClientStub()

    with pytest.raises(
        WorkflowExecutionError,
        match="does not support backendExtensions payloads",
    ):
        RuntimeService(sandbox_backend_client=sandbox_backend_client).execute_workflow(
            sqlite_session,
            workflow,
            {"topic": "remote"},
        )

    assert len(sandbox_backend_client.describe_requests) == 1
    describe_request = sandbox_backend_client.describe_requests[0]
    assert describe_request.execution_class == "sandbox"
    assert describe_request.backend_extensions == {
        "image": "python-safe:3.11",
        "bundle": "finance-safe-v1",
    }

def test_runtime_service_fail_closes_explicit_native_tool_isolation_request(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-execution-fallback",
        name="Execution Fallback Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "tool",
                    "type": "tool",
                    "name": "Tool",
                    "config": {
                        "tool": {"toolId": "native.inline-test"},
                        "inputs": {"mode": "fallback"},
                    },
                    "runtimePolicy": {
                        "execution": {
                            "class": "microvm",
                            "profile": "strict",
                        }
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool"},
                {"id": "e2", "sourceNodeId": "tool", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.inline-test", name="Inline Test"),
        invoker=lambda request: {
            "status": "success",
            "content_type": "json",
            "summary": "inline tool execution",
            "structured": {"answer": "inline", "mode": request.inputs["mode"]},
            "meta": {"tool_name": "Inline Test"},
        },
    )

    sandbox_backend_client = SandboxBackendClient(SandboxBackendRegistry())

    with pytest.raises(
        WorkflowExecutionError,
        match="No sandbox backend is registered",
    ):
        RuntimeService(
            plugin_call_proxy=PluginCallProxy(
                registry,
                sandbox_backend_client=sandbox_backend_client,
            ),
            sandbox_backend_client=sandbox_backend_client,
        ).execute_workflow(
            sqlite_session,
            workflow,
            {"topic": "fallback"},
        )

    run = sqlite_session.scalars(
        select(Run).where(Run.workflow_id == workflow.id).order_by(Run.created_at.desc())
    ).first()
    assert run is not None
    assert run.status == "failed"

    tool_run = sqlite_session.scalars(
        select(NodeRun)
        .where(NodeRun.run_id == run.id, NodeRun.node_id == "tool")
        .order_by(NodeRun.started_at.desc())
    ).first()
    assert tool_run is not None

    events = sqlite_session.scalars(
        select(RunEvent)
        .where(RunEvent.run_id == run.id, RunEvent.node_run_id == tool_run.id)
        .order_by(RunEvent.id.asc())
    ).all()

    unavailable_event = next(
        event for event in events if event.event_type == "node.execution.unavailable"
    )
    assert unavailable_event.payload == {
        "node_id": "tool",
        "node_type": "tool",
        "requested_execution_class": "microvm",
        "reason": (
            "No sandbox backend is registered. Strong-isolation paths must fail closed until "
            "a compatible backend is available."
        ),
    }


def test_runtime_service_only_executes_selected_condition_branch(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-condition",
        name="Condition Workflow",
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
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "branch"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"true_path": {"answer": "yes"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "branch": "succeeded",
        "true_path": "succeeded",
        "false_path": "skipped",
        "output": "succeeded",
    }
    assert "node.skipped" in [event.event_type for event in artifacts.events]


def test_runtime_service_selects_condition_branch_from_trigger_input(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-condition-selector",
        name="Condition Selector Workflow",
        version="0.1.0",
        status="draft",
        definition={
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
                    "id": "normal_path",
                    "type": "tool",
                    "name": "Normal Path",
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
                {"id": "e3", "sourceNodeId": "branch", "targetNodeId": "normal_path"},
                {"id": "e4", "sourceNodeId": "urgent_path", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "normal_path", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"priority": "high"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"urgent_path": {"answer": "rush"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "branch": "succeeded",
        "urgent_path": "succeeded",
        "normal_path": "skipped",
        "output": "succeeded",
    }
    branch_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "branch")
    assert branch_run.output_payload["selected"] == "urgent"
    assert branch_run.output_payload["selector"]["matchedRule"]["path"] == "trigger_input.priority"


def test_runtime_service_uses_default_branch_when_selector_rules_do_not_match(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-condition-selector-default",
        name="Condition Selector Default Workflow",
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
                                    "key": "research",
                                    "path": "trigger_input.intent",
                                    "operator": "eq",
                                    "value": "research",
                                }
                            ]
                        }
                    },
                },
                {
                    "id": "research_path",
                    "type": "tool",
                    "name": "Research Path",
                    "config": {"mock_output": {"answer": "search docs"}},
                },
                {
                    "id": "default_path",
                    "type": "tool",
                    "name": "Default Path",
                    "config": {"mock_output": {"answer": "chat"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "branch"},
                {
                    "id": "e2",
                    "sourceNodeId": "branch",
                    "targetNodeId": "research_path",
                    "condition": "research",
                },
                {"id": "e3", "sourceNodeId": "branch", "targetNodeId": "default_path"},
                {"id": "e4", "sourceNodeId": "research_path", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "default_path", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"intent": "chat"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"default_path": {"answer": "chat"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "branch": "succeeded",
        "research_path": "skipped",
        "default_path": "succeeded",
        "output": "succeeded",
    }
    branch_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "branch")
    assert branch_run.output_payload["selected"] == "default"
    assert branch_run.output_payload["selector"]["defaultUsed"] is True


def test_runtime_service_selects_condition_branch_from_expression(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-condition-expression",
        name="Condition Expression Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "branch",
                    "type": "condition",
                    "name": "Branch",
                    "config": {
                        "expression": "trigger_input.priority == 'high' and "
                        "not upstream.branch_override"
                    },
                },
                {
                    "id": "true_path",
                    "type": "tool",
                    "name": "True Path",
                    "config": {"mock_output": {"answer": "expedite"}},
                },
                {
                    "id": "false_path",
                    "type": "tool",
                    "name": "False Path",
                    "config": {"mock_output": {"answer": "queue"}},
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
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"priority": "high"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"true_path": {"answer": "expedite"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "branch": "succeeded",
        "true_path": "succeeded",
        "false_path": "skipped",
        "output": "succeeded",
    }
    branch_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "branch")
    assert branch_run.output_payload["selected"] == "true"
    assert branch_run.output_payload["expression"]["value"] is True


def test_runtime_service_routes_router_expression_to_matching_branch(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-router-expression",
        name="Router Expression Workflow",
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
                    "id": "chat_path",
                    "type": "tool",
                    "name": "Chat Path",
                    "config": {"mock_output": {"answer": "chat mode"}},
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
                {"id": "e3", "sourceNodeId": "branch", "targetNodeId": "chat_path"},
                {"id": "e4", "sourceNodeId": "search_path", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "chat_path", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"intent": "search"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"search_path": {"answer": "search mode"}}
    branch_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "branch")
    assert branch_run.output_payload["selected"] == "search"
    assert branch_run.output_payload["expression"]["defaultUsed"] is False


def test_runtime_service_gates_regular_edges_with_condition_expression(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-edge-expression",
        name="Edge Expression Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "scorer",
                    "type": "tool",
                    "name": "Scorer",
                    "config": {"mock_output": {"score": 92, "approved": True}},
                },
                {
                    "id": "approve",
                    "type": "tool",
                    "name": "Approve",
                    "config": {"mock_output": {"answer": "approved"}},
                },
                {
                    "id": "reject",
                    "type": "tool",
                    "name": "Reject",
                    "config": {"mock_output": {"answer": "rejected"}},
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

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "gate"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"approve": {"answer": "approved"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "scorer": "succeeded",
        "approve": "succeeded",
        "reject": "skipped",
        "output": "succeeded",
    }


def test_runtime_service_applies_edge_mapping_to_target_input(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-edge-mapping",
        name="Edge Mapping Workflow",
        version="0.1.0",
        status="draft",
        definition={
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
                    "config": {"mode": "summary"},
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
                        {
                            "sourceField": "missing",
                            "targetField": "metadata.note",
                            "fallback": "n/a",
                            "template": "value={{value}}",
                        },
                    ],
                },
                {"id": "e3", "sourceNodeId": "formatter", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "mapping"})

    assert artifacts.run.status == "succeeded"
    formatter_run = next(
        node_run for node_run in artifacts.node_runs if node_run.node_id == "formatter"
    )
    assert formatter_run.input_payload["prompt"] == "Draft"
    assert formatter_run.input_payload["config"]["priority"] == 7
    assert formatter_run.input_payload["metadata"]["note"] == "value=n/a"
    assert formatter_run.input_payload["mapped"] == {
        "prompt": "Draft",
        "config": {"priority": 7},
        "metadata": {"note": "value=n/a"},
    }


def test_runtime_service_appends_conflicting_mapped_values_when_merge_strategy_is_append(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-edge-mapping-append",
        name="Edge Mapping Append Workflow",
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

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "append"})

    assert artifacts.run.status == "succeeded"
    joiner_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "joiner")
    assert joiner_run.input_payload["join"]["mergeStrategy"] == "append"
    assert joiner_run.input_payload["inputs"]["topics"] == ["plan", "facts"]


def test_runtime_service_rejects_conflicting_mapped_values_without_merge_strategy(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-edge-mapping-conflict",
        name="Edge Mapping Conflict Workflow",
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
                    "runtimePolicy": {"join": {"mode": "all"}},
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
                    "mapping": [{"sourceField": "topic", "targetField": "inputs.topic"}],
                },
                {
                    "id": "e4",
                    "sourceNodeId": "researcher",
                    "targetNodeId": "joiner",
                    "mapping": [{"sourceField": "topic", "targetField": "inputs.topic"}],
                },
                {"id": "e5", "sourceNodeId": "joiner", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    with pytest.raises(WorkflowExecutionError, match="conflicting field mapping"):
        RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "conflict"})


def test_runtime_service_executes_join_all_after_all_required_sources_arrive(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-join-all-success",
        name="Join All Workflow",
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
                    "config": {"mock_output": {"facts": ["a", "b"]}},
                },
                {
                    "id": "joiner",
                    "type": "tool",
                    "name": "Joiner",
                    "config": {"mock_output": {"answer": "combined"}},
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

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "join"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"joiner": {"answer": "combined"}}
    joiner_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "joiner")
    assert joiner_run.input_payload["join"] == {
        "mode": "all",
        "onUnmet": "skip",
        "mergeStrategy": "error",
        "expectedSourceIds": ["planner", "researcher"],
        "activatedSourceIds": ["planner", "researcher"],
        "missingSourceIds": [],
    }
    assert [event.event_type for event in artifacts.events].count("node.join.ready") == 1


def test_runtime_service_blocks_when_join_all_missing_required_source_and_fail_policy(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-join-all-fail",
        name="Join All Fail Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "branch",
                    "type": "router",
                    "name": "Branch",
                    "config": {"selected": "planner"},
                },
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
                    "config": {"mock_output": {"facts": ["a", "b"]}},
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
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "branch"},
                {
                    "id": "e2",
                    "sourceNodeId": "branch",
                    "targetNodeId": "planner",
                    "condition": "planner",
                },
                {
                    "id": "e3",
                    "sourceNodeId": "branch",
                    "targetNodeId": "researcher",
                    "condition": "researcher",
                },
                {"id": "e4", "sourceNodeId": "planner", "targetNodeId": "joiner"},
                {"id": "e5", "sourceNodeId": "researcher", "targetNodeId": "joiner"},
                {"id": "e6", "sourceNodeId": "joiner", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    service = RuntimeService()
    with pytest.raises(
        WorkflowExecutionError,
        match="Missing required upstream nodes: researcher",
    ):
        service.execute_workflow(sqlite_session, workflow, {"topic": "join fail"})

    persisted_run = service.list_workflow_runs(sqlite_session, workflow.id)[0]
    artifacts = service.load_run(sqlite_session, persisted_run.id)
    assert artifacts is not None
    assert artifacts.run.status == "failed"
    joiner_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "joiner")
    assert joiner_run.status == "blocked"
    assert "researcher" in (joiner_run.error_message or "")
    assert [event.event_type for event in artifacts.events].count("node.join.unmet") == 1


def test_runtime_service_can_continue_through_failure_branch(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-failure-branch",
        name="Failure Branch Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "explode",
                    "type": "tool",
                    "name": "Explode",
                    "config": {"mock_error": "boom"},
                },
                {
                    "id": "success_path",
                    "type": "tool",
                    "name": "Success Path",
                    "config": {"mock_output": {"answer": "unexpected"}},
                },
                {
                    "id": "fallback",
                    "type": "tool",
                    "name": "Fallback",
                    "config": {"mock_output": {"answer": "recovered"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "explode"},
                {"id": "e2", "sourceNodeId": "explode", "targetNodeId": "success_path"},
                {
                    "id": "e3",
                    "sourceNodeId": "explode",
                    "targetNodeId": "fallback",
                    "condition": "failed",
                },
                {"id": "e4", "sourceNodeId": "success_path", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "fallback", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "errors"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"fallback": {"answer": "recovered"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "explode": "failed",
        "success_path": "skipped",
        "fallback": "succeeded",
        "output": "succeeded",
    }
    assert [event.event_type for event in artifacts.events].count("node.failed") == 1
    assert artifacts.run.error_message is None


def test_runtime_service_retries_node_before_succeeding(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-retry-success",
        name="Retry Success Workflow",
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
                        "mock_error_sequence": ["temporary outage"],
                        "mock_output": {"answer": "recovered"},
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

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "retry"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"flaky_tool": {"answer": "recovered"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "flaky_tool": "succeeded",
        "output": "succeeded",
    }
    flaky_tool_run = next(
        node_run for node_run in artifacts.node_runs if node_run.node_id == "flaky_tool"
    )
    assert flaky_tool_run.input_payload["attempt"] == {"current": 2, "max": 2}
    assert [event.event_type for event in artifacts.events].count("node.retrying") == 1
    assert "node.failed" not in [event.event_type for event in artifacts.events]


def test_runtime_service_routes_to_failure_branch_after_retries_exhausted(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-retry-failure-branch",
        name="Retry Failure Branch Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "explode",
                    "type": "tool",
                    "name": "Explode",
                    "config": {"mock_error": "boom"},
                    "runtimePolicy": {
                        "retry": {
                            "maxAttempts": 3,
                            "backoffSeconds": 0,
                        }
                    },
                },
                {
                    "id": "fallback",
                    "type": "tool",
                    "name": "Fallback",
                    "config": {"mock_output": {"answer": "recovered after retries"}},
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

    artifacts = RuntimeService().execute_workflow(
        sqlite_session,
        workflow,
        {"topic": "retry failure"},
    )

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"fallback": {"answer": "recovered after retries"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "explode": "failed",
        "fallback": "succeeded",
        "output": "succeeded",
    }
    assert [event.event_type for event in artifacts.events].count("node.retrying") == 2
    assert [event.event_type for event in artifacts.events].count("node.failed") == 1


def test_runtime_service_injects_authorized_context_and_executes_mcp_query(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-mcp-query",
        name="MCP Query Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "planner",
                    "type": "tool",
                    "name": "Planner",
                    "config": {"mock_output": {"plan": "collect facts"}},
                },
                {
                    "id": "search",
                    "type": "tool",
                    "name": "Search",
                    "config": {"mock_output": {"docs": ["a", "b"]}},
                },
                {
                    "id": "reader",
                    "type": "mcp_query",
                    "name": "Reader",
                    "config": {
                        "contextAccess": {
                            "readableNodeIds": ["planner"],
                            "readableArtifacts": [
                                {"nodeId": "search", "artifactType": "json"},
                            ],
                        },
                        "query": {
                            "type": "authorized_context",
                            "sourceNodeIds": ["planner", "search"],
                            "artifactTypes": ["json"],
                        },
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
                {"id": "e2", "sourceNodeId": "planner", "targetNodeId": "search"},
                {"id": "e3", "sourceNodeId": "search", "targetNodeId": "reader"},
                {"id": "e4", "sourceNodeId": "reader", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "mcp"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {
        "reader": {
            "query": {
                "type": "authorized_context",
                "sourceNodeIds": ["planner", "search"],
                "artifactTypes": ["json"],
            },
            "results": [
                {"nodeId": "planner", "artifactType": "json", "content": {"plan": "collect facts"}},
                {"nodeId": "search", "artifactType": "json", "content": {"docs": ["a", "b"]}},
            ],
        }
    }
    reader_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "reader")
    assert reader_run.input_payload["authorized_context"] == {
        "currentNodeId": "reader",
        "readableNodeIds": ["planner", "search"],
        "readableArtifacts": [
            {"nodeId": "planner", "artifactType": "json"},
            {"nodeId": "search", "artifactType": "json"},
        ],
    }
    assert [event.event_type for event in artifacts.events].count("node.context.read") == 1


def test_runtime_service_rejects_unauthorized_mcp_query_source(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-mcp-query-unauthorized",
        name="Unauthorized MCP Query Workflow",
        version="0.1.0",
        status="draft",
        definition={
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
                            "sourceNodeIds": ["planner", "search"],
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

    with pytest.raises(WorkflowExecutionError, match="missing source node 'search'"):
        RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "mcp"})


def test_runtime_service_rejects_loop_nodes(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-loop",
        name="Loop Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [{"id": "loop", "type": "loop", "name": "Loop", "config": {}}],
            "edges": [],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    service = RuntimeService()

    with pytest.raises(WorkflowExecutionError):
        service.execute_workflow(sqlite_session, workflow, {})

