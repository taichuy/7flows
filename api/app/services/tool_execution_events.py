from __future__ import annotations

from app.services.runtime_types import RuntimeEvent, ToolExecutionResult


def _build_base_payload(
    *,
    node_id: str,
    tool_id: str,
    tool_name: str,
    trace_payload: dict[str, object],
) -> dict[str, object] | None:
    requested_execution_class = trace_payload.get("requested_execution_class")
    effective_execution_class = trace_payload.get("effective_execution_class")
    executor_ref = trace_payload.get("executor_ref")
    if not all(
        isinstance(value, str) and value.strip()
        for value in (
            requested_execution_class,
            effective_execution_class,
            executor_ref,
        )
    ):
        return None
    payload: dict[str, object] = {
        "node_id": node_id,
        "tool_id": tool_id,
        "tool_name": tool_name,
        "requested_execution_class": requested_execution_class,
        "effective_execution_class": effective_execution_class,
        "execution_source": trace_payload.get("execution_source"),
        "requested_execution_profile": trace_payload.get("requested_execution_profile"),
        "requested_execution_timeout_ms": trace_payload.get("requested_execution_timeout_ms"),
        "requested_network_policy": trace_payload.get("requested_network_policy"),
        "requested_filesystem_policy": trace_payload.get("requested_filesystem_policy"),
        "requested_dependency_mode": trace_payload.get("requested_dependency_mode"),
        "requested_builtin_package_set": trace_payload.get("requested_builtin_package_set"),
        "requested_dependency_ref": trace_payload.get("requested_dependency_ref"),
        "requested_backend_extensions": trace_payload.get("requested_backend_extensions"),
        "executor_ref": executor_ref,
    }
    sandbox_backend_id = trace_payload.get("sandbox_backend_id")
    if isinstance(sandbox_backend_id, str) and sandbox_backend_id.strip():
        payload["sandbox_backend_id"] = sandbox_backend_id

    sandbox_backend_executor_ref = trace_payload.get("sandbox_backend_executor_ref")
    if isinstance(sandbox_backend_executor_ref, str) and sandbox_backend_executor_ref.strip():
        payload["sandbox_backend_executor_ref"] = sandbox_backend_executor_ref

    return payload


def build_tool_execution_error_events(
    *,
    node_id: str,
    tool_id: str,
    tool_name: str,
    trace_payload: dict[str, object],
) -> list[RuntimeEvent]:
    base_payload = _build_base_payload(
        node_id=node_id,
        tool_id=tool_id,
        tool_name=tool_name,
        trace_payload=trace_payload,
    )
    if base_payload is None:
        return []

    events = [RuntimeEvent("tool.execution.dispatched", dict(base_payload))]

    blocked_reason = trace_payload.get("blocked_reason")
    if isinstance(blocked_reason, str) and blocked_reason.strip():
        events.append(
            RuntimeEvent(
                "tool.execution.blocked",
                {
                    **base_payload,
                    "reason": blocked_reason,
                },
            )
        )

    fallback_reason = trace_payload.get("fallback_reason")
    if isinstance(fallback_reason, str) and fallback_reason.strip():
        events.append(
            RuntimeEvent(
                "tool.execution.fallback",
                {
                    **base_payload,
                    "reason": fallback_reason,
                },
            )
        )

    return events


def build_tool_execution_events(
    *,
    node_id: str,
    tool_id: str,
    tool_name: str,
    tool_result: ToolExecutionResult,
) -> list[RuntimeEvent]:
    meta = dict(tool_result.meta or {})
    return build_tool_execution_error_events(
        node_id=node_id,
        tool_id=tool_id,
        tool_name=tool_name,
        trace_payload=meta,
    )
