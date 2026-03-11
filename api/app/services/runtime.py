from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.run import AICallRecord, NodeRun, Run, RunArtifact, RunEvent, ToolCallRecord
from app.models.workflow import Workflow, WorkflowVersion
from app.services.agent_runtime import AgentRuntime
from app.services.artifact_store import RuntimeArtifactStore
from app.services.context_service import ContextService
from app.services.flow_compiler import FlowCompiler
from app.services.plugin_runtime import (
    PluginCallProxy,
    get_plugin_call_proxy,
    get_plugin_registry,
)
from app.services.run_resume_scheduler import (
    RunResumeScheduler,
    get_run_resume_scheduler,
)
from app.services.run_callback_tickets import RunCallbackTicketService
from app.services.runtime_graph_support import RuntimeGraphSupportMixin
from app.services.runtime_types import (
    AuthorizedContextRefs,
    CompiledEdge,
    CompiledNode,
    CompiledWorkflowBlueprint,
    FlowCheckpointState,
    JoinDecision,
    NodeExecutionResult,
    RetryPolicy,
    RuntimeEvent,
    WorkflowExecutionError,
)
from app.services.tool_gateway import ToolGateway


@dataclass
class ExecutionArtifacts:
    run: Run
    node_runs: list[NodeRun]
    events: list[RunEvent]
    artifacts: list[RunArtifact] = field(default_factory=list)
    tool_calls: list[ToolCallRecord] = field(default_factory=list)
    ai_calls: list[AICallRecord] = field(default_factory=list)


@dataclass
class CallbackHandleResult:
    callback_status: str
    ticket: str
    run_id: str
    node_run_id: str
    artifacts: ExecutionArtifacts


def _utcnow() -> datetime:
    return datetime.now(UTC)


class RuntimeService(RuntimeGraphSupportMixin):
    def __init__(
        self,
        plugin_call_proxy: PluginCallProxy | None = None,
        resume_scheduler: RunResumeScheduler | None = None,
    ) -> None:
        self._uses_default_plugin_proxy = plugin_call_proxy is None
        self._plugin_call_proxy = plugin_call_proxy or get_plugin_call_proxy()
        self._resume_scheduler = resume_scheduler or get_run_resume_scheduler()
        self._artifact_store = RuntimeArtifactStore()
        self._context_service = ContextService()
        self._flow_compiler = FlowCompiler()
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
            blueprint = self._flow_compiler.compile_workflow(workflow)
        except Exception as exc:
            raise WorkflowExecutionError(str(exc)) from exc
        if any(node.type == "loop" for node in blueprint.ordered_nodes):
            raise WorkflowExecutionError("Loop nodes are not supported by the MVP executor yet.")

        run = Run(
            id=str(uuid4()),
            workflow_id=workflow.id,
            workflow_version=workflow.version,
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

        workflow_version = db.scalar(
            select(WorkflowVersion).where(
                WorkflowVersion.workflow_id == run.workflow_id,
                WorkflowVersion.version == run.workflow_version,
            )
        )
        if workflow_version is None:
            raise WorkflowExecutionError(
                f"Workflow version '{run.workflow_version}' is not available for resume."
            )

        try:
            blueprint = self._flow_compiler.compile_workflow_version(workflow_version)
        except Exception as exc:
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

        run = db.get(Run, ticket_record.run_id)
        node_run = db.get(NodeRun, ticket_record.node_run_id)
        if run is None or node_run is None:
            raise WorkflowExecutionError("Run callback ticket points to missing runtime records.")

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
        events.append(
            self._build_event(
                run.id,
                None,
                "run.completed",
                {"output": run.output_payload},
            )
        )

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

        if (
            checkpoint_state.waiting_node_run_id
            and checkpoint_state.next_node_index == node_index
        ):
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
                {"node_id": node["id"], "node_type": node_run.node_type},
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
                [self._edge_payload(item) for item in outgoing_edges],
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
        self._callback_tickets.cancel_pending_for_node_run(
            db,
            node_run_id=node_run.id,
            reason=reason,
        )
        checkpoint_payload = dict(node_run.checkpoint_payload or {})
        if checkpoint_payload.pop("callback_ticket", None) is not None:
            node_run.checkpoint_payload = checkpoint_payload

    def _schedule_waiting_resume_if_needed(
        self,
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
