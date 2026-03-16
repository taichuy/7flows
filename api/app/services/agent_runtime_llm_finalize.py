from __future__ import annotations

import json
import logging
import time
from copy import deepcopy
from typing import Any

from app.services.llm_provider import LLMProviderError, LLMResponse, build_llm_call_config
from app.services.runtime_types import (
    AgentPlan,
    RuntimeEvent,
    ToolExecutionResult,
    WorkflowExecutionError,
)

_log = logging.getLogger(__name__)

_DELTA_CHUNK_SIZE = 80


def _chunk_text_for_delta(text: str) -> list[str]:
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


class AgentRuntimeLLMFinalizeMixin:
    def _to_dict(self, value: Any) -> dict[str, Any]:
        return deepcopy(value) if isinstance(value, dict) else {}

    @staticmethod
    def _has_valid_model_config(model_config: dict[str, Any]) -> bool:
        raise NotImplementedError

    def _call_llm(
        self,
        *,
        model_config: dict[str, Any],
        system_prompt: str | None,
        user_prompt: str,
        node_input: dict[str, Any] | None = None,
    ) -> LLMResponse:
        raise NotImplementedError

    def _tool_result_to_dict(self, result: ToolExecutionResult) -> dict[str, Any]:
        raise NotImplementedError

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
            output.setdefault(
                "decision_basis", "evidence" if evidence_pack else "tool_results"
            )
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
                "result": " | ".join(
                    result.summary for result in tool_results if result.summary
                ),
                "decision_basis": "tool_results",
                "tool_results": [
                    self._tool_result_to_dict(result) for result in tool_results
                ],
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

    def _emit_output_deltas(
        self,
        final_output: dict[str, Any],
        events: list[RuntimeEvent],
        node: dict[str, Any],
    ) -> None:
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
