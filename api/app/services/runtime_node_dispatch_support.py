from __future__ import annotations

import json
import logging
import re
from copy import deepcopy

from sqlalchemy.orm import Session

from app.core.safe_expressions import MISSING
from app.core.config import get_settings
from app.models.run import NodeRun
from app.services.credential_store import CredentialAccessPendingError
from app.services.model_provider_registry import (
    ModelProviderRegistryService,
    build_credential_ref,
    resolve_provider_config_id,
)
from app.services.runtime_branch_execution import execute_branch_node
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
_model_provider_registry = ModelProviderRegistryService()
_END_NODE_TEMPLATE_PATTERN = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")


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

        if node.get("type") == "llmAgentNode" and get_settings().durable_agent_runtime_enabled:
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
        if node_type == "startNode":
            return NodeExecutionResult(output=node_input.get("trigger_input", {}))
        if node_type == "endNode":
            return NodeExecutionResult(
                output=self._build_end_node_output(node=node, node_input=node_input)
            )
        if node_type == "toolNode":
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
        if node_type == "mcpQueryNode":
            return self._execute_mcp_query_node_with_access_control(
                db,
                node=node,
                node_run=node_run,
                run_id=run_id,
                authorized_context=authorized_context,
                outputs=outputs,
            )
        if node_type == "referenceNode":
            return NodeExecutionResult(
                output=self._execute_reference_node(node, authorized_context, outputs)
            )
        if node_type in {"conditionNode", "routerNode"}:
            return NodeExecutionResult(output=self._execute_branch_node(node, node_input))
        return NodeExecutionResult(
            output={
                "node_id": node.get("id"),
                "node_type": node_type,
                "received": node_input,
            }
        )

    def _build_end_node_output(self, *, node: dict, node_input: dict) -> dict:
        config = node.get("config") if isinstance(node.get("config"), dict) else {}
        reply_template = config.get("replyTemplate")

        if not isinstance(reply_template, str) or not reply_template.strip():
            return node_input.get("accumulated", {})

        response_key = config.get("responseKey")
        normalized_response_key = (
            response_key.strip()
            if isinstance(response_key, str) and response_key.strip()
            else "answer"
        )

        return {
            normalized_response_key: self._render_end_node_template(reply_template, node_input)
        }

    def _render_end_node_template(self, template: str, node_input: dict) -> str:
        def replace_token(match: re.Match[str]) -> str:
            path = match.group(1).strip()
            if not path:
                return ""

            resolved = self._resolve_selector_path(node_input, path)
            if resolved is MISSING or resolved is None:
                return ""

            if isinstance(resolved, (dict, list)):
                return json.dumps(resolved, ensure_ascii=False)
            if isinstance(resolved, bool):
                return "true" if resolved else "false"
            return str(resolved)

        return _END_NODE_TEMPLATE_PATTERN.sub(replace_token, template).strip()

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
            provider_config_ref = model_config.get("providerConfigRef") or model_config.get(
                "provider_config_ref"
            )
            if isinstance(provider_config_ref, str) and provider_config_ref.strip():
                provider_config = _model_provider_registry.get_provider_config(
                    db,
                    workspace_id="default",
                    provider_config_id=resolve_provider_config_id(provider_config_ref),
                )
                raw_creds.setdefault("apiKey", build_credential_ref(provider_config.credential_id))
            api_key = model_config.get("apiKey")
            if isinstance(api_key, str) and api_key.startswith("credential://"):
                raw_creds["apiKey"] = api_key
        return self._resolve_credentials_dict(
            db,
            raw_creds,
            run_id=run_id,
            node_run=node_run,
            requester_type="ai",
            requester_id=str(node.get("id") or "llmAgentNode"),
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

    def _execute_mcp_query_node_with_access_control(
        self,
        db: Session,
        *,
        node: dict,
        node_run: NodeRun,
        run_id: str,
        authorized_context: AuthorizedContextRefs,
        outputs: dict[str, dict],
    ) -> NodeExecutionResult:
        node_output = self._execute_mcp_query_node(node, authorized_context, outputs)
        guarded_output = self._guard_context_read_output(
            db,
            node=node,
            node_run=node_run,
            run_id=run_id,
            node_output=node_output,
        )
        if isinstance(guarded_output, NodeExecutionResult):
            return guarded_output
        return NodeExecutionResult(
            output=guarded_output,
            events=[
                RuntimeEvent(
                    "node.context.read",
                    self._build_context_read_payload(node, guarded_output),
                )
            ],
        )

    def _guard_context_read_output(
        self,
        db: Session,
        *,
        node: dict,
        node_run: NodeRun,
        run_id: str,
        node_output: dict,
    ) -> dict | NodeExecutionResult:
        results = node_output.get("results")
        if not isinstance(results, list) or not results:
            self._clear_sensitive_access_waiting_state(node_run)
            return node_output

        guarded_results = []
        for item in results:
            if not isinstance(item, dict):
                guarded_results.append(item)
                continue

            source_node_id = str(item.get("nodeId") or "").strip()
            artifact_type = str(item.get("artifactType") or "").strip()
            if not source_node_id or not artifact_type:
                guarded_results.append(item)
                continue

            resource = self._sensitive_access.find_workflow_context_resource(
                db,
                run_id=run_id,
                source_node_id=source_node_id,
                artifact_type=artifact_type,
            )
            if resource is None:
                guarded_results.append(item)
                continue

            bundle = self._sensitive_access.ensure_access(
                db,
                run_id=run_id,
                node_run_id=node_run.id,
                requester_type="workflow",
                requester_id=str(node.get("id") or "mcpQueryNode"),
                resource_id=resource.id,
                action_type="read",
                purpose_text=(
                    f"MCP query node '{node.get('id') or 'unknown'}' requested context "
                    f"from '{source_node_id}' ({artifact_type})."
                ),
                reuse_existing=True,
            )
            decision = str(bundle.access_request.decision or "")
            if decision == "require_approval":
                return self._build_sensitive_access_waiting_result(
                    node=node,
                    node_run=node_run,
                    bundle=bundle,
                    access_target="authorized_context",
                )
            if decision == "deny":
                reason_code = str(bundle.access_request.reason_code or "access_denied")
                raise WorkflowExecutionError(
                    f"Sensitive context access denied for resource '{bundle.resource.label}' "
                    f"({reason_code})."
                )

            guarded_item = deepcopy(item)
            guarded_item["masked"] = decision == "allow_masked"
            guarded_item["sensitiveAccess"] = {
                "resourceId": bundle.resource.id,
                "resourceLabel": bundle.resource.label,
                "sensitivityLevel": bundle.resource.sensitivity_level,
                "decision": decision,
                "reasonCode": bundle.access_request.reason_code,
            }
            if decision == "allow_masked":
                guarded_item["content"] = self._masked_context_content(item.get("content"))
            guarded_results.append(guarded_item)

        self._clear_sensitive_access_waiting_state(node_run)
        guarded_output = deepcopy(node_output)
        guarded_output["results"] = guarded_results
        return guarded_output

    def _execute_reference_node(
        self,
        node: dict,
        authorized_context: AuthorizedContextRefs,
        outputs: dict[str, dict],
    ) -> dict[str, object]:
        config = node.get("config") or {}
        reference = config.get("reference") or {}
        source_node_id = str(reference.get("sourceNodeId") or "").strip()
        artifact_type = str(reference.get("artifactType") or "json").strip() or "json"

        if not source_node_id:
            raise WorkflowExecutionError(
                f"Reference node '{node.get('id')}' requires config.reference.sourceNodeId."
            )
        if artifact_type != "json":
            raise WorkflowExecutionError(
                f"Reference node '{node.get('id')}' currently only supports json artifacts."
            )

        allowed_artifacts = self._authorized_artifact_lookup(authorized_context)
        if source_node_id not in allowed_artifacts:
            raise WorkflowExecutionError(
                f"Node '{node.get('id')}' requested unauthorized reference source "
                f"'{source_node_id}'."
            )
        if "json" not in allowed_artifacts.get(source_node_id, set()):
            raise WorkflowExecutionError(
                f"Node '{node.get('id')}' requested unauthorized json artifact from "
                f"'{source_node_id}'."
            )
        if source_node_id not in outputs:
            raise WorkflowExecutionError(
                f"Reference node '{node.get('id')}' could not find source output from "
                f"'{source_node_id}'."
            )

        return {
            "reference": {
                "sourceNodeId": source_node_id,
                "artifactType": "json",
                "content": deepcopy(outputs[source_node_id]),
            }
        }

    def _masked_context_content(self, content):
        if isinstance(content, dict):
            return {
                "masked": True,
                "kind": "object",
                "fieldCount": len(content),
            }
        if isinstance(content, list):
            return {
                "masked": True,
                "kind": "array",
                "length": len(content),
            }
        if isinstance(content, str):
            return {
                "masked": True,
                "kind": "text",
                "length": len(content),
            }
        if content is None:
            return {"masked": True, "kind": "null"}
        return {
            "masked": True,
            "kind": type(content).__name__,
        }

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
        return execute_branch_node(node, node_input)
