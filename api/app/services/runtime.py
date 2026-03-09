from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import NodeRun, Run, RunEvent
from app.models.workflow import Workflow


class WorkflowExecutionError(RuntimeError):
    pass


@dataclass
class ExecutionArtifacts:
    run: Run
    node_runs: list[NodeRun]
    events: list[RunEvent]


def _utcnow() -> datetime:
    return datetime.now(UTC)


class RuntimeService:
    def execute_workflow(
        self,
        db: Session,
        workflow: Workflow,
        input_payload: dict,
    ) -> ExecutionArtifacts:
        definition = workflow.definition or {}
        nodes = definition.get("nodes", [])
        edges = definition.get("edges", [])

        if not nodes:
            raise WorkflowExecutionError("Workflow definition has no nodes.")

        if any(node.get("type") == "loop" for node in nodes):
            raise WorkflowExecutionError("Loop nodes are not supported by the MVP executor yet.")

        ordered_nodes = self._topological_nodes(nodes, edges)
        node_lookup = {node["id"]: node for node in ordered_nodes}
        incoming_nodes = self._incoming_nodes(edges)
        outgoing_edges = self._outgoing_edges(edges)
        activated_by: dict[str, set[str]] = defaultdict(set)
        data_inputs: dict[str, dict] = defaultdict(dict)

        run = Run(
            id=str(uuid4()),
            workflow_id=workflow.id,
            workflow_version=workflow.version,
            status="running",
            input_payload=input_payload,
            started_at=_utcnow(),
        )
        db.add(run)
        db.flush()

        events: list[RunEvent] = []
        node_runs: list[NodeRun] = []
        outputs: dict[str, dict] = {}
        completed_output_nodes: set[str] = set()
        active_node_run: NodeRun | None = None

        events.append(self._build_event(run.id, None, "run.started", {"input": input_payload}))

        try:
            for node in ordered_nodes:
                node_id = node["id"]
                node_input = self._build_node_input(
                    node=node,
                    input_payload=input_payload,
                    accumulated=data_inputs.get(node_id, {}),
                    activated_by=activated_by.get(node_id, set()),
                )
                if not self._should_execute_node(
                    node,
                    incoming_nodes.get(node_id, []),
                    activated_by,
                ):
                    skipped_node_run = self._build_skipped_node_run(node, run.id, node_input)
                    db.add(skipped_node_run)
                    db.flush()
                    node_runs.append(skipped_node_run)
                    events.append(
                        self._build_event(
                            run.id,
                            skipped_node_run.id,
                            "node.skipped",
                            {
                                "node_id": node_id,
                                "reason": "No active incoming branch reached this node.",
                            },
                        )
                    )
                    continue

                node_run = NodeRun(
                    id=str(uuid4()),
                    run_id=run.id,
                    node_id=node_id,
                    node_name=node.get("name", node_id),
                    node_type=node.get("type", "unknown"),
                    status="running",
                    input_payload=node_input,
                    started_at=_utcnow(),
                )
                db.add(node_run)
                db.flush()
                node_runs.append(node_run)
                active_node_run = node_run
                events.append(
                    self._build_event(
                        run.id,
                        node_run.id,
                        "node.started",
                        {"node_id": node_id, "node_type": node_run.node_type},
                    )
                )

                try:
                    node_output = self._execute_node(node, node_input)
                except Exception as exc:
                    node_error = str(exc)
                    node_run.status = "failed"
                    node_run.error_message = node_error
                    node_run.finished_at = _utcnow()
                    active_node_run = None
                    failure_output = self._build_failure_output(node, node_error)
                    outputs[node_id] = failure_output
                    events.append(
                        self._build_event(
                            run.id,
                            node_run.id,
                            "node.failed",
                            {"node_id": node_id, "error": node_error},
                        )
                    )
                    activated_targets = self._activate_downstream_edges(
                        source_node=node,
                        source_output=failure_output,
                        outcome="failed",
                        outgoing_edges=outgoing_edges.get(node_id, []),
                        node_lookup=node_lookup,
                        activated_by=activated_by,
                        data_inputs=data_inputs,
                    )
                    if not activated_targets:
                        raise WorkflowExecutionError(node_error) from exc
                    continue

                node_run.output_payload = node_output
                node_run.status = "succeeded"
                node_run.finished_at = _utcnow()
                active_node_run = None
                outputs[node_id] = node_output
                if node.get("type") == "output":
                    completed_output_nodes.add(node_id)
                events.append(
                    self._build_event(
                        run.id,
                        node_run.id,
                        "node.output.completed",
                        {"node_id": node_id, "output": node_output},
                    )
                )

                self._activate_downstream_edges(
                    source_node=node,
                    source_output=node_output,
                    outcome="succeeded",
                    outgoing_edges=outgoing_edges.get(node_id, []),
                    node_lookup=node_lookup,
                    activated_by=activated_by,
                    data_inputs=data_inputs,
                )

            if not completed_output_nodes:
                raise WorkflowExecutionError(
                    "Workflow completed without producing a reachable output node."
                )

            run.status = "succeeded"
            run.output_payload = self._resolve_run_output(
                ordered_nodes,
                outputs,
                completed_output_nodes,
            )
            run.finished_at = _utcnow()
            events.append(
                self._build_event(
                    run.id,
                    None,
                    "run.completed",
                    {"output": run.output_payload},
                )
            )
        except WorkflowExecutionError as exc:
            if active_node_run is not None and active_node_run.status == "running":
                active_node_run.status = "failed"
                active_node_run.error_message = str(exc)
                active_node_run.finished_at = _utcnow()
                events.append(
                    self._build_event(
                        run.id,
                        active_node_run.id,
                        "node.failed",
                        {"node_id": active_node_run.node_id, "error": str(exc)},
                    )
                )
            run.status = "failed"
            run.error_message = str(exc)
            run.finished_at = _utcnow()
            events.append(
                self._build_event(run.id, None, "run.failed", {"error": str(exc)})
            )
        except Exception as exc:
            if active_node_run is not None and active_node_run.status == "running":
                active_node_run.status = "failed"
                active_node_run.error_message = str(exc)
                active_node_run.finished_at = _utcnow()
                events.append(
                    self._build_event(
                        run.id,
                        active_node_run.id,
                        "node.failed",
                        {"node_id": active_node_run.node_id, "error": str(exc)},
                    )
                )
            run.status = "failed"
            run.error_message = str(exc)
            run.finished_at = _utcnow()
            events.append(
                self._build_event(run.id, None, "run.failed", {"error": str(exc)})
            )
            raise
        finally:
            for event in events:
                db.add(event)
            db.commit()
            db.refresh(run)
            for node_run in node_runs:
                db.refresh(node_run)

        if run.status != "succeeded":
            raise WorkflowExecutionError(run.error_message or "Workflow execution failed.")

        persisted_events = db.scalars(
            select(RunEvent).where(RunEvent.run_id == run.id).order_by(RunEvent.id.asc())
        ).all()
        return ExecutionArtifacts(run=run, node_runs=node_runs, events=persisted_events)

    def load_run(self, db: Session, run_id: str) -> ExecutionArtifacts | None:
        run = db.get(Run, run_id)
        if run is None:
            return None
        node_runs = db.scalars(
            select(NodeRun).where(NodeRun.run_id == run_id).order_by(NodeRun.created_at.asc())
        ).all()
        events = db.scalars(
            select(RunEvent).where(RunEvent.run_id == run_id).order_by(RunEvent.id.asc())
        ).all()
        return ExecutionArtifacts(run=run, node_runs=node_runs, events=events)

    def list_workflow_runs(self, db: Session, workflow_id: str) -> list[Run]:
        return db.scalars(
            select(Run).where(Run.workflow_id == workflow_id).order_by(Run.created_at.desc())
        ).all()

    def _execute_node(self, node: dict, node_input: dict) -> dict:
        config = node.get("config", {})
        if "mock_error" in config:
            raise WorkflowExecutionError(str(config["mock_error"]))
        if "mock_output" in config:
            mock_output = config["mock_output"]
            return mock_output if isinstance(mock_output, dict) else {"value": mock_output}

        node_type = node.get("type")
        if node_type == "trigger":
            return node_input.get("trigger_input", {})
        if node_type == "output":
            return node_input.get("upstream", {})
        if node_type in {"condition", "router"}:
            return {
                "selected": config.get("selected", "default"),
                "received": node_input,
            }
        return {
            "node_id": node.get("id"),
            "node_type": node_type,
            "received": node_input,
        }

    def _resolve_run_output(
        self,
        nodes: list[dict],
        outputs: dict[str, dict],
        completed_output_nodes: set[str],
    ) -> dict:
        for node in reversed(nodes):
            if node.get("type") == "output" and node["id"] in completed_output_nodes:
                return outputs.get(node["id"], {})
        return outputs.get(nodes[-1]["id"], {})

    def _topological_nodes(self, nodes: list[dict], edges: list[dict]) -> list[dict]:
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
            raise WorkflowExecutionError(
                "Workflow contains a cycle or disconnected invalid edge configuration."
            )

        return [node_lookup[node_id] for node_id in ordered_ids]

    def _incoming_nodes(self, edges: list[dict]) -> dict[str, list[str]]:
        incoming: dict[str, list[str]] = defaultdict(list)
        for edge in edges:
            source = edge.get("sourceNodeId")
            target = edge.get("targetNodeId")
            if source and target:
                incoming[target].append(source)
        return incoming

    def _outgoing_edges(self, edges: list[dict]) -> dict[str, list[dict]]:
        outgoing: dict[str, list[dict]] = defaultdict(list)
        for edge in edges:
            source = edge.get("sourceNodeId")
            if source:
                outgoing[source].append(edge)
        return outgoing

    def _should_execute_node(
        self,
        node: dict,
        incoming: list[str],
        activated_by: dict[str, set[str]],
    ) -> bool:
        if node.get("type") == "trigger":
            return True
        if not incoming:
            return False
        return bool(activated_by.get(node["id"]))

    def _build_node_input(
        self,
        node: dict,
        input_payload: dict,
        accumulated: dict,
        activated_by: set[str],
    ) -> dict:
        return {
            "trigger_input": input_payload,
            "upstream": accumulated,
            "accumulated": accumulated,
            "activated_by": sorted(activated_by),
            "config": node.get("config", {}),
        }

    def _build_skipped_node_run(self, node: dict, run_id: str, node_input: dict) -> NodeRun:
        timestamp = _utcnow()
        return NodeRun(
            id=str(uuid4()),
            run_id=run_id,
            node_id=node["id"],
            node_name=node.get("name", node["id"]),
            node_type=node.get("type", "unknown"),
            status="skipped",
            input_payload=node_input,
            started_at=timestamp,
            finished_at=timestamp,
        )

    def _build_failure_output(self, node: dict, error: str) -> dict:
        return {
            "error": {
                "node_id": node.get("id"),
                "node_type": node.get("type"),
                "message": error,
            }
        }

    def _activate_downstream_edges(
        self,
        source_node: dict,
        source_output: dict,
        outcome: str,
        outgoing_edges: list[dict],
        node_lookup: dict[str, dict],
        activated_by: dict[str, set[str]],
        data_inputs: dict[str, dict],
    ) -> list[str]:
        activated_targets: list[str] = []
        for edge in outgoing_edges:
            if not self._should_activate_edge(
                source_node,
                source_output,
                outcome,
                edge,
                outgoing_edges,
            ):
                continue
            target_id = edge.get("targetNodeId")
            if not target_id or target_id not in node_lookup:
                continue
            activated_by[target_id].add(source_node["id"])
            data_inputs[target_id][source_node["id"]] = source_output
            activated_targets.append(target_id)
        return activated_targets

    def _should_activate_edge(
        self,
        source_node: dict,
        source_output: dict,
        outcome: str,
        edge: dict,
        sibling_edges: list[dict],
    ) -> bool:
        condition = self._normalize_branch_value(edge.get("condition"))
        if outcome == "failed":
            return condition in {"error", "failed", "on_error"}

        if source_node.get("type") in {"condition", "router"}:
            selected = self._normalize_branch_value(source_output.get("selected"))
            has_branch_conditions = any(
                self._normalize_branch_value(candidate.get("condition")) is not None
                for candidate in sibling_edges
            )
            if selected is None:
                return not has_branch_conditions and condition is None

            if condition == selected:
                return True

            has_explicit_match = any(
                self._normalize_branch_value(candidate.get("condition")) == selected
                for candidate in sibling_edges
            )
            return condition is None and not has_explicit_match

        return condition in {None, "success", "succeeded", "default"}

    def _normalize_branch_value(self, value: object) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip().lower()
        return normalized or None

    def _build_event(
        self,
        run_id: str,
        node_run_id: str | None,
        event_type: str,
        payload: dict,
    ) -> RunEvent:
        return RunEvent(
            run_id=run_id,
            node_run_id=node_run_id,
            event_type=event_type,
            payload=payload,
        )
