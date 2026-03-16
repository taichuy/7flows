from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.run import NodeRun, Run, RunEvent
from app.services.runtime_execution_policy import resolve_execution_policy
from app.services.runtime_types import (
    AuthorizedContextRefs,
    FlowCheckpointState,
    JoinDecision,
    WorkflowExecutionError,
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


class RuntimeNodePreparationSupportMixin:
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
        execution_policy = resolve_execution_policy(node)
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

        availability = self._execution_adapter_registry.describe_node_execution_availability(
            node=node,
            execution_policy=execution_policy,
        )
        if not availability.available:
            blocked_node_run = self._build_blocked_node_run(
                node=node,
                run_id=run.id,
                node_input=node_input,
                reason=availability.blocking_reason
                or "Node execution is unavailable for the requested execution class.",
            )
            db.add(blocked_node_run)
            db.flush()
            events.append(
                self._build_event(
                    run.id,
                    blocked_node_run.id,
                    "node.execution.unavailable",
                    {
                        "node_id": node["id"],
                        "node_type": node.get("type", "unknown"),
                        "requested_execution_class": execution_policy.execution_class,
                        "reason": blocked_node_run.error_message,
                    },
                )
            )
            events.append(
                self._build_event(
                    run.id,
                    blocked_node_run.id,
                    "node.blocked",
                    {"node_id": node["id"], "reason": blocked_node_run.error_message},
                )
            )
            raise WorkflowExecutionError(
                blocked_node_run.error_message or "Node execution is unavailable."
            )

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
                    "execution": execution_policy.as_runtime_payload(),
                },
            )
        )
        return node_run

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
        execution_policy = resolve_execution_policy(node)
        node_input = {
            "trigger_input": input_payload,
            "upstream": upstream,
            "accumulated": accumulated,
            "mapped": mapped,
            "activated_by": sorted(activated_by),
            "execution": execution_policy.as_runtime_payload(),
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
