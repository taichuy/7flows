from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.models.run import NodeRun
from app.services.artifact_store import RuntimeArtifactStore
from app.services.context_service import ContextService
from app.services.runtime_execution_policy import (
    ResolvedExecutionPolicy,
    resolve_sandbox_code_dependency_contract,
)
from app.services.runtime_sandbox_code import HostSandboxCodeExecutor
from app.services.runtime_types import (
    AuthorizedContextRefs,
    NodeExecutionResult,
    RuntimeEvent,
    WorkflowExecutionError,
)
from app.services.sandbox_backends import (
    SandboxBackendClient,
    SandboxExecutionRequest,
    get_sandbox_backend_client,
)
from app.services.tool_execution_isolation import (
    build_tool_execution_not_yet_isolated_reason,
    describe_tool_execution_backend_selection,
    is_strong_tool_execution_class,
)


@dataclass(frozen=True)
class NodeExecutionRequest:
    db: Session
    node: dict[str, Any]
    node_run: NodeRun
    node_input: dict[str, Any]
    run_id: str
    attempt_number: int
    authorized_context: AuthorizedContextRefs
    outputs: dict[str, dict]
    execution_policy: ResolvedExecutionPolicy
    inline_executor: Callable[[], NodeExecutionResult]


@dataclass(frozen=True)
class NodeExecutionAvailability:
    available: bool
    blocking_reason: str | None = None
    executor_ref: str | None = None
    sandbox_backend_id: str | None = None
    sandbox_backend_executor_ref: str | None = None


@dataclass(frozen=True)
class SandboxCodeDispatchConfig:
    language: str
    code: str
    dependency_mode: str | None = None
    builtin_package_set: str | None = None
    dependency_ref: str | None = None
    backend_extensions: dict[str, Any] | None = None


def _normalize_optional_string(value: object) -> str | None:
    if isinstance(value, str):
        normalized = value.strip()
        return normalized or None
    return None


def _normalize_backend_extensions(value: object) -> dict[str, Any] | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise WorkflowExecutionError("sandbox_code backendExtensions must be an object.")
    return dict(value)


def _parse_sandbox_code_dispatch_config(
    config: dict[str, Any],
    *,
    execution_policy: ResolvedExecutionPolicy,
) -> SandboxCodeDispatchConfig:
    language = str(config.get("language") or "python").strip().lower() or "python"
    code = str(config.get("code") or "")
    if not code.strip():
        raise WorkflowExecutionError("sandbox_code nodes must define a non-empty config.code.")

    dependency_contract = resolve_sandbox_code_dependency_contract(
        config=config,
        execution_policy=execution_policy,
    )
    dependency_mode = dependency_contract.dependency_mode
    builtin_package_set = dependency_contract.builtin_package_set
    dependency_ref = dependency_contract.dependency_ref
    if builtin_package_set is not None and dependency_mode != "builtin":
        raise WorkflowExecutionError(
            "sandbox_code builtinPackageSet requires dependencyMode 'builtin'."
        )
    if dependency_ref is not None and dependency_mode != "dependency_ref":
        raise WorkflowExecutionError(
            "sandbox_code dependencyRef requires dependencyMode 'dependency_ref'."
        )

    return SandboxCodeDispatchConfig(
        language=language,
        code=code,
        dependency_mode=dependency_mode,
        builtin_package_set=builtin_package_set,
        dependency_ref=dependency_ref,
        backend_extensions=_normalize_backend_extensions(
            dependency_contract.backend_extensions
        ),
    )


class InlineExecutionAdapter:
    adapter_ref = "runtime:inline"

    def execute(self, request: NodeExecutionRequest) -> NodeExecutionResult:
        return request.inline_executor()


class InlineExecutionFallbackAdapter:
    def __init__(self, execution_class: str) -> None:
        self._execution_class = execution_class
        self.adapter_ref = f"runtime:inline-fallback:{execution_class}"

    def execute(self, request: NodeExecutionRequest) -> NodeExecutionResult:
        result = request.inline_executor()
        result.events.insert(
            0,
            RuntimeEvent(
                "node.execution.fallback",
                {
                    "node_id": request.node.get("id"),
                    "node_type": request.node.get("type"),
                    "requested_execution_class": self._execution_class,
                    "effective_execution_class": "inline",
                    "executor_ref": self.adapter_ref,
                    "reason": "execution_class_not_implemented_for_node_type",
                },
            ),
        )
        return result


