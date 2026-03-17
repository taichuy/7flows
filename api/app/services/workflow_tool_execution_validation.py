from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from app.schemas.plugin import PluginToolItem
from app.services.plugin_runtime import CompatibilityAdapterRegistration
from app.services.sandbox_backends import SandboxBackendClient, get_sandbox_backend_client


def collect_invalid_workflow_tool_execution_references(
    definition: dict[str, Any] | None,
    *,
    tool_index: Mapping[str, PluginToolItem] | None,
    adapters: Sequence[CompatibilityAdapterRegistration] | None,
    sandbox_backend_client: SandboxBackendClient | None = None,
) -> list[str]:
    if tool_index is None or not isinstance(definition, dict):
        return []

    nodes = definition.get("nodes")
    if not isinstance(nodes, list):
        return []

    issues: list[str] = []
    adapter_list = list(adapters or ())
    backend_client = sandbox_backend_client or get_sandbox_backend_client()
    for node in nodes:
        if not isinstance(node, dict):
            continue

        node_id = str(node.get("id") or "unknown-node")
        node_name = str(node.get("name") or node_id)
        node_label = f"{node_id}:{node_name}" if node_name != node_id else node_id
        node_type = str(node.get("type") or "")
        config = node.get("config")
        if not isinstance(config, dict):
            continue

        if node_type == "tool":
            issues.extend(
                _collect_tool_node_execution_issues(
                    node=node,
                    node_label=node_label,
                    config=config,
                    tool_index=tool_index,
                    adapters=adapter_list,
                    sandbox_backend_client=backend_client,
                )
            )
            continue

        if node_type == "llm_agent":
            issues.extend(
                _collect_agent_execution_issues(
                    node_label=node_label,
                    config=config,
                    tool_index=tool_index,
                    adapters=adapter_list,
                    sandbox_backend_client=backend_client,
                )
            )

    deduped_issues: list[str] = []
    for issue in issues:
        if issue not in deduped_issues:
            deduped_issues.append(issue)
    return deduped_issues


def _collect_tool_node_execution_issues(
    *,
    node: dict[str, Any],
    node_label: str,
    config: dict[str, Any],
    tool_index: Mapping[str, PluginToolItem],
    adapters: Sequence[CompatibilityAdapterRegistration],
    sandbox_backend_client: SandboxBackendClient,
) -> list[str]:
    binding = config.get("tool")
    tool_id: str | None = None
    ecosystem: str | None = None
    adapter_id: str | None = None

    if isinstance(binding, dict):
        tool_id = _normalize_optional_string(binding.get("toolId"))
        ecosystem = _normalize_optional_string(binding.get("ecosystem"))
        adapter_id = _normalize_optional_string(binding.get("adapterId"))
    else:
        tool_id = _normalize_optional_string(config.get("toolId"))

    if tool_id is None:
        return []

    tool = tool_index.get(tool_id)
    if tool is None:
        return []

    issues: list[str] = []
    if adapter_id is not None:
        adapter_issue = _validate_explicit_adapter_binding(
            tool_id=tool_id,
            ecosystem=ecosystem or tool.ecosystem,
            adapter_id=adapter_id,
            adapters=adapters,
            context=f"Tool node '{node_label}'",
        )
        if adapter_issue is not None:
            issues.append(adapter_issue)
            return issues

    runtime_policy = node.get("runtimePolicy")
    requested_execution_class = _extract_explicit_execution_class(
        runtime_policy.get("execution") if isinstance(runtime_policy, dict) else None
    )
    if requested_execution_class is None:
        return issues

    target_issue = _build_execution_support_issue(
        context=f"Tool node '{node_label}'",
        tool_id=tool_id,
        tool=tool,
        ecosystem=ecosystem,
        adapter_id=adapter_id,
        execution_payload=(runtime_policy.get("execution") if isinstance(runtime_policy, dict) else None),
        requested_execution_class=requested_execution_class,
        adapters=adapters,
        sandbox_backend_client=sandbox_backend_client,
    )
    if target_issue is not None:
        issues.append(target_issue)
    return issues


