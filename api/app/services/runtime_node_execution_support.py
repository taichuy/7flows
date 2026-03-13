from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.run import NodeRun, Run, RunEvent
from app.services.runtime_types import (
    AuthorizedContextRefs,
    CompiledEdge,
    CompiledNode,
    FlowCheckpointState,
    JoinDecision,
    NodeExecutionResult,
    RetryPolicy,
    RuntimeEvent,
    WorkflowExecutionError,
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


class RuntimeNodeExecutionSupportMixin:
    def _prepare_node_run_for_execution(
        self,
        db: Session,
        *,
        run: Run,
        node: dict,
        checkpoint_state: FlowCheckpointState,
        node_index: int,
        input_payload: dict,
        upstream_input: dict,
        mapped_input: dict,
        accumulated_input: dict,
        activation_sources: set[str],
        authorized_context: AuthorizedContextRefs,
        join_decision: JoinDecision,
        global_context: dict,
        events: list[RunEvent],
    ) -> NodeRun | None:
        node_input = self._build_node_input(
            node=node,
            node_run=None,
            input_payload=input_payload,
            upstream=upstream_input,
            mapped=mapped_input,
            accumulated=accumulated_input,
            activated_by=activation_sources,
            authorized_context=authorized_context,
            join_decision=join_decision,
            attempt_number=1,
            max_attempts=self._retry_policy_for_node(node).max_attempts,
            global_context=global_context,
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
                events.append(
                    self._build_event(
                        run.id,
                        blocked_node_run.id,
                        "node.blocked",
                        {"node_id": node["id"], "reason": blocked_node_run.error_message},
                    )
                )
                raise WorkflowExecutionError(blocked_node_run.error_message or "Join blocked.")

            skipped_node_run = self._build_skipped_node_run(
                node,
                run.id,
                node_input,
                reason=join_decision.reason or "No active incoming branch reached this node.",
            )
            db.add(skipped_node_run)
            db.flush()
            events.append(
                self._build_event(
                    run.id,
                    skipped_node_run.id,
                    "node.skipped",
                    {"node_id": node["id"], "reason": skipped_node_run.error_message},
                )
            )
            return None

        if checkpoint_state.waiting_node_run_id and checkpoint_state.next_node_index == node_index:
            node_run = db.get(NodeRun, checkpoint_state.waiting_node_run_id)
            if node_run is None:
                raise WorkflowExecutionError("Waiting node run no longer exists.")
            self._clear_scheduled_resume(node_run)
            node_run.status = "running"
            node_run.waiting_reason = None
            events.append(
                self._build_event(
                    run.id,
                    node_run.id,
                    "node.resumed",
                    {"node_id": node["id"], "phase": node_run.phase},
                )
            )
            return node_run

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
            node_id=node["id"],
            node_name=node.get("name", node["id"]),
            node_type=node.get("type", "unknown"),
            status="running",
            phase="pending",
            input_payload=node_input,
            checkpoint_payload={},
            working_context={},
            artifact_refs=[],
            started_at=_utcnow(),
            phase_started_at=_utcnow(),
        )
        db.add(node_run)
        db.flush()
        events.append(
            self._build_event(
                run.id,
                node_run.id,
                "node.started",
                {
                    "node": node,
                    "input": node_input,
                },
            )
        )
        return node_run

    def _execute_node_with_retry(
        self,
        db: Session,
        *,
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
        global_context: dict,
        events: list[RunEvent],
    ) -> NodeExecutionResult:
        last_error: Exception | None = None
        starting_attempt_number = self._starting_retry_attempt(node_run)

        for attempt_number in range(starting_attempt_number, retry_policy.max_attempts + 1):
            node_input = self._build_node_input(
                node=node,
                node_run=node_run,
                input_payload=input_payload,
                upstream=upstream,
                mapped=mapped,
                accumulated=accumulated,
                activated_by=activated_by,
                authorized_context=authorized_context,
                join_decision=join_decision,
                attempt_number=attempt_number,
                max_attempts=retry_policy.max_attempts,
                global_context=global_context,
            )
            node_run.input_payload = node_input
            node_run.retry_count = attempt_number - 1
            if attempt_number > 1 and node_run.phase not in {"waiting_tool", "waiting_callback"}:
                node_run.status = "retrying"

            try:
                result = self._execute_node(
                    db,
                    node=node,
                    node_run=node_run,
                    node_input=node_input,
                    run_id=run_id,
                    attempt_number=attempt_number,
                    authorized_context=authorized_context,
                    outputs=outputs,
                )
                self._clear_retry_state(node_run)
                return result
            except Exception as exc:
                last_error = exc
                node_run.retry_count = attempt_number
                if attempt_number >= retry_policy.max_attempts:
                    self._clear_retry_state(node_run)
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
                    next_attempt_number = attempt_number + 1
                    retry_waiting_reason = (
                        "Retry "
                        f"{next_attempt_number}/{retry_policy.max_attempts} "
                        f"scheduled in {delay_seconds:g}s after error: {exc}"
                    )
                    self._set_retry_state(
                        node_run,
                        next_attempt_number=next_attempt_number,
                        delay_seconds=delay_seconds,
                        error_message=str(exc),
                    )
                    return NodeExecutionResult(
                        suspended=True,
                        waiting_status="retrying",
                        waiting_reason=retry_waiting_reason,
                        resume_after_seconds=delay_seconds,
                    )
                self._clear_retry_state(node_run)

        if last_error is None:
            raise WorkflowExecutionError(f"Node '{node['id']}' exhausted retries without error.")
        raise last_error

    def _execute_node(
        self,
        db: Session,
        *,
        node: dict,
        node_run: NodeRun,
        node_input: dict,
        run_id: str,
        attempt_number: int,
        authorized_context: AuthorizedContextRefs,
        outputs: dict[str, dict],
    ) -> NodeExecutionResult:
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

        if node.get("type") == "llm_agent" and get_settings().durable_agent_runtime_enabled:
            return self._agent_runtime.execute(
                db,
                run_id=run_id,
                node=node,
                node_run=node_run,
                node_input=node_input,
            )

        if "mock_output" in config:
            mock_output = config["mock_output"]
            return NodeExecutionResult(
                output=mock_output if isinstance(mock_output, dict) else {"value": mock_output}
            )

        node_type = node.get("type")
        if node_type == "trigger":
            return NodeExecutionResult(output=node_input.get("trigger_input", {}))
        if node_type == "output":
            return NodeExecutionResult(output=node_input.get("accumulated", {}))
        if node_type == "tool":
            if self._node_has_tool_binding(node):
                return self._execute_tool_node(
                    db,
                    node=node,
                    node_run=node_run,
                    node_input=node_input,
                    run_id=run_id,
                )
            return NodeExecutionResult(
                output={
                    "node_id": node.get("id"),
                    "node_type": node_type,
                    "received": node_input,
                }
            )
        if node_type == "mcp_query":
            node_output = self._execute_mcp_query_node(node, authorized_context, outputs)
            return NodeExecutionResult(
                output=node_output,
                events=[
                    RuntimeEvent(
                        "node.context.read",
                        self._build_context_read_payload(node, node_output),
                    )
                ],
            )
        if node_type in {"condition", "router"}:
            return NodeExecutionResult(output=self._execute_branch_node(node, node_input))
        return NodeExecutionResult(
            output={
                "node_id": node.get("id"),
                "node_type": node_type,
                "received": node_input,
            }
        )

    def _execute_tool_node(
        self,
        db: Session,
        *,
        node: dict,
        node_run: NodeRun,
        node_input: dict,
        run_id: str,
    ) -> NodeExecutionResult:
        config = node.get("config", {})
        tool_ref = self._tool_ref_for_node(node)
        tool_result = self._tool_gateway.execute(
            db,
            run_id=run_id,
            node_run=node_run,
            phase="tool_execute",
            tool_id=tool_ref["toolId"],
            ecosystem=str(tool_ref.get("ecosystem") or "native"),
            adapter_id=tool_ref.get("adapterId"),
            inputs=self._tool_inputs_for_node(config, node_input),
            credentials={
                str(key): str(value)
                for key, value in (tool_ref.get("credentials") or {}).items()
            },
            timeout_ms=int(tool_ref.get("timeoutMs") or get_settings().plugin_default_timeout_ms),
        )
        if tool_result.raw_ref:
            self._context_service.append_artifact_ref(node_run, tool_result.raw_ref)
        return NodeExecutionResult(
            output=tool_result.structured,
            events=[
                RuntimeEvent(
                    "tool.completed",
                    {
                        "node_id": node["id"],
                        "tool_id": tool_ref["toolId"],
                        "summary": tool_result.summary,
                        "raw_ref": tool_result.raw_ref,
                        "content_type": tool_result.content_type,
                    },
                )
            ],
        )

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
        nodes: tuple[CompiledNode, ...],
        outputs: dict[str, dict],
        completed_output_nodes: set[str],
    ) -> dict:
        for node in reversed(nodes):
            if node.type == "output" and node.id in completed_output_nodes:
                return outputs.get(node.id, {})
        return outputs.get(nodes[-1].id, {})

    def _build_node_input(
        self,
        *,
        node: dict,
        node_run: NodeRun | None,
        input_payload: dict,
        upstream: dict,
        mapped: dict,
        accumulated: dict,
        activated_by: set[str],
        authorized_context: AuthorizedContextRefs,
        join_decision: JoinDecision,
        attempt_number: int,
        max_attempts: int,
        global_context: dict,
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
        node_input.update(
            self._context_service.build_node_context_roots(
                node_run=node_run,
                global_context=global_context,
            )
        )
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
            phase="pending",
            input_payload=node_input,
            checkpoint_payload={},
            working_context={},
            artifact_refs=[],
            error_message=reason,
            waiting_reason=reason,
            started_at=timestamp,
            phase_started_at=timestamp,
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
            phase="pending",
            input_payload=node_input,
            checkpoint_payload={},
            working_context={},
            artifact_refs=[],
            error_message=reason,
            waiting_reason=reason,
            started_at=timestamp,
            phase_started_at=timestamp,
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
        *,
        source_node: dict,
        source_output: dict,
        outcome: str,
        outgoing_edges: tuple[CompiledEdge, ...],
        node_lookup: dict[str, dict],
        checkpoint_state: FlowCheckpointState,
    ) -> list[str]:
        activated_targets: list[str] = []
        sibling_edges = [self._edge_payload(item) for item in outgoing_edges]
        for compiled_edge in outgoing_edges:
            edge = self._edge_payload(compiled_edge)
            target_id = edge.get("targetNodeId")
            if not target_id or target_id not in node_lookup:
                continue
            if not self._should_activate_edge(
                source_node,
                source_output,
                outcome,
                edge,
                node_lookup[target_id],
                sibling_edges,
            ):
                continue
            checkpoint_state.activated_by.setdefault(target_id, [])
            if source_node["id"] not in checkpoint_state.activated_by[target_id]:
                checkpoint_state.activated_by[target_id].append(source_node["id"])
            checkpoint_state.upstream_inputs.setdefault(target_id, {})
            checkpoint_state.upstream_inputs[target_id][source_node["id"]] = deepcopy(source_output)
            checkpoint_state.mapped_inputs.setdefault(target_id, {})
            self._apply_edge_mappings(
                edge=edge,
                source_node=source_node,
                target_node=node_lookup[target_id],
                source_output=source_output,
                mapped_input=checkpoint_state.mapped_inputs[target_id],
            )
            activated_targets.append(target_id)
        return activated_targets
