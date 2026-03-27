from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.api.routes.published_gateway_shared import (
    apply_publish_response_headers,
    build_anthropic_message_input_payload,
    build_publish_streaming_response,
    extract_presented_api_key,
    published_gateway_service,
    raise_gateway_http_exception,
    raise_publish_protocol_rejection,
)
from app.core.database import get_db
from app.schemas.workflow_publish import (
    AnthropicMessageRequest,
    AnthropicMessageResponse,
    PublishedProtocolAsyncRunResponse,
)
from app.services.published_gateway import PublishedEndpointGatewayError
from app.services.published_protocol_streaming import build_anthropic_message_stream

router = APIRouter()


@router.post(
    "/messages",
    response_model=AnthropicMessageResponse,
)
def invoke_published_anthropic_message(
    payload: AnthropicMessageRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> Response | AnthropicMessageResponse:
    try:
        result = published_gateway_service.invoke_anthropic_message(
            db,
            model=payload.model,
            input_payload=build_anthropic_message_input_payload(payload),
            request_payload=payload.model_dump(mode="json", exclude_none=True),
            presented_api_key=extract_presented_api_key(request),
            require_streaming_enabled=payload.stream,
        )
    except PublishedEndpointGatewayError as exc:
        raise_gateway_http_exception(exc)

    if payload.stream:
        return build_publish_streaming_response(
            stream_events=build_anthropic_message_stream(
                result.response_payload,
                run_payload=result.run_payload,
            ),
            cache_status=result.cache_status,
            run_status=result.run_status,
            run_id=result.run_id,
        )

    apply_publish_response_headers(
        response,
        cache_status=result.cache_status,
        run_status=result.run_status,
        run_id=result.run_id,
    )
    return AnthropicMessageResponse.model_validate(result.response_payload)


@router.post(
    "/messages-async",
    response_model=PublishedProtocolAsyncRunResponse,
)
def invoke_published_anthropic_message_async(
    payload: AnthropicMessageRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> PublishedProtocolAsyncRunResponse:
    if payload.stream:
        message = "Streaming Anthropic messages are not supported yet."
        published_gateway_service.record_protocol_rejection_by_alias(
            db,
            model=payload.model,
            expected_protocol="anthropic",
            request_payload=payload.model_dump(mode="json", exclude_none=True),
            error_detail=message,
            presented_api_key=extract_presented_api_key(request),
            request_surface_override="anthropic.messages.async",
        )
        raise_publish_protocol_rejection(
            message=message,
            reason_code="streaming_unsupported",
        )

    try:
        result = published_gateway_service.invoke_anthropic_message_async(
            db,
            model=payload.model,
            input_payload=build_anthropic_message_input_payload(payload),
            request_payload=payload.model_dump(mode="json", exclude_none=True),
            presented_api_key=extract_presented_api_key(request),
        )
    except PublishedEndpointGatewayError as exc:
        raise_gateway_http_exception(exc)

    run_status = result.response_payload.get("run", {}).get("status")
    if run_status == "waiting":
        response.status_code = status.HTTP_202_ACCEPTED
    apply_publish_response_headers(
        response,
        cache_status=result.cache_status,
        run_status=run_status,
        run_id=result.run_id,
    )
    return PublishedProtocolAsyncRunResponse.model_validate(result.response_payload)
