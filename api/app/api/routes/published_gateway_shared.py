from collections.abc import Iterable

from fastapi import HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from app.schemas.workflow_publish import (
    AnthropicMessageRequest,
    OpenAIChatCompletionRequest,
    OpenAIResponseRequest,
)
from app.services.published_gateway import (
    PublishedEndpointGatewayError,
    PublishedEndpointGatewayService,
)

published_gateway_service = PublishedEndpointGatewayService()


def extract_presented_api_key(request: Request) -> str | None:
    header_api_key = request.headers.get("x-api-key")
    if header_api_key and header_api_key.strip():
        return header_api_key.strip()

    authorization = request.headers.get("authorization")
    if authorization:
        scheme, _, credentials = authorization.partition(" ")
        if scheme.strip().lower() == "bearer" and credentials.strip():
            return credentials.strip()
    return None


def build_openai_chat_input_payload(payload: OpenAIChatCompletionRequest) -> dict:
    return {
        "model": payload.model,
        "messages": payload.messages,
        "metadata": payload.metadata,
        "temperature": payload.temperature,
    }


def build_openai_response_input_payload(payload: OpenAIResponseRequest) -> dict:
    return {
        "model": payload.model,
        "input": payload.input,
        "instructions": payload.instructions,
        "metadata": payload.metadata,
    }


def build_anthropic_message_input_payload(payload: AnthropicMessageRequest) -> dict:
    return {
        "model": payload.model,
        "messages": payload.messages,
        "system": payload.system,
        "max_tokens": payload.max_tokens,
        "metadata": payload.metadata,
    }


def apply_publish_response_headers(
    response: Response,
    *,
    cache_status: str,
    run_status: str | None,
    run_id: str | None = None,
) -> None:
    response.headers["X-7Flows-Cache"] = cache_status.upper()
    if run_id:
        response.headers["X-7Flows-Run-Id"] = run_id
    if run_status:
        response.headers["X-7Flows-Run-Status"] = run_status.upper()


def build_publish_streaming_response(
    *,
    stream_events: Iterable[str],
    cache_status: str,
    run_status: str | None,
    run_id: str | None = None,
) -> StreamingResponse:
    response = StreamingResponse(
        (chunk.encode("utf-8") for chunk in stream_events),
        media_type="text/event-stream",
    )
    apply_publish_response_headers(
        response,
        cache_status=cache_status,
        run_status=run_status,
        run_id=run_id,
    )
    response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Accel-Buffering"] = "no"
    return response


def raise_gateway_http_exception(exc: PublishedEndpointGatewayError) -> None:
    raise HTTPException(
        status_code=exc.status_code,
        detail=exc.detail_payload if exc.detail_payload is not None else str(exc),
        headers=exc.headers,
    ) from exc
