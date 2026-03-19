from __future__ import annotations

from typing import Any

from app.services.sandbox_backends import SandboxBackendClient, SandboxBackendSelection

_STRONG_TOOL_EXECUTION_CLASSES = frozenset({"sandbox", "microvm"})


def is_strong_tool_execution_class(value: str | None) -> bool:
    return isinstance(value, str) and value.strip().lower() in _STRONG_TOOL_EXECUTION_CLASSES


def build_tool_execution_not_yet_isolated_reason(
    *,
    tool_id: str,
    execution_class: str,
    backend_selection: SandboxBackendSelection | None = None,
) -> str:
    normalized_execution_class = execution_class.strip().lower() or execution_class
    requested_execution_summary = f"Tool '{tool_id}' requests execution class '{normalized_execution_class}'. "
    backend_summary = ""
    if (
        backend_selection is not None
        and backend_selection.available
        and backend_selection.backend_id is not None
    ):
        backend_summary = (
            f"A compatible sandbox backend has already been selected "
            f"({backend_selection.backend_id}"
        )
        if backend_selection.executor_ref:
            backend_summary += f", {backend_selection.executor_ref}"
        backend_summary += "), but "

    return (
        requested_execution_summary
        + backend_summary
        + "7Flows does not yet "
        "implement sandbox-backed tool execution for native / compat tool paths. "
        "Current host / adapter invokers cannot honestly enforce this strong-isolation contract, "
        "so the path must fail closed until "
        "a sandbox tool runner is available."
    )


def describe_tool_execution_backend_selection(
    *,
    sandbox_backend_client: SandboxBackendClient,
    execution_class: str,
    profile: str | None = None,
    dependency_mode: str | None = None,
    builtin_package_set: str | None = None,
    network_policy: str | None = None,
    filesystem_policy: str | None = None,
    backend_extensions: dict[str, Any] | None = None,
) -> SandboxBackendSelection | None:
    normalized_execution_class = execution_class.strip().lower() if execution_class else ""
    if normalized_execution_class not in _STRONG_TOOL_EXECUTION_CLASSES:
        return None
    return sandbox_backend_client.describe_tool_execution_backend(
        execution_class=normalized_execution_class,
        profile=profile,
        dependency_mode=dependency_mode,
        builtin_package_set=builtin_package_set,
        network_policy=network_policy,
        filesystem_policy=filesystem_policy,
        backend_extensions=backend_extensions,
    )
