from __future__ import annotations

import json
from collections.abc import Iterable, Iterator
from typing import Any


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


def build_openai_chat_completion_stream(response_payload: dict[str, Any]) -> Iterable[str]:
    response_id = str(response_payload.get("id") or "chatcmpl_7flows_stream")
    created = int(response_payload.get("created") or 0)
    model = str(response_payload.get("model") or "")
    text = _extract_openai_chat_text(response_payload)

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


def build_openai_response_stream(response_payload: dict[str, Any]) -> Iterable[str]:
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
    text = _extract_openai_response_text(response_payload)

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


def build_anthropic_message_stream(response_payload: dict[str, Any]) -> Iterable[str]:
    message_id = str(response_payload.get("id") or "msg_7flows_stream")
    model = str(response_payload.get("model") or "")
    usage = response_payload.get("usage") if isinstance(response_payload.get("usage"), dict) else {}
    text = _extract_anthropic_text(response_payload)

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
