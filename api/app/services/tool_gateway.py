from __future__ import annotations

import time
from copy import deepcopy
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.plugin import PluginToolRecord
from app.models.run import NodeRun, ToolCallRecord
from app.services.artifact_store import RuntimeArtifactStore
from app.services.plugin_runtime import PluginCallProxy, PluginCallRequest, PluginInvocationError
from app.services.runtime_execution_policy import (
    ResolvedExecutionPolicy,
    default_execution_class_for_tool_ecosystem,
)
from app.services.runtime_types import ToolExecutionResult, WorkflowExecutionError


def _utcnow() -> datetime:
    return datetime.now(UTC)


class ToolGateway:
    def __init__(
        self,
        *,
        plugin_call_proxy: PluginCallProxy,
        artifact_store: RuntimeArtifactStore | None = None,
    ) -> None:
        self._plugin_call_proxy = plugin_call_proxy
        self._artifact_store = artifact_store or RuntimeArtifactStore()

    def execute(
        self,
        db: Session,
        *,
        run_id: str,
        node_run: NodeRun,
        phase: str,
        tool_id: str,
        ecosystem: str,
        inputs: dict[str, Any],
        adapter_id: str | None = None,
        credentials: dict[str, str] | None = None,
        timeout_ms: int | None = None,
        execution_policy: ResolvedExecutionPolicy | None = None,
        allowed_tool_ids: set[str] | None = None,
        retry_count: int = 0,
    ) -> ToolExecutionResult:
        if allowed_tool_ids is not None and tool_id not in allowed_tool_ids:
            raise WorkflowExecutionError(
                f"Node '{node_run.node_id}' is not allowed to call tool '{tool_id}'."
            )

        tool_record = db.get(PluginToolRecord, tool_id)
        tool_name = tool_record.name if tool_record is not None else tool_id
        request_summary = self._artifact_store.summarize(inputs)
        call_record = ToolCallRecord(
            id=str(uuid4()),
            run_id=run_id,
            node_run_id=node_run.id,
            tool_id=tool_id,
            tool_name=tool_name,
            phase=phase,
            status="running",
            request_summary=request_summary,
            retry_count=retry_count,
            created_at=_utcnow(),
        )
        db.add(call_record)
        db.flush()

        resolved_timeout_ms = timeout_ms or get_settings().plugin_default_timeout_ms
        execution_trace = self._resolve_execution_trace(
            ecosystem=ecosystem,
            adapter_id=adapter_id,
            execution_policy=execution_policy,
        )
        started_at = time.perf_counter()
        try:
            response = self._plugin_call_proxy.invoke(
                PluginCallRequest(
                    tool_id=tool_id,
                    ecosystem=ecosystem,
                    adapter_id=adapter_id,
                    inputs=deepcopy(inputs),
                    credentials=dict(credentials or {}),
                    timeout_ms=resolved_timeout_ms,
                    trace_id=f"run:{run_id}:node:{node_run.node_id}:tool:{tool_id}",
                )
            )
            result = self._normalize_result(
                db,
                run_id=run_id,
                node_run_id=node_run.id,
                tool_id=tool_id,
                tool_name=tool_name,
                payload=response.output,
                latency_ms=response.duration_ms
                or int((time.perf_counter() - started_at) * 1000),
                artifact_metadata=execution_trace,
            )
            result.meta.update(
                {key: value for key, value in execution_trace.items() if value is not None}
            )
            result.meta.setdefault("tool_call_id", call_record.id)
            call_record.status = result.status
            call_record.response_summary = result.summary
            raw_ref = result.raw_ref or ""
            if raw_ref.startswith("artifact://"):
                call_record.raw_artifact_id = raw_ref.removeprefix("artifact://")
            call_record.latency_ms = int(result.meta.get("latency_ms") or 0)
            call_record.finished_at = _utcnow()
            db.flush()
            return result
        except PluginInvocationError as exc:
            call_record.status = "failed"
            call_record.error_message = str(exc)
            call_record.latency_ms = int((time.perf_counter() - started_at) * 1000)
            call_record.finished_at = _utcnow()
            db.flush()
            raise WorkflowExecutionError(str(exc)) from exc

    def list_tool_calls(self, db: Session, run_id: str) -> list[ToolCallRecord]:
        return db.scalars(
            select(ToolCallRecord)
            .where(ToolCallRecord.run_id == run_id)
            .order_by(ToolCallRecord.created_at.asc())
        ).all()

    def record_callback_result(
        self,
        db: Session,
        *,
        run_id: str,
        node_run: NodeRun,
        tool_call_record: ToolCallRecord | None,
        payload: dict[str, Any],
        tool_id: str | None = None,
    ) -> ToolExecutionResult:
        resolved_tool_id = (
            tool_id or (tool_call_record.tool_id if tool_call_record is not None else "")
        )
        resolved_tool_name = (
            tool_call_record.tool_name
            if tool_call_record is not None
            else resolved_tool_id or "callback"
        )
        callback_finished_at = _utcnow()
        latency_ms = 0
        if tool_call_record is not None and tool_call_record.created_at is not None:
            created_at = tool_call_record.created_at
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=UTC)
            latency_ms = max(
                int((callback_finished_at - created_at).total_seconds() * 1000),
                0,
            )

        result = self._normalize_result(
            db,
            run_id=run_id,
            node_run_id=node_run.id,
            tool_id=resolved_tool_id or resolved_tool_name,
            tool_name=resolved_tool_name,
            payload=payload,
            latency_ms=latency_ms,
        )
        if tool_call_record is not None:
            result.meta.setdefault("tool_call_id", tool_call_record.id)

        if tool_call_record is not None:
            tool_call_record.status = result.status
            tool_call_record.response_summary = result.summary
            raw_ref = result.raw_ref or ""
            if raw_ref.startswith("artifact://"):
                tool_call_record.raw_artifact_id = raw_ref.removeprefix("artifact://")
            tool_call_record.latency_ms = int(result.meta.get("latency_ms") or latency_ms)
            tool_call_record.error_message = (
                str(payload.get("error_message") or result.summary or "")
                if result.status == "failed"
                else None
            )
            tool_call_record.finished_at = callback_finished_at
            db.flush()

        return result

    def _normalize_result(
        self,
        db: Session,
        *,
        run_id: str,
        node_run_id: str,
        tool_id: str,
        tool_name: str,
        payload: dict[str, Any],
        latency_ms: int,
        artifact_metadata: dict[str, Any] | None = None,
    ) -> ToolExecutionResult:
        normalized_artifact_metadata = {
            "tool_id": tool_id,
            "tool_name": tool_name,
            **dict(artifact_metadata or {}),
        }
        if self._is_normalized_tool_payload(payload):
            normalized = deepcopy(payload)
            meta = dict(normalized.get("meta") or {})
            meta.setdefault("tool_name", tool_name)
            meta.setdefault("tool_id", tool_id)
            meta.setdefault("latency_ms", latency_ms)
            raw_ref = normalized.get("raw_ref")
            if raw_ref is None and normalized.get("status") != "waiting":
                artifact_ref = self._artifact_store.create_artifact(
                    db,
                    run_id=run_id,
                    node_run_id=node_run_id,
                    artifact_kind="tool_result",
                    value=normalized.get("structured") or {},
                    content_type=normalized.get("content_type") or "json",
                    summary=normalized.get("summary") or "",
                    metadata_payload=normalized_artifact_metadata,
                )
                raw_ref = artifact_ref.uri
            return ToolExecutionResult(
                status=str(normalized.get("status") or "success"),
                content_type=str(normalized.get("content_type") or "json"),
                summary=str(normalized.get("summary") or ""),
                raw_ref=raw_ref,
                structured=dict(normalized.get("structured") or {}),
                meta=meta,
            )

        artifact_ref = self._artifact_store.create_artifact(
            db,
            run_id=run_id,
            node_run_id=node_run_id,
            artifact_kind="tool_result",
            value=payload,
            content_type=self._artifact_store.infer_content_type(payload),
            metadata_payload=normalized_artifact_metadata,
        )
        return ToolExecutionResult(
            status="success",
            content_type=self._artifact_store.infer_content_type(payload),
            summary=self._artifact_store.summarize(payload),
            raw_ref=artifact_ref.uri,
            structured=dict(payload or {}),
            meta={
                "tool_name": tool_name,
                "tool_id": tool_id,
                "latency_ms": latency_ms,
                "truncated": False,
            },
        )

    def _is_normalized_tool_payload(self, payload: dict[str, Any]) -> bool:
        return bool(
            isinstance(payload, dict)
            and isinstance(payload.get("status"), str)
            and isinstance(payload.get("content_type"), str)
            and "structured" in payload
        )

    def _resolve_execution_trace(
        self,
        *,
        ecosystem: str,
        adapter_id: str | None,
        execution_policy: ResolvedExecutionPolicy | None,
    ) -> dict[str, Any]:
        resolved_policy = execution_policy or ResolvedExecutionPolicy(
            execution_class=default_execution_class_for_tool_ecosystem(ecosystem),
            source="default",
        )
        requested_execution_class = resolved_policy.execution_class
        if ecosystem == "native":
            effective_execution_class = "inline"
            executor_ref = "tool:native-inline"
            fallback_reason = None
            if requested_execution_class != effective_execution_class:
                fallback_reason = "native_tools_currently_inline_only"
        else:
            effective_execution_class = "subprocess"
            executor_ref = f"tool:compat-adapter:{adapter_id or ecosystem}"
            fallback_reason = None
            if requested_execution_class != effective_execution_class:
                fallback_reason = "compat_tools_currently_bridge_via_adapter_service"

        return {
            "requested_execution_class": requested_execution_class,
            "effective_execution_class": effective_execution_class,
            "execution_source": resolved_policy.source,
            "requested_execution_profile": resolved_policy.profile,
            "requested_execution_timeout_ms": resolved_policy.timeout_ms,
            "requested_network_policy": resolved_policy.network_policy,
            "requested_filesystem_policy": resolved_policy.filesystem_policy,
            "executor_ref": executor_ref,
            "fallback_reason": fallback_reason,
        }