def _collect_agent_execution_issues(
    *,
    node_label: str,
    config: dict[str, Any],
    tool_index: Mapping[str, PluginToolItem],
    adapters: Sequence[CompatibilityAdapterRegistration],
    sandbox_backend_client: SandboxBackendClient,
) -> list[str]:
    issues: list[str] = []
    tool_policy = config.get("toolPolicy")
    mock_plan = config.get("mockPlan")

    if isinstance(tool_policy, dict):
        policy_execution_class = _extract_explicit_execution_class(
            tool_policy.get("execution")
        )
        allowed_tool_ids = tool_policy.get("allowedToolIds")
        normalized_allowed_tool_ids = _normalize_tool_id_list(allowed_tool_ids)
        if policy_execution_class is not None and not normalized_allowed_tool_ids:
            incompatible_tool_ids = _collect_execution_incompatible_tool_ids(
                tool_index=tool_index,
                requested_execution_class=policy_execution_class,
                execution_payload=tool_policy.get("execution"),
                adapters=adapters,
                sandbox_backend_client=sandbox_backend_client,
            )
            if incompatible_tool_ids:
                rendered_tool_ids = ", ".join(incompatible_tool_ids)
                issues.append(
                    f"LLM agent node '{node_label}' declares toolPolicy.execution class "
                    f"'{policy_execution_class}' without narrowing toolPolicy.allowedToolIds, "
                    "but the current workspace tool catalog still contains execution-incompatible "
                    f"tools: {rendered_tool_ids}. Scope allowedToolIds to compatible tools or "
                    "remove the explicit execution target."
                )
        if normalized_allowed_tool_ids:
            seen_tool_ids: set[str] = set()
            for tool_id in normalized_allowed_tool_ids:
                if tool_id in seen_tool_ids:
                    continue
                seen_tool_ids.add(tool_id)
                tool = tool_index.get(tool_id)
                if tool is None:
                    continue
                if policy_execution_class is None:
                    continue
                target_issue = _build_execution_support_issue(
                    context=f"LLM agent node '{node_label}' toolPolicy.allowedToolIds",
                    tool_id=tool_id,
                    tool=tool,
                    ecosystem=tool.ecosystem,
                    adapter_id=None,
                    execution_payload=tool_policy.get("execution"),
                    requested_execution_class=policy_execution_class,
                    adapters=adapters,
                    sandbox_backend_client=sandbox_backend_client,
                )
                if target_issue is not None:
                    issues.append(target_issue)

    if isinstance(mock_plan, dict):
        raw_tool_calls = mock_plan.get("toolCalls")
        if isinstance(raw_tool_calls, list):
            for index, raw_tool_call in enumerate(raw_tool_calls, start=1):
                if not isinstance(raw_tool_call, dict):
                    continue
                tool_id = _normalize_optional_string(raw_tool_call.get("toolId"))
                if tool_id is None:
                    continue
                tool = tool_index.get(tool_id)
                if tool is None:
                    continue
                ecosystem = _normalize_optional_string(raw_tool_call.get("ecosystem"))
                adapter_id = _normalize_optional_string(raw_tool_call.get("adapterId"))
                if adapter_id is not None:
                    adapter_issue = _validate_explicit_adapter_binding(
                        tool_id=tool_id,
                        ecosystem=ecosystem or tool.ecosystem,
                        adapter_id=adapter_id,
                        adapters=adapters,
                        context=(
                            f"LLM agent node '{node_label}' mockPlan.toolCalls[{index}]"
                        ),
                    )
                    if adapter_issue is not None:
                        issues.append(adapter_issue)
                        continue

                requested_execution_class = _extract_explicit_execution_class(
                    raw_tool_call.get("execution")
                )
                if requested_execution_class is None:
                    continue
                target_issue = _build_execution_support_issue(
                    context=f"LLM agent node '{node_label}' mockPlan.toolCalls[{index}]",
                    tool_id=tool_id,
                    tool=tool,
                    ecosystem=ecosystem,
                    adapter_id=adapter_id,
                    execution_payload=raw_tool_call.get("execution"),
                    requested_execution_class=requested_execution_class,
                    adapters=adapters,
                    sandbox_backend_client=sandbox_backend_client,
                )
                if target_issue is not None:
                    issues.append(target_issue)

    return issues


def _validate_explicit_adapter_binding(
    *,
    tool_id: str,
    ecosystem: str,
    adapter_id: str,
    adapters: Sequence[CompatibilityAdapterRegistration],
    context: str,
) -> str | None:
    adapter = next((item for item in adapters if item.id == adapter_id), None)
    if adapter is None:
        return (
            f"{context} binds tool '{tool_id}' to adapter '{adapter_id}', but that adapter "
            "is not registered for the current workspace."
        )
    if adapter.ecosystem != ecosystem:
        return (
            f"{context} binds tool '{tool_id}' to adapter '{adapter_id}', but the adapter "
            f"serves ecosystem '{adapter.ecosystem}' instead of '{ecosystem}'."
        )
    if not adapter.enabled:
        return (
            f"{context} binds tool '{tool_id}' to adapter '{adapter_id}', but that adapter "
            "is currently disabled."
        )
    return None


