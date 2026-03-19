from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from app.schemas.plugin import PluginToolItem
from app.services.plugin_runtime import CompatibilityAdapterRegistration
from app.services.runtime_execution_policy import (
    resolve_execution_policy,
    resolve_sandbox_code_dependency_contract,
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

_DEPENDENCY_MODES = {"builtin", "dependency_ref", "backend_managed"}


@dataclass(frozen=True)
class WorkflowToolExecutionValidationIssue:
    message: str
    path: str | None = None
    field: str | None = None


def collect_invalid_workflow_tool_execution_references(
    definition: dict[str, Any] | None,
    *,
    tool_index: Mapping[str, PluginToolItem] | None,
    adapters: Sequence[CompatibilityAdapterRegistration] | None,
    sandbox_backend_client: SandboxBackendClient | None = None,
) -> list[WorkflowToolExecutionValidationIssue]:
    if tool_index is None or not isinstance(definition, dict):
        return []

    nodes = definition.get("nodes")
    if not isinstance(nodes, list):
        return []

    issues: list[WorkflowToolExecutionValidationIssue] = []
    adapter_list = list(adapters or ())
    backend_client = sandbox_backend_client or get_sandbox_backend_client()
    for node_index, node in enumerate(nodes):
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
                    node_index=node_index,
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
                    node_index=node_index,
                    node_label=node_label,
                    config=config,
                    tool_index=tool_index,
                    adapters=adapter_list,
                    sandbox_backend_client=backend_client,
                )
            )
            continue

        if node_type == "sandbox_code":
            issues.extend(
                _collect_sandbox_code_execution_issues(
                    node=node,
                    node_index=node_index,
                    node_label=node_label,
                    config=config,
                    sandbox_backend_client=backend_client,
                )
            )

    deduped_issues: list[WorkflowToolExecutionValidationIssue] = []
    for issue in issues:
        if not any(
            candidate.message == issue.message
            and candidate.path == issue.path
            and candidate.field == issue.field
            for candidate in deduped_issues
        ):
            deduped_issues.append(issue)
    return deduped_issues


def _collect_tool_node_execution_issues(
    *,
    node: dict[str, Any],
    node_index: int,
    node_label: str,
    config: dict[str, Any],
    tool_index: Mapping[str, PluginToolItem],
    adapters: Sequence[CompatibilityAdapterRegistration],
    sandbox_backend_client: SandboxBackendClient,
) -> list[WorkflowToolExecutionValidationIssue]:
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

    issues: list[WorkflowToolExecutionValidationIssue] = []
    binding_path = f"nodes.{node_index}.config.tool"
    if adapter_id is not None:
        adapter_issue = _validate_explicit_adapter_binding(
            tool_id=tool_id,
            ecosystem=ecosystem or tool.ecosystem,
            adapter_id=adapter_id,
            adapters=adapters,
            context=f"Tool node '{node_label}'",
            path=f"{binding_path}.adapterId",
            field="adapterId",
        )
        if adapter_issue is not None:
            issues.append(adapter_issue)
            return issues

    runtime_policy = node.get("runtimePolicy")
    requested_execution_class = _extract_explicit_execution_class(
        runtime_policy.get("execution") if isinstance(runtime_policy, dict) else None
    )
    if requested_execution_class is None:
        default_issue = _build_default_execution_support_issue(
            context=f"Tool node '{node_label}'",
            tool_id=tool_id,
            tool=tool,
            ecosystem=ecosystem,
            adapter_id=adapter_id,
            adapters=adapters,
            sandbox_backend_client=sandbox_backend_client,
            path=f"{binding_path}.toolId",
            field="toolId",
        )
        if default_issue is not None:
            issues.append(default_issue)
        return issues

    target_issue = _build_execution_support_issue(
        context=f"Tool node '{node_label}'",
        tool_id=tool_id,
        tool=tool,
        ecosystem=ecosystem,
        adapter_id=adapter_id,
        execution_payload=(
            runtime_policy.get("execution") if isinstance(runtime_policy, dict) else None
        ),
        requested_execution_class=requested_execution_class,
        adapters=adapters,
        sandbox_backend_client=sandbox_backend_client,
        path=f"nodes.{node_index}.runtimePolicy.execution",
        field="execution",
    )
    if target_issue is not None:
        issues.append(target_issue)
    return issues


