from __future__ import annotations

from collections import defaultdict, deque
from typing import Any

from app.models.workflow import Workflow, WorkflowVersion
from app.schemas.workflow import WorkflowDefinitionDocument
from app.services.runtime_types import CompiledEdge, CompiledNode, CompiledWorkflowBlueprint


class FlowCompiler:
    def compile_workflow(self, workflow: Workflow) -> CompiledWorkflowBlueprint:
        return self.compile_definition(
            workflow_id=workflow.id,
            workflow_version=workflow.version,
            definition=workflow.definition or {},
        )

    def compile_workflow_version(
        self,
        workflow_version: WorkflowVersion,
    ) -> CompiledWorkflowBlueprint:
        return self.compile_definition(
            workflow_id=workflow_version.workflow_id,
            workflow_version=workflow_version.version,
            definition=workflow_version.definition or {},
        )

    def compile_definition(
        self,
        *,
        workflow_id: str,
        workflow_version: str,
        definition: dict[str, Any],
    ) -> CompiledWorkflowBlueprint:
        document = WorkflowDefinitionDocument.model_validate(definition)
        normalized = document.model_dump(mode="python", exclude_none=True)
        ordered_nodes = self._topological_nodes(
            normalized.get("nodes", []),
            normalized.get("edges", []),
        )
        node_lookup = {
            node["id"]: CompiledNode(
                id=node["id"],
                type=node["type"],
                name=node["name"],
                config=dict(node.get("config") or {}),
                runtime_policy=dict(node.get("runtimePolicy") or {}),
                input_schema=(
                    dict(node["inputSchema"])
                    if isinstance(node.get("inputSchema"), dict)
                    else None
                ),
                output_schema=(
                    dict(node["outputSchema"])
                    if isinstance(node.get("outputSchema"), dict)
                    else None
                ),
            )
            for node in ordered_nodes
        }

        compiled_edges = [
            CompiledEdge(
                id=edge["id"],
                source_node_id=edge["sourceNodeId"],
                target_node_id=edge["targetNodeId"],
                channel=edge.get("channel", "control"),
                condition=edge.get("condition"),
                condition_expression=edge.get("conditionExpression"),
                mapping=tuple(dict(item) for item in (edge.get("mapping") or [])),
            )
            for edge in normalized.get("edges", [])
        ]
        incoming_nodes: dict[str, tuple[str, ...]] = defaultdict(tuple)
        outgoing_edges: dict[str, list[CompiledEdge]] = defaultdict(list)
        incoming_builder: dict[str, list[str]] = defaultdict(list)
        for edge in compiled_edges:
            incoming_builder[edge.target_node_id].append(edge.source_node_id)
            outgoing_edges[edge.source_node_id].append(edge)

        for node_id, source_ids in incoming_builder.items():
            incoming_nodes[node_id] = tuple(source_ids)

        workflow_variables = {
            str(variable["name"]): variable.get("default")
            for variable in normalized.get("variables", [])
            if str(variable.get("name", "")).strip()
        }
        trigger_node_id = next(
            node_id for node_id, node in node_lookup.items() if node.type == "trigger"
        )
        output_node_ids = tuple(
            node_id for node_id, node in node_lookup.items() if node.type == "output"
        )

        return CompiledWorkflowBlueprint(
            workflow_id=workflow_id,
            workflow_version=workflow_version,
            trigger_node_id=trigger_node_id,
            output_node_ids=output_node_ids,
            workflow_variables=workflow_variables,
            ordered_nodes=tuple(node_lookup[node["id"]] for node in ordered_nodes),
            node_lookup=node_lookup,
            incoming_nodes=dict(incoming_nodes),
            outgoing_edges={
                node_id: tuple(edges)
                for node_id, edges in outgoing_edges.items()
            },
        )

    def _topological_nodes(
        self,
        nodes: list[dict[str, Any]],
        edges: list[dict[str, Any]],
    ) -> list[dict]:
        node_lookup = {node["id"]: node for node in nodes}
        indegree = {node["id"]: 0 for node in nodes}
        adjacency: dict[str, list[str]] = defaultdict(list)

        for edge in edges:
            source = edge.get("sourceNodeId")
            target = edge.get("targetNodeId")
            if source not in node_lookup or target not in node_lookup:
                continue
            adjacency[source].append(target)
            indegree[target] += 1

        queue = deque(node_id for node_id, degree in indegree.items() if degree == 0)
        ordered_ids: list[str] = []

        while queue:
            node_id = queue.popleft()
            ordered_ids.append(node_id)
            for target in adjacency.get(node_id, []):
                indegree[target] -= 1
                if indegree[target] == 0:
                    queue.append(target)

        if len(ordered_ids) != len(nodes):
            raise ValueError(
                "Workflow contains a cycle or disconnected invalid edge configuration."
            )

        return [node_lookup[node_id] for node_id in ordered_ids]