class SandboxCodeExecutionAdapter:
    adapter_ref = "runtime:host-subprocess-sandbox-code"

    def __init__(
        self,
        *,
        sandbox_code_executor: HostSandboxCodeExecutor,
        artifact_store: RuntimeArtifactStore,
        context_service: ContextService,
    ) -> None:
        self._sandbox_code_executor = sandbox_code_executor
        self._artifact_store = artifact_store
        self._context_service = context_service

    def execute(self, request: NodeExecutionRequest) -> NodeExecutionResult:
        if request.execution_policy.execution_class != "subprocess":
            raise WorkflowExecutionError(
                "Host subprocess sandbox_code adapter only supports explicit subprocess execution."
            )
        events = [
            RuntimeEvent(
                "node.execution.dispatched",
                {
                    "node_id": request.node.get("id"),
                    "node_type": request.node.get("type"),
                    "requested_execution_class": request.execution_policy.execution_class,
                    "effective_execution_class": "subprocess",
                    "executor_ref": self.adapter_ref,
                },
            )
        ]

        execution = self._sandbox_code_executor.execute(
            config=dict(request.node.get("config") or {}),
            node_input=request.node_input,
            timeout_ms=request.execution_policy.timeout_ms,
        )
        normalized_output = self._normalize_output(execution.result)
        artifact_payload = {
            "language": execution.language,
            "result": normalized_output,
            "stdout": execution.stdout,
            "stderr": execution.stderr,
            "requestedExecutionClass": request.execution_policy.execution_class,
            "effectiveExecutionClass": "subprocess",
            "executorRef": execution.effective_adapter,
        }
        artifact_ref = self._artifact_store.create_artifact(
            request.db,
            run_id=request.run_id,
            node_run_id=request.node_run.id,
            artifact_kind="sandbox_result",
            value=artifact_payload,
            metadata_payload={
                "node_id": request.node.get("id"),
                "language": execution.language,
                "requested_execution_class": request.execution_policy.execution_class,
                "executor_ref": execution.effective_adapter,
            },
        )
        self._context_service.append_artifact_ref(request.node_run, artifact_ref.uri)
        events.append(
            RuntimeEvent(
                "sandbox_code.completed",
                {
                    "node_id": request.node.get("id"),
                    "language": execution.language,
                    "stdout_present": bool(execution.stdout.strip()),
                    "stderr_present": bool(execution.stderr.strip()),
                    "artifact_ref": artifact_ref.uri,
                    "executor_ref": execution.effective_adapter,
                },
            )
        )
        return NodeExecutionResult(output=normalized_output, events=events)

    def _normalize_output(self, result: Any) -> dict[str, Any]:
        if isinstance(result, dict):
            return result
        if result is None:
            return {}
        return {"value": result}