def _collect_agent_execution_issues(
    *,
    node_index: int,
    node_label: str,
    config: dict[str, Any],
    tool_index: Mapping[str, PluginToolItem],
    adapters: Sequence[CompatibilityAdapterRegistration],
    sandbox_backend_client: SandboxBackendClient,
) -> list[WorkflowToolExecutionValidationIssue]:
    issues: list[WorkflowToolExecutionValidationIssue] = []
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
                    WorkflowToolExecutionValidationIssue(
                        message=(
                            f"LLM agent node '{node_label}' declares toolPolicy.execution class "
                            f"'{policy_execution_class}' without narrowing "
                            "toolPolicy.allowedToolIds, but the current workspace tool catalog "
                            "still contains execution-incompatible "
                            f"tools: {rendered_tool_ids}. Scope allowedToolIds to compatible "
                            "tools or "
                            "remove the explicit execution target."
                        ),
                        path=f"nodes.{node_index}.config.toolPolicy.execution",
                        field="execution",
                    )
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
                    default_issue = _build_default_execution_support_issue(
                        context=f"LLM agent node '{node_label}' toolPolicy.allowedToolIds",
                        tool_id=tool_id,
                        tool=tool,
                        ecosystem=tool.ecosystem,
                        adapter_id=None,
                        adapters=adapters,
                        sandbox_backend_client=sandbox_backend_client,
                        path=f"nodes.{node_index}.config.toolPolicy.allowedToolIds",
                        field="allowedToolIds",
                    )
                    if default_issue is not None:
                        issues.append(default_issue)
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
                    path=f"nodes.{node_index}.config.toolPolicy.execution",
                    field="execution",
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
                        path=f"nodes.{node_index}.config.mockPlan.toolCalls.{index - 1}.adapterId",
                        field="adapterId",
                    )
                    if adapter_issue is not None:
                        issues.append(adapter_issue)
                        continue

                requested_execution_class = _extract_explicit_execution_class(
                    raw_tool_call.get("execution")
                )
                if requested_execution_class is None:
                    default_issue = _build_default_execution_support_issue(
                        context=f"LLM agent node '{node_label}' mockPlan.toolCalls[{index}]",
                        tool_id=tool_id,
                        tool=tool,
                        ecosystem=ecosystem,
                        adapter_id=adapter_id,
                        adapters=adapters,
                        sandbox_backend_client=sandbox_backend_client,
                        path=f"nodes.{node_index}.config.mockPlan.toolCalls.{index - 1}.toolId",
                        field="toolId",
                    )
                    if default_issue is not None:
                        issues.append(default_issue)
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
                    path=f"nodes.{node_index}.config.mockPlan.toolCalls.{index - 1}.execution",
                    field="execution",
                )
                if target_issue is not None:
                    issues.append(target_issue)

    return issues


