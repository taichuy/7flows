from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.schemas.workflow import WorkflowDefinitionDocument, WorkflowEdgeDefinition

_FAILURE_EDGE_CONDITIONS = {"error", "failed", "on_error"}
_SUCCESS_EDGE_CONDITIONS = {"success", "succeeded", "default"}


def validate_workflow_graph(
    document: WorkflowDefinitionDocument,
    *,
    context_access_model: type[Any],
    mcp_query_model: type[Any],
    branch_selector_model: type[Any],
) -> None:
    node_ids = [node.id for node in document.nodes]
    if len(set(node_ids)) != len(node_ids):
        raise ValueError("Workflow node ids must be unique.")

    variable_names = [variable.name for variable in document.variables]
    if len(set(variable_names)) != len(variable_names):
        raise ValueError("Workflow variable names must be unique.")

    publish_ids = [endpoint.id for endpoint in document.publish]
    if len(set(publish_ids)) != len(publish_ids):
        raise ValueError("Workflow published endpoint ids must be unique.")

    publish_names = [endpoint.name for endpoint in document.publish]
    if len(set(publish_names)) != len(publish_names):
        raise ValueError("Workflow published endpoint names must be unique.")

    publish_aliases = [endpoint.alias for endpoint in document.publish]
    if len(set(publish_aliases)) != len(publish_aliases):
        raise ValueError("Workflow published endpoint aliases must be unique.")

    publish_paths = [endpoint.path for endpoint in document.publish]
    if len(set(publish_paths)) != len(publish_paths):
        raise ValueError("Workflow published endpoint paths must be unique.")

    edge_ids = [edge.id for edge in document.edges]
    if len(set(edge_ids)) != len(edge_ids):
        raise ValueError("Workflow edge ids must be unique.")

    node_id_set = set(node_ids)
    trigger_count = sum(node.type == "trigger" for node in document.nodes)
    if trigger_count != 1:
        raise ValueError("Workflow definition must contain exactly one trigger node.")

    if not any(node.type == "output" for node in document.nodes):
        raise ValueError("Workflow definition must contain at least one output node.")

    _validate_node_context_access_and_queries(
        document,
        node_id_set=node_id_set,
        context_access_model=context_access_model,
        mcp_query_model=mcp_query_model,
    )
    incoming_by_target, outgoing_by_source = _validate_edge_references(
        document,
        node_id_set=node_id_set,
    )
    _validate_join_policies(document, incoming_by_target=incoming_by_target)
    _validate_outgoing_edge_conditions(
        document,
        outgoing_by_source=outgoing_by_source,
        branch_selector_model=branch_selector_model,
    )


def _validate_node_context_access_and_queries(
    document: WorkflowDefinitionDocument,
    *,
    node_id_set: set[str],
    context_access_model: type[Any],
    mcp_query_model: type[Any],
) -> None:
    for node in document.nodes:
        context_access = context_access_model.model_validate(
            node.config.get("contextAccess") or {}
        )
        authorized_node_ids = set(context_access.readableNodeIds)
        authorized_node_ids.update(
            artifact.nodeId for artifact in context_access.readableArtifacts
        )

        for readable_node_id in sorted(authorized_node_ids):
            if readable_node_id not in node_id_set:
                raise ValueError(
                    f"Node '{node.id}' contextAccess references missing node "
                    f"'{readable_node_id}'."
                )

        if node.type != "mcp_query":
            continue

        query = mcp_query_model.model_validate(node.config["query"])
        requested_source_ids = set(query.sourceNodeIds or [])
        for source_node_id in sorted(requested_source_ids):
            if source_node_id not in node_id_set:
                raise ValueError(
                    f"Node '{node.id}' query references missing source node "
                    f"'{source_node_id}'."
                )

        unauthorized_sources = sorted(requested_source_ids - authorized_node_ids)
        if unauthorized_sources:
            raise ValueError(
                f"Node '{node.id}' query references unauthorized source nodes: "
                f"{', '.join(unauthorized_sources)}."
            )

        if query.artifactTypes is None:
            continue

        authorized_artifacts: dict[str, set[str]] = {
            readable_node_id: {"json"}
            for readable_node_id in context_access.readableNodeIds
        }
        for artifact in context_access.readableArtifacts:
            authorized_artifacts.setdefault(artifact.nodeId, {"json"}).add(
                artifact.artifactType
            )

        artifact_source_ids = requested_source_ids or authorized_node_ids
        requested_artifact_types = set(query.artifactTypes)
        for source_node_id in sorted(artifact_source_ids):
            allowed_artifact_types = authorized_artifacts.get(source_node_id, {"json"})
            unauthorized_artifact_types = sorted(
                requested_artifact_types - allowed_artifact_types
            )
            if unauthorized_artifact_types:
                raise ValueError(
                    f"Node '{node.id}' query requests unauthorized artifact types "
                    f"from '{source_node_id}': "
                    f"{', '.join(unauthorized_artifact_types)}."
                )


