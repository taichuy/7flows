from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.api.routes.published_gateway_shared import (
    apply_publish_response_headers,
    build_openai_chat_input_payload,
    build_openai_response_input_payload,
    build_publish_streaming_response,
    extract_presented_api_key,
    published_gateway_service,
    raise_gateway_http_exception,
    raise_publish_protocol_rejection,
)
from app.core.database import get_db
from app.schemas.workflow_publish import (
    OpenAIChatCompletionRequest,
    OpenAIChatCompletionResponse,
    OpenAIResponseRequest,
    OpenAIResponseResponse,
    PublishedProtocolAsyncRunResponse,
)
from app.services.published_gateway import PublishedEndpointGatewayError
from app.services.published_protocol_streaming import (
    build_openai_chat_completion_stream,
    build_openai_response_stream,
)

router = APIRouter()


@router.post(
    "/chat/completions",
    response_model=OpenAIChatCompletionResponse,
)
def invoke_published_openai_chat_completion(
    payload: OpenAIChatCompletionRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> Response | OpenAIChatCompletionResponse:
    try:
        result = published_gateway_service.invoke_openai_chat_completion(
            db,
            model=payload.model,
            input_payload=build_openai_chat_input_payload(payload),
            request_payload=payload.model_dump(mode="json", exclude_none=True),
            presented_api_key=extract_presented_api_key(request),
            require_streaming_enabled=payload.stream,
        )
    except PublishedEndpointGatewayError as exc:
        raise_gateway_http_exception(exc)

    if payload.stream:
        return build_publish_streaming_response(
            stream_events=build_openai_chat_completion_stream(
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
    return OpenAIChatCompletionResponse.model_validate(result.response_payload)


@router.post(
    "/chat/completions-async",
    response_model=PublishedProtocolAsyncRunResponse,
)
def invoke_published_openai_chat_completion_async(
    payload: OpenAIChatCompletionRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> PublishedProtocolAsyncRunResponse:
    if payload.stream:
        message = "Streaming chat completions are not supported yet."
        published_gateway_service.record_protocol_rejection_by_alias(
            db,
            model=payload.model,
            expected_protocol="openai",
            request_payload=payload.model_dump(mode="json", exclude_none=True),
            error_detail=message,
            presented_api_key=extract_presented_api_key(request),
            request_surface_override="openai.chat.completions.async",
        )
        raise_publish_protocol_rejection(
            message=message,
            reason_code="streaming_unsupported",
        )

    try:
        result = published_gateway_service.invoke_openai_chat_completion_async(
            db,
            model=payload.model,
            input_payload=build_openai_chat_input_payload(payload),
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


@router.post(
    "/responses",
    response_model=OpenAIResponseResponse,
)
def invoke_published_openai_response(
    payload: OpenAIResponseRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> Response | OpenAIResponseResponse:
    try:
        result = published_gateway_service.invoke_openai_response(
            db,
            model=payload.model,
            input_payload=build_openai_response_input_payload(payload),
            request_payload=payload.model_dump(mode="json", exclude_none=True),
            presented_api_key=extract_presented_api_key(request),
            require_streaming_enabled=payload.stream,
        )
    except PublishedEndpointGatewayError as exc:
        raise_gateway_http_exception(exc)

    if payload.stream:
        return build_publish_streaming_response(
            stream_events=build_openai_response_stream(
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
    return OpenAIResponseResponse.model_validate(result.response_payload)


@router.post(
    "/responses-async",
    response_model=PublishedProtocolAsyncRunResponse,
)
def invoke_published_openai_response_async(
    payload: OpenAIResponseRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> PublishedProtocolAsyncRunResponse:
    if payload.stream:
        message = "Streaming responses are not supported yet."
        published_gateway_service.record_protocol_rejection_by_alias(
            db,
            model=payload.model,
            expected_protocol="openai",
            request_payload=payload.model_dump(mode="json", exclude_none=True),
            error_detail=message,
            presented_api_key=extract_presented_api_key(request),
            request_surface_override="openai.responses.async",
        )
        raise_publish_protocol_rejection(
            message=message,
            reason_code="streaming_unsupported",
        )

    try:
        result = published_gateway_service.invoke_openai_response_async(
            db,
            model=payload.model,
            input_payload=build_openai_response_input_payload(payload),
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
