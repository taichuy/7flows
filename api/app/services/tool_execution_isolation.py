from __future__ import annotations


_STRONG_TOOL_EXECUTION_CLASSES = frozenset({"sandbox", "microvm"})


def is_strong_tool_execution_class(value: str | None) -> bool:
    return isinstance(value, str) and value.strip().lower() in _STRONG_TOOL_EXECUTION_CLASSES


def build_tool_execution_not_yet_isolated_reason(
    *,
    tool_id: str,
    execution_class: str,
) -> str:
    normalized_execution_class = execution_class.strip().lower() or execution_class
    return (
        f"Tool '{tool_id}' requests execution class '{normalized_execution_class}', but 7Flows does not yet "
        "implement sandbox-backed tool execution for native / compat tool paths. Current host / adapter "
        "invokers cannot honestly enforce this strong-isolation contract, so the path must fail closed until "
        "a sandbox tool runner is available."
    )
