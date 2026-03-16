"""AgentRuntime LLM support facade.

Keeps shared LLM integration/config helpers in one place while delegating
plan, assistant evidence distill, and finalize/delta behavior to phase-
specific mixins.
"""

from __future__ import annotations

import logging
import time
from copy import deepcopy
from typing import TYPE_CHECKING, Any

from app.services.agent_runtime_llm_assistant import AgentRuntimeLLMAssistantMixin
from app.services.agent_runtime_llm_finalize import AgentRuntimeLLMFinalizeMixin
from app.services.agent_runtime_llm_plan import AgentRuntimeLLMPlanMixin
from app.services.llm_provider import (
    LLMProviderError,
    LLMResponse,
    build_llm_call_config,
)
from app.services.runtime_types import ToolExecutionResult, WorkflowExecutionError

if TYPE_CHECKING:
    from app.services.llm_provider import LLMProviderService

_log = logging.getLogger(__name__)


class AgentRuntimeLLMSupportMixin(
    AgentRuntimeLLMPlanMixin,
    AgentRuntimeLLMAssistantMixin,
    AgentRuntimeLLMFinalizeMixin,
):
    """Mixin providing LLM plan, finalize, evidence distill and delta helpers.

    Expects the consuming class to expose:
    - ``self._llm_provider: LLMProviderService``
    - ``self._to_dict(value) -> dict``
    """

    _llm_provider: LLMProviderService

    def _to_dict(self, value: Any) -> dict[str, Any]:  # pragma: no cover - stub
        return deepcopy(value) if isinstance(value, dict) else {}

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

    def _tool_result_to_dict(self, result: ToolExecutionResult) -> dict[str, Any]:
        return {
            "status": result.status,
            "content_type": result.content_type,
            "summary": result.summary,
            "raw_ref": result.raw_ref,
            "structured": deepcopy(result.structured),
            "meta": deepcopy(result.meta),
        }