def _validate_edge_references(
    document: WorkflowDefinitionDocument,
    *,
    node_id_set: set[str],
) -> tuple[dict[str, set[str]], dict[str, list[WorkflowEdgeDefinition]]]:
    incoming_by_target: dict[str, set[str]] = {}
    outgoing_by_source: dict[str, list[WorkflowEdgeDefinition]] = {}

    for edge in document.edges:
        if edge.sourceNodeId not in node_id_set:
            raise ValueError(
                f"Edge '{edge.id}' references missing source node '{edge.sourceNodeId}'."
            )
        if edge.targetNodeId not in node_id_set:
            raise ValueError(
                f"Edge '{edge.id}' references missing target node '{edge.targetNodeId}'."
            )
        if edge.sourceNodeId == edge.targetNodeId:
            raise ValueError(f"Edge '{edge.id}' cannot point to the same node on both ends.")

        incoming_by_target.setdefault(edge.targetNodeId, set()).add(edge.sourceNodeId)
        outgoing_by_source.setdefault(edge.sourceNodeId, []).append(edge)

    return incoming_by_target, outgoing_by_source


def _validate_join_policies(
    document: WorkflowDefinitionDocument,
    *,
    incoming_by_target: dict[str, set[str]],
) -> None:
    for node in document.nodes:
        join_policy = node.runtimePolicy.join if node.runtimePolicy is not None else None
        if join_policy is None:
            continue

        incoming_sources = incoming_by_target.get(node.id, set())
        if node.type == "trigger":
            raise ValueError("Trigger nodes cannot define runtimePolicy.join.")
        if not incoming_sources:
            raise ValueError(
                f"Node '{node.id}' defines runtimePolicy.join but has no incoming edges."
            )

        unknown_required_sources = sorted(set(join_policy.requiredNodeIds) - incoming_sources)
        if unknown_required_sources:
            raise ValueError(
                f"Node '{node.id}' join.requiredNodeIds references non-incoming sources: "
                f"{', '.join(unknown_required_sources)}."
            )


def _validate_outgoing_edge_conditions(
    document: WorkflowDefinitionDocument,
    *,
    outgoing_by_source: dict[str, list[WorkflowEdgeDefinition]],
    branch_selector_model: type[Any],
) -> None:
    for node in document.nodes:
        outgoing_edges = outgoing_by_source.get(node.id, [])
        if node.type in {"condition", "router"}:
            _validate_branch_node_outgoing_conditions(
                node,
                outgoing_edges=outgoing_edges,
                branch_selector_model=branch_selector_model,
            )
            continue

        for edge in outgoing_edges:
            normalized_condition = _normalize_edge_condition(edge.condition)
            if normalized_condition is None:
                continue
            if normalized_condition in _FAILURE_EDGE_CONDITIONS:
                continue
            if normalized_condition not in _SUCCESS_EDGE_CONDITIONS:
                raise ValueError(
                    f"Edge '{edge.id}' uses unsupported condition '{edge.condition}' "
                    f"for non-branch node '{node.id}'."
                )


def _validate_branch_node_outgoing_conditions(
    node: Any,
    *,
    outgoing_edges: list[WorkflowEdgeDefinition],
    branch_selector_model: type[Any],
) -> None:
    explicit_branch_conditions: list[str] = []
    fallback_edges = 0
    for edge in outgoing_edges:
        normalized_condition = _normalize_edge_condition(edge.condition)
        if normalized_condition is None:
            fallback_edges += 1
            continue
        if normalized_condition in _FAILURE_EDGE_CONDITIONS:
            continue
        explicit_branch_conditions.append(normalized_condition)

    if len(set(explicit_branch_conditions)) != len(explicit_branch_conditions):
        raise ValueError(f"Node '{node.id}' has duplicate outgoing branch conditions.")
    if fallback_edges > 1:
        raise ValueError(
            f"Node '{node.id}' may define at most one fallback outgoing edge."
        )

    selector = node.config.get("selector")
    expression = node.config.get("expression")
    if selector is not None:
        selector_model = branch_selector_model.model_validate(selector)
        allowed_branch_conditions = {
            rule.key.strip().lower() for rule in selector_model.rules
        }
        if selector_model.default is not None:
            allowed_branch_conditions.add(selector_model.default.strip().lower())
        else:
            allowed_branch_conditions.add("default")
        invalid_branch_conditions = sorted(
            condition
            for condition in explicit_branch_conditions
            if condition not in allowed_branch_conditions
        )
        if invalid_branch_conditions:
            raise ValueError(
                f"Node '{node.id}' has outgoing branch conditions not declared by "
                f"config.selector: {', '.join(invalid_branch_conditions)}."
            )
        return

    if expression is not None and node.type == "condition":
        allowed_branch_conditions = {"true", "false"}
        invalid_branch_conditions = sorted(
            condition
            for condition in explicit_branch_conditions
            if condition not in allowed_branch_conditions
        )
        if invalid_branch_conditions:
            raise ValueError(
                f"Condition node '{node.id}' expression may only target 'true'/'false' "
                "branch conditions."
            )


def _normalize_edge_condition(condition: str | None) -> str | None:
    if condition is None:
        return None
    normalized = condition.strip().lower()
    return normalized or None
