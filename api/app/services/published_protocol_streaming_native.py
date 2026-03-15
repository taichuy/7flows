from __future__ import annotations

from collections.abc import Iterable, Iterator
from typing import Any

from app.services.published_protocol_streaming_common import (
    chunk_text,
    extract_native_run_events,
    has_real_deltas,
    serialize_payload_text,
    serialize_sse_event,
)


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

    if event_type in {"node.output.delta", "run.output.delta"}:
        delta = normalized_payload.get("delta")
        if delta is not None:
            payload["delta"] = delta
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
    output_text = serialize_payload_text(output_payload)
    stored_events = extract_native_run_events(run)
    has_started_event = any(item.get("event_type") == "run.started" for item in stored_events)
    has_deltas = has_real_deltas(stored_events)
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
            yield serialize_sse_event(
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

            yield serialize_sse_event(
                event=event_name,
                data=_build_native_run_event_payload(
                    event_item=event_item,
                    response_payload=response_payload,
                    run_id=run_id,
                    run_status=run_status,
                    output_payload=output_payload,
                ),
            )

        if not has_deltas:
            for chunk in chunk_text(output_text):
                yield serialize_sse_event(
                    event="run.output.delta",
                    data={
                        "type": "run.output.delta",
                        "run_id": run_id,
                        "delta": chunk,
                    },
                )
        if completed_event is not None:
            yield serialize_sse_event(
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
            yield serialize_sse_event(
                event="run.completed",
                data={
                    "type": "run.completed",
                    "run_id": run_id,
                    "status": run_status,
                    "output_payload": output_payload,
                    "response": response_payload,
                },
            )
        yield serialize_sse_event(data="[DONE]")

    return _iter()
