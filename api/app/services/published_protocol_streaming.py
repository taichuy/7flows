from __future__ import annotations

import json
from collections.abc import Iterable, Iterator
from typing import Any

from app.services.published_protocol_mapper import extract_text_output


_DEFAULT_CHUNK_SIZE = 32


def _chunk_text(text: str, *, chunk_size: int = _DEFAULT_CHUNK_SIZE) -> list[str]:
    normalized = text or ""
    if not normalized:
        return []
    return [normalized[index : index + chunk_size] for index in range(0, len(normalized), chunk_size)]


def _serialize_sse_event(*, data: Any, event: str | None = None) -> str:
    lines: list[str] = []
    if event is not None:
        lines.append(f"event: {event}")
    payload = data if isinstance(data, str) else json.dumps(
        data,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    for line in str(payload).splitlines() or [""]:
        lines.append(f"data: {line}")
    lines.append("")
    return "\n".join(lines)


def _extract_openai_chat_text(response_payload: dict[str, Any]) -> str:
    choices = response_payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        return ""
    message = first_choice.get("message")
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    return content if isinstance(content, str) else ""


def _extract_openai_response_text(response_payload: dict[str, Any]) -> str:
    text = response_payload.get("output_text")
    return text if isinstance(text, str) else ""


def _extract_anthropic_text(response_payload: dict[str, Any]) -> str:
    content = response_payload.get("content")
    if not isinstance(content, list) or not content:
        return ""
    first_block = content[0]
    if not isinstance(first_block, dict):
        return ""
    text = first_block.get("text")
    return text if isinstance(text, str) else ""


def _serialize_payload_text(payload: Any) -> str:
    if isinstance(payload, str):
        return payload
    return json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _extract_native_run_events(run_payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw_events = run_payload.get("events")
    if not isinstance(raw_events, list):
        return []
    return [item for item in raw_events if isinstance(item, dict)]


def _extract_protocol_run_events(run_payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(run_payload, dict):
        return []
    return _extract_native_run_events(run_payload)


def _extract_protocol_text_from_run_events(run_payload: dict[str, Any] | None) -> str:
    stored_events = _extract_protocol_run_events(run_payload)
    if not stored_events:
        return ""

    delta_fragments: list[str] = []
    for event_item in stored_events:
        event_type = event_item.get("event_type")
        if event_type not in {"node.output.delta", "run.output.delta"}:
            continue
        payload = event_item.get("payload")
        normalized_payload = payload if isinstance(payload, dict) else {}
        delta = normalized_payload.get("delta")
        if isinstance(delta, str) and delta:
            delta_fragments.append(delta)
    if delta_fragments:
        return "".join(delta_fragments)

    for event_type in ("node.output.completed", "run.completed"):
        for event_item in reversed(stored_events):
            if event_item.get("event_type") != event_type:
                continue
            payload = event_item.get("payload")
            normalized_payload = payload if isinstance(payload, dict) else {}
            output_payload = normalized_payload.get("output")
            text = extract_text_output(output_payload)
            if text:
                return text
    return ""


def _resolve_protocol_stream_text(
    *,
    run_payload: dict[str, Any] | None,
    fallback_text: str,
) -> str:
    return _extract_protocol_text_from_run_events(run_payload) or fallback_text


def _build_native_run_started_payload(
    *,
    response_payload: dict[str, Any],
    run_id: str,
    run_status: str,
    run_event_payload: dict[str, Any],
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": "run.started",
        "binding_id": response_payload.get("binding_id"),
        "workflow_id": response_payload.get("workflow_id"),
        "endpoint_id": response_payload.get("endpoint_id"),
        "run": {
            "id": run_id,
            "status": run_status,
            "workflow_version": response_payload.get("workflow_version"),
            "compiled_blueprint_id": response_payload.get("compiled_blueprint_id"),
        },
    }
    input_payload = run_event_payload.get("input")
    if input_payload is not None:
        payload["input_payload"] = input_payload
    return payload


def _build_native_run_event_payload(
    *,
    event_item: dict[str, Any],
    response_payload: dict[str, Any],
    run_id: str,
    run_status: str,
    output_payload: dict[str, Any],
) -> dict[str, Any]:
    event_type = str(event_item.get("event_type") or "unknown")
    event_payload = event_item.get("payload")
    normalized_payload = event_payload if isinstance(event_payload, dict) else {}
    payload: dict[str, Any] = {
        "type": event_type,
        "run_id": run_id,
    }

    node_run_id = event_item.get("node_run_id")
    if node_run_id is not None:
        payload["node_run_id"] = node_run_id

    created_at = event_item.get("created_at")
    if created_at is not None:
        payload["created_at"] = created_at

    if event_type == "run.started":
        payload.update(
            _build_native_run_started_payload(
                response_payload=response_payload,
                run_id=run_id,
                run_status=run_status,
                run_event_payload=normalized_payload,
            )
        )
        return payload

    if event_type == "run.completed":
        completed_output = normalized_payload.get("output")
        payload["status"] = run_status
        payload["output_payload"] = (
            completed_output if isinstance(completed_output, dict) else output_payload
        )
        payload["response"] = response_payload
        return payload

    node_id = normalized_payload.get("node_id")
    if node_id is not None:
        payload["node_id"] = node_id

    if event_type == "node.output.completed":
        payload["output_payload"] = normalized_payload.get("output")
        return payload

    if normalized_payload:
        payload["payload"] = normalized_payload
    return payload


def build_native_run_stream(response_payload: dict[str, Any]) -> Iterable[str]:
    run_payload = response_payload.get("run")
    run = run_payload if isinstance(run_payload, dict) else {}
    run_id = str(run.get("id") or "run_7flows_stream")
    run_status = str(run.get("status") or "succeeded")
    output_payload = run.get("output_payload")
    output_payload = output_payload if isinstance(output_payload, dict) else {}
    output_text = _serialize_payload_text(output_payload)
    stored_events = _extract_native_run_events(run)
    has_started_event = any(item.get("event_type") == "run.started" for item in stored_events)
    completed_event = next(
        (
            item
            for item in reversed(stored_events)
            if item.get("event_type") == "run.completed"
        ),
        None,
    )

    def _iter() -> Iterator[str]:
        if not has_started_event:
            yield _serialize_sse_event(
                event="run.started",
                data=_build_native_run_started_payload(
                    response_payload=response_payload,
                    run_id=run_id,
                    run_status=run_status,
                    run_event_payload={},
                ),
            )

        for event_item in stored_events:
            event_name = event_item.get("event_type")
            if not isinstance(event_name, str) or not event_name:
                continue
            if event_name == "run.completed":
                continue

            yield _serialize_sse_event(
                event=event_name,
                data=_build_native_run_event_payload(
                    event_item=event_item,
                    response_payload=response_payload,
                    run_id=run_id,
                    run_status=run_status,
                    output_payload=output_payload,
                ),
            )

        for chunk in _chunk_text(output_text):
            yield _serialize_sse_event(
                event="run.output.delta",
                data={
                    "type": "run.output.delta",
                    "run_id": run_id,
                    "delta": chunk,
                },
            )
        if completed_event is not None:
            yield _serialize_sse_event(
                event="run.completed",
                data=_build_native_run_event_payload(
                    event_item=completed_event,
                    response_payload=response_payload,
                    run_id=run_id,
                    run_status=run_status,
                    output_payload=output_payload,
                ),
            )
        else:
            yield _serialize_sse_event(
                event="run.completed",
                data={
                    "type": "run.completed",
                    "run_id": run_id,
                    "status": run_status,
                    "output_payload": output_payload,
                    "response": response_payload,
                },
            )
        yield _serialize_sse_event(data="[DONE]")

    return _iter()


def build_openai_chat_completion_stream(
    response_payload: dict[str, Any],
    *,
    run_payload: dict[str, Any] | None = None,
) -> Iterable[str]:
    response_id = str(response_payload.get("id") or "chatcmpl_7flows_stream")
    created = int(response_payload.get("created") or 0)
    model = str(response_payload.get("model") or "")
    text = _resolve_protocol_stream_text(
        run_payload=run_payload,
        fallback_text=_extract_openai_chat_text(response_payload),
    )

    def _iter() -> Iterator[str]:
        yield _serialize_sse_event(
            data={
                "id": response_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model,
                "choices": [
                    {
                        "index": 0,
                        "delta": {"role": "assistant"},
                        "finish_reason": None,
                    }
                ],
            }
        )
        for chunk in _chunk_text(text):
            yield _serialize_sse_event(
                data={
                    "id": response_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": model,
                    "choices": [
                        {
                            "index": 0,
                            "delta": {"content": chunk},
                            "finish_reason": None,
                        }
                    ],
                }
            )
        yield _serialize_sse_event(
            data={
                "id": response_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model,
                "choices": [
                    {
                        "index": 0,
                        "delta": {},
                        "finish_reason": "stop",
                    }
                ],
            }
        )
        yield _serialize_sse_event(data="[DONE]")

    return _iter()


def build_openai_response_stream(
    response_payload: dict[str, Any],
    *,
    run_payload: dict[str, Any] | None = None,
) -> Iterable[str]:
    response_id = str(response_payload.get("id") or "resp_7flows_stream")
    created_at = int(response_payload.get("created_at") or 0)
    model = str(response_payload.get("model") or "")
    output = response_payload.get("output")
    output_item = output[0] if isinstance(output, list) and output else {}
    item_id = (
        str(output_item.get("id") or "msg_7flows_stream")
        if isinstance(output_item, dict)
        else "msg_7flows_stream"
    )
    text = _resolve_protocol_stream_text(
        run_payload=run_payload,
        fallback_text=_extract_openai_response_text(response_payload),
    )

    def _iter() -> Iterator[str]:
        yield _serialize_sse_event(
            event="response.created",
            data={
                "type": "response.created",
                "response": {
                    "id": response_id,
                    "object": "response",
                    "created_at": created_at,
                    "status": "in_progress",
                    "model": model,
                },
            },
        )
        for chunk in _chunk_text(text):
            yield _serialize_sse_event(
                event="response.output_text.delta",
                data={
                    "type": "response.output_text.delta",
                    "response_id": response_id,
                    "item_id": item_id,
                    "output_index": 0,
                    "content_index": 0,
                    "delta": chunk,
                },
            )
        yield _serialize_sse_event(
            event="response.output_text.done",
            data={
                "type": "response.output_text.done",
                "response_id": response_id,
                "item_id": item_id,
                "output_index": 0,
                "content_index": 0,
                "text": text,
            },
        )
        yield _serialize_sse_event(
            event="response.completed",
            data={
                "type": "response.completed",
                "response": response_payload,
            },
        )

    return _iter()


def build_anthropic_message_stream(
    response_payload: dict[str, Any],
    *,
    run_payload: dict[str, Any] | None = None,
) -> Iterable[str]:
    message_id = str(response_payload.get("id") or "msg_7flows_stream")
    model = str(response_payload.get("model") or "")
    usage = response_payload.get("usage") if isinstance(response_payload.get("usage"), dict) else {}
    text = _resolve_protocol_stream_text(
        run_payload=run_payload,
        fallback_text=_extract_anthropic_text(response_payload),
    )

    def _iter() -> Iterator[str]:
        yield _serialize_sse_event(
            event="message_start",
            data={
                "type": "message_start",
                "message": {
                    "id": message_id,
                    "type": "message",
                    "role": "assistant",
                    "model": model,
                    "content": [],
                    "stop_reason": None,
                    "stop_sequence": None,
                    "usage": usage,
                },
            },
        )
        yield _serialize_sse_event(
            event="content_block_start",
            data={
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "text", "text": ""},
            },
        )
        for chunk in _chunk_text(text):
            yield _serialize_sse_event(
                event="content_block_delta",
                data={
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": chunk},
                },
            )
        yield _serialize_sse_event(
            event="content_block_stop",
            data={
                "type": "content_block_stop",
                "index": 0,
            },
        )
        yield _serialize_sse_event(
            event="message_delta",
            data={
                "type": "message_delta",
                "delta": {
                    "stop_reason": response_payload.get("stop_reason") or "end_turn",
                    "stop_sequence": None,
                },
                "usage": usage,
            },
        )
        yield _serialize_sse_event(
            event="message_stop",
            data={"type": "message_stop"},
        )

    return _iter()
