from __future__ import annotations

import time
from collections import defaultdict, deque
from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.safe_expressions import (
    BRANCH_EXPRESSION_NAMES,
    EDGE_EXPRESSION_NAMES,
    MISSING,
    SafeExpressionError,
    evaluate_expression,
)
from app.models.run import NodeRun, Run, RunEvent
from app.models.workflow import Workflow
from app.services.plugin_runtime import (
    PluginCallProxy,
    PluginCallRequest,
    get_plugin_registry,
    get_plugin_call_proxy,
)


class WorkflowExecutionError(RuntimeError):
    pass


@dataclass
class ExecutionArtifacts:
    run: Run
    node_runs: list[NodeRun]
    events: list[RunEvent]


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int = 1
    backoff_seconds: float = 0.0
    backoff_multiplier: float = 1.0


@dataclass(frozen=True)
class AuthorizedContextRefs:
    current_node_id: str
    readable_node_ids: tuple[str, ...] = ()
    readable_artifacts: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True)
class JoinPolicy:
    mode: str = "any"
    required_node_ids: tuple[str, ...] = ()
    on_unmet: str = "skip"
    merge_strategy: str = "error"


@dataclass(frozen=True)
class JoinDecision:
    should_execute: bool
    mode: str
    on_unmet: str
    merge_strategy: str
    expected_source_ids: tuple[str, ...]
    activated_source_ids: tuple[str, ...]
    missing_source_ids: tuple[str, ...]
    reason: str | None = None
    block_on_unmet: bool = False


def _utcnow() -> datetime:
    return datetime.now(UTC)


