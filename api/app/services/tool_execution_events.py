from __future__ import annotations

from app.services.runtime_types import RuntimeEvent, ToolExecutionResult


def build_tool_execution_events(
    *,
    node_id: str,
    tool_id: str,
    tool_name: str,
    tool_result: ToolExecutionResult,
) -> list[RuntimeEvent]:
    meta = dict(tool_result.meta or {})
    requested_execution_class = meta.get("requested_execution_class")
    effective_execution_class = meta.get("effective_execution_class")
    executor_ref = meta.get("executor_ref")
    if not all(
        isinstance(value, str) and value.strip()
        for value in (
            requested_execution_class,
            effective_execution_class,
            executor_ref,
        )
    ):
        return []

    base_payload = {
        "node_id": node_id,
        "tool_id": tool_id,
        "tool_name": tool_name,
        "requested_execution_class": requested_execution_class,
        "effective_execution_class": effective_execution_class,
        "execution_source": meta.get("execution_source"),
        "requested_execution_profile": meta.get("requested_execution_profile"),
        "requested_execution_timeout_ms": meta.get("requested_execution_timeout_ms"),
        "requested_network_policy": meta.get("requested_network_policy"),
        "requested_filesystem_policy": meta.get("requested_filesystem_policy"),
        "executor_ref": executor_ref,
    }
    events = [RuntimeEvent("tool.execution.dispatched", base_payload)]

    fallback_reason = meta.get("fallback_reason")
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
