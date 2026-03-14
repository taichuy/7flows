from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.models.run import NodeRun
from app.services.artifact_store import RuntimeArtifactStore
from app.services.context_service import ContextService
from app.services.runtime_execution_policy import ResolvedExecutionPolicy
from app.services.runtime_sandbox_code import HostSandboxCodeExecutor
from app.services.runtime_types import AuthorizedContextRefs, NodeExecutionResult, RuntimeEvent


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
        events = [
            RuntimeEvent(
                "node.execution.dispatched",
                {
                    "node_id": request.node.get("id"),
                    "node_type": request.node.get("type"),
                    "requested_execution_class": request.execution_policy.execution_class,
                    "executor_ref": self.adapter_ref,
                },
            )
        ]
        if request.execution_policy.execution_class in {"inline", "sandbox", "microvm"}:
            events.append(
                RuntimeEvent(
                    "node.execution.fallback",
                    {
                        "node_id": request.node.get("id"),
                        "node_type": request.node.get("type"),
                        "requested_execution_class": request.execution_policy.execution_class,
                        "effective_execution_class": "subprocess",
                        "executor_ref": self.adapter_ref,
                        "reason": "host_subprocess_adapter_is_current_mvp_path",
                    },
                )
            )

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


class RuntimeExecutionAdapterRegistry:
    def __init__(
        self,
        *,
        artifact_store: RuntimeArtifactStore,
        context_service: ContextService,
        sandbox_code_executor: HostSandboxCodeExecutor | None = None,
    ) -> None:
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

    def execute(self, request: NodeExecutionRequest) -> NodeExecutionResult:
        if request.node.get("type") == "sandbox_code":
            return self._sandbox_code_adapter.execute(request)
        if request.execution_policy.execution_class == "inline":
            return self._inline_adapter.execute(request)
        return self._fallback_adapters[request.execution_policy.execution_class].execute(request)
