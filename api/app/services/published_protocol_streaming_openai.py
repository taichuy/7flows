from __future__ import annotations

from collections.abc import Iterable, Iterator
from typing import Any

from app.services.published_protocol_streaming_common import (
    chunk_text,
    extract_openai_chat_text,
    extract_openai_response_text,
    resolve_protocol_stream_text,
    serialize_sse_event,
)


def build_openai_chat_completion_stream(
    response_payload: dict[str, Any],
    *,
    run_payload: dict[str, Any] | None = None,
) -> Iterable[str]:
    response_id = str(response_payload.get("id") or "chatcmpl_7flows_stream")
    created = int(response_payload.get("created") or 0)
    model = str(response_payload.get("model") or "")
    text = resolve_protocol_stream_text(
        run_payload=run_payload,
        fallback_text=extract_openai_chat_text(response_payload),
    )

    def _iter() -> Iterator[str]:
        yield serialize_sse_event(
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
        for chunk in chunk_text(text):
            yield serialize_sse_event(
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
        yield serialize_sse_event(
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
        yield serialize_sse_event(data="[DONE]")

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
    text = resolve_protocol_stream_text(
        run_payload=run_payload,
        fallback_text=extract_openai_response_text(response_payload),
    )

    def _iter() -> Iterator[str]:
        yield serialize_sse_event(
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
        for chunk in chunk_text(text):
            yield serialize_sse_event(
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
        yield serialize_sse_event(
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
        yield serialize_sse_event(
            event="response.completed",
            data={
                "type": "response.completed",
                "response": response_payload,
            },
        )

    return _iter()
