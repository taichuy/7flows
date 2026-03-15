from __future__ import annotations

from copy import deepcopy

from sqlalchemy.orm import Session

from app.models.run import NodeRun, Run, RunEvent
from app.services.callback_waiting_lifecycle import (
    record_callback_ticket_canceled,
    record_callback_ticket_issued,
)
from app.services.runtime_types import CompiledEdge, CompiledNode, NodeExecutionResult


class RuntimeLifecycleSupportMixin:
    def _apply_result_events(
        self,
        run_id: str,
        node_run_id: str,
        result: NodeExecutionResult,
        events: list[RunEvent],
    ) -> None:
        for runtime_event in result.events:
            events.append(
                self._build_event(
                    run_id,
                    node_run_id,
                    runtime_event.event_type,
                    runtime_event.payload,
                )
            )

    def _issue_callback_ticket_if_needed(
        self,
        db: Session,
        *,
        run: Run,
        node: dict,
        node_run: NodeRun,
        result: NodeExecutionResult,
        events: list[RunEvent],
    ) -> None:
        if result.waiting_status != "waiting_callback":
            self._clear_callback_ticket(db, node_run, reason="waiting_status_changed")
            return

        checkpoint_payload = dict(node_run.checkpoint_payload or {})
        tool_results = list(checkpoint_payload.get("tool_results") or [])
        tool_index = max(int(checkpoint_payload.get("next_tool_index") or 0), 0)
        waiting_result = tool_results[tool_index] if tool_index < len(tool_results) else {}
        meta = waiting_result.get("meta") if isinstance(waiting_result, dict) else {}
        meta = meta if isinstance(meta, dict) else {}
        snapshot = self._callback_tickets.issue_ticket(
            db,
            run_id=run.id,
            node_run_id=node_run.id,
            tool_call_id=str(meta.get("tool_call_id") or "") or None,
            tool_id=str(meta.get("tool_id") or "") or None,
            tool_call_index=tool_index,
            waiting_status=result.waiting_status,
            reason=result.waiting_reason,
        )
        checkpoint_payload["callback_ticket"] = snapshot.as_checkpoint_payload()
        checkpoint_payload = record_callback_ticket_issued(
            checkpoint_payload,
            reason=result.waiting_reason,
            issued_at=snapshot.created_at,
        )
        node_run.checkpoint_payload = checkpoint_payload
        events.append(
            self._build_event(
                run.id,
                node_run.id,
                "run.callback.ticket.issued",
                {
                    "ticket": snapshot.ticket,
                    "node_id": node["id"],
                    "tool_id": snapshot.tool_id,
                    "tool_call_id": snapshot.tool_call_id,
                    "tool_call_index": snapshot.tool_call_index,
                    "waiting_status": snapshot.waiting_status,
                },
            )
        )

    def _clear_callback_ticket(
        self,
        db: Session,
        node_run: NodeRun,
        *,
        reason: str,
    ) -> None:
        canceled_records = self._callback_tickets.cancel_pending_for_node_run(
            db,
            node_run_id=node_run.id,
            reason=reason,
        )
        checkpoint_payload = dict(node_run.checkpoint_payload or {})
        for record in canceled_records:
            checkpoint_payload = record_callback_ticket_canceled(
                checkpoint_payload,
                reason=reason,
                canceled_at=record.canceled_at,
            )
        if checkpoint_payload.pop("callback_ticket", None) is not None:
            node_run.checkpoint_payload = checkpoint_payload
        elif canceled_records:
            node_run.checkpoint_payload = checkpoint_payload

    def _schedule_waiting_resume_if_needed(
        self,
        db: Session,
        *,
        run: Run,
        node: dict,
        node_run: NodeRun,
        result: NodeExecutionResult,
        events: list[RunEvent],
    ) -> None:
        if result.resume_after_seconds is None:
            self._clear_scheduled_resume(node_run)
            return

        scheduled_resume = self._resume_scheduler.schedule(
            run_id=run.id,
            delay_seconds=result.resume_after_seconds,
            reason=result.waiting_reason or f"{node['id']} waiting",
            source="runtime_waiting",
            db=db,
        )
        checkpoint_payload = dict(node_run.checkpoint_payload or {})
        checkpoint_payload["scheduled_resume"] = {
            "delay_seconds": scheduled_resume.delay_seconds,
            "reason": scheduled_resume.reason,
            "source": scheduled_resume.source,
            "waiting_status": result.waiting_status,
        }
        node_run.checkpoint_payload = checkpoint_payload
        events.append(
            self._build_event(
                run.id,
                node_run.id,
                "run.resume.scheduled",
                {
                    "node_id": node["id"],
                    "delay_seconds": scheduled_resume.delay_seconds,
                    "reason": scheduled_resume.reason,
                    "source": scheduled_resume.source,
                    "waiting_status": result.waiting_status,
                },
            )
        )

    def _starting_retry_attempt(self, node_run: NodeRun) -> int:
        checkpoint_payload = node_run.checkpoint_payload or {}
        retry_state = checkpoint_payload.get("retry_state")
        if not isinstance(retry_state, dict):
            return 1
        raw_attempt = retry_state.get("next_attempt_number")
        try:
            return max(int(raw_attempt), 1)
        except (TypeError, ValueError):
            return 1

    def _set_retry_state(
        self,
        node_run: NodeRun,
        *,
        next_attempt_number: int,
        delay_seconds: float,
        error_message: str,
    ) -> None:
        checkpoint_payload = dict(node_run.checkpoint_payload or {})
        checkpoint_payload["retry_state"] = {
            "next_attempt_number": next_attempt_number,
            "delay_seconds": max(float(delay_seconds), 0.0),
            "error_message": error_message,
        }
        node_run.checkpoint_payload = checkpoint_payload

    def _clear_retry_state(self, node_run: NodeRun) -> None:
        checkpoint_payload = dict(node_run.checkpoint_payload or {})
        if checkpoint_payload.pop("retry_state", None) is not None:
            node_run.checkpoint_payload = checkpoint_payload

    def _serialize_tool_result(self, result: object) -> dict:
        return {
            "status": str(getattr(result, "status", "success") or "success"),
            "content_type": str(getattr(result, "content_type", "json") or "json"),
            "summary": str(getattr(result, "summary", "") or ""),
            "raw_ref": getattr(result, "raw_ref", None),
            "structured": deepcopy(getattr(result, "structured", {}) or {}),
            "meta": deepcopy(getattr(result, "meta", {}) or {}),
        }

    def _clear_scheduled_resume(self, node_run: NodeRun) -> None:
        checkpoint_payload = dict(node_run.checkpoint_payload or {})
        if checkpoint_payload.pop("scheduled_resume", None) is not None:
            node_run.checkpoint_payload = checkpoint_payload

    def _persist_events(self, db: Session, events: list[RunEvent]) -> None:
        for event in events:
            db.add(event)

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

    def _node_payload(self, node: CompiledNode) -> dict:
        return {
            "id": node.id,
            "type": node.type,
            "name": node.name,
            "config": deepcopy(node.config),
            "runtimePolicy": deepcopy(node.runtime_policy),
        }

    def _edge_payload(self, edge: CompiledEdge) -> dict:
        return {
            "id": edge.id,
            "sourceNodeId": edge.source_node_id,
            "targetNodeId": edge.target_node_id,
            "channel": edge.channel,
            "condition": edge.condition,
            "conditionExpression": edge.condition_expression,
            "mapping": [deepcopy(item) for item in edge.mapping],
        }
