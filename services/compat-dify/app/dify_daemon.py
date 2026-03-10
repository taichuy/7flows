from __future__ import annotations

import json
import mimetypes
from collections.abc import Callable
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import Settings
from app.schemas import AdapterToolItem

FILE_MODEL_IDENTITY = "__dify__file__"
ClientFactory = Callable[[int], httpx.Client]


class DifyTranslationError(ValueError):
    pass


class DifyPluginDaemonError(RuntimeError):
    pass


class DifyPluginDaemonClient:
    def __init__(
        self,
        settings: Settings,
        *,
        client_factory: ClientFactory | None = None,
    ) -> None:
        self._settings = settings
        self._client_factory = client_factory or self._default_client_factory

    def translate_invoke_request(
        self,
        *,
        tool: AdapterToolItem,
        inputs: dict[str, Any],
        credentials: dict[str, str],
        trace_id: str,
        timeout_ms: int,
    ) -> dict[str, Any]:
        runtime = _runtime_binding_for_tool(tool)
        tool_parameters = _translate_tool_parameters(tool, inputs)
        credential_type = "api-key" if credentials else "unauthorized"
        request_body = {
            "user_id": self._settings.plugin_daemon_user_id,
            "conversation_id": None,
            "app_id": self._settings.plugin_daemon_app_id,
            "message_id": trace_id or None,
            "data": {
                "provider": runtime["provider"],
                "tool": runtime["tool_name"],
                "credentials": dict(credentials),
                "credential_type": credential_type,
                "tool_parameters": tool_parameters,
            },
        }
        path = f"plugin/{self._settings.plugin_daemon_tenant_id}/dispatch/tool/invoke"
        return {
            "path": path,
            "headers": {
                "X-Plugin-ID": runtime["plugin_id"],
                "Content-Type": "application/json",
            },
            "body": request_body,
            "timeoutMs": min(timeout_ms, self._settings.plugin_daemon_timeout_ms),
        }

    def translate_invoke_request_preview(
        self,
        *,
        tool: AdapterToolItem,
        inputs: dict[str, Any],
        credentials: dict[str, str],
        trace_id: str,
        timeout_ms: int,
    ) -> dict[str, Any]:
        translated = self.translate_invoke_request(
            tool=tool,
            inputs=inputs,
            credentials=credentials,
            trace_id=trace_id,
            timeout_ms=timeout_ms,
        )
        redacted_body = dict(translated["body"])
        redacted_data = dict(redacted_body["data"])
        redacted_data["credentials"] = {name: "***" for name in credentials}
        redacted_body["data"] = redacted_data
        return {
            "path": translated["path"],
            "headers": translated["headers"],
            "body": redacted_body,
            "timeoutMs": translated["timeoutMs"],
        }

    def invoke_tool(
        self,
        *,
        tool: AdapterToolItem,
        inputs: dict[str, Any],
        credentials: dict[str, str],
        trace_id: str,
        timeout_ms: int,
    ) -> tuple[dict[str, Any], list[str]]:
        if not self._settings.plugin_daemon_url or not self._settings.plugin_daemon_api_key:
            raise DifyPluginDaemonError(
                "Dify plugin daemon URL or API key is not configured for proxy mode."
            )

        translated = self.translate_invoke_request(
            tool=tool,
            inputs=inputs,
            credentials=credentials,
            trace_id=trace_id,
            timeout_ms=timeout_ms,
        )
        invoke_url = f"{self._settings.plugin_daemon_url.rstrip('/')}/{translated['path']}"
        headers = {
            **translated["headers"],
            "X-Api-Key": self._settings.plugin_daemon_api_key,
        }
        timeout_value = translated["timeoutMs"]

        try:
            with self._client_factory(timeout_value) as client:
                with client.stream(
                    "POST",
                    invoke_url,
                    json=translated["body"],
                    headers=headers,
                ) as response:
                    response.raise_for_status()
                    output, logs = _aggregate_daemon_stream(response.iter_lines())
        except httpx.TimeoutException as exc:
            raise DifyPluginDaemonError("Timed out while invoking Dify plugin daemon.") from exc
        except httpx.HTTPStatusError as exc:
            raise DifyPluginDaemonError(
                f"Dify plugin daemon rejected tool '{tool.id}' with status {exc.response.status_code}."
            ) from exc
        except httpx.RequestError as exc:
            raise DifyPluginDaemonError("Failed to reach Dify plugin daemon.") from exc

        return output, logs

    @staticmethod
    def _default_client_factory(timeout_ms: int) -> httpx.Client:
        timeout_seconds = None if timeout_ms <= 0 else timeout_ms / 1000
        return httpx.Client(timeout=timeout_seconds)


def _runtime_binding_for_tool(tool: AdapterToolItem) -> dict[str, str]:
    plugin_meta = tool.plugin_meta or {}
    runtime = plugin_meta.get("dify_runtime") if isinstance(plugin_meta, dict) else None
    if not isinstance(runtime, dict):
        raise DifyTranslationError(f"Tool '{tool.id}' is missing dify_runtime metadata.")

    plugin_id = str(runtime.get("plugin_id") or "").strip()
    provider = str(runtime.get("provider") or "").strip()
    tool_name = str(runtime.get("tool_name") or "").strip()
    if not plugin_id or not provider or not tool_name:
        raise DifyTranslationError(f"Tool '{tool.id}' has incomplete dify_runtime metadata.")
    return {
        "plugin_id": plugin_id,
        "provider": provider,
        "tool_name": tool_name,
    }


