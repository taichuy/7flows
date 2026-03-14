from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.run import NodeRun, Run, RunEvent
from app.services.published_protocol_mapper import extract_text_output
from app.services.runtime_types import (
    CompiledWorkflowBlueprint,
    FlowCheckpointState,
    NodeExecutionResult,
    WorkflowExecutionError,
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


class RuntimeExecutionProgressSupportMixin:
    def _handle_failed_node_execution(
        self,
        db: Session,
        *,
        run: Run,
        node: dict,
        node_run: NodeRun,
        node_index: int,
        checkpoint_state: FlowCheckpointState,
        events: list[RunEvent],
        node_lookup: dict[str, dict],
        outgoing_edges: tuple,
        cause: Exception,
    ) -> None:
        node_id = node["id"]
        node_error = str(cause)
        node_run.status = "failed"
        node_run.error_message = node_error
        node_run.finished_at = _utcnow()
        self._clear_callback_ticket(db, node_run, reason="node_failed")
        events.append(
            self._build_event(
                run.id,
                node_run.id,
                "node.failed",
                {"node_id": node_id, "error": node_error},
            )
        )
        failure_output = self._build_failure_output(node, node_error)
        checkpoint_state.outputs[node_id] = failure_output
        activated_targets = self._activate_downstream_edges(
            source_node=node,
            source_output=failure_output,
            outcome="failed",
            outgoing_edges=outgoing_edges,
            node_lookup=node_lookup,
            checkpoint_state=checkpoint_state,
        )
        checkpoint_state.next_node_index = node_index + 1
        run.checkpoint_payload = checkpoint_state.as_dict()
        run.current_node_id = None
        if not activated_targets:
            raise WorkflowExecutionError(node_error) from cause

    def _handle_suspended_node_execution(
        self,
        db: Session,
        *,
        run: Run,
        node: dict,
        node_run: NodeRun,
        node_index: int,
        result: NodeExecutionResult,
        checkpoint_state: FlowCheckpointState,
        events: list[RunEvent],
    ) -> None:
        node_id = node["id"]
        node_run.status = result.waiting_status or "waiting_tool"
        node_run.waiting_reason = result.waiting_reason
        run.status = "waiting"
        run.current_node_id = node_id
        checkpoint_state.next_node_index = node_index
        checkpoint_state.waiting_node_run_id = node_run.id
        run.checkpoint_payload = checkpoint_state.as_dict()
        self._issue_callback_ticket_if_needed(
            db,
            run=run,
            node=node,
            node_run=node_run,
            result=result,
            events=events,
        )
        self._schedule_waiting_resume_if_needed(
            run=run,
            node=node,
            node_run=node_run,
            result=result,
            events=events,
        )
        events.append(
            self._build_event(
                run.id,
                node_run.id,
                "run.waiting",
                {
                    "node_id": node_id,
                    "status": node_run.status,
                    "reason": result.waiting_reason,
                },
            )
        )

    def _handle_succeeded_node_execution(
        self,
        db: Session,
        *,
        run: Run,
        node: dict,
        node_run: NodeRun,
        node_index: int,
        result: NodeExecutionResult,
        checkpoint_state: FlowCheckpointState,
        events: list[RunEvent],
        node_lookup: dict[str, dict],
        outgoing_edges: tuple,
    ) -> None:
        node_id = node["id"]
        node_output = result.output or {}
        node_run.output_payload = node_output
        node_run.status = "succeeded"
        node_run.finished_at = _utcnow()
        node_run.waiting_reason = None
        self._clear_callback_ticket(db, node_run, reason="node_completed")
        checkpoint_state.outputs[node_id] = node_output
        if node["type"] == "output":
            checkpoint_state.completed_output_nodes = list(
                dict.fromkeys([*checkpoint_state.completed_output_nodes, node_id])
            )

        agent_emitted_deltas = any(
            event.event_type == "node.output.delta" for event in (result.events or [])
        )
        if not agent_emitted_deltas:
            delta_text = extract_text_output(node_output)
            if delta_text:
                events.append(
                    self._build_event(
                        run.id,
                        node_run.id,
                        "node.output.delta",
                        {"node_id": node_id, "delta": delta_text},
                    )
                )
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
            outgoing_edges=outgoing_edges,
            node_lookup=node_lookup,
            checkpoint_state=checkpoint_state,
        )
        checkpoint_state.waiting_node_run_id = None
        checkpoint_state.next_node_index = node_index + 1
        run.current_node_id = None
        run.checkpoint_payload = checkpoint_state.as_dict()

    def _finalize_completed_run(
        self,
        *,
        run: Run,
        blueprint: CompiledWorkflowBlueprint,
        checkpoint_state: FlowCheckpointState,
        events: list[RunEvent],
    ) -> None:
        if not checkpoint_state.completed_output_nodes:
            raise WorkflowExecutionError(
                "Workflow completed without producing a reachable output node."
            )

        run.status = "succeeded"
        run.output_payload = self._resolve_run_output(
            blueprint.ordered_nodes,
            checkpoint_state.outputs,
            set(checkpoint_state.completed_output_nodes),
        )
        run.finished_at = _utcnow()
        run.current_node_id = None
        run.checkpoint_payload = checkpoint_state.as_dict()

        run_delta_text = extract_text_output(run.output_payload)
        if run_delta_text:
            events.append(
                self._build_event(
                    run.id,
                    None,
                    "run.output.delta",
                    {"delta": run_delta_text},
                )
            )
        events.append(
            self._build_event(
                run.id,
                None,
                "run.completed",
                {"output": run.output_payload},
            )
        )
