from __future__ import annotations

import json
import logging
from copy import deepcopy
from typing import Any

from app.services.llm_provider import LLMResponse
from app.services.runtime_types import (
    EvidencePack,
    ToolExecutionResult,
    WorkflowExecutionError,
)

_log = logging.getLogger(__name__)


class AgentRuntimeLLMAssistantMixin:
    def _to_dict(self, value: Any) -> dict[str, Any]:
        return deepcopy(value) if isinstance(value, dict) else {}

    def _assistant_enabled(self, config: dict[str, Any]) -> bool:
        raise NotImplementedError

    def _assistant_trigger_mode(self, config: dict[str, Any]) -> str:
        raise NotImplementedError

    def _assistant_model_config(
        self,
        config: dict[str, Any],
        default_model_config: dict[str, Any],
    ) -> dict[str, Any]:
        raise NotImplementedError

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
                recommended_focus=[
                    str(item) for item in mock_output.get("recommended_focus", [])
                ],
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
                "tool_id": result.meta.get("tool_id"),
                "tool_name": result.meta.get("tool_name"),
                "summary": result.summary,
                "structured": result.structured,
            }
            for result in tool_results
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
                key_points=[str(point) for point in parsed.get("key_points", [])],
                evidence=[
                    {"tool_id": result.meta.get("tool_id"), "summary": result.summary}
                    for result in tool_results
                ],
                conflicts=[str(conflict) for conflict in parsed.get("conflicts", [])],
                unknowns=[str(unknown) for unknown in parsed.get("unknowns", [])],
                recommended_focus=[
                    str(focus) for focus in parsed.get("recommended_focus", [])
                ],
                confidence=float(parsed.get("confidence") or 0.8),
                artifact_refs=[result.raw_ref for result in tool_results if result.raw_ref],
            ), llm_response

        return EvidencePack(
            summary=llm_response.text[:500],
            key_points=[result.summary for result in tool_results if result.summary],
            evidence=[
                {"tool_id": result.meta.get("tool_id"), "summary": result.summary}
                for result in tool_results
            ],
            confidence=0.7,
            artifact_refs=[result.raw_ref for result in tool_results if result.raw_ref],
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
        summary = " | ".join(
            result.summary for result in tool_results if result.summary
        ).strip()
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