class RemoteSandboxExecutionAdapter:
    def __init__(
        self,
        *,
        sandbox_backend_client: SandboxBackendClient,
        artifact_store: RuntimeArtifactStore,
        context_service: ContextService,
    ) -> None:
        self._sandbox_backend_client = sandbox_backend_client
        self._artifact_store = artifact_store
        self._context_service = context_service

    def execute(self, request: NodeExecutionRequest) -> NodeExecutionResult:
        config = dict(request.node.get("config") or {})
        dispatch_config = _parse_sandbox_code_dispatch_config(
            config,
            execution_policy=request.execution_policy,
        )
        language = dispatch_config.language
        dependency_mode = dispatch_config.dependency_mode
        builtin_package_set = dispatch_config.builtin_package_set
        dependency_ref = dispatch_config.dependency_ref
        backend_extensions = dispatch_config.backend_extensions

        execution = self._sandbox_backend_client.execute(
            SandboxExecutionRequest(
                execution_class=request.execution_policy.execution_class,
                language=language,
                code=dispatch_config.code,
                node_input=request.node_input,
                trace_id=f"run:{request.run_id}:node:{request.node.get('id')}:sandbox_code",
                profile=request.execution_policy.profile,
                dependency_mode=dependency_mode,
                builtin_package_set=builtin_package_set,
                dependency_ref=dependency_ref,
                timeout_ms=request.execution_policy.timeout_ms,
                network_policy=request.execution_policy.network_policy,
                filesystem_policy=request.execution_policy.filesystem_policy,
                backend_extensions=backend_extensions,
            )
        )
        normalized_output = self._normalize_output(execution.result)
        artifact_payload = {
            "language": language,
            "result": normalized_output,
            "stdout": execution.stdout,
            "stderr": execution.stderr,
            "requestedExecutionClass": request.execution_policy.execution_class,
            "effectiveExecutionClass": execution.effective_execution_class,
            "executorRef": execution.executor_ref,
            "backendId": execution.backend_id,
        }
        if dependency_mode is not None:
            artifact_payload["dependencyMode"] = dependency_mode
        if builtin_package_set is not None:
            artifact_payload["builtinPackageSet"] = builtin_package_set
        if dependency_ref is not None:
            artifact_payload["dependencyRef"] = dependency_ref
        artifact_ref = self._artifact_store.create_artifact(
            request.db,
            run_id=request.run_id,
            node_run_id=request.node_run.id,
            artifact_kind="sandbox_result",
            value=artifact_payload,
            metadata_payload={
                "node_id": request.node.get("id"),
                "language": language,
                "requested_execution_class": request.execution_policy.execution_class,
                "effective_execution_class": execution.effective_execution_class,
                "executor_ref": execution.executor_ref,
                "backend_id": execution.backend_id,
                "dependency_mode": dependency_mode,
            },
        )
        self._context_service.append_artifact_ref(request.node_run, artifact_ref.uri)
        return NodeExecutionResult(
            output=normalized_output,
            events=[
                RuntimeEvent(
                    "node.execution.dispatched",
                    {
                        "node_id": request.node.get("id"),
                        "node_type": request.node.get("type"),
                        "requested_execution_class": request.execution_policy.execution_class,
                        "effective_execution_class": execution.effective_execution_class,
                        "executor_ref": execution.executor_ref,
                    },
                ),
                RuntimeEvent(
                    "sandbox_code.completed",
                    {
                        "node_id": request.node.get("id"),
                        "language": language,
                        "stdout_present": bool(execution.stdout.strip()),
                        "stderr_present": bool(execution.stderr.strip()),
                        "artifact_ref": artifact_ref.uri,
                        "executor_ref": execution.executor_ref,
                        "backend_id": execution.backend_id,
                        "dependency_mode": dependency_mode,
                    },
                ),
            ],
        )

    def _normalize_output(self, result: Any) -> dict[str, Any]:
        if isinstance(result, dict):
            return result
        if result is None:
            return {}
        return {"value": result}