def _collect_sandbox_code_execution_issues(
    *,
    node: dict[str, Any],
    node_index: int,
    node_label: str,
    config: dict[str, Any],
    sandbox_backend_client: SandboxBackendClient,
) -> list[WorkflowToolExecutionValidationIssue]:
    execution_policy = resolve_execution_policy(node)
    execution_class = execution_policy.execution_class
    context = f"Sandbox code node '{node_label}'"
    path = f"nodes.{node_index}.runtimePolicy.execution"
    dependency_contract = resolve_sandbox_code_dependency_contract(
        config=config,
        execution_policy=execution_policy,
    )

    if execution_class == "subprocess":
        return []

    if execution_class == "inline":
        return [
            WorkflowToolExecutionValidationIssue(
                message=(
                    f"{context} cannot run with execution class 'inline'. Use explicit "
                    "'subprocess' for the current host-controlled MVP path, or register a "
                    "sandbox backend for "
                    "'sandbox' / 'microvm'."
                ),
                path=path,
                field="execution",
            )
        ]

    if execution_class not in {"sandbox", "microvm"}:
        return [
            WorkflowToolExecutionValidationIssue(
                message=(
                    f"{context} requests unsupported execution class '{execution_class}'. "
                    "Strong-isolation paths must fail closed until a compatible sandbox "
                    "backend is available."
                ),
                path=path,
                field="execution",
            )
        ]

    selection = sandbox_backend_client.describe_execution_backend(
        SandboxExecutionRequest(
            execution_class=execution_class,
            language=str(config.get("language") or "python").strip().lower() or "python",
            code=str(config.get("code") or ""),
            node_input={},
            trace_id=f"node:{node.get('id')}:definition-validation",
            profile=execution_policy.profile,
            dependency_mode=dependency_contract.dependency_mode,
            builtin_package_set=dependency_contract.builtin_package_set,
            dependency_ref=dependency_contract.dependency_ref,
            timeout_ms=execution_policy.timeout_ms,
            network_policy=execution_policy.network_policy,
            filesystem_policy=execution_policy.filesystem_policy,
            backend_extensions=dependency_contract.backend_extensions,
        )
    )
    if selection.available:
        return []

    backend_reason = selection.reason or "No compatible sandbox backend is currently available."
    return [
        WorkflowToolExecutionValidationIssue(
            message=(
                f"{context} requests execution class '{execution_class}', but no compatible "
                f"sandbox backend is currently available. {backend_reason}"
            ).strip(),
            path=path,
            field="execution",
        )
    ]


