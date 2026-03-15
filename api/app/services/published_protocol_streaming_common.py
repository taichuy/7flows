from __future__ import annotations

import json
from typing import Any

from app.services.published_protocol_mapper import extract_text_output

DEFAULT_CHUNK_SIZE = 32


def chunk_text(text: str, *, chunk_size: int = DEFAULT_CHUNK_SIZE) -> list[str]:
    normalized = text or ""
    if not normalized:
        return []
    return [
        normalized[index : index + chunk_size]
        for index in range(0, len(normalized), chunk_size)
    ]


def serialize_sse_event(*, data: Any, event: str | None = None) -> str:
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


def extract_openai_chat_text(response_payload: dict[str, Any]) -> str:
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


def extract_openai_response_text(response_payload: dict[str, Any]) -> str:
    text = response_payload.get("output_text")
    return text if isinstance(text, str) else ""


def extract_anthropic_text(response_payload: dict[str, Any]) -> str:
    content = response_payload.get("content")
    if not isinstance(content, list) or not content:
        return ""
    first_block = content[0]
    if not isinstance(first_block, dict):
        return ""
    text = first_block.get("text")
    return text if isinstance(text, str) else ""


def serialize_payload_text(payload: Any) -> str:
    if isinstance(payload, str):
        return payload
    return json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
    )


def extract_native_run_events(run_payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw_events = run_payload.get("events")
    if not isinstance(raw_events, list):
        return []
    return [item for item in raw_events if isinstance(item, dict)]


def extract_protocol_text_from_run_events(run_payload: dict[str, Any] | None) -> str:
    if not isinstance(run_payload, dict):
        return ""

    stored_events = extract_native_run_events(run_payload)
    if not stored_events:
        return ""

    run_delta_fragments: list[str] = []
    node_delta_fragments: list[str] = []
    for event_item in stored_events:
        event_type = event_item.get("event_type")
        if event_type not in {"node.output.delta", "run.output.delta"}:
            continue
        payload = event_item.get("payload")
        normalized_payload = payload if isinstance(payload, dict) else {}
        delta = normalized_payload.get("delta")
        if isinstance(delta, str) and delta:
            if event_type == "run.output.delta":
                run_delta_fragments.append(delta)
            else:
                node_delta_fragments.append(delta)
    if run_delta_fragments:
        return "".join(run_delta_fragments)
    if node_delta_fragments:
        return "".join(node_delta_fragments)

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


def resolve_protocol_stream_text(
    *,
    run_payload: dict[str, Any] | None,
    fallback_text: str,
) -> str:
    return extract_protocol_text_from_run_events(run_payload) or fallback_text


def has_real_deltas(stored_events: list[dict[str, Any]]) -> bool:
    return any(
        item.get("event_type") in {"node.output.delta", "run.output.delta"}
        for item in stored_events
    )
