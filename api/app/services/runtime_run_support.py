from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import NodeRun, Run, RunEvent, ToolCallRecord
from app.models.workflow import WorkflowCompiledBlueprint
from app.services.callback_waiting_lifecycle import (
    record_callback_ticket_canceled,
    record_callback_ticket_consumed,
    record_callback_ticket_expired,
    record_late_callback_delivery,
)
from app.services.compiled_blueprints import CompiledBlueprintError
from app.services.runtime_records import CallbackHandleResult, ExecutionArtifacts
from app.services.runtime_types import FlowCheckpointState, WorkflowExecutionError


def _utcnow() -> datetime:
    return datetime.now(UTC)


class RuntimeRunSupportMixin:
    def resume_run(
        self,
        db: Session,
        run_id: str,
        *,
        source: str = "manual",
        reason: str | None = None,
    ) -> ExecutionArtifacts:
        self._refresh_runtime_dependencies(db)
        run = db.get(Run, run_id)
        if run is None:
            raise WorkflowExecutionError("Run not found.")
        if run.status != "waiting":
            raise WorkflowExecutionError("Only waiting runs can be resumed.")

        try:
            blueprint_record = self._resolve_run_blueprint_record(db, run)
            blueprint = self._compiled_blueprints.load_blueprint(blueprint_record)
        except (CompiledBlueprintError, WorkflowExecutionError) as exc:
            raise WorkflowExecutionError(str(exc)) from exc
        checkpoint_state = FlowCheckpointState.from_dict(
            run.checkpoint_payload,
            ordered_node_ids=[node.id for node in blueprint.ordered_nodes],
        )
        if not checkpoint_state.waiting_node_run_id:
            raise WorkflowExecutionError("Run does not have a resumable waiting node.")

        run.status = "running"
        run.current_node_id = None
        run.error_message = None
        events = [
            self._build_event(
                run.id,
                None,
                "run.resumed",
                {
                    "run_id": run.id,
                    "source": source,
                    "reason": reason,
                },
            )
        ]
        try:
            self._continue_execution(
                db,
                run=run,
                blueprint=blueprint,
                input_payload=run.input_payload,
                checkpoint_state=checkpoint_state,
                events=events,
            )
        except WorkflowExecutionError as exc:
            run.status = "failed"
            run.error_message = str(exc)
            run.finished_at = _utcnow()
            events.append(self._build_event(run.id, None, "run.failed", {"error": str(exc)}))
        finally:
            self._persist_events(db, events)
            db.commit()

        artifacts = self.load_run(db, run_id)
        if artifacts is None:
            raise WorkflowExecutionError("Run disappeared while resuming.")
        if artifacts.run.status == "failed":
            raise WorkflowExecutionError(artifacts.run.error_message or "Workflow resume failed.")
        return artifacts

    def _resolve_run_blueprint_record(
        self,
        db: Session,
        run: Run,
    ) -> WorkflowCompiledBlueprint:
        record = self._compiled_blueprints.get_for_run(db, run)
        if record is not None:
            if run.compiled_blueprint_id != record.id:
                run.compiled_blueprint_id = record.id
            return record

        workflow_version = self._load_workflow_version(
            db,
            workflow_id=run.workflow_id,
            workflow_version=run.workflow_version,
        )
        record = self._compiled_blueprints.ensure_for_workflow_version(db, workflow_version)
        run.compiled_blueprint_id = record.id
        return record

    def receive_callback(
        self,
        db: Session,
        ticket: str,
        *,
        payload: dict,
        source: str = "external_callback",
    ) -> CallbackHandleResult:
        self._refresh_runtime_dependencies(db)
        ticket_record = self._callback_tickets.get_ticket(db, ticket)
        if ticket_record is None:
            raise WorkflowExecutionError("Callback ticket not found.")

        if ticket_record.status == "consumed":
            artifacts = self._load_run_artifacts_or_raise(db, ticket_record.run_id)
            return self._build_callback_handle_result(
                callback_status="already_consumed",
                ticket=ticket_record.id,
                run_id=ticket_record.run_id,
                node_run_id=ticket_record.node_run_id,
                artifacts=artifacts,
            )

        if ticket_record.status == "expired":
            node_run = db.get(NodeRun, ticket_record.node_run_id)
            if node_run is not None:
                self._record_late_callback_state(
                    db,
                    node_run=node_run,
                    ticket_record=ticket_record,
                    status="expired",
                    reason="callback_received_for_expired_ticket",
                    source=source,
                )
                db.commit()
            artifacts = self._load_run_artifacts_or_raise(db, ticket_record.run_id)
            return self._build_callback_handle_result(
                callback_status="expired",
                ticket=ticket_record.id,
                run_id=ticket_record.run_id,
                node_run_id=ticket_record.node_run_id,
                artifacts=artifacts,
            )

        run = db.get(Run, ticket_record.run_id)
        node_run = db.get(NodeRun, ticket_record.node_run_id)
        if run is None or node_run is None:
            raise WorkflowExecutionError("Run callback ticket points to missing runtime records.")

        if self._callback_tickets.is_ticket_expired(ticket_record):
            callback_snapshot = self._callback_tickets.expire_ticket(
                ticket_record,
                reason="callback_ticket_expired",
                callback_payload={
                    "reason": "callback_ticket_expired",
                    "source": source,
                    "cleanup": False,
                },
            )
            node_run.checkpoint_payload = record_callback_ticket_expired(
                node_run.checkpoint_payload,
                reason="callback_ticket_expired",
                expired_at=callback_snapshot.expired_at,
            )
            self._record_late_callback_state(
                db,
                node_run=node_run,
                ticket_record=ticket_record,
                status="expired",
                reason="callback_ticket_expired",
                source=source,
            )
            self._persist_events(
                db,
                [
                    self._build_event(
                        ticket_record.run_id,
                        ticket_record.node_run_id,
                        "run.callback.ticket.expired",
                        {
                            "ticket": callback_snapshot.ticket,
                            "node_id": node_run.node_id,
                            "tool_id": ticket_record.tool_id,
                            "tool_call_id": ticket_record.tool_call_id,
                            "expires_at": self._serialize_timestamp(callback_snapshot.expires_at),
                            "expired_at": self._serialize_timestamp(callback_snapshot.expired_at),
                            "source": source,
                            "cleanup": False,
                        },
                    )
                ],
            )
            db.commit()
            artifacts = self._load_run_artifacts_or_raise(db, ticket_record.run_id)
            return self._build_callback_handle_result(
                callback_status="expired",
                ticket=ticket_record.id,
                run_id=ticket_record.run_id,
                node_run_id=ticket_record.node_run_id,
                artifacts=artifacts,
            )

        if ticket_record.status != "pending":
            self._record_late_callback_state(
                db,
                node_run=node_run,
                ticket_record=ticket_record,
                status=str(ticket_record.status or "ignored"),
                reason=f"callback_received_for_{ticket_record.status}_ticket",
                source=source,
            )
            db.commit()
            artifacts = self._load_run_artifacts_or_raise(db, ticket_record.run_id)
            return self._build_callback_handle_result(
                callback_status="ignored",
                ticket=ticket_record.id,
                run_id=ticket_record.run_id,
                node_run_id=ticket_record.node_run_id,
                artifacts=artifacts,
            )

        if run.status != "waiting" or node_run.status != "waiting_callback":
            canceled_records = self._callback_tickets.cancel_pending_for_node_run(
                db,
                node_run_id=node_run.id,
                reason="callback_received_after_run_left_waiting",
            )
            checkpoint_payload = dict(node_run.checkpoint_payload or {})
            for record in canceled_records:
                checkpoint_payload = record_callback_ticket_canceled(
                    checkpoint_payload,
                    reason="callback_received_after_run_left_waiting",
                    canceled_at=record.canceled_at,
                )
            if checkpoint_payload.pop("callback_ticket", None) is not None or canceled_records:
                node_run.checkpoint_payload = checkpoint_payload
            self._record_late_callback_state(
                db,
                node_run=node_run,
                ticket_record=ticket_record,
                status="ignored",
                reason="callback_received_after_run_left_waiting",
                source=source,
            )
            db.commit()
            artifacts = self._load_run_artifacts_or_raise(db, ticket_record.run_id)
            return self._build_callback_handle_result(
                callback_status="ignored",
                ticket=ticket_record.id,
                run_id=ticket_record.run_id,
                node_run_id=ticket_record.node_run_id,
                artifacts=artifacts,
            )

        tool_call_record = self._resolve_tool_call_record(db, ticket_record)
        result = self._tool_gateway.record_callback_result(
            db,
            run_id=run.id,
            node_run=node_run,
            tool_call_record=tool_call_record,
            tool_id=ticket_record.tool_id,
            payload=payload,
        )
        callback_snapshot = self._callback_tickets.consume_ticket(
            ticket_record,
            callback_payload={
                "source": source,
                "result": deepcopy(payload),
            },
        )

        self._apply_callback_result_to_node_run(
            node_run=node_run,
            ticket_record=ticket_record,
            result=result,
        )
        self._persist_callback_received_events(
            db,
            run=run,
            node_run=node_run,
            ticket_record=ticket_record,
            callback_snapshot=callback_snapshot,
            result=result,
            source=source,
        )

        artifacts = self.resume_run(
            db,
            run.id,
            source=source,
            reason=f"callback:{callback_snapshot.ticket}",
        )
        return self._build_callback_handle_result(
            callback_status="accepted",
            ticket=callback_snapshot.ticket,
            run_id=run.id,
            node_run_id=node_run.id,
            artifacts=artifacts,
        )

    def _load_run_artifacts_or_raise(self, db: Session, run_id: str) -> ExecutionArtifacts:
        artifacts = self.load_run(db, run_id)
        if artifacts is None:
            raise WorkflowExecutionError("Run not found for callback ticket.")
        return artifacts

    def _build_callback_handle_result(
        self,
        *,
        callback_status: str,
        ticket: str,
        run_id: str,
        node_run_id: str,
        artifacts: ExecutionArtifacts,
    ) -> CallbackHandleResult:
        return CallbackHandleResult(
            callback_status=callback_status,
            ticket=ticket,
            run_id=run_id,
            node_run_id=node_run_id,
            artifacts=artifacts,
        )

    def _resolve_tool_call_record(self, db: Session, ticket_record):
        tool_call_record = None
        if ticket_record.tool_call_id:
            tool_call_record = db.get(ToolCallRecord, ticket_record.tool_call_id)
        if tool_call_record is None and ticket_record.tool_id:
            tool_call_record = db.scalar(
                select(ToolCallRecord)
                .where(
                    ToolCallRecord.node_run_id == ticket_record.node_run_id,
                    ToolCallRecord.tool_id == ticket_record.tool_id,
                )
                .order_by(ToolCallRecord.created_at.desc())
            )
        return tool_call_record

    def _apply_callback_result_to_node_run(
        self,
        *,
        node_run: NodeRun,
        ticket_record,
        result,
    ) -> None:
        checkpoint_payload = dict(node_run.checkpoint_payload or {})
        tool_results = list(checkpoint_payload.get("tool_results") or [])
        tool_index = max(int(ticket_record.tool_call_index), 0)
        if tool_index > len(tool_results):
            raise WorkflowExecutionError("Callback ticket references an invalid tool result slot.")
        serialized_result = self._serialize_tool_result(result)
        if tool_index == len(tool_results):
            tool_results.append(serialized_result)
        else:
            tool_results[tool_index] = serialized_result
        checkpoint_payload["tool_results"] = tool_results
        checkpoint_payload["next_tool_index"] = max(
            tool_index + 1,
            int(checkpoint_payload.get("next_tool_index") or 0),
        )
        checkpoint_payload = record_callback_ticket_consumed(
            checkpoint_payload,
            consumed_at=ticket_record.consumed_at,
        )
        checkpoint_payload.pop("callback_ticket", None)
        checkpoint_payload.pop("scheduled_resume", None)
        node_run.checkpoint_payload = checkpoint_payload
        self._context_service.update_working_context(
            node_run,
            tool_results=tool_results,
            callback_result=serialized_result,
        )
        artifact_refs = list(node_run.artifact_refs or [])
        if result.raw_ref and result.raw_ref not in artifact_refs:
            artifact_refs.append(result.raw_ref)
        self._context_service.replace_artifact_refs(node_run, artifact_refs)

    def _persist_callback_received_events(
        self,
        db: Session,
        *,
        run: Run,
        node_run: NodeRun,
        ticket_record,
        callback_snapshot,
        result,
        source: str,
    ) -> None:
        callback_events = [
            self._build_event(
                run.id,
                node_run.id,
                "run.callback.received",
                {
                    "ticket": callback_snapshot.ticket,
                    "node_id": node_run.node_id,
                    "tool_id": ticket_record.tool_id,
                    "tool_call_id": ticket_record.tool_call_id,
                    "source": source,
                    "status": result.status,
                },
            ),
            self._build_event(
                run.id,
                node_run.id,
                "tool.completed",
                {
                    "node_id": node_run.node_id,
                    "tool_id": ticket_record.tool_id,
                    "summary": result.summary,
                    "raw_ref": result.raw_ref,
                    "content_type": result.content_type,
                    "status": result.status,
                    "source": "callback",
                },
            ),
        ]
        self._persist_events(db, callback_events)

    def _record_late_callback_state(
        self,
        db: Session,
        *,
        node_run: NodeRun,
        ticket_record,
        status: str,
        reason: str,
        source: str,
    ) -> None:
        received_at = _utcnow()
        node_run.checkpoint_payload = record_late_callback_delivery(
            node_run.checkpoint_payload,
            status=status,
            reason=reason,
            received_at=received_at,
        )
        self._persist_events(
            db,
            [
                self._build_event(
                    ticket_record.run_id,
                    node_run.id,
                    "run.callback.ticket.late",
                    {
                        "ticket": ticket_record.id,
                        "node_id": node_run.node_id,
                        "tool_id": ticket_record.tool_id,
                        "tool_call_id": ticket_record.tool_call_id,
                        "ticket_status": status,
                        "reason": reason,
                        "source": source,
                        "received_at": self._serialize_timestamp(received_at),
                    },
                )
            ],
        )

    def _serialize_timestamp(self, value: datetime | None) -> str | None:
        if value is None:
            return None
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")

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
        artifacts = self._artifact_store.load_run_artifacts(db, run_id)
        tool_calls = self._tool_gateway.list_tool_calls(db, run_id)
        ai_calls = self._agent_runtime.list_ai_calls(db, run_id)
        return ExecutionArtifacts(
            run=run,
            node_runs=node_runs,
            events=events,
            artifacts=artifacts,
            tool_calls=tool_calls,
            ai_calls=ai_calls,
        )

    def list_workflow_runs(self, db: Session, workflow_id: str) -> list[Run]:
        return db.scalars(
            select(Run).where(Run.workflow_id == workflow_id).order_by(Run.created_at.desc())
        ).all()
