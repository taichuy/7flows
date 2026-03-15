from __future__ import annotations

from collections.abc import Iterable, Iterator
from typing import Any

from app.services.published_protocol_streaming_common import (
    chunk_text,
    extract_anthropic_text,
    resolve_protocol_stream_text,
    serialize_sse_event,
)


def build_anthropic_message_stream(
    response_payload: dict[str, Any],
    *,
    run_payload: dict[str, Any] | None = None,
) -> Iterable[str]:
    message_id = str(response_payload.get("id") or "msg_7flows_stream")
    model = str(response_payload.get("model") or "")
    usage = response_payload.get("usage") if isinstance(response_payload.get("usage"), dict) else {}
    text = resolve_protocol_stream_text(
        run_payload=run_payload,
        fallback_text=extract_anthropic_text(response_payload),
    )

    def _iter() -> Iterator[str]:
        yield serialize_sse_event(
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
        yield serialize_sse_event(
            event="content_block_start",
            data={
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "text", "text": ""},
            },
        )
        for chunk in chunk_text(text):
            yield serialize_sse_event(
                event="content_block_delta",
                data={
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": chunk},
                },
            )
        yield serialize_sse_event(
            event="content_block_stop",
            data={
                "type": "content_block_stop",
                "index": 0,
            },
        )
        yield serialize_sse_event(
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
        yield serialize_sse_event(
            event="message_stop",
            data={"type": "message_stop"},
        )

    return _iter()
