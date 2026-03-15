from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import Run, RunEvent
from app.models.workflow import Workflow, WorkflowCompiledBlueprint, WorkflowVersion
from app.services.agent_runtime import AgentRuntime
from app.services.artifact_store import RuntimeArtifactStore
from app.services.compiled_blueprints import (
    CompiledBlueprintError,
    CompiledBlueprintService,
)
from app.services.context_service import ContextService
from app.services.credential_store import CredentialStore
from app.services.flow_compiler import FlowCompiler
from app.services.llm_provider import LLMProviderService
from app.services.plugin_runtime import (
    PluginCallProxy,
    get_plugin_call_proxy,
    get_plugin_registry,
)
from app.services.run_callback_tickets import RunCallbackTicketService
from app.services.run_resume_scheduler import (
    RunResumeScheduler,
    get_run_resume_scheduler,
)
from app.services.runtime_execution_adapters import RuntimeExecutionAdapterRegistry
from app.services.runtime_execution_progress_support import (
    RuntimeExecutionProgressSupportMixin,
)
from app.services.runtime_graph_support import RuntimeGraphSupportMixin
from app.services.runtime_lifecycle_support import RuntimeLifecycleSupportMixin
from app.services.runtime_node_dispatch_support import RuntimeNodeDispatchSupportMixin
from app.services.runtime_node_execution_support import RuntimeNodeExecutionSupportMixin
from app.services.runtime_node_preparation_support import (
    RuntimeNodePreparationSupportMixin,
)
from app.services.runtime_records import ExecutionArtifacts
from app.services.runtime_run_support import RuntimeRunSupportMixin
from app.services.runtime_types import (
    CompiledWorkflowBlueprint,
    FlowCheckpointState,
    WorkflowExecutionError,
)
from app.services.sensitive_access_control import SensitiveAccessControlService
from app.services.tool_gateway import ToolGateway


def _utcnow() -> datetime:
    return datetime.now(UTC)


class RuntimeService(
    RuntimeRunSupportMixin,
    RuntimeNodePreparationSupportMixin,
    RuntimeNodeDispatchSupportMixin,
    RuntimeNodeExecutionSupportMixin,
    RuntimeExecutionProgressSupportMixin,
    RuntimeLifecycleSupportMixin,
    RuntimeGraphSupportMixin,
):
    def __init__(
        self,
        plugin_call_proxy: PluginCallProxy | None = None,
        resume_scheduler: RunResumeScheduler | None = None,
        credential_store: CredentialStore | None = None,
        sensitive_access_service: SensitiveAccessControlService | None = None,
    ) -> None:
        self._uses_default_plugin_proxy = plugin_call_proxy is None
        self._plugin_call_proxy = plugin_call_proxy or get_plugin_call_proxy()
        self._resume_scheduler = resume_scheduler or get_run_resume_scheduler()
        self._flow_compiler = FlowCompiler()
        self._compiled_blueprints = CompiledBlueprintService(self._flow_compiler)
        self._artifact_store = RuntimeArtifactStore()
        self._context_service = ContextService()
        if credential_store is not None:
            self._credential_store = credential_store
            self._sensitive_access = (
                sensitive_access_service or credential_store.sensitive_access_service
            )
        else:
            self._sensitive_access = sensitive_access_service or SensitiveAccessControlService()
            self._credential_store = CredentialStore(
                sensitive_access_service=self._sensitive_access
            )
        self._callback_tickets = RunCallbackTicketService()
        self._llm_provider = LLMProviderService()
        self._execution_adapter_registry = RuntimeExecutionAdapterRegistry(
            artifact_store=self._artifact_store,
            context_service=self._context_service,
        )
        self._tool_gateway = ToolGateway(
            plugin_call_proxy=self._plugin_call_proxy,
            artifact_store=self._artifact_store,
            credential_store=self._credential_store,
            sensitive_access_service=self._sensitive_access,
        )
        self._agent_runtime = AgentRuntime(
            tool_gateway=self._tool_gateway,
            artifact_store=self._artifact_store,
            context_service=self._context_service,
            credential_store=self._credential_store,
            llm_provider=self._llm_provider,
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

    def _refresh_runtime_dependencies(self, db: Session) -> None:
        if not self._uses_default_plugin_proxy:
            return
        from app.services.plugin_registry_store import get_plugin_registry_store

        registry = get_plugin_registry()
        get_plugin_registry_store().hydrate_registry(db, registry)
        self._plugin_call_proxy = PluginCallProxy(registry)
        self._execution_adapter_registry = RuntimeExecutionAdapterRegistry(
            artifact_store=self._artifact_store,
            context_service=self._context_service,
        )
        self._tool_gateway = ToolGateway(
            plugin_call_proxy=self._plugin_call_proxy,
            artifact_store=self._artifact_store,
            sensitive_access_service=self._sensitive_access,
        )
        self._agent_runtime = AgentRuntime(
            tool_gateway=self._tool_gateway,
            artifact_store=self._artifact_store,
            context_service=self._context_service,
            llm_provider=self._llm_provider,
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
                self._handle_failed_node_execution(
                    db,
                    run=run,
                    node=node,
                    node_run=node_run,
                    node_index=node_index,
                    checkpoint_state=checkpoint_state,
                    events=events,
                    node_lookup=runtime_nodes,
                    outgoing_edges=blueprint.outgoing_edges.get(node_id, ()),
                    cause=exc,
                )
                continue

            self._apply_result_events(run.id, node_run.id, result, events)
            if result.suspended:
                self._handle_suspended_node_execution(
                    db,
                    run=run,
                    node=node,
                    node_run=node_run,
                    node_index=node_index,
                    result=result,
                    checkpoint_state=checkpoint_state,
                    events=events,
                )
                return

            self._handle_succeeded_node_execution(
                db,
                run=run,
                node=node,
                node_run=node_run,
                node_index=node_index,
                result=result,
                checkpoint_state=checkpoint_state,
                events=events,
                node_lookup=runtime_nodes,
                outgoing_edges=blueprint.outgoing_edges.get(node_id, ()),
            )

        self._finalize_completed_run(
            run=run,
            blueprint=blueprint,
            checkpoint_state=checkpoint_state,
            events=events,
        )

