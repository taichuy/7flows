from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.run import NodeRun, Run, RunEvent, ToolCallRecord
from app.models.workflow import Workflow, WorkflowCompiledBlueprint, WorkflowVersion
from app.services.agent_runtime import AgentRuntime
from app.services.artifact_store import RuntimeArtifactStore
from app.services.compiled_blueprints import (
    CompiledBlueprintError,
    CompiledBlueprintService,
)
from app.services.context_service import ContextService
from app.services.flow_compiler import FlowCompiler
from app.services.plugin_runtime import (
    PluginCallProxy,
    get_plugin_call_proxy,
    get_plugin_registry,
)
from app.services.published_protocol_mapper import extract_text_output
from app.services.run_callback_tickets import RunCallbackTicketService
from app.services.run_resume_scheduler import (
    RunResumeScheduler,
    get_run_resume_scheduler,
)
from app.services.runtime_graph_support import RuntimeGraphSupportMixin
from app.services.runtime_lifecycle_support import RuntimeLifecycleSupportMixin
from app.services.runtime_node_execution_support import RuntimeNodeExecutionSupportMixin
from app.services.runtime_records import CallbackHandleResult, ExecutionArtifacts
from app.services.runtime_types import (
    AuthorizedContextRefs,
    FlowCheckpointState,
    WorkflowExecutionError,
)
from app.services.tool_gateway import ToolGateway


def _utcnow() -> datetime:
    return datetime.now(UTC)