def _validate_explicit_adapter_binding(
    *,
    tool_id: str,
    ecosystem: str,
    adapter_id: str,
    adapters: Sequence[CompatibilityAdapterRegistration],
    context: str,
    path: str,
    field: str,
) -> WorkflowToolExecutionValidationIssue | None:
    adapter = next((item for item in adapters if item.id == adapter_id), None)
    if adapter is None:
        return WorkflowToolExecutionValidationIssue(
            message=(
                f"{context} binds tool '{tool_id}' to adapter '{adapter_id}', but that adapter "
                "is not registered for the current workspace."
            ),
            path=path,
            field=field,
        )
    if adapter.ecosystem != ecosystem:
        return WorkflowToolExecutionValidationIssue(
            message=(
                f"{context} binds tool '{tool_id}' to adapter '{adapter_id}', but the adapter "
                f"serves ecosystem '{adapter.ecosystem}' instead of '{ecosystem}'."
            ),
            path=path,
            field=field,
        )
    if not adapter.enabled:
        return WorkflowToolExecutionValidationIssue(
            message=(
                f"{context} binds tool '{tool_id}' to adapter '{adapter_id}', but that adapter "
                "is currently disabled."
            ),
            path=path,
            field=field,
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
    path: str,
    field: str,
) -> WorkflowToolExecutionValidationIssue | None:
    if tool.ecosystem == "native":
        supported_execution_classes = tuple(tool.supported_execution_classes or ("inline",))
        if requested_execution_class in supported_execution_classes:
            if is_strong_tool_execution_class(requested_execution_class):
                backend_issue = _build_sandbox_backend_issue(
                    context=context,
                    tool_id=tool_id,
                    requested_execution_class=requested_execution_class,
                    execution_payload=execution_payload,
                    sandbox_backend_client=sandbox_backend_client,
                    path=path,
                    field=field,
                )
                if backend_issue is not None:
                    return backend_issue
                runner_gap_reason = build_tool_execution_not_yet_isolated_reason(
                    tool_id=tool_id,
                    execution_class=requested_execution_class,
                )
                return WorkflowToolExecutionValidationIssue(
                    message=(
                        f"{context} explicitly requests execution class "
                        f"'{requested_execution_class}' for native tool '{tool_id}', "
                        f"but {runner_gap_reason}"
                    ),
                    path=path,
                    field=field,
                )
            return _build_sandbox_backend_issue(
                context=context,
                tool_id=tool_id,
                requested_execution_class=requested_execution_class,
                execution_payload=execution_payload,
                sandbox_backend_client=sandbox_backend_client,
                path=path,
                field=field,
            )
        supported_summary = ", ".join(supported_execution_classes)
        return WorkflowToolExecutionValidationIssue(
            message=(
                f"{context} explicitly requests execution class '{requested_execution_class}' for "
                f"native tool '{tool_id}', but this tool currently supports only "
                f"{supported_summary}."
            ),
            path=path,
            field=field,
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
        return WorkflowToolExecutionValidationIssue(
            message=(
                f"{context} explicitly requests execution class '{requested_execution_class}' for "
                f"tool '{tool_id}', but no enabled adapter is currently available for ecosystem "
                f"'{resolved_ecosystem}'."
            ),
            path=path,
            field=field,
        )

    supported_execution_classes = tuple(adapter.supported_execution_classes or ("subprocess",))
    if requested_execution_class in supported_execution_classes:
        if is_strong_tool_execution_class(requested_execution_class):
            backend_issue = _build_sandbox_backend_issue(
                context=context,
                tool_id=tool_id,
                requested_execution_class=requested_execution_class,
                execution_payload=execution_payload,
                sandbox_backend_client=sandbox_backend_client,
                path=path,
                field=field,
            )
            if backend_issue is not None:
                return backend_issue
            selection = describe_tool_execution_backend_selection(
                sandbox_backend_client=sandbox_backend_client,
                execution_class=requested_execution_class,
                profile=_normalize_optional_string(
                    execution_payload.get("profile")
                    if isinstance(execution_payload, dict)
                    else None
                ),
                dependency_mode=_normalize_optional_dependency_mode(
                    execution_payload.get("dependencyMode")
                    if isinstance(execution_payload, dict)
                    else None
                ),
                builtin_package_set=_normalize_optional_string(
                    execution_payload.get("builtinPackageSet")
                    if isinstance(execution_payload, dict)
                    else None
                ),
                network_policy=_normalize_optional_string(
                    execution_payload.get("networkPolicy")
                    if isinstance(execution_payload, dict)
                    else None
                ),
                filesystem_policy=_normalize_optional_string(
                    execution_payload.get("filesystemPolicy")
                    if isinstance(execution_payload, dict)
                    else None
                ),
                backend_extensions=_normalize_optional_object(
                    execution_payload.get("backendExtensions")
                    if isinstance(execution_payload, dict)
                    else None
                ),
            )
            if (
                selection is not None
                and selection.available
                and selection.capability.supports_tool_execution
            ):
                return None
            runner_gap_reason = build_tool_execution_not_yet_isolated_reason(
                tool_id=tool_id,
                execution_class=requested_execution_class,
                backend_selection=selection,
            )
            return WorkflowToolExecutionValidationIssue(
                message=(
                    f"{context} explicitly requests execution class "
                    f"'{requested_execution_class}' for tool '{tool_id}', but "
                    f"{runner_gap_reason}"
                ),
                path=path,
                field=field,
            )
        return _build_sandbox_backend_issue(
            context=context,
            tool_id=tool_id,
            requested_execution_class=requested_execution_class,
            execution_payload=execution_payload,
            sandbox_backend_client=sandbox_backend_client,
            path=path,
            field=field,
        )

    supported_summary = ", ".join(supported_execution_classes)
    return WorkflowToolExecutionValidationIssue(
        message=(
            f"{context} explicitly requests execution class '{requested_execution_class}' for "
            f"tool '{tool_id}', but adapter '{adapter.id}' currently supports only "
            f"{supported_summary}."
        ),
        path=path,
        field=field,
    )


def _build_default_execution_support_issue(
    *,
    context: str,
    tool_id: str,
    tool: PluginToolItem,
    ecosystem: str | None,
    adapter_id: str | None,
    adapters: Sequence[CompatibilityAdapterRegistration],
    sandbox_backend_client: SandboxBackendClient,
    path: str,
    field: str,
) -> WorkflowToolExecutionValidationIssue | None:
    default_execution_class = _normalize_default_strong_execution_class(
        tool.default_execution_class
    )
    if default_execution_class is None:
        return None

    if tool.ecosystem == "native":
        supported_execution_classes = tuple(tool.supported_execution_classes or ("inline",))
        if default_execution_class not in supported_execution_classes:
            supported_summary = ", ".join(supported_execution_classes)
            return WorkflowToolExecutionValidationIssue(
                message=(
                    f"{context} relies on native tool '{tool_id}' default execution class "
                    f"'{default_execution_class}', but this tool currently supports only "
                    f"{supported_summary}."
                ),
                path=path,
                field=field,
            )
        if is_strong_tool_execution_class(default_execution_class):
            backend_issue = _build_default_sandbox_backend_issue(
                context=context,
                tool_id=tool_id,
                default_execution_class=default_execution_class,
                sandbox_backend_client=sandbox_backend_client,
                path=path,
                field=field,
            )
            if backend_issue is not None:
                return backend_issue
            runner_gap_reason = build_tool_execution_not_yet_isolated_reason(
                tool_id=tool_id,
                execution_class=default_execution_class,
            )
            return WorkflowToolExecutionValidationIssue(
                message=(
                    f"{context} relies on native tool '{tool_id}' default execution class "
                    f"'{default_execution_class}', but {runner_gap_reason}"
                ),
                path=path,
                field=field,
            )
        backend_issue = _build_default_sandbox_backend_issue(
            context=context,
            tool_id=tool_id,
            default_execution_class=default_execution_class,
            sandbox_backend_client=sandbox_backend_client,
            path=path,
            field=field,
        )
        if backend_issue is not None:
            return backend_issue
        return None

    resolved_ecosystem = ecosystem or tool.ecosystem
    if resolved_ecosystem != tool.ecosystem:
        return None

    adapter = _resolve_adapter_for_execution(
        ecosystem=resolved_ecosystem,
        adapter_id=adapter_id,
        adapters=adapters,
    )
    if adapter is None:
        return WorkflowToolExecutionValidationIssue(
            message=(
                f"{context} relies on tool '{tool_id}' default execution class "
                f"'{default_execution_class}', but no enabled adapter is currently available for "
                f"ecosystem '{resolved_ecosystem}'."
            ),
            path=path,
            field=field,
        )

    supported_execution_classes = tuple(adapter.supported_execution_classes or ("subprocess",))
    if default_execution_class not in supported_execution_classes:
        supported_summary = ", ".join(supported_execution_classes)
        return WorkflowToolExecutionValidationIssue(
            message=(
                f"{context} relies on tool '{tool_id}' default execution class "
                f"'{default_execution_class}', but adapter '{adapter.id}' currently supports only "
                f"{supported_summary}."
            ),
            path=path,
            field=field,
        )

    if is_strong_tool_execution_class(default_execution_class):
        backend_issue = _build_default_sandbox_backend_issue(
            context=context,
            tool_id=tool_id,
            default_execution_class=default_execution_class,
            sandbox_backend_client=sandbox_backend_client,
            path=path,
            field=field,
        )
        if backend_issue is not None:
            return backend_issue
        selection = describe_tool_execution_backend_selection(
            sandbox_backend_client=sandbox_backend_client,
            execution_class=default_execution_class,
        )
        if (
            selection is not None
            and selection.available
            and selection.capability.supports_tool_execution
        ):
            return None
        runner_gap_reason = build_tool_execution_not_yet_isolated_reason(
            tool_id=tool_id,
            execution_class=default_execution_class,
            backend_selection=selection,
        )
        return WorkflowToolExecutionValidationIssue(
            message=(
                f"{context} relies on tool '{tool_id}' default execution class "
                f"'{default_execution_class}', but {runner_gap_reason}"
            ),
            path=path,
            field=field,
        )

    return _build_default_sandbox_backend_issue(
        context=context,
        tool_id=tool_id,
        default_execution_class=default_execution_class,
        sandbox_backend_client=sandbox_backend_client,
        path=path,
        field=field,
    )


def _build_sandbox_backend_issue(
    *,
    context: str,
    tool_id: str,
    requested_execution_class: str,
    execution_payload: Any,
    sandbox_backend_client: SandboxBackendClient,
    path: str,
    field: str,
) -> WorkflowToolExecutionValidationIssue | None:
    backend_reason = _describe_sandbox_backend_unavailable(
        requested_execution_class=requested_execution_class,
        execution_payload=execution_payload,
        sandbox_backend_client=sandbox_backend_client,
    )
    if backend_reason is None:
        return None
    return WorkflowToolExecutionValidationIssue(
        message=(
            f"{context} explicitly requests execution class '{requested_execution_class}' for "
            f"tool '{tool_id}', but no compatible sandbox backend is currently available. "
            f"{backend_reason}"
        ).strip(),
        path=path,
        field=field,
    )


def _build_default_sandbox_backend_issue(
    *,
    context: str,
    tool_id: str,
    default_execution_class: str,
    sandbox_backend_client: SandboxBackendClient,
    path: str,
    field: str,
) -> WorkflowToolExecutionValidationIssue | None:
    backend_reason = _describe_sandbox_backend_unavailable(
        requested_execution_class=default_execution_class,
        execution_payload=None,
        sandbox_backend_client=sandbox_backend_client,
    )
    if backend_reason is None:
        return None
    return WorkflowToolExecutionValidationIssue(
        message=(
            f"{context} relies on tool '{tool_id}' default execution class "
            f"'{default_execution_class}', but no compatible sandbox backend is currently "
            f"available. {backend_reason}"
        ).strip(),
        path=path,
        field=field,
    )


def _describe_sandbox_backend_unavailable(
    *,
    requested_execution_class: str,
    execution_payload: Any,
    sandbox_backend_client: SandboxBackendClient,
) -> str | None:
    if requested_execution_class not in {"sandbox", "microvm"}:
        return None

    execution = execution_payload if isinstance(execution_payload, dict) else {}
    dependency_mode = _normalize_optional_dependency_mode(execution.get("dependencyMode"))
    builtin_package_set = _normalize_optional_string(execution.get("builtinPackageSet"))
    if dependency_mode != "builtin":
        builtin_package_set = None
    backend_extensions = _normalize_optional_object(execution.get("backendExtensions"))
    selection = describe_tool_execution_backend_selection(
        sandbox_backend_client=sandbox_backend_client,
        execution_class=requested_execution_class,
        profile=_normalize_optional_string(execution.get("profile")),
        dependency_mode=dependency_mode,
        builtin_package_set=builtin_package_set,
        network_policy=_normalize_optional_string(execution.get("networkPolicy")),
        filesystem_policy=_normalize_optional_string(execution.get("filesystemPolicy")),
        backend_extensions=backend_extensions,
    )
    if selection is None or selection.available:
        return None
    return selection.reason or "No compatible sandbox backend is currently available."


def _normalize_default_strong_execution_class(value: Any) -> str | None:
    normalized = _normalize_optional_string(value)
    if normalized not in {"sandbox", "microvm"}:
        return None
    return normalized


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
            path="toolPolicy.execution",
            field="execution",
        )
        if issue is not None:
            incompatible_tool_ids.append(tool_id)
    return incompatible_tool_ids


def _normalize_optional_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_optional_dependency_mode(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    return normalized if normalized in _DEPENDENCY_MODES else None


def _normalize_optional_object(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    return value
