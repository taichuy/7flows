from __future__ import annotations

import logging
from copy import deepcopy

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.run import NodeRun
from app.services.runtime_execution_adapters import NodeExecutionRequest
from app.services.runtime_execution_policy import execution_policy_from_node_run_input
from app.services.runtime_types import (
    AuthorizedContextRefs,
    NodeExecutionResult,
    RuntimeEvent,
    WorkflowExecutionError,
)

_log = logging.getLogger(__name__)


class RuntimeNodeDispatchSupportMixin:
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
        execution_policy = execution_policy_from_node_run_input(
            node_input,
            node_type=str(node.get("type") or ""),
        )
        return self._execution_adapter_registry.execute(
            NodeExecutionRequest(
                db=db,
                node=node,
                node_run=node_run,
                node_input=node_input,
                run_id=run_id,
                attempt_number=attempt_number,
                authorized_context=authorized_context,
                outputs=outputs,
                execution_policy=execution_policy,
                inline_executor=lambda: self._execute_node_inline(
                    db,
                    node=node,
                    node_run=node_run,
                    node_input=node_input,
                    run_id=run_id,
                    attempt_number=attempt_number,
                    authorized_context=authorized_context,
                    outputs=outputs,
                ),
            )
        )

    def _execute_node_inline(
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
            resolved_credentials = self._resolve_node_credentials(db, node)
            return self._agent_runtime.execute(
                db,
                run_id=run_id,
                node=node,
                node_run=node_run,
                node_input=node_input,
                resolved_credentials=resolved_credentials,
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
        raw_credentials = {
            str(key): str(value)
            for key, value in (tool_ref.get("credentials") or {}).items()
        }
        resolved_credentials = self._resolve_credentials_dict(db, raw_credentials)
        tool_result = self._tool_gateway.execute(
            db,
            run_id=run_id,
            node_run=node_run,
            phase="tool_execute",
            tool_id=tool_ref["toolId"],
            ecosystem=str(tool_ref.get("ecosystem") or "native"),
            adapter_id=tool_ref.get("adapterId"),
            inputs=self._tool_inputs_for_node(config, node_input),
            credentials=resolved_credentials,
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

    def _resolve_node_credentials(self, db: Session, node: dict) -> dict[str, str]:
        config = node.get("config", {})
        raw_creds: dict[str, str] = {}
        config_creds = config.get("credentials")
        if isinstance(config_creds, dict):
            raw_creds.update({str(key): str(value) for key, value in config_creds.items()})
        model_config = config.get("model")
        if isinstance(model_config, dict):
            api_key = model_config.get("apiKey")
            if isinstance(api_key, str) and api_key.startswith("credential://"):
                raw_creds["apiKey"] = api_key
        return self._resolve_credentials_dict(db, raw_creds)

    def _resolve_credentials_dict(
        self, db: Session, raw: dict[str, str]
    ) -> dict[str, str]:
        if not any(
            isinstance(value, str) and value.startswith("credential://")
            for value in raw.values()
        ):
            return raw
        try:
            return self._credential_store.resolve_credential_refs(db, credentials=raw)
        except Exception as exc:
            _log.warning("Credential resolution failed: %s", exc)
            raise WorkflowExecutionError(
                f"Failed to resolve credential references: {exc}"
            ) from exc

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
