"""AgentRuntime LLM support mixin.

Extracts LLM plan / finalize / distill / delta methods from ``AgentRuntime``
into a reusable mixin, keeping the main ``agent_runtime.py`` focused on
orchestration, phase management, recording and tool execution.
"""

from __future__ import annotations

import json
import logging
import time
from copy import deepcopy
from typing import TYPE_CHECKING, Any

from app.services.llm_provider import (
    LLMProviderError,
    LLMResponse,
    build_llm_call_config,
)
from app.services.runtime_types import (
    AgentPlan,
    AgentToolCall,
    EvidencePack,
    RuntimeEvent,
    ToolExecutionResult,
    WorkflowExecutionError,
)

if TYPE_CHECKING:
    from app.services.llm_provider import LLMProviderService

_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Delta chunking utilities
# ---------------------------------------------------------------------------

_DELTA_CHUNK_SIZE = 80


def _chunk_text_for_delta(text: str) -> list[str]:
    """Split text into chunks for streaming delta events.

    Short texts (< 2 * chunk size) are returned as a single chunk.
    Longer texts are split at natural sentence/line boundaries when possible.
    """
    if not text:
        return []
    if len(text) < _DELTA_CHUNK_SIZE * 2:
        return [text]

    chunks: list[str] = []
    remaining = text
    while remaining:
        if len(remaining) <= _DELTA_CHUNK_SIZE:
            chunks.append(remaining)
            break

        cut_at = _DELTA_CHUNK_SIZE
        for separator in ("\n", "。", ". ", "，", ", ", "；", "; "):
            pos = remaining.rfind(separator, 0, _DELTA_CHUNK_SIZE + len(separator))
            if pos > 0:
                cut_at = pos + len(separator)
                break

        chunks.append(remaining[:cut_at])
        remaining = remaining[cut_at:]

    return chunks


# ---------------------------------------------------------------------------
# Mixin
# ---------------------------------------------------------------------------