class RuntimeService(
    RuntimeNodeExecutionSupportMixin,
    RuntimeLifecycleSupportMixin,
    RuntimeGraphSupportMixin,
):
    def __init__(
        self,
        plugin_call_proxy: PluginCallProxy | None = None,
        resume_scheduler: RunResumeScheduler | None = None,
    ) -> None:
        self._uses_default_plugin_proxy = plugin_call_proxy is None
        self._plugin_call_proxy = plugin_call_proxy or get_plugin_call_proxy()
        self._resume_scheduler = resume_scheduler or get_run_resume_scheduler()
        self._flow_compiler = FlowCompiler()
        self._compiled_blueprints = CompiledBlueprintService(self._flow_compiler)
        self._artifact_store = RuntimeArtifactStore()
        self._context_service = ContextService()
        self._callback_tickets = RunCallbackTicketService()
        self._tool_gateway = ToolGateway(
            plugin_call_proxy=self._plugin_call_proxy,
            artifact_store=self._artifact_store,
        )
        self._agent_runtime = AgentRuntime(
            tool_gateway=self._tool_gateway,
            artifact_store=self._artifact_store,
            context_service=self._context_service,
        )

    def execute_workflow(
        self,
        db: Session,
        workflow: Workflow,
        input_payload: dict,
    ) -> ExecutionArtifacts:
        self._refresh_runtime_dependencies(db)
        try:
            workflow_version = self._ensure_workflow_version_for_execution(db, workflow)
            blueprint_record = self._compiled_blueprints.ensure_for_workflow_version(
                db,
                workflow_version,
            )
        except (CompiledBlueprintError, WorkflowExecutionError) as exc:
            raise WorkflowExecutionError(str(exc)) from exc

        return self._execute_compiled_workflow(
            db,
            workflow=workflow,
            workflow_version=workflow_version,
            blueprint_record=blueprint_record,
            input_payload=input_payload,
        )

    def execute_compiled_workflow(
        self,
        db: Session,
        *,
        workflow: Workflow,
        workflow_version: WorkflowVersion,
        blueprint_record: WorkflowCompiledBlueprint,
        input_payload: dict,
    ) -> ExecutionArtifacts:
        self._refresh_runtime_dependencies(db)
        try:
            return self._execute_compiled_workflow(
                db,
                workflow=workflow,
                workflow_version=workflow_version,
                blueprint_record=blueprint_record,
                input_payload=input_payload,
            )
        except (CompiledBlueprintError, WorkflowExecutionError) as exc:
            raise WorkflowExecutionError(str(exc)) from exc

    def _execute_compiled_workflow(
        self,
        db: Session,
        *,
        workflow: Workflow,
        workflow_version: WorkflowVersion,
        blueprint_record: WorkflowCompiledBlueprint,
        input_payload: dict,
    ) -> ExecutionArtifacts:
        if blueprint_record.workflow_id != workflow.id:
            raise WorkflowExecutionError("Compiled blueprint does not belong to the workflow.")
        if blueprint_record.workflow_version_id != workflow_version.id:
            raise WorkflowExecutionError(
                "Compiled blueprint does not match the requested workflow version."
            )

        blueprint = self._compiled_blueprints.load_blueprint(blueprint_record)
        if any(node.type == "loop" for node in blueprint.ordered_nodes):
            raise WorkflowExecutionError("Loop nodes are not supported by the MVP executor yet.")

        run = Run(
            id=str(uuid4()),
            workflow_id=workflow.id,
            workflow_version=workflow_version.version,
            compiled_blueprint_id=blueprint_record.id,
            status="running",
            input_payload=input_payload,
            checkpoint_payload={},
            started_at=_utcnow(),
        )
        db.add(run)
        db.flush()

        events = [self._build_event(run.id, None, "run.started", {"input": input_payload})]
        try:
            self._continue_execution(
                db,
                run=run,
                blueprint=blueprint,
                input_payload=input_payload,
                checkpoint_state=FlowCheckpointState(
                    ordered_node_ids=[node.id for node in blueprint.ordered_nodes]
                ),
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

        artifacts = self.load_run(db, run.id) or ExecutionArtifacts(
            run=run,
            node_runs=[],
            events=[],
        )
        if artifacts.run.status == "failed":
            raise WorkflowExecutionError(
                artifacts.run.error_message or "Workflow execution failed."
            )
        return artifacts

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

    def _ensure_workflow_version_for_execution(
        self,
        db: Session,
        workflow: Workflow,
    ) -> WorkflowVersion:
        record = db.scalar(
            select(WorkflowVersion).where(
                WorkflowVersion.workflow_id == workflow.id,
                WorkflowVersion.version == workflow.version,
            )
        )
        if record is not None:
            return record

        record = WorkflowVersion(
            id=str(uuid4()),
            workflow_id=workflow.id,
            version=workflow.version,
            definition=deepcopy(workflow.definition or {}),
        )
        db.add(record)
        return record

    def _load_workflow_version(
        self,
        db: Session,
        *,
        workflow_id: str,
        workflow_version: str,
    ) -> WorkflowVersion:
        record = db.scalar(
            select(WorkflowVersion).where(
                WorkflowVersion.workflow_id == workflow_id,
                WorkflowVersion.version == workflow_version,
            )
        )
        if record is None:
            raise WorkflowExecutionError(
                f"Workflow version '{workflow_version}' is not available."
            )
        return record

    def _resolve_run_blueprint_record(
        self,
        db: Session,
        run: Run,
    ):
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
            artifacts = self.load_run(db, ticket_record.run_id)
            if artifacts is None:
                raise WorkflowExecutionError("Run not found for callback ticket.")
            return CallbackHandleResult(
                callback_status="already_consumed",
                ticket=ticket_record.id,
                run_id=ticket_record.run_id,
                node_run_id=ticket_record.node_run_id,
                artifacts=artifacts,
            )

        if ticket_record.status == "expired":
            artifacts = self.load_run(db, ticket_record.run_id)
            if artifacts is None:
                raise WorkflowExecutionError("Run not found for callback ticket.")
            return CallbackHandleResult(
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
                            "expires_at": (
                                callback_snapshot.expires_at.isoformat().replace("+00:00", "Z")
                                if callback_snapshot.expires_at is not None
                                else None
                            ),
                            "expired_at": (
                                callback_snapshot.expired_at.isoformat().replace("+00:00", "Z")
                                if callback_snapshot.expired_at is not None
                                else None
                            ),
                            "source": source,
                            "cleanup": False,
                        },
                    )
                ],
            )
            db.commit()
            artifacts = self.load_run(db, ticket_record.run_id)
            if artifacts is None:
                raise WorkflowExecutionError("Run not found for callback ticket.")
            return CallbackHandleResult(
                callback_status="expired",
                ticket=ticket_record.id,
                run_id=ticket_record.run_id,
                node_run_id=ticket_record.node_run_id,
                artifacts=artifacts,
            )

        if ticket_record.status != "pending":
            artifacts = self.load_run(db, ticket_record.run_id)
            if artifacts is None:
                raise WorkflowExecutionError("Run not found for callback ticket.")
            return CallbackHandleResult(
                callback_status="ignored",
                ticket=ticket_record.id,
                run_id=ticket_record.run_id,
                node_run_id=ticket_record.node_run_id,
                artifacts=artifacts,
            )

        if run.status != "waiting" or node_run.status != "waiting_callback":
            self._callback_tickets.cancel_pending_for_node_run(
                db,
                node_run_id=node_run.id,
                reason="callback_received_after_run_left_waiting",
            )
            artifacts = self.load_run(db, ticket_record.run_id)
            if artifacts is None:
                raise WorkflowExecutionError("Run not found for callback ticket.")
            db.commit()
            return CallbackHandleResult(
                callback_status="ignored",
                ticket=ticket_record.id,
                run_id=ticket_record.run_id,
                node_run_id=ticket_record.node_run_id,
                artifacts=artifacts,
            )

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

        artifacts = self.resume_run(
            db,
            run.id,
            source=source,
            reason=f"callback:{callback_snapshot.ticket}",
        )
        return CallbackHandleResult(
            callback_status="accepted",
            ticket=callback_snapshot.ticket,
            run_id=run.id,
            node_run_id=node_run.id,
            artifacts=artifacts,
        )

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

    def _refresh_runtime_dependencies(self, db: Session) -> None:
        if not self._uses_default_plugin_proxy:
            return
        from app.services.plugin_registry_store import get_plugin_registry_store

        registry = get_plugin_registry()
        get_plugin_registry_store().hydrate_registry(db, registry)
        self._plugin_call_proxy = PluginCallProxy(registry)
        self._tool_gateway = ToolGateway(
            plugin_call_proxy=self._plugin_call_proxy,
            artifact_store=self._artifact_store,
        )
        self._agent_runtime = AgentRuntime(
            tool_gateway=self._tool_gateway,
            artifact_store=self._artifact_store,
            context_service=self._context_service,
        )

    def _continue_execution(
        self,
        db: Session,
        *,
        run: Run,
        blueprint: CompiledWorkflowBlueprint,
        input_payload: dict,
        checkpoint_state: FlowCheckpointState,
        events: list[RunEvent],
    ) -> None:
        runtime_nodes = {
            node.id: self._node_payload(node)
            for node in blueprint.ordered_nodes
        }
        global_context = self._context_service.build_global_context(
            trigger_input=input_payload,
            workflow_variables=blueprint.workflow_variables,
        )

        for node_index in range(checkpoint_state.next_node_index, len(blueprint.ordered_nodes)):
            compiled_node = blueprint.ordered_nodes[node_index]
            node = runtime_nodes[compiled_node.id]
            node_id = node["id"]
            retry_policy = self._retry_policy_for_node(node)
            upstream_input = deepcopy(checkpoint_state.upstream_inputs.get(node_id, {}))
            mapped_input = deepcopy(checkpoint_state.mapped_inputs.get(node_id, {}))
            accumulated_input = self._accumulated_input_for_node(
                upstream=upstream_input,
                mapped=mapped_input,
            )
            activation_sources = set(checkpoint_state.activated_by.get(node_id, []))
            authorized_context = self._authorized_context_for_node(node)
            join_decision = self._join_decision_for_node(
                node=node,
                incoming=blueprint.incoming_nodes.get(node_id, ()),
                activated_sources=activation_sources,
            )

            node_run = self._prepare_node_run_for_execution(
                db,
                run=run,
                node=node,
                checkpoint_state=checkpoint_state,
                node_index=node_index,
                input_payload=input_payload,
                upstream_input=upstream_input,
                mapped_input=mapped_input,
                accumulated_input=accumulated_input,
                activation_sources=activation_sources,
                authorized_context=authorized_context,
                join_decision=join_decision,
                global_context=global_context,
                events=events,
            )
            if node_run is None:
                checkpoint_state.next_node_index = node_index + 1
                run.checkpoint_payload = checkpoint_state.as_dict()
                continue

            try:
                result = self._execute_node_with_retry(
                    db,
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
                    outputs=checkpoint_state.outputs,
                    retry_policy=retry_policy,
                    global_context=global_context,
                    events=events,
                )
            except Exception as exc:
                node_error = str(exc)
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
                    outgoing_edges=blueprint.outgoing_edges.get(node_id, ()),
                    node_lookup=runtime_nodes,
                    checkpoint_state=checkpoint_state,
                )
                checkpoint_state.next_node_index = node_index + 1
                run.checkpoint_payload = checkpoint_state.as_dict()
                run.current_node_id = None
                if not activated_targets:
                    raise WorkflowExecutionError(node_error) from exc
                continue

            self._apply_result_events(run.id, node_run.id, result, events)
            if result.suspended:
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
                return

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
                outgoing_edges=blueprint.outgoing_edges.get(node_id, ()),
                node_lookup=runtime_nodes,
                checkpoint_state=checkpoint_state,
            )
            checkpoint_state.waiting_node_run_id = None
            checkpoint_state.next_node_index = node_index + 1
            run.current_node_id = None
            run.checkpoint_payload = checkpoint_state.as_dict()

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