def _translate_tool_parameters(tool: AdapterToolItem, inputs: dict[str, Any]) -> dict[str, Any]:
    constrained_ir = tool.constrained_ir
    parameters: dict[str, Any] = {}
    for field in constrained_ir.input_contract:
        name = field.name
        if name not in inputs:
            continue
        value = inputs[name]
        if field.value_source == "file":
            parameters[name] = _translate_file_parameter(value)
            continue
        parameters[name] = value
    return parameters


def _translate_file_parameter(value: Any) -> dict[str, Any]:
    if not isinstance(value, str):
        raise DifyTranslationError("File parameters must be translated from URI strings.")
    parsed = urlparse(value)
    if not parsed.scheme:
        raise DifyTranslationError(f"Invalid file URI '{value}'.")

    filename = PurePosixPath(parsed.path).name or "file"
    mime_type, _ = mimetypes.guess_type(filename)
    extension = PurePosixPath(filename).suffix or None
    file_type = _guess_file_type(mime_type, extension)

    return {
        "dify_model_identity": FILE_MODEL_IDENTITY,
        "mime_type": mime_type or "application/octet-stream",
        "filename": filename,
        "extension": extension,
        "size": -1,
        "type": file_type,
        "url": value,
    }


def _guess_file_type(mime_type: str | None, extension: str | None) -> str:
    mime = (mime_type or "").lower()
    ext = (extension or "").lower()
    if mime.startswith("image/") or ext in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}:
        return "image"
    if mime.startswith("audio/") or ext in {".mp3", ".wav", ".ogg", ".m4a"}:
        return "audio"
    if mime.startswith("video/") or ext in {".mp4", ".mov", ".avi", ".mkv", ".webm"}:
        return "video"
    if mime or ext:
        return "document"
    return "custom"


def _aggregate_daemon_stream(lines: Any) -> tuple[dict[str, Any], list[str]]:
    text_parts: list[str] = []
    json_messages: list[Any] = []
    files: list[dict[str, Any]] = []
    messages: list[dict[str, Any]] = []
    variables: dict[str, Any] = {}
    logs: list[str] = []
    structured_logs: list[dict[str, Any]] = []

    for raw_line in lines:
        if not raw_line:
            continue
        line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else str(raw_line)
        line = line.strip()
        if not line:
            continue
        if line.startswith("data:"):
            line = line[5:].strip()
        if not line:
            continue

        event = json.loads(line)
        if int(event.get("code") or 0) != 0:
            raise DifyPluginDaemonError(
                str(event.get("message") or "Dify plugin daemon returned an error.")
            )

        data = event.get("data")
        if not isinstance(data, dict):
            continue

        msg_type = str(data.get("type") or "").lower()
        message = data.get("message") if isinstance(data.get("message"), dict) else {}
        meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}

        if msg_type == "text":
            text = str(message.get("text") or "")
            text_parts.append(text)
            messages.append({"type": "text", "text": text, "meta": meta})
            continue
        if msg_type == "json":
            payload = message.get("json_object")
            json_messages.append(payload)
            messages.append({"type": "json", "json": payload, "meta": meta})
            continue
        if msg_type == "variable":
            variable_name = str(message.get("variable_name") or "").strip()
            variable_value = message.get("variable_value")
            if variable_name:
                if bool(message.get("stream")) and isinstance(variable_value, str):
                    previous = variables.get(variable_name)
                    if isinstance(previous, str):
                        variables[variable_name] = previous + variable_value
                    else:
                        variables[variable_name] = variable_value
                else:
                    variables[variable_name] = variable_value
            messages.append(
                {
                    "type": "variable",
                    "name": variable_name,
                    "stream": bool(message.get("stream")),
                    "meta": meta,
                }
            )
            continue
        if msg_type == "log":
            log_entry = {
                "id": str(message.get("id") or ""),
                "label": str(message.get("label") or ""),
                "status": str(message.get("status") or ""),
                "error": message.get("error"),
                "data": message.get("data") or {},
                "metadata": message.get("metadata") or {},
            }
            structured_logs.append(log_entry)
            logs.append(_format_log_entry(log_entry))
            continue
        if msg_type in {"blob", "file", "image", "image_link", "binary_link", "link"}:
            file_entry = {
                "type": msg_type,
                "meta": meta,
            }
            if msg_type == "blob":
                blob_value = str(message.get("blob") or "")
                file_entry["size"] = len(blob_value)
            else:
                file_entry["message"] = message
            files.append(file_entry)
            messages.append(file_entry)
            continue

        messages.append({"type": msg_type or "unknown", "message": message, "meta": meta})

    output: dict[str, Any] = {}
    if text_parts:
        output["text"] = "".join(text_parts)
    if json_messages:
        output["json"] = json_messages[0] if len(json_messages) == 1 else json_messages
    if variables:
        output["variables"] = variables
    if files:
        output["files"] = files
    if messages:
        output["messages"] = messages
    if structured_logs:
        output["logs"] = structured_logs
    return output, logs


def _format_log_entry(entry: dict[str, Any]) -> str:
    label = entry.get("label") or "plugin-log"
    status = entry.get("status") or "unknown"
    error = entry.get("error")
    if error:
        return f"{label}[{status}]: {error}"
    return f"{label}[{status}]"