class AgentRuntimeLLMSupportMixin:
    """Mixin providing LLM plan, finalize, evidence distill and delta helpers.

    Expects the consuming class to expose:
    - ``self._llm_provider: LLMProviderService``
    - ``self._to_dict(value) -> dict``
    """

    # -- attributes provided by host class (type stubs for IDE) --
    _llm_provider: LLMProviderService

    def _to_dict(self, value: Any) -> dict[str, Any]:  # pragma: no cover – stub
        return deepcopy(value) if isinstance(value, dict) else {}

    # ------------------------------------------------------------------
    # LLM integration helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _has_valid_model_config(model_config: dict[str, Any]) -> bool:
        model_id = model_config.get("modelId") or model_config.get("model_id") or ""
        api_key = model_config.get("apiKey") or model_config.get("api_key") or ""
        return bool(model_id and api_key)

    def _call_llm(
        self,
        *,
        model_config: dict[str, Any],
        system_prompt: str | None,
        user_prompt: str,
        node_input: dict[str, Any] | None = None,
    ) -> LLMResponse:
        call_config = build_llm_call_config(
            model_config=model_config,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            node_input=node_input,
        )
        start = time.monotonic()
        try:
            response = self._llm_provider.chat(call_config)
        except LLMProviderError as exc:
            _log.warning("LLM call failed: %s", exc)
            raise WorkflowExecutionError(str(exc)) from exc
        elapsed_ms = int((time.monotonic() - start) * 1000)
        response.usage.setdefault("latency_ms", elapsed_ms)
        return response

    # ------------------------------------------------------------------
    # Plan
    # ------------------------------------------------------------------

    def _build_plan(
        self,
        config: dict[str, Any],
        model_config: dict[str, Any],
        node_input: dict[str, Any],
    ) -> AgentPlan:
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
                    execution=self._to_dict(raw_tool_call.get("execution")),
                )
            )
        need_assistant = bool(raw_plan.get("needAssistant")) if raw_plan else False
        if self._assistant_enabled(config):
            need_assistant = True

        analysis = ""
        llm_response: LLMResponse | None = None
        if not raw_plan and self._has_valid_model_config(model_config):
            prompt = str(config.get("prompt") or "")
            if prompt:
                try:
                    llm_response = self._call_llm(
                        model_config=model_config,
                        system_prompt=(
                            "You are a workflow planning engine. Analyze the task and "
                            "provide a brief analysis of how to approach it. "
                            "Be concise and actionable."
                        ),
                        user_prompt=prompt,
                        node_input=node_input,
                    )
                    analysis = llm_response.text
                except WorkflowExecutionError:
                    _log.warning("LLM plan call failed, using empty plan")

        plan = AgentPlan(
            tool_calls=tool_calls,
            need_assistant=need_assistant,
            finalize_from=(
                str(raw_plan.get("finalizeFrom") or "evidence")
                if raw_plan
                else "evidence"
            ),
        )
        if analysis:
            plan.analysis = analysis
        plan.llm_response = llm_response
        return plan

    @staticmethod
    def _restore_plan(payload: Any) -> AgentPlan | None:
        if not isinstance(payload, dict):
            return None
        tool_calls: list[AgentToolCall] = []
        for raw_tool_call in payload.get("toolCalls", []):
            if not isinstance(raw_tool_call, dict):
                continue
            tool_calls.append(
                AgentToolCall(
                    tool_id=str(raw_tool_call.get("toolId")),
                    inputs=deepcopy(raw_tool_call.get("inputs"))
                    if isinstance(raw_tool_call.get("inputs"), dict)
                    else {},
                    ecosystem=str(raw_tool_call.get("ecosystem") or "native"),
                    adapter_id=raw_tool_call.get("adapterId"),
                    label=raw_tool_call.get("label"),
                    timeout_ms=(
                        int(raw_tool_call["timeoutMs"])
                        if raw_tool_call.get("timeoutMs") is not None
                        else None
                    ),
                    execution=deepcopy(raw_tool_call.get("execution"))
                    if isinstance(raw_tool_call.get("execution"), dict)
                    else {},
                )
            )
        return AgentPlan(
            tool_calls=tool_calls,
            need_assistant=bool(payload.get("needAssistant")),
            finalize_from=str(payload.get("finalizeFrom") or "evidence"),
        )

    # ------------------------------------------------------------------
    # Assistant / evidence distill
    # ------------------------------------------------------------------

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
        model_config: dict[str, Any],
        tool_results: list[ToolExecutionResult],
    ) -> tuple[EvidencePack, LLMResponse | None]:
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
            ), None

        assistant_model = self._assistant_model_config(config, model_config)
        if self._has_valid_model_config(assistant_model):
            return self._distill_evidence_via_llm(assistant_model, tool_results)

        return self._distill_evidence_synthetic(tool_results), None

    def _distill_evidence_via_llm(
        self,
        model_config: dict[str, Any],
        tool_results: list[ToolExecutionResult],
    ) -> tuple[EvidencePack, LLMResponse | None]:
        tool_data = [
            {
                "tool_id": r.meta.get("tool_id"),
                "tool_name": r.meta.get("tool_name"),
                "summary": r.summary,
                "structured": r.structured,
            }
            for r in tool_results
        ]
        user_prompt = (
            "Distill the following tool results into a structured evidence summary.\n\n"
            f"{json.dumps(tool_data, ensure_ascii=False, default=str)}\n\n"
            "Return a JSON object with keys: summary, key_points (array), "
            "conflicts (array), unknowns (array), confidence (0-1 float)."
        )
        try:
            llm_response = self._call_llm(
                model_config=model_config,
                system_prompt=(
                    "You are an information distillation assistant. "
                    "Extract key findings from tool results and produce structured evidence. "
                    "Respond with valid JSON only."
                ),
                user_prompt=user_prompt,
            )
        except WorkflowExecutionError:
            _log.warning("LLM distill call failed, using synthetic evidence")
            return self._distill_evidence_synthetic(tool_results), None

        try:
            parsed = json.loads(llm_response.text)
        except (json.JSONDecodeError, TypeError):
            parsed = {}

        if isinstance(parsed, dict) and parsed.get("summary"):
            return EvidencePack(
                summary=str(parsed.get("summary") or ""),
                key_points=[str(p) for p in parsed.get("key_points", [])],
                evidence=[
                    {"tool_id": r.meta.get("tool_id"), "summary": r.summary}
                    for r in tool_results
                ],
                conflicts=[str(c) for c in parsed.get("conflicts", [])],
                unknowns=[str(u) for u in parsed.get("unknowns", [])],
                recommended_focus=[str(f) for f in parsed.get("recommended_focus", [])],
                confidence=float(parsed.get("confidence") or 0.8),
                artifact_refs=[r.raw_ref for r in tool_results if r.raw_ref],
            ), llm_response

        return EvidencePack(
            summary=llm_response.text[:500],
            key_points=[r.summary for r in tool_results if r.summary],
            evidence=[
                {"tool_id": r.meta.get("tool_id"), "summary": r.summary}
                for r in tool_results
            ],
            confidence=0.7,
            artifact_refs=[r.raw_ref for r in tool_results if r.raw_ref],
        ), llm_response

    @staticmethod
    def _distill_evidence_synthetic(
        tool_results: list[ToolExecutionResult],
    ) -> EvidencePack:
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

    # ------------------------------------------------------------------
    # Finalize output
    # ------------------------------------------------------------------

    def _finalize_output(
        self,
        *,
        config: dict[str, Any],
        model_config: dict[str, Any],
        plan: AgentPlan,
        tool_results: list[ToolExecutionResult],
        evidence_pack: dict[str, Any] | None,
        artifact_refs: list[str],
        node_input: dict[str, Any],
        events: list[RuntimeEvent],
        node: dict[str, Any],
    ) -> tuple[dict[str, Any], LLMResponse | None, bool]:
        mock_final_output = self._to_dict(config.get("mockFinalOutput"))
        if mock_final_output:
            output = deepcopy(mock_final_output)
            output.setdefault("decision_basis", "evidence" if evidence_pack else "tool_results")
            output.setdefault("artifact_refs", artifact_refs)
            return output, None, False

        if self._has_valid_model_config(model_config):
            return self._finalize_output_via_llm(
                config=config,
                model_config=model_config,
                plan=plan,
                tool_results=tool_results,
                evidence_pack=evidence_pack,
                artifact_refs=artifact_refs,
                node_input=node_input,
                events=events,
                node=node,
            )

        if evidence_pack:
            return {
                "result": evidence_pack.get("summary", ""),
                "decision_basis": "evidence",
                "evidence": evidence_pack,
                "tool_summaries": [result.summary for result in tool_results],
                "artifact_refs": artifact_refs,
                "finalize_from": plan.finalize_from,
            }, None, False
        if tool_results:
            return {
                "result": " | ".join(result.summary for result in tool_results if result.summary),
                "decision_basis": "tool_results",
                "tool_results": [self._tool_result_to_dict(result) for result in tool_results],
                "artifact_refs": artifact_refs,
            }, None, False
        mock_output = config.get("mock_output")
        if isinstance(mock_output, dict):
            return deepcopy(mock_output), None, False
        return {
            "result": str(config.get("prompt") or config.get("systemPrompt") or ""),
            "decision_basis": "working_context",
            "received": self._to_dict(node_input.get("accumulated")),
            "artifact_refs": artifact_refs,
        }, None, False

    def _finalize_output_via_llm(
        self,
        *,
        config: dict[str, Any],
        model_config: dict[str, Any],
        plan: AgentPlan,
        tool_results: list[ToolExecutionResult],
        evidence_pack: dict[str, Any] | None,
        artifact_refs: list[str],
        node_input: dict[str, Any],
        events: list[RuntimeEvent],
        node: dict[str, Any],
    ) -> tuple[dict[str, Any], LLMResponse | None, bool]:
        system_prompt = config.get("systemPrompt") or None
        prompt = str(config.get("prompt") or "")

        context_parts: list[str] = []
        if evidence_pack:
            context_parts.append(
                f"[Evidence]\n{json.dumps(evidence_pack, ensure_ascii=False, default=str)}"
            )
        if tool_results:
            summaries = [result.summary for result in tool_results if result.summary]
            if summaries:
                context_parts.append("[Tool results]\n" + "\n".join(summaries))
        if plan.analysis:
            context_parts.append(f"[Analysis]\n{plan.analysis}")

        user_prompt = prompt
        if context_parts:
            user_prompt = "\n\n".join(context_parts) + "\n\n" + prompt

        if not user_prompt.strip():
            user_prompt = "Generate a response based on the provided context."

        decision_basis = "llm"
        if evidence_pack:
            decision_basis = "llm_with_evidence"
        elif tool_results:
            decision_basis = "llm_with_tools"

        # Try streaming first for real-time delta events
        call_config = build_llm_call_config(
            model_config=model_config,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            node_input=node_input,
        )
        node_id = node["id"]
        start = time.monotonic()

        try:
            accumulated_chunks: list[str] = []
            model = ""
            finish_reason = ""
            stream_usage: dict[str, int] = {}

            for chunk in self._llm_provider.chat_stream(call_config):
                if chunk.delta:
                    accumulated_chunks.append(chunk.delta)
                    events.append(
                        RuntimeEvent(
                            "node.output.delta",
                            {"node_id": node_id, "delta": chunk.delta},
                        )
                    )
                if chunk.finish_reason:
                    finish_reason = chunk.finish_reason
                if chunk.model:
                    model = chunk.model
                if chunk.usage:
                    stream_usage.update(chunk.usage)

            elapsed_ms = int((time.monotonic() - start) * 1000)
            final_text = "".join(accumulated_chunks)

            if not final_text:
                raise LLMProviderError("LLM stream returned empty content")

            llm_response = LLMResponse(
                text=final_text,
                model=model or call_config.model_id,
                finish_reason=finish_reason,
                usage={**stream_usage, "latency_ms": elapsed_ms},
            )

            return {
                "result": final_text,
                "decision_basis": decision_basis,
                "model": llm_response.model,
                "finish_reason": llm_response.finish_reason,
                "usage": llm_response.usage,
                "artifact_refs": artifact_refs,
                "streaming": True,
            }, llm_response, True

        except (LLMProviderError, WorkflowExecutionError) as stream_err:
            _log.warning("LLM stream failed (%s), falling back to sync call", stream_err)

        # Fallback to synchronous call
        try:
            llm_response = self._call_llm(
                model_config=model_config,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                node_input=node_input,
            )
        except WorkflowExecutionError:
            _log.warning("LLM finalize call failed, falling back to synthetic output")
            if evidence_pack:
                return {
                    "result": evidence_pack.get("summary", ""),
                    "decision_basis": "evidence",
                    "evidence": evidence_pack,
                    "artifact_refs": artifact_refs,
                }, None, False
            return {
                "result": prompt or "LLM call failed.",
                "decision_basis": "working_context",
                "artifact_refs": artifact_refs,
            }, None, False

        return {
            "result": llm_response.text,
            "decision_basis": decision_basis,
            "model": llm_response.model,
            "finish_reason": llm_response.finish_reason,
            "usage": llm_response.usage,
            "artifact_refs": artifact_refs,
        }, llm_response, False

    # ------------------------------------------------------------------
    # Delta / output text helpers
    # ------------------------------------------------------------------

    def _emit_output_deltas(
        self,
        final_output: dict[str, Any],
        events: list[RuntimeEvent],
        node: dict[str, Any],
    ) -> None:
        """Emit fine-grained node.output.delta events by chunking the output text.

        When real LLM streaming is integrated, this will be replaced by
        provider-driven callbacks that emit chunks as they arrive.
        """
        text = self._extract_output_text(final_output)
        if not text:
            return
        node_id = node["id"]
        for chunk in _chunk_text_for_delta(text):
            events.append(
                RuntimeEvent(
                    "node.output.delta",
                    {"node_id": node_id, "delta": chunk},
                )
            )

    @staticmethod
    def _extract_output_text(output: dict[str, Any]) -> str:
        for key in ("result", "text", "content", "answer", "output", "message"):
            value = output.get(key)
            if isinstance(value, str) and value.strip():
                return value
        return ""

    # ------------------------------------------------------------------
    # Assistant config helpers
    # ------------------------------------------------------------------

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

    # ------------------------------------------------------------------
    # Tool result serialization (shared with host)
    # ------------------------------------------------------------------

    def _tool_result_to_dict(self, result: ToolExecutionResult) -> dict[str, Any]:
        return {
            "status": result.status,
            "content_type": result.content_type,
            "summary": result.summary,
            "raw_ref": result.raw_ref,
            "structured": deepcopy(result.structured),
            "meta": deepcopy(result.meta),
        }