def _build_execution_support_issue(
    *,
    context: str,
    tool_id: str,
    tool: PluginToolItem,
    ecosystem: str | None,
    adapter_id: str | None,
    execution_payload: Any,
    requested_execution_class: str,
    adapters: Sequence[CompatibilityAdapterRegistration],
    sandbox_backend_client: SandboxBackendClient,
) -> str | None:
    if tool.ecosystem == "native":
        if requested_execution_class == "inline":
            return None
        return (
            f"{context} explicitly requests execution class '{requested_execution_class}' for "
            f"native tool '{tool_id}', but native tools currently support only 'inline'."
        )

    resolved_ecosystem = ecosystem or tool.ecosystem
    if resolved_ecosystem != tool.ecosystem:
        return None

    adapter = _resolve_adapter_for_execution(
        ecosystem=resolved_ecosystem,
        adapter_id=adapter_id,
        adapters=adapters,
    )
    if adapter is None:
        return (
            f"{context} explicitly requests execution class '{requested_execution_class}' for "
            f"tool '{tool_id}', but no enabled adapter is currently available for ecosystem "
            f"'{resolved_ecosystem}'."
        )

    supported_execution_classes = tuple(adapter.supported_execution_classes or ("subprocess",))
    if requested_execution_class in supported_execution_classes:
        return _build_sandbox_backend_issue(
            context=context,
            tool_id=tool_id,
            requested_execution_class=requested_execution_class,
            execution_payload=execution_payload,
            sandbox_backend_client=sandbox_backend_client,
        )

    supported_summary = ", ".join(supported_execution_classes)
    return (
        f"{context} explicitly requests execution class '{requested_execution_class}' for "
        f"tool '{tool_id}', but adapter '{adapter.id}' currently supports only "
        f"{supported_summary}."
    )


def _build_sandbox_backend_issue(
    *,
    context: str,
    tool_id: str,
    requested_execution_class: str,
    execution_payload: Any,
    sandbox_backend_client: SandboxBackendClient,
) -> str | None:
    if requested_execution_class not in {"sandbox", "microvm"}:
        return None

    execution = execution_payload if isinstance(execution_payload, dict) else {}
    selection = sandbox_backend_client.describe_tool_execution_backend(
        execution_class=requested_execution_class,
        profile=_normalize_optional_string(execution.get("profile")),
        network_policy=_normalize_optional_string(execution.get("networkPolicy")),
        filesystem_policy=_normalize_optional_string(execution.get("filesystemPolicy")),
    )
    if selection.available:
        return None
    return (
        f"{context} explicitly requests execution class '{requested_execution_class}' for "
        f"tool '{tool_id}', but no compatible sandbox backend is currently available. "
        f"{selection.reason or ''}".strip()
    )


def _resolve_adapter_for_execution(
    *,
    ecosystem: str,
    adapter_id: str | None,
    adapters: Sequence[CompatibilityAdapterRegistration],
) -> CompatibilityAdapterRegistration | None:
    if adapter_id is not None:
        for adapter in adapters:
            if adapter.id == adapter_id:
                return adapter if adapter.enabled and adapter.ecosystem == ecosystem else None
        return None

    for adapter in adapters:
        if adapter.ecosystem == ecosystem and adapter.enabled:
            return adapter
    return None


def _extract_explicit_execution_class(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None
    return _normalize_optional_string(value.get("class"))


def _normalize_tool_id_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []

    normalized: list[str] = []
    seen: set[str] = set()
    for item in value:
        tool_id = _normalize_optional_string(item)
        if tool_id is None or tool_id in seen:
            continue
        normalized.append(tool_id)
        seen.add(tool_id)
    return normalized


def _collect_execution_incompatible_tool_ids(
    *,
    tool_index: Mapping[str, PluginToolItem],
    requested_execution_class: str,
    execution_payload: Any,
    adapters: Sequence[CompatibilityAdapterRegistration],
    sandbox_backend_client: SandboxBackendClient,
) -> list[str]:
    incompatible_tool_ids: list[str] = []
    for tool_id, tool in sorted(tool_index.items()):
        if not tool.callable:
            continue
        issue = _build_execution_support_issue(
            context="LLM agent toolPolicy.execution",
            tool_id=tool_id,
            tool=tool,
            ecosystem=tool.ecosystem,
            adapter_id=None,
            execution_payload=execution_payload,
            requested_execution_class=requested_execution_class,
            adapters=adapters,
            sandbox_backend_client=sandbox_backend_client,
        )
        if issue is not None:
            incompatible_tool_ids.append(tool_id)
    return incompatible_tool_ids


def _normalize_optional_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None
