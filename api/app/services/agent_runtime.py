from __future__ import annotations

import json
import logging
from copy import deepcopy
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import AICallRecord, NodeRun
from app.schemas.workflow_node_validation import WorkflowNodeSkillBindingPolicy
from app.services.agent_runtime_llm_support import AgentRuntimeLLMSupportMixin
from app.services.artifact_store import RuntimeArtifactStore
from app.services.context_service import ContextService
from app.services.credential_store import CredentialStore
from app.services.llm_provider import LLMProviderService, LLMResponse
from app.services.runtime_execution_policy import resolve_tool_execution_policy
from app.services.runtime_types import (
    PHASE_STATUS_MAP,
    AgentExecutionResult,
    AgentSkillReferenceRequest,
    RuntimeEvent,
    ToolExecutionResult,
    WorkflowExecutionError,
)
from app.services.skill_catalog import SkillCatalogError, SkillCatalogService
from app.services.tool_execution_events import build_tool_execution_events
from app.services.tool_gateway import ToolGateway

_log = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(UTC)


class AgentRuntime(AgentRuntimeLLMSupportMixin):
    def __init__(
        self,
        *,
        tool_gateway: ToolGateway,
        artifact_store: RuntimeArtifactStore | None = None,
        context_service: ContextService | None = None,
        credential_store: CredentialStore | None = None,
        llm_provider: LLMProviderService | None = None,
        skill_catalog: SkillCatalogService | None = None,
    ) -> None:
        self._tool_gateway = tool_gateway
        self._artifact_store = artifact_store or RuntimeArtifactStore()
        self._context_service = context_service or ContextService()
        self._credential_store = credential_store or CredentialStore()
        self._llm_provider = llm_provider or LLMProviderService()
        self._skill_catalog = skill_catalog or SkillCatalogService()

    # ------------------------------------------------------------------
    # Main execute orchestration
    # ------------------------------------------------------------------

    def execute(
        self,
        db: Session,
        *,
        run_id: str,
        node: dict[str, Any],
        node_run: NodeRun,
        node_input: dict[str, Any],
        resolved_credentials: dict[str, str] | None = None,
    ) -> AgentExecutionResult:
        events: list[RuntimeEvent] = []
        config = dict(node.get("config") or {})
        model_config = self._to_dict(config.get("model"))
        creds = self._credential_store.resolve_masked_runtime_credentials(
            db,
            credentials=resolved_credentials or {},
        )
        if creds:
            model_config = dict(model_config)
            if "apiKey" in creds:
                model_config["apiKey"] = creds["apiKey"]
        checkpoint = self._to_dict(node_run.checkpoint_payload)
        enriched_node_input = dict(node_input)
        main_plan_skill_query = self._build_skill_retrieval_query(
            config=config,
            phase="main_plan",
            base_node_input=enriched_node_input,
        )
        default_skill_context, default_skill_reference_loads = self._resolve_skill_context(
            db,
            config,
            phase="main_plan",
            retrieval_query=main_plan_skill_query,
        )
        working_context = self._context_service.update_working_context(
            node_run,
            role=config.get("role"),
            goal=config.get("goal"),
            prompt=config.get("prompt"),
            system_prompt=config.get("systemPrompt"),
            authorized_context=node_input.get("authorized_context", {}),
            global_context=node_input.get("global_context", {}),
            skill_context=default_skill_context,
        )

        self._transition_phase(node_run, "preparing", events, node)
        plan = self._restore_plan(checkpoint.get("plan"))
        if plan is None:
            self._transition_phase(node_run, "running_main", events, node)
            plan_node_input = dict(enriched_node_input)
            if default_skill_context:
                plan_node_input["skill_context"] = default_skill_context
            else:
                plan_node_input.pop("skill_context", None)
            self._emit_skill_reference_fetch_event(
                events,
                node=node,
                phase="main_plan",
                loaded_references=default_skill_reference_loads,
            )
            plan = self._build_plan(
                config,
                model_config,
                plan_node_input,
                allow_skill_reference_request=True,
            )
            plan_llm_response = plan.llm_response
            if plan.skill_reference_request is not None and plan_llm_response is not None:
                self._record_ai_call(
                    db,
                    run_id=run_id,
                    node_run=node_run,
                    role="main_plan_skill_reference_request",
                    model_config=model_config,
                    input_value={
                        "global_context": node_input.get("global_context", {}),
                        "working_context": working_context,
                        "authorized_context": node_input.get("authorized_context", {}),
                        "skill_context": plan_node_input.get("skill_context"),
                    },
                    output_value={
                        "phase": "main_plan",
                        "skill_reference_request": {
                            "skill_id": plan.skill_reference_request.skill_id,
                            "reference_id": plan.skill_reference_request.reference_id,
                            "reason": plan.skill_reference_request.reason,
                        },
                    },
                    assistant=False,
                    llm_response=plan_llm_response,
                )
                (
                    plan_node_input,
                    explicit_skill_reference_loads,
                    skill_reference_request_event,
                ) = self._apply_plan_skill_reference_request(
                    db,
                    config=config,
                    node=node,
                    base_node_input=plan_node_input,
                    retrieval_query=main_plan_skill_query,
                    current_loaded_references=default_skill_reference_loads,
                    request=plan.skill_reference_request,
                )
                if skill_reference_request_event is not None:
                    events.append(skill_reference_request_event)
                if explicit_skill_reference_loads:
                    self._emit_skill_reference_fetch_event(
                        events,
                        node=node,
                        phase="main_plan",
                        loaded_references=explicit_skill_reference_loads,
                    )
                    plan = self._build_plan(
                        config,
                        model_config,
                        plan_node_input,
                        allow_skill_reference_request=False,
                    )
                    plan_llm_response = plan.llm_response
            checkpoint["plan"] = plan.as_dict()
            node_run.checkpoint_payload = deepcopy(checkpoint)
            self._record_ai_call(
                db,
                run_id=run_id,
                node_run=node_run,
                role="main_plan",
                model_config=model_config,
                input_value={
                    "global_context": node_input.get("global_context", {}),
                    "working_context": working_context,
                    "authorized_context": node_input.get("authorized_context", {}),
                    "skill_context": plan_node_input.get("skill_context"),
                },
                output_value=plan.as_dict(),
                assistant=False,
                llm_response=plan_llm_response,
            )
            events.append(
                RuntimeEvent(
                    "agent.plan.completed",
                    {
                        "node_id": node["id"],
                        "tool_count": len(plan.tool_calls),
                        "need_assistant": plan.need_assistant,
                    },
                )
            )

        tool_results = [
            self._restore_tool_result(item)
            for item in checkpoint.get("tool_results", [])
            if isinstance(item, dict)
        ]
        raw_next_tool_index = checkpoint.get("next_tool_index")
        next_tool_index = (
            len(tool_results)
            if raw_next_tool_index is None
            else int(raw_next_tool_index)
        )
        artifact_refs = list(node_run.artifact_refs or [])

        if next_tool_index < len(plan.tool_calls):
            self._transition_phase(node_run, "tool_execute", events, node)
        while next_tool_index < len(plan.tool_calls):
            tool_call = plan.tool_calls[next_tool_index]
            tool_execution_policy = resolve_tool_execution_policy(
                tool_call=tool_call.execution,
                tool_policy=self._to_dict(config.get("toolPolicy")),
                ecosystem=tool_call.ecosystem,
            )
            try:
                tool_result = self._tool_gateway.execute(
                    db,
                    run_id=run_id,
                    node_run=node_run,
                    phase=node_run.phase,
                    tool_id=tool_call.tool_id,
                    ecosystem=tool_call.ecosystem,
                    adapter_id=tool_call.adapter_id,
                    inputs=tool_call.inputs,
                    credentials=creds or None,
                    timeout_ms=tool_call.timeout_ms,
                    execution_policy=tool_execution_policy,
                    allowed_tool_ids=self._allowed_tool_ids(config),
                    retry_count=node_run.retry_count,
                )
            except WorkflowExecutionError as exc:
                fallback_output = self._fallback_output(config, error_message=str(exc))
                if fallback_output is None:
                    raise
                if exc.runtime_events:
                    events.extend(exc.runtime_events)
                self._transition_phase(node_run, "main_finalize", events, node)
                node_run.waiting_reason = None
                events.append(
                    RuntimeEvent(
                        "node.fallback.used",
                        {
                            "node_id": node["id"],
                            "reason": str(exc),
                        },
                    )
                )
                self._record_ai_call(
                    db,
                    run_id=run_id,
                    node_run=node_run,
                    role="main_finalize",
                    model_config=model_config,
                    input_value={"error": str(exc), "working_context": working_context},
                    output_value=fallback_output,
                    assistant=False,
                    error_message=str(exc),
                )
                self._transition_phase(node_run, "emit_output", events, node)
                self._context_service.update_working_context(
                    node_run,
                    tool_error=str(exc),
                    final_output=fallback_output,
                )
                node_run.checkpoint_payload = deepcopy(checkpoint)
                self._context_service.replace_artifact_refs(node_run, artifact_refs)
                return AgentExecutionResult(
                    output=fallback_output,
                    evidence_pack=node_run.evidence_context,
                    artifact_refs=artifact_refs,
                    tool_results=tool_results,
                    events=events,
                )

            events.extend(
                build_tool_execution_events(
                    node_id=node["id"],
                    tool_id=tool_call.tool_id,
                    tool_name=str(tool_result.meta.get("tool_name") or tool_call.tool_id),
                    tool_result=tool_result,
                )
            )
            if next_tool_index < len(tool_results):
                tool_results[next_tool_index] = tool_result
            else:
                tool_results.append(tool_result)
            checkpoint["tool_results"] = [
                self._tool_result_to_dict(result) for result in tool_results
            ]
            checkpoint["next_tool_index"] = next_tool_index
            sensitive_access_checkpoint = tool_result.meta.get("sensitive_access")
            if isinstance(sensitive_access_checkpoint, dict):
                checkpoint["sensitive_access"] = dict(sensitive_access_checkpoint)
            else:
                checkpoint.pop("sensitive_access", None)
            if tool_result.raw_ref:
                artifact_refs = self._append_unique_ref(artifact_refs, tool_result.raw_ref)
            self._context_service.update_working_context(
                node_run,
                tool_results=[self._tool_result_to_dict(result) for result in tool_results],
            )

            if tool_result.status == "waiting":
                waiting_status = self._waiting_status_for_tool_result(tool_result)
                waiting_reason = str(
                    tool_result.meta.get("waiting_reason")
                    or tool_result.summary
                    or "Waiting for tool completion."
                )
                node_run.status = waiting_status
                node_run.phase = waiting_status
                node_run.waiting_reason = waiting_reason
                node_run.checkpoint_payload = deepcopy(checkpoint)
                self._context_service.replace_artifact_refs(node_run, artifact_refs)
                events.append(
                    RuntimeEvent(
                        "tool.waiting",
                        {
                            "node_id": node["id"],
                            "tool_id": tool_call.tool_id,
                            "reason": waiting_reason,
                            "raw_ref": tool_result.raw_ref,
                        },
                    )
                )
                return AgentExecutionResult(
                    suspended=True,
                    waiting_status=waiting_status,
                    waiting_reason=waiting_reason,
                    resume_after_seconds=self._resume_after_seconds_for_tool_result(tool_result),
                    evidence_pack=node_run.evidence_context,
                    artifact_refs=artifact_refs,
                    tool_results=tool_results,
                    events=events,
                )

            events.append(
                RuntimeEvent(
                    "tool.completed",
                    {
                        "node_id": node["id"],
                        "tool_id": tool_call.tool_id,
                        "summary": tool_result.summary,
                        "raw_ref": tool_result.raw_ref,
                        "content_type": tool_result.content_type,
                    },
                )
            )
            next_tool_index += 1
            checkpoint["next_tool_index"] = next_tool_index
            node_run.checkpoint_payload = deepcopy(checkpoint)

        evidence_pack = self._to_dict(node_run.evidence_context)
        if self._should_run_assistant(config, tool_results) and not evidence_pack:
            self._transition_phase(node_run, "assistant_distill", events, node)
            assistant_skill_query = self._build_skill_retrieval_query(
                config=config,
                phase="assistant_distill",
                base_node_input=enriched_node_input,
                plan=plan,
                tool_results=tool_results,
                evidence_pack=evidence_pack,
            )
            assistant_node_input, assistant_skill_reference_loads = self._build_phase_node_input(
                db,
                config=config,
                base_node_input=enriched_node_input,
                phase="assistant_distill",
                retrieval_query=assistant_skill_query,
            )
            self._emit_skill_reference_fetch_event(
                events,
                node=node,
                phase="assistant_distill",
                loaded_references=assistant_skill_reference_loads,
            )
            (
                assistant_node_input,
                assistant_explicit_skill_reference_loads,
                assistant_skill_reference_request_event,
            ) = self._maybe_apply_phase_skill_reference_request(
                db,
                run_id=run_id,
                node_run=node_run,
                node=node,
                phase="assistant_distill",
                config=config,
                model_config=model_config,
                base_node_input=enriched_node_input,
                phase_node_input=assistant_node_input,
                retrieval_query=assistant_skill_query,
                current_loaded_references=assistant_skill_reference_loads,
                plan=plan,
                tool_results=tool_results,
                evidence_pack=evidence_pack,
            )
            if assistant_skill_reference_request_event is not None:
                events.append(assistant_skill_reference_request_event)
            if assistant_explicit_skill_reference_loads:
                self._emit_skill_reference_fetch_event(
                    events,
                    node=node,
                    phase="assistant_distill",
                    loaded_references=assistant_explicit_skill_reference_loads,
                )
            distilled_evidence, distill_llm_response = self._distill_evidence(
                config,
                model_config,
                tool_results,
                node_input=assistant_node_input,
            )
            evidence_artifact = self._artifact_store.create_artifact(
                db,
                run_id=run_id,
                node_run_id=node_run.id,
                artifact_kind="evidence_pack",
                value=distilled_evidence.as_dict(),
                content_type="json",
                summary=distilled_evidence.summary,
                metadata_payload={"node_id": node["id"]},
            )
            distilled_evidence.artifact_refs = self._append_unique_ref(
                distilled_evidence.artifact_refs,
                evidence_artifact.uri,
            )
            evidence_pack = distilled_evidence.as_dict()
            checkpoint["evidence_pack"] = evidence_pack
            node_run.checkpoint_payload = deepcopy(checkpoint)
            self._context_service.set_evidence_context(node_run, evidence_pack)
            artifact_refs = self._append_unique_ref(artifact_refs, evidence_artifact.uri)
            self._record_ai_call(
                db,
                run_id=run_id,
                node_run=node_run,
                role="assistant_distill",
                model_config=self._assistant_model_config(config, model_config),
                input_value={
                    "tool_results": [
                        self._tool_result_to_dict(result) for result in tool_results
                    ],
                    "skill_context": assistant_node_input.get("skill_context"),
                },
                output_value=evidence_pack,
                assistant=True,
                llm_response=distill_llm_response,
            )
            events.append(
                RuntimeEvent(
                    "assistant.completed",
                    {
                        "node_id": node["id"],
                        "summary": evidence_pack.get("summary", ""),
                        "evidence_ref": evidence_artifact.uri,
                    },
                )
            )

        self._transition_phase(node_run, "main_finalize", events, node)
        finalize_skill_query = self._build_skill_retrieval_query(
            config=config,
            phase="main_finalize",
            base_node_input=enriched_node_input,
            plan=plan,
            tool_results=tool_results,
            evidence_pack=evidence_pack,
        )
        finalize_node_input, finalize_skill_reference_loads = self._build_phase_node_input(
            db,
            config=config,
            base_node_input=enriched_node_input,
            phase="main_finalize",
            retrieval_query=finalize_skill_query,
        )
        self._emit_skill_reference_fetch_event(
            events,
            node=node,
            phase="main_finalize",
            loaded_references=finalize_skill_reference_loads,
        )
        (
            finalize_node_input,
            finalize_explicit_skill_reference_loads,
            finalize_skill_reference_request_event,
        ) = self._maybe_apply_phase_skill_reference_request(
            db,
            run_id=run_id,
            node_run=node_run,
            node=node,
            phase="main_finalize",
            config=config,
            model_config=model_config,
            base_node_input=enriched_node_input,
            phase_node_input=finalize_node_input,
            retrieval_query=finalize_skill_query,
            current_loaded_references=finalize_skill_reference_loads,
            plan=plan,
            tool_results=tool_results,
            evidence_pack=evidence_pack,
        )
        if finalize_skill_reference_request_event is not None:
            events.append(finalize_skill_reference_request_event)
        if finalize_explicit_skill_reference_loads:
            self._emit_skill_reference_fetch_event(
                events,
                node=node,
                phase="main_finalize",
                loaded_references=finalize_explicit_skill_reference_loads,
            )
        final_output, finalize_llm_response, streaming_deltas_emitted = self._finalize_output(
            config=config,
            model_config=model_config,
            plan=plan,
            tool_results=tool_results,
            evidence_pack=evidence_pack,
            artifact_refs=artifact_refs,
            node_input=finalize_node_input,
            events=events,
            node=node,
        )
        self._record_ai_call(
            db,
            run_id=run_id,
            node_run=node_run,
            role="main_finalize",
            model_config=model_config,
            input_value={
                "tool_results": [self._tool_result_to_dict(result) for result in tool_results],
                "evidence_pack": evidence_pack,
                "working_context": node_run.working_context,
                "skill_context": finalize_node_input.get("skill_context"),
            },
            output_value=final_output,
            assistant=False,
            llm_response=finalize_llm_response,
        )
        if not streaming_deltas_emitted:
            self._emit_output_deltas(final_output, events, node)
        self._transition_phase(node_run, "emit_output", events, node)
        node_run.waiting_reason = None
        self._context_service.update_working_context(
            node_run,
            plan=plan.as_dict(),
            tool_results=[self._tool_result_to_dict(result) for result in tool_results],
            final_output=final_output,
        )
        self._context_service.replace_artifact_refs(node_run, artifact_refs)
        node_run.checkpoint_payload = deepcopy(checkpoint)
        return AgentExecutionResult(
            output=final_output,
            evidence_pack=evidence_pack,
            artifact_refs=artifact_refs,
            tool_results=tool_results,
            events=events,
        )

    # ------------------------------------------------------------------
    # Query helpers
    # ------------------------------------------------------------------

    def list_ai_calls(self, db: Session, run_id: str) -> list[AICallRecord]:
        return db.scalars(
            select(AICallRecord)
            .where(AICallRecord.run_id == run_id)
            .order_by(AICallRecord.created_at.asc())
        ).all()

    # ------------------------------------------------------------------
    # Phase management
    # ------------------------------------------------------------------

    def _transition_phase(
        self,
        node_run: NodeRun,
        phase: str,
        events: list[RuntimeEvent],
        node: dict[str, Any],
    ) -> None:
        previous_phase = node_run.phase
        node_run.phase = phase
        node_run.status = PHASE_STATUS_MAP.get(phase, phase)
        node_run.phase_started_at = _utcnow()
        events.append(
            RuntimeEvent(
                "node.phase.changed",
                {
                    "node_id": node["id"],
                    "from": previous_phase,
                    "to": phase,
                },
            )
        )

    # ------------------------------------------------------------------
    # AI call recording
    # ------------------------------------------------------------------

    def _record_ai_call(
        self,
        db: Session,
        *,
        run_id: str,
        node_run: NodeRun,
        role: str,
        model_config: dict[str, Any],
        input_value: dict[str, Any],
        output_value: dict[str, Any],
        assistant: bool,
        error_message: str | None = None,
        llm_response: LLMResponse | None = None,
    ) -> None:
        input_artifact = self._artifact_store.create_artifact(
            db,
            run_id=run_id,
            node_run_id=node_run.id,
            artifact_kind="ai_input",
            value=input_value,
            content_type="json",
            summary=self._artifact_store.summarize(input_value),
            metadata_payload={"role": role, "assistant": assistant},
        )
        output_artifact = self._artifact_store.create_artifact(
            db,
            run_id=run_id,
            node_run_id=node_run.id,
            artifact_kind="ai_output",
            value=output_value,
            content_type="json",
            summary=self._artifact_store.summarize(output_value),
            metadata_payload={"role": role, "assistant": assistant},
        )

        latency_ms = 0
        token_usage: dict[str, Any] = {}
        actual_model_id = model_config.get("modelId")
        actual_provider = model_config.get("provider")
        if llm_response is not None:
            latency_ms = llm_response.usage.pop("latency_ms", 0)
            token_usage = llm_response.usage
            actual_model_id = llm_response.model or actual_model_id
            actual_provider = actual_provider

        db.add(
            AICallRecord(
                id=str(uuid4()),
                run_id=run_id,
                node_run_id=node_run.id,
                role=role,
                status="failed" if error_message else "succeeded",
                provider=actual_provider,
                model_id=actual_model_id,
                input_summary=input_artifact.summary,
                output_summary=output_artifact.summary,
                input_artifact_id=input_artifact.id,
                output_artifact_id=output_artifact.id,
                latency_ms=latency_ms,
                token_usage=token_usage,
                cost_payload={},
                assistant=assistant,
                error_message=error_message,
                created_at=_utcnow(),
                finished_at=_utcnow(),
            )
        )
        db.flush()

    # ------------------------------------------------------------------
    # Tool result helpers
    # ------------------------------------------------------------------

    def _restore_tool_result(self, payload: dict[str, Any]) -> ToolExecutionResult:
        return ToolExecutionResult(
            status=str(payload.get("status") or "success"),
            content_type=str(payload.get("content_type") or "json"),
            summary=str(payload.get("summary") or ""),
            raw_ref=payload.get("raw_ref"),
            structured=self._to_dict(payload.get("structured")),
            meta=self._to_dict(payload.get("meta")),
        )

    def _append_unique_ref(self, refs: list[str], value: str) -> list[str]:
        if value not in refs:
            refs.append(value)
        return refs

    def _waiting_status_for_tool_result(self, result: ToolExecutionResult) -> str:
        waiting_status = str(result.meta.get("waiting_status") or "waiting_tool").strip()
        if waiting_status not in {"waiting_tool", "waiting_callback"}:
            return "waiting_tool"
        return waiting_status

    def _resume_after_seconds_for_tool_result(
        self,
        result: ToolExecutionResult,
    ) -> float | None:
        raw_value = result.meta.get("resume_after_seconds")
        if raw_value is None:
            raw_value = result.meta.get("resumeAfterSeconds")
        if raw_value is None:
            return None
        try:
            return max(float(raw_value), 0.0)
        except (TypeError, ValueError):
            return None

    # ------------------------------------------------------------------
    # Config helpers
    # ------------------------------------------------------------------

    def _fallback_output(
        self,
        config: dict[str, Any],
        *,
        error_message: str,
    ) -> dict[str, Any] | None:
        raw_fallback = self._to_dict(config.get("fallbackOutput"))
        if not raw_fallback:
            return None
        output = deepcopy(raw_fallback)
        output.setdefault("degraded", True)
        output.setdefault("fallback_reason", error_message)
        return output

    def _allowed_tool_ids(self, config: dict[str, Any]) -> set[str] | None:
        tool_policy = self._to_dict(config.get("toolPolicy"))
        allowed_tool_ids = [
            str(tool_id)
            for tool_id in tool_policy.get("allowedToolIds", [])
            if str(tool_id).strip()
        ]
        return set(allowed_tool_ids) if allowed_tool_ids else None

    def _resolve_skill_context(
        self,
        db: Session,
        config: dict[str, Any],
        *,
        phase: str,
        retrieval_query: str | None = None,
        explicit_request: AgentSkillReferenceRequest | None = None,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        raw_skill_ids = config.get("skillIds")
        if not isinstance(raw_skill_ids, list):
            return [], []
        if not self._skill_phase_enabled(config, phase):
            return [], []
        workspace_id = str(config.get("workspaceId") or "default")
        try:
            selected_reference_ids_by_skill = self._selected_skill_reference_ids_by_phase(
                config,
                phase=phase,
            )
            reference_load_specs_by_skill: dict[str, list[dict[str, Any]]] = {}
            for skill_id, reference_ids in selected_reference_ids_by_skill.items():
                for reference_id in reference_ids:
                    self._append_skill_reference_load_spec(
                        reference_load_specs_by_skill,
                        skill_id=skill_id,
                        reference_id=reference_id,
                        load_source="skill_binding",
                    )

            if explicit_request is not None:
                self._append_skill_reference_load_spec(
                    reference_load_specs_by_skill,
                    skill_id=explicit_request.skill_id,
                    reference_id=explicit_request.reference_id,
                    load_source="llm_explicit_request",
                    fetch_reason=explicit_request.reason or "Requested by planning model.",
                    fetch_request_index=1,
                    fetch_request_total=1,
                )

            lazy_reference_suggestions = self._skill_catalog.suggest_references(
                db,
                skill_ids=[str(skill_id) for skill_id in raw_skill_ids],
                workspace_id=workspace_id,
                query_text=retrieval_query or "",
                excluded_reference_ids_by_skill=selected_reference_ids_by_skill,
            )
            for skill_id, suggestion_items in lazy_reference_suggestions.items():
                for suggestion_item in suggestion_items:
                    self._append_skill_reference_load_spec(
                        reference_load_specs_by_skill,
                        skill_id=skill_id,
                        reference_id=suggestion_item.reference_id,
                        load_source="retrieval_query_match",
                        fetch_reason=suggestion_item.fetch_reason,
                    )

            merged_reference_ids_by_skill = {
                skill_id: [
                    str(spec.get("reference_id"))
                    for spec in specs
                    if str(spec.get("reference_id") or "").strip()
                ]
                for skill_id, specs in reference_load_specs_by_skill.items()
                if specs
            }
            skill_docs = self._skill_catalog.build_prompt_docs(
                db,
                skill_ids=[str(skill_id) for skill_id in raw_skill_ids],
                workspace_id=workspace_id,
                selected_reference_ids_by_skill=merged_reference_ids_by_skill,
                prompt_budget_chars=self._skill_prompt_budget_chars(config),
            )
            loaded_references = self._collect_inlined_skill_reference_loads(
                skill_docs,
                reference_load_specs_by_skill=reference_load_specs_by_skill,
            )
            return (
                [skill.model_dump(mode="python") for skill in skill_docs],
                loaded_references,
            )
        except SkillCatalogError as exc:
            raise WorkflowExecutionError(str(exc)) from exc

    def _build_phase_node_input(
        self,
        db: Session,
        *,
        config: dict[str, Any],
        base_node_input: dict[str, Any],
        phase: str,
        retrieval_query: str | None = None,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        phase_node_input = dict(base_node_input)
        skill_context, loaded_references = self._resolve_skill_context(
            db,
            config,
            phase=phase,
            retrieval_query=retrieval_query,
        )
        if skill_context:
            phase_node_input["skill_context"] = skill_context
        else:
            phase_node_input.pop("skill_context", None)
        return phase_node_input, loaded_references

    def _skill_phase_enabled(self, config: dict[str, Any], phase: str) -> bool:
        skill_binding = self._skill_binding_policy(config)
        if skill_binding is None or not skill_binding.enabledPhases:
            return phase in {"main_plan", "main_finalize"}
        return phase in skill_binding.enabledPhases

    def _selected_skill_reference_ids_by_phase(
        self,
        config: dict[str, Any],
        *,
        phase: str,
    ) -> dict[str, list[str]]:
        skill_binding = self._skill_binding_policy(config)
        if skill_binding is None:
            return {}

        selected_reference_ids_by_skill: dict[str, list[str]] = {}
        for reference in skill_binding.references:
            if reference.phases and phase not in reference.phases:
                continue
            selected_reference_ids_by_skill.setdefault(reference.skillId, []).append(
                reference.referenceId
            )
        return selected_reference_ids_by_skill

    def _skill_prompt_budget_chars(self, config: dict[str, Any]) -> int | None:
        skill_binding = self._skill_binding_policy(config)
        if skill_binding is None:
            return None
        return skill_binding.promptBudgetChars

    def _build_skill_retrieval_query(
        self,
        *,
        config: dict[str, Any],
        phase: str,
        base_node_input: dict[str, Any],
        plan: Any | None = None,
        tool_results: list[ToolExecutionResult] | None = None,
        evidence_pack: dict[str, Any] | None = None,
    ) -> str:
        parts: list[str] = []
        for key in ("role", "goal", "prompt", "systemPrompt"):
            value = config.get(key)
            if isinstance(value, str) and value.strip():
                parts.append(value.strip())

        contextual_input = {
            key: value
            for key, value in base_node_input.items()
            if key != "skill_context" and value not in (None, "", [], {})
        }
        if contextual_input:
            parts.append(json.dumps(contextual_input, ensure_ascii=False, default=str))

        if phase in {"assistant_distill", "main_finalize"}:
            if plan is not None and getattr(plan, "analysis", ""):
                parts.append(str(plan.analysis))
            if tool_results:
                parts.extend(
                    result.summary.strip()
                    for result in tool_results
                    if isinstance(result.summary, str) and result.summary.strip()
                )
            if evidence_pack:
                summary = evidence_pack.get("summary")
                if isinstance(summary, str) and summary.strip():
                    parts.append(summary.strip())
                recommended_focus = evidence_pack.get("recommended_focus") or []
                if isinstance(recommended_focus, list):
                    parts.extend(
                        str(item).strip()
                        for item in recommended_focus
                        if str(item).strip()
                    )
        return "\n".join(parts)

    @staticmethod
    def _phase_skill_reference_request_role(phase: str) -> str:
        return f"{phase}_skill_reference_request"

    @staticmethod
    def _phase_skill_reference_request_task_label(phase: str) -> str:
        if phase == "assistant_distill":
            return "distilling tool results into structured evidence"
        if phase == "main_finalize":
            return "finalizing the operator-visible response"
        return "the current phase"

    def _build_phase_skill_reference_request_prompt(
        self,
        *,
        phase: str,
        config: dict[str, Any],
        retrieval_query: str,
    ) -> str:
        task = self._phase_skill_reference_request_task_label(phase)
        parts = [
            f"Decide whether you need exactly one deeper skill reference body before {task}.",
            "Only request a reference when the current skill summaries/handles are not enough.",
        ]
        goal = str(config.get("goal") or "").strip()
        if goal:
            parts.append(f"Goal: {goal}")
        prompt = str(config.get("prompt") or "").strip()
        if prompt:
            parts.append(f"Prompt: {prompt}")
        if retrieval_query.strip():
            parts.append("[Current phase context]\n" + retrieval_query.strip())
        return "\n\n".join(parts)

    def _maybe_apply_phase_skill_reference_request(
        self,
        db: Session,
        *,
        run_id: str,
        node_run: NodeRun,
        node: dict[str, Any],
        phase: str,
        config: dict[str, Any],
        model_config: dict[str, Any],
        base_node_input: dict[str, Any],
        phase_node_input: dict[str, Any],
        retrieval_query: str,
        current_loaded_references: list[dict[str, Any]],
        plan: Any | None = None,
        tool_results: list[ToolExecutionResult] | None = None,
        evidence_pack: dict[str, Any] | None = None,
    ) -> tuple[dict[str, Any], list[dict[str, Any]], RuntimeEvent | None]:
        if phase not in {"assistant_distill", "main_finalize"}:
            return phase_node_input, [], None
        if not self._has_pending_skill_references(phase_node_input):
            return phase_node_input, [], None

        phase_model_config = (
            self._assistant_model_config(config, model_config)
            if phase == "assistant_distill"
            else model_config
        )
        if not self._has_valid_model_config(phase_model_config):
            return phase_node_input, [], None

        task = self._phase_skill_reference_request_task_label(phase)
        try:
            llm_response = self._call_llm(
                model_config=phase_model_config,
                system_prompt=(
                    f"You are preparing {task}. If the current [Skills] section only gives "
                    "summaries/handles and you need exactly one deeper skill reference body, "
                    "start your response with a single line in the format: "
                    'SKILL_REFERENCE_REQUEST {"skill_id":"...","reference_id":"...",'
                    '"reason":"..."}. Only request one reference and only when it is genuinely '
                    "necessary."
                ),
                user_prompt=self._build_phase_skill_reference_request_prompt(
                    phase=phase,
                    config=config,
                    retrieval_query=retrieval_query,
                ),
                node_input=phase_node_input,
            )
        except WorkflowExecutionError:
            _log.warning(
                "LLM %s skill reference request call failed, continuing without extra skill fetch",
                phase,
            )
            return phase_node_input, [], None

        request, _ = self._parse_plan_response(
            llm_response.text,
            allow_skill_reference_request=True,
        )
        if request is None:
            return phase_node_input, [], None

        input_value: dict[str, Any] = {
            "phase": phase,
            "skill_context": phase_node_input.get("skill_context"),
        }
        if tool_results:
            input_value["tool_results"] = [
                self._tool_result_to_dict(result) for result in tool_results
            ]
        if evidence_pack:
            input_value["evidence_pack"] = evidence_pack
        if phase == "main_finalize":
            input_value["working_context"] = node_run.working_context
        if plan is not None and getattr(plan, "analysis", ""):
            input_value["plan_analysis"] = str(plan.analysis)

        self._record_ai_call(
            db,
            run_id=run_id,
            node_run=node_run,
            role=self._phase_skill_reference_request_role(phase),
            model_config=phase_model_config,
            input_value=input_value,
            output_value={
                "phase": phase,
                "skill_reference_request": {
                    "skill_id": request.skill_id,
                    "reference_id": request.reference_id,
                    "reason": request.reason,
                },
            },
            assistant=phase == "assistant_distill",
            llm_response=llm_response,
        )

        updated_node_input, delta_loads, event = self._apply_phase_skill_reference_request(
            db,
            config=config,
            node=node,
            phase=phase,
            base_node_input=base_node_input,
            retrieval_query=retrieval_query,
            current_loaded_references=current_loaded_references,
            request=request,
        )
        return updated_node_input, delta_loads, event

    @staticmethod
    def _append_skill_reference_load_spec(
        reference_load_specs_by_skill: dict[str, list[dict[str, Any]]],
        *,
        skill_id: str,
        reference_id: str,
        load_source: str,
        fetch_reason: str | None = None,
        fetch_request_index: int | None = None,
        fetch_request_total: int | None = None,
    ) -> None:
        if not skill_id or not reference_id:
            return
        specs = reference_load_specs_by_skill.setdefault(skill_id, [])
        if any(str(spec.get("reference_id") or "") == reference_id for spec in specs):
            return
        spec: dict[str, Any] = {
            "reference_id": reference_id,
            "load_source": load_source,
        }
        if isinstance(fetch_reason, str) and fetch_reason.strip():
            spec["fetch_reason"] = fetch_reason.strip()
        if fetch_request_index is not None:
            spec["fetch_request_index"] = int(fetch_request_index)
        if fetch_request_total is not None:
            spec["fetch_request_total"] = int(fetch_request_total)
        specs.append(spec)

    @staticmethod
    def _collect_inlined_skill_reference_loads(
        skill_docs: list[Any],
        *,
        reference_load_specs_by_skill: dict[str, list[dict[str, Any]]],
    ) -> list[dict[str, Any]]:
        loaded_references: list[dict[str, Any]] = []
        for skill_doc in skill_docs:
            references_by_id = {
                reference.id: reference
                for reference in skill_doc.references
                if isinstance(reference.body, str) and reference.body
            }
            if not references_by_id:
                continue
            for spec in reference_load_specs_by_skill.get(skill_doc.id, []):
                reference = references_by_id.get(str(spec.get("reference_id") or ""))
                if reference is None:
                    continue
                retrieval = reference.retrieval
                item = {
                    "skill_id": skill_doc.id,
                    "skill_name": skill_doc.name,
                    "reference_id": reference.id,
                    "reference_name": reference.name,
                    "load_source": str(spec.get("load_source") or "unknown"),
                    "retrieval_http_path": (
                        retrieval.http_path if retrieval is not None else None
                    ),
                    "retrieval_mcp_method": (
                        retrieval.mcp_method if retrieval is not None else None
                    ),
                    "retrieval_mcp_params": (
                        dict(retrieval.mcp_params) if retrieval is not None else {}
                    ),
                }
                fetch_reason = spec.get("fetch_reason")
                if isinstance(fetch_reason, str) and fetch_reason.strip():
                    item["fetch_reason"] = fetch_reason.strip()
                if spec.get("fetch_request_index") is not None:
                    item["fetch_request_index"] = int(spec["fetch_request_index"])
                if spec.get("fetch_request_total") is not None:
                    item["fetch_request_total"] = int(spec["fetch_request_total"])
                loaded_references.append(item)
        return loaded_references

    @staticmethod
    def _skill_reference_load_key(item: dict[str, Any]) -> tuple[str, str]:
        return (
            str(item.get("skill_id") or "").strip(),
            str(item.get("reference_id") or "").strip(),
        )

    def _apply_phase_skill_reference_request(
        self,
        db: Session,
        *,
        config: dict[str, Any],
        node: dict[str, Any],
        phase: str,
        base_node_input: dict[str, Any],
        retrieval_query: str,
        current_loaded_references: list[dict[str, Any]],
        request: AgentSkillReferenceRequest,
    ) -> tuple[dict[str, Any], list[dict[str, Any]], RuntimeEvent | None]:
        phase_node_input = dict(base_node_input)
        workspace_id = str(config.get("workspaceId") or "default")
        raw_skill_ids = config.get("skillIds")
        normalized_skill_ids = (
            [str(skill_id) for skill_id in raw_skill_ids] if isinstance(raw_skill_ids, list) else []
        )
        retrieval = self._skill_catalog.build_reference_retrieval(
            skill_id=request.skill_id,
            reference_id=request.reference_id,
            workspace_id=workspace_id,
        )
        status = "loaded"
        if request.skill_id not in normalized_skill_ids:
            status = "skill_not_bound"
            return phase_node_input, [], self._build_skill_reference_request_event(
                node=node,
                phase=phase,
                request=request,
                status=status,
                retrieval=retrieval,
            )

        reference = self._skill_catalog.get_reference(
            db,
            skill_id=request.skill_id,
            reference_id=request.reference_id,
            workspace_id=workspace_id,
        )
        if reference is None:
            status = "reference_not_found"
            return phase_node_input, [], self._build_skill_reference_request_event(
                node=node,
                phase=phase,
                request=request,
                status=status,
                retrieval=retrieval,
            )

        current_load_keys = {
            self._skill_reference_load_key(item) for item in current_loaded_references
        }
        requested_load_key = (request.skill_id, request.reference_id)
        if requested_load_key in current_load_keys:
            status = "already_loaded"
            return phase_node_input, [], self._build_skill_reference_request_event(
                node=node,
                phase=phase,
                request=request,
                status=status,
                retrieval=retrieval,
            )

        skill_context, enriched_loaded_references = self._resolve_skill_context(
            db,
            config,
            phase=phase,
            retrieval_query=retrieval_query,
            explicit_request=request,
        )
        requested_loaded = next(
            (
                item
                for item in enriched_loaded_references
                if self._skill_reference_load_key(item) == requested_load_key
            ),
            None,
        )
        if requested_loaded is None:
            status = "requested_not_inlined"
            return phase_node_input, [], self._build_skill_reference_request_event(
                node=node,
                phase=phase,
                request=request,
                status=status,
                retrieval=retrieval,
            )

        delta_loads = [
            item
            for item in enriched_loaded_references
            if self._skill_reference_load_key(item) not in current_load_keys
        ]
        if skill_context:
            phase_node_input["skill_context"] = skill_context
        else:
            phase_node_input.pop("skill_context", None)
        return phase_node_input, delta_loads, self._build_skill_reference_request_event(
            node=node,
            phase=phase,
            request=request,
            status=status,
            retrieval=retrieval,
        )

    def _apply_plan_skill_reference_request(
        self,
        db: Session,
        *,
        config: dict[str, Any],
        node: dict[str, Any],
        base_node_input: dict[str, Any],
        retrieval_query: str,
        current_loaded_references: list[dict[str, Any]],
        request: AgentSkillReferenceRequest,
    ) -> tuple[dict[str, Any], list[dict[str, Any]], RuntimeEvent | None]:
        return self._apply_phase_skill_reference_request(
            db,
            config=config,
            node=node,
            phase="main_plan",
            base_node_input=base_node_input,
            retrieval_query=retrieval_query,
            current_loaded_references=current_loaded_references,
            request=request,
        )

    @staticmethod
    def _build_skill_reference_request_event(
        *,
        node: dict[str, Any],
        phase: str,
        request: AgentSkillReferenceRequest,
        status: str,
        retrieval: Any,
    ) -> RuntimeEvent:
        payload: dict[str, Any] = {
            "node_id": node["id"],
            "phase": phase,
            "skill_id": request.skill_id,
            "reference_id": request.reference_id,
            "status": status,
            "request_index": 1,
            "request_total": 1,
        }
        if request.reason.strip():
            payload["reason"] = request.reason.strip()
        if retrieval is not None:
            payload["retrieval_http_path"] = getattr(retrieval, "http_path", None)
            payload["retrieval_mcp_method"] = getattr(retrieval, "mcp_method", None)
            payload["retrieval_mcp_params"] = dict(getattr(retrieval, "mcp_params", {}) or {})
        return RuntimeEvent("agent.skill.references.requested", payload)

    @staticmethod
    def _emit_skill_reference_fetch_event(
        events: list[RuntimeEvent],
        *,
        node: dict[str, Any],
        phase: str,
        loaded_references: list[dict[str, Any]],
    ) -> None:
        if not loaded_references:
            return
        events.append(
            RuntimeEvent(
                "agent.skill.references.loaded",
                {
                    "node_id": node["id"],
                    "phase": phase,
                    "references": loaded_references,
                },
            )
        )

    def _skill_binding_policy(
        self,
        config: dict[str, Any],
    ) -> WorkflowNodeSkillBindingPolicy | None:
        raw_skill_binding = config.get("skillBinding")
        if not isinstance(raw_skill_binding, dict):
            return None
        try:
            return WorkflowNodeSkillBindingPolicy.model_validate(raw_skill_binding)
        except Exception as exc:
            raise WorkflowExecutionError(f"Invalid config.skillBinding: {exc}") from exc

    # ------------------------------------------------------------------
    # General helpers
    # ------------------------------------------------------------------

    def _to_dict(self, value: Any) -> dict[str, Any]:
        return deepcopy(value) if isinstance(value, dict) else {}
