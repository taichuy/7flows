from __future__ import annotations

import logging
from copy import deepcopy

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.run import NodeRun
from app.services.credential_store import CredentialAccessPendingError
from app.services.runtime_execution_adapters import NodeExecutionRequest
from app.services.runtime_execution_policy import execution_policy_from_node_run_input
from app.services.runtime_types import (
    AuthorizedContextRefs,
    NodeExecutionResult,
    RuntimeEvent,
    WorkflowExecutionError,
)
from app.services.tool_execution_events import build_tool_execution_events

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
            try:
                resolved_credentials = self._resolve_node_credentials(
                    db,
                    node,
                    run_id=run_id,
                    node_run=node_run,
                )
            except CredentialAccessPendingError as exc:
                return self._build_sensitive_access_waiting_result(
                    node=node,
                    node_run=node_run,
                    bundle=exc.bundle,
                    access_target="llm_model",
                )
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
        try:
            resolved_credentials = self._resolve_credentials_dict(
                db,
                raw_credentials,
                run_id=run_id,
                node_run=node_run,
                requester_type="tool",
                requester_id=tool_ref["toolId"],
                purpose_text=(
                    f"Tool node '{node['id']}' requested credentials for tool "
                    f"'{tool_ref['toolId']}'."
                ),
            )
        except CredentialAccessPendingError as exc:
            return self._build_sensitive_access_waiting_result(
                node=node,
                node_run=node_run,
                bundle=exc.bundle,
                access_target="tool_credentials",
            )
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
            execution_policy=execution_policy_from_node_run_input(
                node_input,
                node_type=str(node.get("type") or ""),
            ),
        )
        if tool_result.raw_ref:
            self._context_service.append_artifact_ref(node_run, tool_result.raw_ref)
        events = build_tool_execution_events(
            node_id=node["id"],
            tool_id=tool_ref["toolId"],
            tool_name=str(tool_result.meta.get("tool_name") or tool_ref["toolId"]),
            tool_result=tool_result,
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
            events.append(
                RuntimeEvent(
                    "tool.waiting",
                    {
                        "node_id": node["id"],
                        "tool_id": tool_ref["toolId"],
                        "reason": waiting_reason,
                        "raw_ref": tool_result.raw_ref,
                    },
                )
            )
            return NodeExecutionResult(
                suspended=True,
                waiting_status=waiting_status,
                waiting_reason=waiting_reason,
                resume_after_seconds=self._resume_after_seconds_for_tool_result(tool_result),
                events=events,
            )
        events.append(
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
        )
        return NodeExecutionResult(
            output=tool_result.structured,
            events=events,
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

    def _resolve_node_credentials(
        self,
        db: Session,
        node: dict,
        *,
        run_id: str | None = None,
        node_run: NodeRun | None = None,
    ) -> dict[str, str]:
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
        return self._resolve_credentials_dict(
            db,
            raw_creds,
            run_id=run_id,
            node_run=node_run,
            requester_type="ai",
            requester_id=str(node.get("id") or "llm_agent"),
            purpose_text=(
                "LLM agent node "
                f"'{node.get('id') or 'unknown'}' requested model/runtime credentials."
            ),
        )

    def _resolve_credentials_dict(
        self,
        db: Session,
        raw: dict[str, str],
        *,
        run_id: str | None = None,
        node_run: NodeRun | None = None,
        requester_type: str = "workflow",
        requester_id: str = "runtime",
        purpose_text: str | None = None,
    ) -> dict[str, str]:
        if not any(
            isinstance(value, str) and value.startswith("credential://")
            for value in raw.values()
        ):
            return raw
        try:
            if node_run is not None:
                resolved = self._credential_store.resolve_runtime_credential_refs(
                    db,
                    credentials=raw,
                    run_id=run_id,
                    node_run_id=node_run.id,
                    requester_type=requester_type,
                    requester_id=requester_id,
                    purpose_text=purpose_text,
                )
                self._clear_sensitive_access_waiting_state(node_run)
                return resolved
            return self._credential_store.resolve_credential_refs(db, credentials=raw)
        except CredentialAccessPendingError:
            raise
        except Exception as exc:
            _log.warning("Credential resolution failed: %s", exc)
            raise WorkflowExecutionError(
                f"Failed to resolve credential references: {exc}"
            ) from exc

    def _build_sensitive_access_waiting_result(
        self,
        *,
        node: dict,
        node_run: NodeRun,
        bundle,
        access_target: str,
    ) -> NodeExecutionResult:
        approval_ticket = bundle.approval_ticket
        waiting_reason = (
            f"Sensitive access approval required for resource '{bundle.resource.label}'."
        )
        node_run.status = "waiting_tool"
        node_run.phase = "waiting_tool"
        node_run.waiting_reason = waiting_reason
        checkpoint_payload = dict(node_run.checkpoint_payload or {})
        checkpoint_payload["sensitive_access"] = {
            "resource_id": bundle.resource.id,
            "resource_label": bundle.resource.label,
            "sensitivity_level": bundle.resource.sensitivity_level,
            "access_request_id": bundle.access_request.id,
            "approval_ticket_id": approval_ticket.id if approval_ticket is not None else None,
            "access_target": access_target,
        }
        node_run.checkpoint_payload = checkpoint_payload
        return NodeExecutionResult(
            suspended=True,
            waiting_status="waiting_tool",
            waiting_reason=waiting_reason,
            events=[
                RuntimeEvent(
                    "sensitive_access.requested",
                    {
                        "node_id": node["id"],
                        "resource_id": bundle.resource.id,
                        "resource_label": bundle.resource.label,
                        "sensitivity_level": bundle.resource.sensitivity_level,
                        "access_request_id": bundle.access_request.id,
                        "approval_ticket_id": (
                            approval_ticket.id if approval_ticket is not None else None
                        ),
                        "access_target": access_target,
                    },
                )
            ],
        )

    def _clear_sensitive_access_waiting_state(self, node_run: NodeRun) -> None:
        checkpoint_payload = dict(node_run.checkpoint_payload or {})
        if checkpoint_payload.pop("sensitive_access", None) is not None:
            node_run.checkpoint_payload = checkpoint_payload

    def _waiting_status_for_tool_result(self, tool_result) -> str:
        waiting_status = str(tool_result.meta.get("waiting_status") or "").strip()
        if waiting_status:
            return waiting_status
        return "waiting_tool"

    def _resume_after_seconds_for_tool_result(self, tool_result) -> float | None:
        raw_value = tool_result.meta.get("resume_after_seconds")
        if raw_value is None:
            return None
        try:
            return max(float(raw_value), 0.0)
        except (TypeError, ValueError):
            return None

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
