from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import AICallRecord, NodeRun
from app.services.artifact_store import RuntimeArtifactStore
from app.services.context_service import ContextService
from app.services.runtime_types import (
    PHASE_STATUS_MAP,
    AgentExecutionResult,
    AgentPlan,
    AgentToolCall,
    EvidencePack,
    RuntimeEvent,
    ToolExecutionResult,
    WorkflowExecutionError,
)
from app.services.tool_gateway import ToolGateway


def _utcnow() -> datetime:
    return datetime.now(UTC)


class AgentRuntime:
    def __init__(
        self,
        *,
        tool_gateway: ToolGateway,
        artifact_store: RuntimeArtifactStore | None = None,
        context_service: ContextService | None = None,
    ) -> None:
        self._tool_gateway = tool_gateway
        self._artifact_store = artifact_store or RuntimeArtifactStore()
        self._context_service = context_service or ContextService()

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
        creds = resolved_credentials or {}
        if creds:
            model_config = dict(model_config)
            if "apiKey" in creds:
                model_config["apiKey"] = creds["apiKey"]
        checkpoint = self._to_dict(node_run.checkpoint_payload)
        working_context = self._context_service.update_working_context(
            node_run,
            role=config.get("role"),
            goal=config.get("goal"),
            prompt=config.get("prompt"),
            system_prompt=config.get("systemPrompt"),
            authorized_context=node_input.get("authorized_context", {}),
            global_context=node_input.get("global_context", {}),
        )

        self._transition_phase(node_run, "preparing", events, node)
        plan = self._restore_plan(checkpoint.get("plan"))
        if plan is None:
            self._transition_phase(node_run, "running_main", events, node)
            plan = self._build_plan(config)
            checkpoint["plan"] = plan.as_dict()
            node_run.checkpoint_payload = checkpoint
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
                },
                output_value=plan.as_dict(),
                assistant=False,
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
                    allowed_tool_ids=self._allowed_tool_ids(config),
                    retry_count=node_run.retry_count,
                )
            except WorkflowExecutionError as exc:
                fallback_output = self._fallback_output(config, error_message=str(exc))
                if fallback_output is None:
                    raise
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
                node_run.checkpoint_payload = checkpoint
                self._context_service.replace_artifact_refs(node_run, artifact_refs)
                return AgentExecutionResult(
                    output=fallback_output,
                    evidence_pack=node_run.evidence_context,
                    artifact_refs=artifact_refs,
                    tool_results=tool_results,
                    events=events,
                )

            if next_tool_index < len(tool_results):
                tool_results[next_tool_index] = tool_result
            else:
                tool_results.append(tool_result)
            checkpoint["tool_results"] = [
                self._tool_result_to_dict(result) for result in tool_results
            ]
            checkpoint["next_tool_index"] = next_tool_index
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
                node_run.checkpoint_payload = checkpoint
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
            node_run.checkpoint_payload = checkpoint

        evidence_pack = self._to_dict(node_run.evidence_context)
        if self._should_run_assistant(config, tool_results) and not evidence_pack:
            self._transition_phase(node_run, "assistant_distill", events, node)
            distilled_evidence = self._distill_evidence(config, tool_results)
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
            node_run.checkpoint_payload = checkpoint
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
                    ]
                },
                output_value=evidence_pack,
                assistant=True,
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
        final_output = self._finalize_output(
            config=config,
            plan=plan,
            tool_results=tool_results,
            evidence_pack=evidence_pack,
            artifact_refs=artifact_refs,
            node_input=node_input,
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
            },
            output_value=final_output,
            assistant=False,
        )
        self._transition_phase(node_run, "emit_output", events, node)
        node_run.waiting_reason = None
        self._context_service.update_working_context(
            node_run,
            plan=plan.as_dict(),
            tool_results=[self._tool_result_to_dict(result) for result in tool_results],
            final_output=final_output,
        )
        self._context_service.replace_artifact_refs(node_run, artifact_refs)
        node_run.checkpoint_payload = checkpoint
        return AgentExecutionResult(
            output=final_output,
            evidence_pack=evidence_pack,
            artifact_refs=artifact_refs,
            tool_results=tool_results,
            events=events,
        )

    def list_ai_calls(self, db: Session, run_id: str) -> list[AICallRecord]:
        return db.scalars(
            select(AICallRecord)
            .where(AICallRecord.run_id == run_id)
            .order_by(AICallRecord.created_at.asc())
        ).all()

    def _build_plan(self, config: dict[str, Any]) -> AgentPlan:
        raw_plan = self._to_dict(config.get("mockPlan"))
        raw_tool_calls = raw_plan.get("toolCalls") if raw_plan else None
        tool_calls: list[AgentToolCall] = []
        for raw_tool_call in raw_tool_calls or []:
            tool_calls.append(
                AgentToolCall(
                    tool_id=str(raw_tool_call.get("toolId")),
                    inputs=self._to_dict(raw_tool_call.get("inputs")),
                    ecosystem=str(raw_tool_call.get("ecosystem") or "native"),
                    adapter_id=raw_tool_call.get("adapterId"),
                    label=raw_tool_call.get("label"),
                    timeout_ms=(
                        int(raw_tool_call["timeoutMs"])
                        if raw_tool_call.get("timeoutMs") is not None
                        else None
                    ),
                )
            )
        need_assistant = bool(raw_plan.get("needAssistant")) if raw_plan else False
        if self._assistant_enabled(config):
            need_assistant = True
        return AgentPlan(
            tool_calls=tool_calls,
            need_assistant=need_assistant,
            finalize_from=(
                str(raw_plan.get("finalizeFrom") or "evidence")
                if raw_plan
                else "evidence"
            ),
        )

    def _restore_plan(self, payload: Any) -> AgentPlan | None:
        if not isinstance(payload, dict):
            return None
        tool_calls: list[AgentToolCall] = []
        for raw_tool_call in payload.get("toolCalls", []):
            if not isinstance(raw_tool_call, dict):
                continue
            tool_calls.append(
                AgentToolCall(
                    tool_id=str(raw_tool_call.get("toolId")),
                    inputs=self._to_dict(raw_tool_call.get("inputs")),
                    ecosystem=str(raw_tool_call.get("ecosystem") or "native"),
                    adapter_id=raw_tool_call.get("adapterId"),
                    label=raw_tool_call.get("label"),
                    timeout_ms=(
                        int(raw_tool_call["timeoutMs"])
                        if raw_tool_call.get("timeoutMs") is not None
                        else None
                    ),
                )
            )
        return AgentPlan(
            tool_calls=tool_calls,
            need_assistant=bool(payload.get("needAssistant")),
            finalize_from=str(payload.get("finalizeFrom") or "evidence"),
        )

    def _should_run_assistant(
        self,
        config: dict[str, Any],
        tool_results: list[ToolExecutionResult],
    ) -> bool:
        if not self._assistant_enabled(config):
            return False
        trigger = self._assistant_trigger_mode(config)
        if trigger == "always":
            return True
        if trigger == "on_large_payload":
            return any(len(result.summary) >= 120 for result in tool_results)
        if trigger == "on_search_result":
            return any(
                "search" in str(result.meta.get("tool_name", "")).lower()
                for result in tool_results
            )
        if trigger == "on_multi_tool_results":
            return len(tool_results) > 1
        if trigger == "on_high_risk_mode":
            return bool(config.get("highRiskMode"))
        return False

    def _distill_evidence(
        self,
        config: dict[str, Any],
        tool_results: list[ToolExecutionResult],
    ) -> EvidencePack:
        mock_output = self._to_dict(config.get("mockAssistantOutput"))
        if mock_output:
            return EvidencePack(
                summary=str(mock_output.get("summary") or ""),
                key_points=[str(item) for item in mock_output.get("key_points", [])],
                evidence=list(mock_output.get("evidence", [])),
                conflicts=[str(item) for item in mock_output.get("conflicts", [])],
                unknowns=[str(item) for item in mock_output.get("unknowns", [])],
                recommended_focus=[str(item) for item in mock_output.get("recommended_focus", [])],
                confidence=float(mock_output.get("confidence") or 0.0),
                artifact_refs=[str(item) for item in mock_output.get("artifact_refs", [])],
            )

        evidence = [
            {
                "tool_id": result.meta.get("tool_id"),
                "tool_name": result.meta.get("tool_name"),
                "summary": result.summary,
                "raw_ref": result.raw_ref,
            }
            for result in tool_results
        ]
        summary = " | ".join(result.summary for result in tool_results if result.summary).strip()
        return EvidencePack(
            summary=summary or "No evidence distilled.",
            key_points=[result.summary for result in tool_results if result.summary],
            evidence=evidence,
            conflicts=[],
            unknowns=[],
            recommended_focus=[
                str(result.meta.get("tool_name") or result.meta.get("tool_id") or "")
                for result in tool_results
                if result.meta.get("tool_name") or result.meta.get("tool_id")
            ],
            confidence=0.72 if tool_results else 0.0,
            artifact_refs=[result.raw_ref for result in tool_results if result.raw_ref],
        )

    def _finalize_output(
        self,
        *,
        config: dict[str, Any],
        plan: AgentPlan,
        tool_results: list[ToolExecutionResult],
        evidence_pack: dict[str, Any] | None,
        artifact_refs: list[str],
        node_input: dict[str, Any],
    ) -> dict[str, Any]:
        mock_final_output = self._to_dict(config.get("mockFinalOutput"))
        if mock_final_output:
            output = deepcopy(mock_final_output)
            output.setdefault("decision_basis", "evidence" if evidence_pack else "tool_results")
            output.setdefault("artifact_refs", artifact_refs)
            return output

        if evidence_pack:
            return {
                "result": evidence_pack.get("summary", ""),
                "decision_basis": "evidence",
                "evidence": evidence_pack,
                "tool_summaries": [result.summary for result in tool_results],
                "artifact_refs": artifact_refs,
                "finalize_from": plan.finalize_from,
            }
        if tool_results:
            return {
                "result": " | ".join(result.summary for result in tool_results if result.summary),
                "decision_basis": "tool_results",
                "tool_results": [self._tool_result_to_dict(result) for result in tool_results],
                "artifact_refs": artifact_refs,
            }
        mock_output = config.get("mock_output")
        if isinstance(mock_output, dict):
            return deepcopy(mock_output)
        return {
            "result": str(config.get("prompt") or config.get("systemPrompt") or ""),
            "decision_basis": "working_context",
            "received": self._to_dict(node_input.get("accumulated")),
            "artifact_refs": artifact_refs,
        }

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

    def _assistant_enabled(self, config: dict[str, Any]) -> bool:
        assistant_config = self._to_dict(config.get("assistant"))
        return bool(assistant_config.get("enabled"))

    def _assistant_trigger_mode(self, config: dict[str, Any]) -> str:
        assistant_config = self._to_dict(config.get("assistant"))
        return str(assistant_config.get("trigger") or "on_multi_tool_results")

    def _assistant_model_config(
        self,
        config: dict[str, Any],
        default_model_config: dict[str, Any],
    ) -> dict[str, Any]:
        assistant_config = self._to_dict(config.get("assistant"))
        assistant_model = self._to_dict(assistant_config.get("model"))
        return assistant_model or default_model_config

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
        db.add(
            AICallRecord(
                id=str(uuid4()),
                run_id=run_id,
                node_run_id=node_run.id,
                role=role,
                status="failed" if error_message else "succeeded",
                provider=model_config.get("provider"),
                model_id=model_config.get("modelId"),
                input_summary=input_artifact.summary,
                output_summary=output_artifact.summary,
                input_artifact_id=input_artifact.id,
                output_artifact_id=output_artifact.id,
                latency_ms=0,
                token_usage={},
                cost_payload={},
                assistant=assistant,
                error_message=error_message,
                created_at=_utcnow(),
                finished_at=_utcnow(),
            )
        )
        db.flush()

    def _restore_tool_result(self, payload: dict[str, Any]) -> ToolExecutionResult:
        return ToolExecutionResult(
            status=str(payload.get("status") or "success"),
            content_type=str(payload.get("content_type") or "json"),
            summary=str(payload.get("summary") or ""),
            raw_ref=payload.get("raw_ref"),
            structured=self._to_dict(payload.get("structured")),
            meta=self._to_dict(payload.get("meta")),
        )

    def _tool_result_to_dict(self, result: ToolExecutionResult) -> dict[str, Any]:
        return {
            "status": result.status,
            "content_type": result.content_type,
            "summary": result.summary,
            "raw_ref": result.raw_ref,
            "structured": deepcopy(result.structured),
            "meta": deepcopy(result.meta),
        }

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

    def _to_dict(self, value: Any) -> dict[str, Any]:
        return deepcopy(value) if isinstance(value, dict) else {}
