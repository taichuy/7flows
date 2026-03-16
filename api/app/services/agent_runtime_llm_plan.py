from __future__ import annotations

import logging
from copy import deepcopy
from typing import Any

from app.services.llm_provider import LLMResponse
from app.services.runtime_types import (
    AgentPlan,
    AgentToolCall,
    WorkflowExecutionError,
)

_log = logging.getLogger(__name__)


class AgentRuntimeLLMPlanMixin:
    def _to_dict(self, value: Any) -> dict[str, Any]:
        return deepcopy(value) if isinstance(value, dict) else {}

    @staticmethod
    def _has_valid_model_config(model_config: dict[str, Any]) -> bool:
        raise NotImplementedError

    def _assistant_enabled(self, config: dict[str, Any]) -> bool:
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