class RuntimeExecutionAdapterRegistry:
    def __init__(
        self,
        *,
        artifact_store: RuntimeArtifactStore,
        context_service: ContextService,
        sandbox_code_executor: HostSandboxCodeExecutor | None = None,
        sandbox_backend_client: SandboxBackendClient | None = None,
    ) -> None:
        self._sandbox_backend_client = sandbox_backend_client or get_sandbox_backend_client()
        self._inline_adapter = InlineExecutionAdapter()
        self._fallback_adapters = {
            "subprocess": InlineExecutionFallbackAdapter("subprocess"),
            "sandbox": InlineExecutionFallbackAdapter("sandbox"),
            "microvm": InlineExecutionFallbackAdapter("microvm"),
        }
        self._sandbox_code_adapter = SandboxCodeExecutionAdapter(
            sandbox_code_executor=sandbox_code_executor or HostSandboxCodeExecutor(),
            artifact_store=artifact_store,
            context_service=context_service,
        )
        self._remote_sandbox_adapter = RemoteSandboxExecutionAdapter(
            sandbox_backend_client=self._sandbox_backend_client,
            artifact_store=artifact_store,
            context_service=context_service,
        )

    def describe_node_execution_availability(
        self,
        *,
        node: dict[str, Any],
        execution_policy: ResolvedExecutionPolicy,
    ) -> NodeExecutionAvailability:
        node_type = str(node.get("type") or "unknown")
        if node_type != "sandbox_code":
            if node_type == "tool" and is_strong_tool_execution_class(
                execution_policy.execution_class
            ):
                backend_selection = describe_tool_execution_backend_selection(
                    sandbox_backend_client=self._sandbox_backend_client,
                    execution_class=execution_policy.execution_class,
                    profile=execution_policy.profile,
                    dependency_mode=execution_policy.dependency_mode,
                    builtin_package_set=execution_policy.builtin_package_set,
                    network_policy=execution_policy.network_policy,
                    filesystem_policy=execution_policy.filesystem_policy,
                    backend_extensions=execution_policy.backend_extensions,
                )
                if backend_selection is not None and not backend_selection.available:
                    return NodeExecutionAvailability(
                        available=False,
                        blocking_reason=backend_selection.reason,
                    )
                return NodeExecutionAvailability(
                    available=False,
                    blocking_reason=(
                        build_tool_execution_not_yet_isolated_reason(
                            tool_id=str(node.get("id") or node.get("name") or "tool"),
                            execution_class=execution_policy.execution_class,
                            backend_selection=backend_selection,
                        )
                    ),
                    sandbox_backend_id=(
                        backend_selection.backend_id
                        if backend_selection is not None and backend_selection.available
                        else None
                    ),
                    sandbox_backend_executor_ref=(
                        backend_selection.executor_ref
                        if backend_selection is not None and backend_selection.available
                        else None
                    ),
                )
            if node_type != "tool" and execution_policy.execution_class in {
                "sandbox",
                "microvm",
            }:
                return NodeExecutionAvailability(
                    available=False,
                    blocking_reason=(
                        f"Node type '{node_type}' does not implement requested "
                        f"strong-isolation execution class '{execution_policy.execution_class}'. "
                        "Strong-isolation paths must fail closed until a compatible "
                        "execution adapter is available."
                    ),
                )
            return NodeExecutionAvailability(available=True)

        if execution_policy.execution_class == "subprocess":
            return NodeExecutionAvailability(
                available=True,
                executor_ref=self._sandbox_code_adapter.adapter_ref,
            )

        if execution_policy.execution_class == "inline":
            return NodeExecutionAvailability(
                available=False,
                blocking_reason=(
                    "sandbox_code cannot run with execution class 'inline'. "
                    "Use explicit 'subprocess' for the current host-controlled MVP path, "
                    "or register a sandbox backend for 'sandbox' / 'microvm'."
                ),
            )

        if execution_policy.execution_class in {"sandbox", "microvm"}:
            config = dict(node.get("config") or {})
            try:
                dispatch_config = _parse_sandbox_code_dispatch_config(
                    config,
                    execution_policy=execution_policy,
                )
            except WorkflowExecutionError as exc:
                return NodeExecutionAvailability(
                    available=False,
                    blocking_reason=str(exc),
                )
            selection = self._sandbox_backend_client.describe_execution_backend(
                SandboxExecutionRequest(
                    execution_class=execution_policy.execution_class,
                    language=dispatch_config.language,
                    code=dispatch_config.code,
                    node_input={},
                    trace_id=f"node:{node.get('id')}:availability",
                    profile=execution_policy.profile,
                    dependency_mode=dispatch_config.dependency_mode,
                    builtin_package_set=dispatch_config.builtin_package_set,
                    dependency_ref=dispatch_config.dependency_ref,
                    timeout_ms=execution_policy.timeout_ms,
                    network_policy=execution_policy.network_policy,
                    filesystem_policy=execution_policy.filesystem_policy,
                    backend_extensions=dispatch_config.backend_extensions,
                )
            )
            if selection.available:
                return NodeExecutionAvailability(
                    available=True,
                    executor_ref=selection.executor_ref,
                )
            return NodeExecutionAvailability(
                available=False,
                blocking_reason=selection.reason,
            )

        return NodeExecutionAvailability(
            available=False,
            blocking_reason=(
                f"sandbox_code requested execution class '{execution_policy.execution_class}', "
                "but no compatible sandbox backend is registered. "
                "Strong-isolation paths must fail closed until a sandbox backend is available."
            ),
        )

    def execute(self, request: NodeExecutionRequest) -> NodeExecutionResult:
        if request.node.get("type") == "sandbox_code":
            if request.execution_policy.execution_class == "subprocess":
                return self._sandbox_code_adapter.execute(request)
            if request.execution_policy.execution_class in {"sandbox", "microvm"}:
                return self._remote_sandbox_adapter.execute(request)
            raise WorkflowExecutionError(
                "sandbox_code execution class "
                f"'{request.execution_policy.execution_class}' is unavailable "
                "without a registered sandbox backend."
            )
        if request.execution_policy.execution_class == "inline":
            return self._inline_adapter.execute(request)
        return self._fallback_adapters[request.execution_policy.execution_class].execute(request)
