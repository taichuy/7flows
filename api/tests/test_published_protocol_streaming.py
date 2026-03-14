import json

from fastapi.testclient import TestClient

from app.api.routes.published_gateway import published_gateway_service
from app.services.published_gateway import PublishedGatewayInvokeResult
from app.services.published_protocol_streaming import (
    build_anthropic_message_stream,
    build_openai_chat_completion_stream,
    build_openai_response_stream,
)


def _build_run_payload(text: str) -> dict:
    return {
        "id": "run_stream_test",
        "status": "succeeded",
        "events": [
            {
                "event_type": "run.started",
                "payload": {"input": {"question": "hello"}},
            },
            {
                "event_type": "node.output.completed",
                "payload": {
                    "node_id": "tool_search",
                    "output": {"answer": "tool intermediate"},
                },
            },
            {
                "event_type": "node.output.completed",
                "payload": {
                    "node_id": "output",
                    "output": {"answer": text},
                },
            },
            {
                "event_type": "run.completed",
                "payload": {"output": {"answer": text}},
            },
        ],
    }


def _collect_sse_packets(stream) -> list[tuple[str | None, str]]:
    packets: list[tuple[str | None, str]] = []
    for chunk in stream:
        event_name = None
        data_lines: list[str] = []
        for line in chunk.splitlines():
            if line.startswith("event: "):
                event_name = line.removeprefix("event: ")
            elif line.startswith("data: "):
                data_lines.append(line.removeprefix("data: "))
        packets.append((event_name, "\n".join(data_lines)))
    return packets


def test_openai_chat_completion_stream_prefers_run_event_output() -> None:
    packets = _collect_sse_packets(
        build_openai_chat_completion_stream(
            {
                "id": "chatcmpl_stream_test",
                "created": 1,
                "model": "gpt-7flows-test",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": "fallback response text",
                        },
                        "finish_reason": "stop",
                    }
                ],
            },
            run_payload=_build_run_payload("stream from run events"),
        )
    )

    payloads = [json.loads(data) for _, data in packets if data != "[DONE]"]
    streamed_text = "".join(
        payload["choices"][0]["delta"].get("content", "")
        for payload in payloads
        if payload["choices"][0]["delta"].get("content")
    )

    assert payloads[0]["choices"][0]["delta"] == {"role": "assistant"}
    assert streamed_text == "stream from run events"
    assert payloads[-1]["choices"][0]["finish_reason"] == "stop"


def test_openai_response_stream_prefers_run_event_output() -> None:
    packets = _collect_sse_packets(
        build_openai_response_stream(
            {
                "id": "resp_stream_test",
                "created_at": 1,
                "model": "gpt-7flows-test",
                "output": [
                    {
                        "id": "msg_stream_test",
                        "content": [{"type": "output_text", "text": "fallback response text"}],
                    }
                ],
                "output_text": "fallback response text",
            },
            run_payload=_build_run_payload("response stream from run events"),
        )
    )

    delta_text = "".join(
        json.loads(data)["delta"]
        for event_name, data in packets
        if event_name == "response.output_text.delta"
    )
    done_payload = next(
        json.loads(data)
        for event_name, data in packets
        if event_name == "response.output_text.done"
    )

    assert delta_text == "response stream from run events"
    assert done_payload["text"] == "response stream from run events"


def test_anthropic_message_stream_prefers_run_event_output() -> None:
    packets = _collect_sse_packets(
        build_anthropic_message_stream(
            {
                "id": "msg_stream_test",
                "model": "claude-7flows-test",
                "content": [{"type": "text", "text": "fallback response text"}],
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
            run_payload=_build_run_payload("anthropic stream from run events"),
        )
    )

    delta_text = "".join(
        json.loads(data)["delta"]["text"]
        for event_name, data in packets
        if event_name == "content_block_delta"
    )

    assert packets[0][0] == "message_start"
    assert delta_text == "anthropic stream from run events"
    assert packets[-1][0] == "message_stop"


def test_openai_chat_completion_stream_route_uses_run_payload(
    client: TestClient,
    monkeypatch,
) -> None:
    def _invoke_openai_chat_completion(*args, **kwargs) -> PublishedGatewayInvokeResult:
        assert kwargs["require_streaming_enabled"] is True
        return PublishedGatewayInvokeResult(
            response_payload={
                "id": "chatcmpl_route_stream_test",
                "created": 1,
                "model": "gpt-7flows-route-test",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": "fallback response text",
                        },
                        "finish_reason": "stop",
                    }
                ],
            },
            cache_status="bypass",
            run_status="succeeded",
            run_payload=_build_run_payload("route stream from run events"),
        )

    monkeypatch.setattr(
        published_gateway_service,
        "invoke_openai_chat_completion",
        _invoke_openai_chat_completion,
    )

    with client.stream(
        "POST",
        "/v1/chat/completions",
        json={
            "model": "gpt-7flows-route-test",
            "messages": [{"role": "user", "content": "hello"}],
            "stream": True,
        },
    ) as response:
        assert response.status_code == 200
        packets = [
            line
            for line in response.iter_lines()
            if line and line.startswith(("event: ", "data: "))
        ]

    data_lines = [line.removeprefix("data: ") for line in packets if line.startswith("data: ")]
    payloads = [json.loads(line) for line in data_lines[:-1]]
    streamed_text = "".join(
        payload["choices"][0]["delta"].get("content", "")
        for payload in payloads
        if payload["choices"][0]["delta"].get("content")
    )

    assert response.headers["content-type"].startswith("text/event-stream")
    assert streamed_text == "route stream from run events"