class RuntimeService:
    def __init__(self, plugin_call_proxy: PluginCallProxy | None = None) -> None:
        self._uses_default_plugin_proxy = plugin_call_proxy is None
        self._plugin_call_proxy = plugin_call_proxy or get_plugin_call_proxy()

    def execute_workflow(
        self,
        db: Session,
        workflow: Workflow,
        input_payload: dict,
    ) -> ExecutionArtifacts:
        if self._uses_default_plugin_proxy:
            from app.services.plugin_registry_store import get_plugin_registry_store

            registry = get_plugin_registry()
            get_plugin_registry_store().hydrate_registry(db, registry)
            self._plugin_call_proxy = PluginCallProxy(registry)

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
        upstream_inputs: dict[str, dict] = defaultdict(dict)
        mapped_inputs: dict[str, dict] = defaultdict(dict)

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
                retry_policy = self._retry_policy_for_node(node)
                upstream_input = upstream_inputs.get(node_id, {})
                mapped_input = mapped_inputs.get(node_id, {})
                accumulated_input = self._accumulated_input_for_node(
                    upstream=upstream_input,
                    mapped=mapped_input,
                )
                activation_sources = activated_by.get(node_id, set())
                authorized_context = self._authorized_context_for_node(node)
                join_decision = self._join_decision_for_node(
                    node=node,
                    incoming=incoming_nodes.get(node_id, []),
                    activated_sources=activation_sources,
                )
                node_input = self._build_node_input(
                    node=node,
                    input_payload=input_payload,
                    upstream=upstream_input,
                    mapped=mapped_input,
                    accumulated=accumulated_input,
                    activated_by=activation_sources,
                    authorized_context=authorized_context,
                    join_decision=join_decision,
                    attempt_number=1,
                    max_attempts=retry_policy.max_attempts,
                )
                if not join_decision.should_execute:
                    if len(join_decision.expected_source_ids) > 1:
                        events.append(
                            self._build_event(
                                run.id,
                                None,
                                "node.join.unmet",
                                self._build_join_event_payload(node, join_decision),
                            )
                        )
                    if join_decision.block_on_unmet:
                        blocked_node_run = self._build_blocked_node_run(
                            node=node,
                            run_id=run.id,
                            node_input=node_input,
                            reason=join_decision.reason or "Join requirements were not met.",
                        )
                        db.add(blocked_node_run)
                        db.flush()
                        node_runs.append(blocked_node_run)
                        raise WorkflowExecutionError(
                            blocked_node_run.error_message or "Join blocked."
                        )

                    skipped_node_run = self._build_skipped_node_run(
                        node,
                        run.id,
                        node_input,
                        reason=(
                            join_decision.reason
                            or "No active incoming branch reached this node."
                        ),
                    )
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
                                "reason": skipped_node_run.error_message,
                            },
                        )
                    )
                    continue

                if len(join_decision.expected_source_ids) > 1 and join_decision.mode == "all":
                    events.append(
                        self._build_event(
                            run.id,
                            None,
                            "node.join.ready",
                            self._build_join_event_payload(node, join_decision),
                        )
                    )

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
                    node_output = self._execute_node_with_retry(
                        node=node,
                        node_run=node_run,
                        run_id=run.id,
                        input_payload=input_payload,
                        upstream=upstream_input,
                        mapped=mapped_input,
                        accumulated=accumulated_input,
                        activated_by=activation_sources,
                        authorized_context=authorized_context,
                        join_decision=join_decision,
                        outputs=outputs,
                        retry_policy=retry_policy,
                        events=events,
                    )
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
                        upstream_inputs=upstream_inputs,
                        mapped_inputs=mapped_inputs,
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
                    upstream_inputs=upstream_inputs,
                    mapped_inputs=mapped_inputs,
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

    def _execute_node_with_retry(
        self,
        node: dict,
        node_run: NodeRun,
        run_id: str,
        input_payload: dict,
        upstream: dict,
        mapped: dict,
        accumulated: dict,
        activated_by: set[str],
        authorized_context: AuthorizedContextRefs,
        join_decision: JoinDecision,
        outputs: dict[str, dict],
        retry_policy: RetryPolicy,
        events: list[RunEvent],
    ) -> dict:
        last_error: Exception | None = None

        for attempt_number in range(1, retry_policy.max_attempts + 1):
            node_run.input_payload = self._build_node_input(
                node=node,
                input_payload=input_payload,
                upstream=upstream,
                mapped=mapped,
                accumulated=accumulated,
                activated_by=activated_by,
                authorized_context=authorized_context,
                join_decision=join_decision,
                attempt_number=attempt_number,
                max_attempts=retry_policy.max_attempts,
            )
            node_run.status = "retrying" if attempt_number > 1 else "running"

            try:
                node_output = self._execute_node(
                    node=node,
                    node_input=node_run.input_payload,
                    run_id=run_id,
                    attempt_number=attempt_number,
                    authorized_context=authorized_context,
                    outputs=outputs,
                )
                if node.get("type") == "mcp_query":
                    events.append(
                        self._build_event(
                            run_id,
                            node_run.id,
                            "node.context.read",
                            self._build_context_read_payload(node, node_output),
                        )
                    )
                return node_output
            except Exception as exc:
                last_error = exc
                if attempt_number >= retry_policy.max_attempts:
                    raise

                delay_seconds = self._retry_delay_seconds(retry_policy, attempt_number)
                events.append(
                    self._build_event(
                        run_id,
                        node_run.id,
                        "node.retrying",
                        {
                            "node_id": node["id"],
                            "attempt": attempt_number,
                            "max_attempts": retry_policy.max_attempts,
                            "error": str(exc),
                            "next_retry_in_seconds": delay_seconds,
                        },
                    )
                )
                if delay_seconds > 0:
                    time.sleep(delay_seconds)

        if last_error is None:
            raise WorkflowExecutionError(f"Node '{node['id']}' exhausted retries without error.")
        raise last_error

    def _execute_node(
        self,
        node: dict,
        node_input: dict,
        run_id: str,
        attempt_number: int,
        authorized_context: AuthorizedContextRefs,
        outputs: dict[str, dict],
    ) -> dict:
        config = node.get("config", {})
        mock_error_sequence = config.get("mock_error_sequence")
        if isinstance(mock_error_sequence, list):
            attempt_index = attempt_number - 1
            if attempt_index < len(mock_error_sequence):
                attempt_error = mock_error_sequence[attempt_index]
                if attempt_error:
                    raise WorkflowExecutionError(str(attempt_error))
        if "mock_error" in config:
            raise WorkflowExecutionError(str(config["mock_error"]))
        if "mock_output" in config:
            mock_output = config["mock_output"]
            return mock_output if isinstance(mock_output, dict) else {"value": mock_output}

        node_type = node.get("type")
        if node_type == "trigger":
            return node_input.get("trigger_input", {})
        if node_type == "output":
            return node_input.get("accumulated", {})
        if node_type == "tool":
            if self._node_has_tool_binding(node):
                return self._execute_tool_node(node, node_input, run_id)
            return {
                "node_id": node.get("id"),
                "node_type": node_type,
                "received": node_input,
            }
        if node_type == "mcp_query":
            return self._execute_mcp_query_node(node, authorized_context, outputs)
        if node_type in {"condition", "router"}:
            return self._execute_branch_node(node, node_input)
        return {
            "node_id": node.get("id"),
            "node_type": node_type,
            "received": node_input,
        }

    def _execute_tool_node(self, node: dict, node_input: dict, run_id: str) -> dict:
        config = node.get("config", {})
        tool_ref = self._tool_ref_for_node(node)
        request = PluginCallRequest(
            tool_id=tool_ref["toolId"],
            ecosystem=str(tool_ref.get("ecosystem") or "native"),
            adapter_id=tool_ref.get("adapterId"),
            inputs=self._tool_inputs_for_node(config, node_input),
            credentials={
                str(key): str(value)
                for key, value in (tool_ref.get("credentials") or {}).items()
            },
            timeout_ms=int(tool_ref.get("timeoutMs") or get_settings().plugin_default_timeout_ms),
            trace_id=f"run:{run_id}:node:{node['id']}",
        )
        response = self._plugin_call_proxy.invoke(request)
        return response.output

    def _node_has_tool_binding(self, node: dict) -> bool:
        config = node.get("config", {})
        return isinstance(config.get("tool"), dict) or bool(config.get("toolId"))

    def _tool_ref_for_node(self, node: dict) -> dict:
        config = node.get("config", {})
        if isinstance(config.get("tool"), dict):
            tool_ref = dict(config["tool"])
        elif config.get("toolId"):
            tool_ref = {"toolId": config["toolId"]}
        else:
            raise WorkflowExecutionError(
                f"Tool node '{node['id']}' must define config.tool.toolId or config.toolId."
            )

        tool_id = str(tool_ref.get("toolId", "")).strip()
        if not tool_id:
            raise WorkflowExecutionError(
                f"Tool node '{node['id']}' must define a non-empty toolId binding."
            )

        tool_ref["toolId"] = tool_id
        return tool_ref

    def _tool_inputs_for_node(self, config: dict, node_input: dict) -> dict:
        configured_inputs = config.get("inputs")
        if isinstance(configured_inputs, dict):
            return deepcopy(configured_inputs)
        for key in ("accumulated", "mapped", "upstream", "trigger_input"):
            candidate = node_input.get(key)
            if isinstance(candidate, dict) and candidate:
                return deepcopy(candidate)
        return {}

    def _execute_branch_node(self, node: dict, node_input: dict) -> dict:
        config = node.get("config", {})
        selector = config.get("selector")
        if isinstance(selector, dict):
            selected, matched_rule, default_used = self._select_branch_from_rules(
                selector,
                node_input,
            )
            return {
                "selected": selected,
                "received": node_input,
                "selector": {
                    "matchedRule": matched_rule,
                    "defaultUsed": default_used,
                },
            }

        expression = config.get("expression")
        if isinstance(expression, str):
            selected, expression_value, default_used = self._select_branch_from_expression(
                node,
                node_input,
            )
            return {
                "selected": selected,
                "received": node_input,
                "expression": {
                    "source": expression,
                    "value": expression_value,
                    "defaultUsed": default_used,
                },
            }

        return {
            "selected": config.get("selected", "default"),
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

    def _build_node_input(
        self,
        node: dict,
        input_payload: dict,
        upstream: dict,
        mapped: dict,
        accumulated: dict,
        activated_by: set[str],
        authorized_context: AuthorizedContextRefs,
        join_decision: JoinDecision,
        attempt_number: int,
        max_attempts: int,
    ) -> dict:
        node_input = {
            "trigger_input": input_payload,
            "upstream": upstream,
            "accumulated": accumulated,
            "mapped": mapped,
            "activated_by": sorted(activated_by),
            "authorized_context": {
                "currentNodeId": authorized_context.current_node_id,
                "readableNodeIds": list(authorized_context.readable_node_ids),
                "readableArtifacts": [
                    {"nodeId": node_id, "artifactType": artifact_type}
                    for node_id, artifact_type in authorized_context.readable_artifacts
                ],
            },
            "attempt": {
                "current": attempt_number,
                "max": max_attempts,
            },
            "join": {
                "mode": join_decision.mode,
                "onUnmet": join_decision.on_unmet,
                "mergeStrategy": join_decision.merge_strategy,
                "expectedSourceIds": list(join_decision.expected_source_ids),
                "activatedSourceIds": list(join_decision.activated_source_ids),
                "missingSourceIds": list(join_decision.missing_source_ids),
            },
            "config": node.get("config", {}),
        }
        if mapped:
            return self._overlay_mapped_input(node_input, mapped)
        return node_input

    def _build_skipped_node_run(
        self,
        node: dict,
        run_id: str,
        node_input: dict,
        reason: str,
    ) -> NodeRun:
        timestamp = _utcnow()
        return NodeRun(
            id=str(uuid4()),
            run_id=run_id,
            node_id=node["id"],
            node_name=node.get("name", node["id"]),
            node_type=node.get("type", "unknown"),
            status="skipped",
            input_payload=node_input,
            error_message=reason,
            started_at=timestamp,
            finished_at=timestamp,
        )

    def _build_blocked_node_run(
        self,
        node: dict,
        run_id: str,
        node_input: dict,
        reason: str,
    ) -> NodeRun:
        timestamp = _utcnow()
        return NodeRun(
            id=str(uuid4()),
            run_id=run_id,
            node_id=node["id"],
            node_name=node.get("name", node["id"]),
            node_type=node.get("type", "unknown"),
            status="blocked",
            input_payload=node_input,
            error_message=reason,
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
        upstream_inputs: dict[str, dict],
        mapped_inputs: dict[str, dict],
    ) -> list[str]:
        activated_targets: list[str] = []
        for edge in outgoing_edges:
            target_id = edge.get("targetNodeId")
            if not target_id or target_id not in node_lookup:
                continue
            if not self._should_activate_edge(
                source_node,
                source_output,
                outcome,
                edge,
                node_lookup[target_id],
                outgoing_edges,
            ):
                continue
            activated_by[target_id].add(source_node["id"])
            upstream_inputs[target_id][source_node["id"]] = source_output
            self._apply_edge_mappings(
                edge=edge,
                source_node=source_node,
                target_node=node_lookup[target_id],
                source_output=source_output,
                mapped_input=mapped_inputs[target_id],
            )
            activated_targets.append(target_id)
        return activated_targets

    def _should_activate_edge(
        self,
        source_node: dict,
        source_output: dict,
        outcome: str,
        edge: dict,
        target_node: dict,
        sibling_edges: list[dict],
    ) -> bool:
        condition = self._normalize_branch_value(edge.get("condition"))
        if outcome == "failed":
            if condition not in {"error", "failed", "on_error"}:
                return False
            return self._edge_expression_matches(
                source_node=source_node,
                target_node=target_node,
                source_output=source_output,
                outcome=outcome,
                edge=edge,
            )

        if source_node.get("type") in {"condition", "router"}:
            selected = self._normalize_branch_value(source_output.get("selected"))
            has_branch_conditions = any(
                self._normalize_branch_value(candidate.get("condition")) is not None
                for candidate in sibling_edges
            )
            if selected is None:
                matches_branch = not has_branch_conditions and condition is None
                if not matches_branch:
                    return False
                return self._edge_expression_matches(
                    source_node=source_node,
                    target_node=target_node,
                    source_output=source_output,
                    outcome=outcome,
                    edge=edge,
                )

            if condition == selected:
                return self._edge_expression_matches(
                    source_node=source_node,
                    target_node=target_node,
                    source_output=source_output,
                    outcome=outcome,
                    edge=edge,
                )

            has_explicit_match = any(
                self._normalize_branch_value(candidate.get("condition")) == selected
                for candidate in sibling_edges
            )
            if condition is not None or has_explicit_match:
                return False
            return self._edge_expression_matches(
                source_node=source_node,
                target_node=target_node,
                source_output=source_output,
                outcome=outcome,
                edge=edge,
            )

        if condition not in {None, "success", "succeeded", "default"}:
            return False
        return self._edge_expression_matches(
            source_node=source_node,
            target_node=target_node,
            source_output=source_output,
            outcome=outcome,
            edge=edge,
        )

    def _normalize_branch_value(self, value: object) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip().lower()
        return normalized or None

    def _select_branch_from_rules(
        self,
        selector: dict,
        node_input: dict,
    ) -> tuple[str | None, dict | None, bool]:
        for rule in selector.get("rules", []):
            if self._selector_rule_matches(rule, node_input):
                return rule["key"], rule, False

        default_branch = selector.get("default")
        if default_branch is not None:
            return str(default_branch), None, True

        return "default", None, True

    def _select_branch_from_expression(
        self,
        node: dict,
        node_input: dict,
    ) -> tuple[str, object, bool]:
        expression = str(node.get("config", {}).get("expression"))
        try:
            expression_value = evaluate_expression(
                expression,
                context=self._branch_expression_context(node_input),
                allowed_names=BRANCH_EXPRESSION_NAMES,
                description=f"Node '{node['id']}' config.expression",
            )
        except SafeExpressionError as exc:
            raise WorkflowExecutionError(str(exc)) from exc

        if node.get("type") == "condition":
            selected = "true" if bool(expression_value) else "false"
            return selected, expression_value, False

        selected = self._stringify_branch_key(expression_value)
        if selected is not None:
            return selected, expression_value, False

        return self._default_branch_key(node), expression_value, True

    def _selector_rule_matches(self, rule: dict, node_input: dict) -> bool:
        actual_value = self._resolve_selector_path(node_input, str(rule["path"]))
        operator = rule.get("operator", "eq")
        expected_value = rule.get("value")

        if operator == "exists":
            return actual_value is not MISSING
        if operator == "not_exists":
            return actual_value is MISSING
        if actual_value is MISSING:
            return False
        if operator == "eq":
            return actual_value == expected_value
        if operator == "ne":
            return actual_value != expected_value
        if operator == "gt":
            return self._compare_selector_values(actual_value, expected_value, lambda a, b: a > b)
        if operator == "gte":
            return self._compare_selector_values(actual_value, expected_value, lambda a, b: a >= b)
        if operator == "lt":
            return self._compare_selector_values(actual_value, expected_value, lambda a, b: a < b)
        if operator == "lte":
            return self._compare_selector_values(actual_value, expected_value, lambda a, b: a <= b)
        if operator == "in":
            return isinstance(expected_value, list | tuple | set) and actual_value in expected_value
        if operator == "not_in":
            return isinstance(
                expected_value,
                list | tuple | set,
            ) and actual_value not in expected_value
        if operator == "contains":
            try:
                return expected_value in actual_value
            except TypeError:
                return False
        raise WorkflowExecutionError(f"Unsupported branch selector operator '{operator}'.")

    def _compare_selector_values(
        self,
        actual_value: object,
        expected_value: object,
        comparator,
    ) -> bool:
        try:
            return bool(comparator(actual_value, expected_value))
        except TypeError:
            return False

    def _resolve_selector_path(self, payload: object, path: str) -> object:
        current_value = payload
        for token in self._selector_path_tokens(path):
            if isinstance(current_value, dict):
                if token not in current_value:
                    return MISSING
                current_value = current_value[token]
                continue
            if isinstance(current_value, list):
                if not token.isdigit():
                    return MISSING
                index = int(token)
                if index < 0 or index >= len(current_value):
                    return MISSING
                current_value = current_value[index]
                continue
            return MISSING
        return current_value

    def _selector_path_tokens(self, path: str) -> list[str]:
        normalized_path = path.replace("[", ".").replace("]", "")
        return [segment for segment in normalized_path.split(".") if segment]

    def _authorized_context_for_node(self, node: dict) -> AuthorizedContextRefs:
        config = node.get("config", {})
        context_access = config.get("contextAccess") or {}
        readable_node_ids = {
            str(node_id)
            for node_id in context_access.get("readableNodeIds", [])
            if str(node_id).strip()
        }
        readable_artifacts: set[tuple[str, str]] = set()

        for node_id in readable_node_ids:
            readable_artifacts.add((node_id, "json"))

        for artifact in context_access.get("readableArtifacts", []):
            artifact_node_id = str(artifact.get("nodeId", "")).strip()
            artifact_type = str(artifact.get("artifactType", "")).strip()
            if not artifact_node_id or not artifact_type:
                continue
            readable_node_ids.add(artifact_node_id)
            readable_artifacts.add((artifact_node_id, artifact_type))

        return AuthorizedContextRefs(
            current_node_id=node["id"],
            readable_node_ids=tuple(sorted(readable_node_ids)),
            readable_artifacts=tuple(sorted(readable_artifacts)),
        )

    def _execute_mcp_query_node(
        self,
        node: dict,
        authorized_context: AuthorizedContextRefs,
        outputs: dict[str, dict],
    ) -> dict:
        query = node.get("config", {}).get("query") or {}
        query_type = query.get("type")
        if query_type != "authorized_context":
            raise WorkflowExecutionError(
                f"Node '{node['id']}' uses unsupported MCP query type '{query_type}'."
            )

        authorized_artifacts = self._authorized_artifact_lookup(authorized_context)
        requested_source_ids = [
            str(source_node_id)
            for source_node_id in (
                query.get("sourceNodeIds") or authorized_context.readable_node_ids
            )
        ]
        unauthorized_sources = sorted(
            source_node_id
            for source_node_id in requested_source_ids
            if source_node_id not in authorized_artifacts
        )
        if unauthorized_sources:
            raise WorkflowExecutionError(
                f"Node '{node['id']}' requested unauthorized context sources: "
                f"{', '.join(unauthorized_sources)}."
            )

        requested_artifact_types = {
            str(artifact_type)
            for artifact_type in (query.get("artifactTypes") or ["json"])
        }

        results: list[dict] = []
        for source_node_id in requested_source_ids:
            allowed_artifact_types = authorized_artifacts.get(source_node_id, set())
            unauthorized_artifact_types = sorted(requested_artifact_types - allowed_artifact_types)
            if unauthorized_artifact_types:
                raise WorkflowExecutionError(
                    f"Node '{node['id']}' requested unauthorized artifact types from "
                    f"'{source_node_id}': {', '.join(unauthorized_artifact_types)}."
                )

            if "json" in requested_artifact_types and source_node_id in outputs:
                results.append(
                    {
                        "nodeId": source_node_id,
                        "artifactType": "json",
                        "content": outputs[source_node_id],
                    }
                )

        return {
            "query": {
                "type": query_type,
                "sourceNodeIds": requested_source_ids,
                "artifactTypes": sorted(requested_artifact_types),
            },
            "results": results,
        }

    def _authorized_artifact_lookup(
        self,
        authorized_context: AuthorizedContextRefs,
    ) -> dict[str, set[str]]:
        artifact_lookup: dict[str, set[str]] = defaultdict(set)
        for node_id in authorized_context.readable_node_ids:
            artifact_lookup[node_id].add("json")
        for node_id, artifact_type in authorized_context.readable_artifacts:
            artifact_lookup[node_id].add(artifact_type)
        return artifact_lookup

    def _retry_policy_for_node(self, node: dict) -> RetryPolicy:
        runtime_policy = node.get("runtimePolicy") or {}
        retry_config = runtime_policy.get("retry")
        if retry_config is None and any(
            key in runtime_policy for key in ("maxAttempts", "backoffSeconds", "backoffMultiplier")
        ):
            retry_config = runtime_policy
        if retry_config is None:
            return RetryPolicy()

        max_attempts = int(retry_config.get("maxAttempts", 1))
        backoff_seconds = float(retry_config.get("backoffSeconds", 0.0))
        backoff_multiplier = float(retry_config.get("backoffMultiplier", 1.0))

        if max_attempts < 1:
            raise WorkflowExecutionError(
                f"Node '{node['id']}' retry policy must use maxAttempts >= 1."
            )
        if backoff_seconds < 0:
            raise WorkflowExecutionError(
                f"Node '{node['id']}' retry policy must use backoffSeconds >= 0."
            )
        if backoff_multiplier < 1:
            raise WorkflowExecutionError(
                f"Node '{node['id']}' retry policy must use backoffMultiplier >= 1."
            )

        return RetryPolicy(
            max_attempts=max_attempts,
            backoff_seconds=backoff_seconds,
            backoff_multiplier=backoff_multiplier,
        )

    def _retry_delay_seconds(self, retry_policy: RetryPolicy, failed_attempt_number: int) -> float:
        if retry_policy.backoff_seconds <= 0:
            return 0.0
        multiplier = retry_policy.backoff_multiplier ** (failed_attempt_number - 1)
        return retry_policy.backoff_seconds * multiplier

    def _accumulated_input_for_node(self, upstream: dict, mapped: dict) -> dict:
        if mapped:
            return deepcopy(mapped)
        return deepcopy(upstream)

    def _overlay_mapped_input(self, node_input: dict, mapped: dict) -> dict:
        merged_input = deepcopy(node_input)
        return self._deep_merge_dicts(merged_input, mapped)

    def _deep_merge_dicts(self, base: dict, override: dict) -> dict:
        for key, value in override.items():
            if isinstance(base.get(key), dict) and isinstance(value, dict):
                self._deep_merge_dicts(base[key], value)
                continue
            base[key] = deepcopy(value)
        return base

    def _apply_edge_mappings(
        self,
        edge: dict,
        source_node: dict,
        target_node: dict,
        source_output: dict,
        mapped_input: dict,
    ) -> None:
        mappings = edge.get("mapping") or []
        if not mappings:
            return

        merge_strategy = self._join_policy_for_node(target_node).merge_strategy
        for mapping in mappings:
            source_value = self._resolve_mapping_source_value(source_output, mapping)
            if source_value is MISSING:
                continue
            transformed_value = self._transform_mapping_value(source_value, mapping)
            self._merge_mapping_target_value(
                mapped_input=mapped_input,
                target_field=str(mapping["targetField"]),
                value=transformed_value,
                merge_strategy=merge_strategy,
                edge=edge,
                target_node=target_node,
            )

    def _resolve_mapping_source_value(self, source_output: dict, mapping: dict) -> object:
        source_field = str(mapping["sourceField"])
        normalized_source_field = (
            source_field[7:] if source_field.startswith("output.") else source_field
        )
        source_value = self._resolve_selector_path(source_output, normalized_source_field)
        if source_value is not MISSING:
            return source_value
        if "fallback" in mapping:
            return mapping.get("fallback")
        return MISSING

    def _transform_mapping_value(self, value: object, mapping: dict) -> object:
        transform = mapping.get("transform") or {"type": "identity"}
        transform_type = str(transform.get("type", "identity"))
        if transform_type == "identity":
            transformed = value
        elif transform_type == "toString":
            transformed = "" if value is None else str(value)
        elif transform_type == "toNumber":
            transformed = self._to_mapping_number(value)
        elif transform_type == "toBoolean":
            transformed = self._to_mapping_boolean(value)
        else:
            raise WorkflowExecutionError(
                f"Unsupported field mapping transform '{transform_type}'."
            )

        template = mapping.get("template")
        if isinstance(template, str):
            return template.replace("{{value}}", self._stringify_template_value(transformed))
        return transformed

    def _to_mapping_number(self, value: object) -> int | float:
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int | float):
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                raise WorkflowExecutionError("Cannot convert empty string to number.")
            try:
                return int(normalized) if normalized.isdigit() else float(normalized)
            except ValueError as exc:
                raise WorkflowExecutionError(
                    f"Cannot convert mapping value '{value}' to number."
                ) from exc
        raise WorkflowExecutionError(f"Cannot convert mapping value '{value}' to number.")

    def _to_mapping_boolean(self, value: object) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, int | float):
            return bool(value)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1", "yes", "on"}:
                return True
            if normalized in {"false", "0", "no", "off", ""}:
                return False
        return bool(value)

    def _stringify_template_value(self, value: object) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        return str(value)

    def _merge_mapping_target_value(
        self,
        mapped_input: dict,
        target_field: str,
        value: object,
        merge_strategy: str,
        edge: dict,
        target_node: dict,
    ) -> None:
        target_tokens = self._target_path_tokens(target_field)
        current = mapped_input
        for token in target_tokens[:-1]:
            current = current.setdefault(token, {})
            if not isinstance(current, dict):
                raise WorkflowExecutionError(
                    f"Field mapping target '{target_field}' conflicts with an "
                    "existing scalar value."
                )

        leaf_key = target_tokens[-1]
        if leaf_key not in current:
            if merge_strategy == "append":
                current[leaf_key] = [deepcopy(value)]
            else:
                current[leaf_key] = deepcopy(value)
            return

        existing_value = current[leaf_key]
        if merge_strategy == "error":
            raise WorkflowExecutionError(
                f"Node '{target_node['id']}' received conflicting field mapping for "
                f"'{target_field}' from edge '{edge.get('id', '<unknown>')}'."
            )
        if merge_strategy == "overwrite":
            current[leaf_key] = deepcopy(value)
            return
        if merge_strategy == "keep_first":
            return
        if merge_strategy == "append":
            if isinstance(existing_value, list):
                existing_value.append(deepcopy(value))
            else:
                current[leaf_key] = [existing_value, deepcopy(value)]
            return
        raise WorkflowExecutionError(
            f"Node '{target_node['id']}' uses unsupported join mergeStrategy '{merge_strategy}'."
        )

    def _target_path_tokens(self, path: str) -> list[str]:
        tokens = [segment for segment in path.split(".") if segment]
        if not tokens:
            raise WorkflowExecutionError("Field mapping targetField must not be empty.")
        return tokens

    def _join_policy_for_node(self, node: dict) -> JoinPolicy:
        runtime_policy = node.get("runtimePolicy") or {}
        join_config = runtime_policy.get("join") or {}
        required_node_ids = tuple(
            sorted(
                {
                    str(node_id).strip()
                    for node_id in join_config.get("requiredNodeIds", [])
                    if str(node_id).strip()
                }
            )
        )
        mode = str(join_config.get("mode", "any"))
        on_unmet = str(join_config.get("onUnmet", "skip"))
        merge_strategy = str(join_config.get("mergeStrategy", "error"))
        if mode not in {"any", "all"}:
            raise WorkflowExecutionError(
                f"Node '{node['id']}' uses unsupported join mode '{mode}'."
            )
        if on_unmet not in {"skip", "fail"}:
            raise WorkflowExecutionError(
                f"Node '{node['id']}' uses unsupported join onUnmet policy '{on_unmet}'."
            )
        if merge_strategy not in {"error", "overwrite", "keep_first", "append"}:
            raise WorkflowExecutionError(
                f"Node '{node['id']}' uses unsupported join mergeStrategy "
                f"'{merge_strategy}'."
            )
        return JoinPolicy(
            mode=mode,
            required_node_ids=required_node_ids,
            on_unmet=on_unmet,
            merge_strategy=merge_strategy,
        )

    def _join_decision_for_node(
        self,
        node: dict,
        incoming: list[str] | tuple[str, ...],
        activated_sources: set[str],
    ) -> JoinDecision:
        incoming_ids = tuple(sorted({str(node_id) for node_id in incoming if str(node_id).strip()}))
        activated_source_ids = tuple(sorted(str(node_id) for node_id in activated_sources))
        if node.get("type") == "trigger":
            return JoinDecision(
                should_execute=True,
                mode="any",
                on_unmet="skip",
                merge_strategy="error",
                expected_source_ids=(),
                activated_source_ids=activated_source_ids,
                missing_source_ids=(),
            )
        if not incoming_ids:
            return JoinDecision(
                should_execute=False,
                mode="any",
                on_unmet="skip",
                merge_strategy="error",
                expected_source_ids=(),
                activated_source_ids=activated_source_ids,
                missing_source_ids=(),
                reason="No incoming edges reached this node.",
            )

        join_policy = self._join_policy_for_node(node)
        if join_policy.mode == "all":
            expected_source_ids = (
                join_policy.required_node_ids if join_policy.required_node_ids else incoming_ids
            )
            missing_source_ids = tuple(
                node_id for node_id in expected_source_ids if node_id not in activated_sources
            )
            if missing_source_ids:
                reason = (
                    f"Join requirements were not met. Missing required upstream nodes: "
                    f"{', '.join(missing_source_ids)}."
                )
                return JoinDecision(
                    should_execute=False,
                    mode=join_policy.mode,
                    on_unmet=join_policy.on_unmet,
                    merge_strategy=join_policy.merge_strategy,
                    expected_source_ids=expected_source_ids,
                    activated_source_ids=activated_source_ids,
                    missing_source_ids=missing_source_ids,
                    reason=reason,
                    block_on_unmet=join_policy.on_unmet == "fail",
                )
            return JoinDecision(
                should_execute=bool(expected_source_ids),
                mode=join_policy.mode,
                on_unmet=join_policy.on_unmet,
                merge_strategy=join_policy.merge_strategy,
                expected_source_ids=expected_source_ids,
                activated_source_ids=activated_source_ids,
                missing_source_ids=(),
            )

        return JoinDecision(
            should_execute=bool(activated_sources),
            mode=join_policy.mode,
            on_unmet=join_policy.on_unmet,
            merge_strategy=join_policy.merge_strategy,
            expected_source_ids=incoming_ids,
            activated_source_ids=activated_source_ids,
            missing_source_ids=(),
            reason="No active incoming branch reached this node."
            if not activated_sources
            else None,
        )

    def _branch_expression_context(self, node_input: dict) -> dict[str, object]:
        return {
            "trigger_input": node_input.get("trigger_input", {}),
            "upstream": node_input.get("upstream", {}),
            "accumulated": node_input.get("accumulated", {}),
            "activated_by": node_input.get("activated_by", []),
            "authorized_context": node_input.get("authorized_context", {}),
            "attempt": node_input.get("attempt", {}),
            "config": node_input.get("config", {}),
        }

    def _edge_expression_matches(
        self,
        source_node: dict,
        target_node: dict,
        source_output: dict,
        outcome: str,
        edge: dict,
    ) -> bool:
        expression = edge.get("conditionExpression")
        if expression is None:
            return True

        try:
            result = evaluate_expression(
                str(expression),
                context={
                    "source_output": source_output,
                    "source_node": source_node,
                    "target_node": target_node,
                    "edge": edge,
                    "outcome": outcome,
                },
                allowed_names=EDGE_EXPRESSION_NAMES,
                description=f"Edge '{edge.get('id', '<unknown>')}' conditionExpression",
            )
        except SafeExpressionError as exc:
            raise WorkflowExecutionError(str(exc)) from exc

        return bool(result)

    def _default_branch_key(self, node: dict) -> str:
        config = node.get("config", {})
        for key in ("default", "selected"):
            value = config.get(key)
            if isinstance(value, str) and value.strip():
                return value
        return "default"

    def _stringify_branch_key(self, value: object) -> str | None:
        if value is MISSING or value is None:
            return None
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return str(value)

    def _build_join_event_payload(self, node: dict, join_decision: JoinDecision) -> dict:
        return {
            "node_id": node["id"],
            "mode": join_decision.mode,
            "on_unmet": join_decision.on_unmet,
            "merge_strategy": join_decision.merge_strategy,
            "expected_source_ids": list(join_decision.expected_source_ids),
            "activated_source_ids": list(join_decision.activated_source_ids),
            "missing_source_ids": list(join_decision.missing_source_ids),
        }

    def _build_context_read_payload(self, node: dict, node_output: dict) -> dict:
        results = node_output.get("results", [])
        return {
            "node_id": node["id"],
            "query_type": node_output.get("query", {}).get("type"),
            "source_node_ids": [item["nodeId"] for item in results],
            "artifact_types": sorted({item["artifactType"] for item in results}),
            "result_count": len(results),
        }

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
