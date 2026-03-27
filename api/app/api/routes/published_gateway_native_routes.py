from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.api.routes.published_gateway_shared import (
    apply_publish_response_headers,
    build_publish_streaming_response,
    extract_presented_api_key,
    published_gateway_service,
    raise_gateway_http_exception,
)
from app.core.database import get_db
from app.schemas.workflow_publish import PublishedNativeRunRequest, PublishedNativeRunResponse
from app.services.published_gateway import PublishedEndpointGatewayError
from app.services.published_protocol_streaming import build_native_run_stream

router = APIRouter()


@router.post(
    "/workflows/{workflow_id}/published-endpoints/{endpoint_id}/run",
    response_model=PublishedNativeRunResponse,
)
def invoke_published_native_endpoint(
    workflow_id: str,
    endpoint_id: str,
    payload: PublishedNativeRunRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> Response | PublishedNativeRunResponse:
    try:
        result = published_gateway_service.invoke_native_endpoint(
            db,
            workflow_id=workflow_id,
            endpoint_id=endpoint_id,
            input_payload=payload.input_payload,
            presented_api_key=extract_presented_api_key(request),
            require_streaming_enabled=payload.stream,
        )
    except PublishedEndpointGatewayError as exc:
        raise_gateway_http_exception(exc)

    run_status = result.response_payload.get("run", {}).get("status")
    if payload.stream:
        return build_publish_streaming_response(
            stream_events=build_native_run_stream(result.response_payload),
            cache_status=result.cache_status,
            run_status=run_status,
            run_id=result.run_id,
        )

    apply_publish_response_headers(
        response,
        cache_status=result.cache_status,
        run_status=run_status,
        run_id=result.run_id,
    )
    return PublishedNativeRunResponse.model_validate(result.response_payload)


@router.post(
    "/published-aliases/{endpoint_alias}/run",
    response_model=PublishedNativeRunResponse,
)
def invoke_published_native_endpoint_by_alias(
    endpoint_alias: str,
    payload: PublishedNativeRunRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> Response | PublishedNativeRunResponse:
    try:
        result = published_gateway_service.invoke_native_endpoint_by_alias(
            db,
            endpoint_alias=endpoint_alias,
            input_payload=payload.input_payload,
            presented_api_key=extract_presented_api_key(request),
            require_streaming_enabled=payload.stream,
        )
    except PublishedEndpointGatewayError as exc:
        raise_gateway_http_exception(exc)

    run_status = result.response_payload.get("run", {}).get("status")
    if payload.stream:
        return build_publish_streaming_response(
            stream_events=build_native_run_stream(result.response_payload),
            cache_status=result.cache_status,
            run_status=run_status,
            run_id=result.run_id,
        )

    apply_publish_response_headers(
        response,
        cache_status=result.cache_status,
        run_status=run_status,
        run_id=result.run_id,
    )
    return PublishedNativeRunResponse.model_validate(result.response_payload)


@router.post(
    "/workflows/{workflow_id}/published-endpoints/{endpoint_id}/run-async",
    response_model=PublishedNativeRunResponse,
)
def invoke_published_native_endpoint_async(
    workflow_id: str,
    endpoint_id: str,
    payload: PublishedNativeRunRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> PublishedNativeRunResponse:
    try:
        result = published_gateway_service.invoke_native_endpoint_async(
            db,
            workflow_id=workflow_id,
            endpoint_id=endpoint_id,
            input_payload=payload.input_payload,
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
    return PublishedNativeRunResponse.model_validate(result.response_payload)


@router.post(
    "/published-aliases/{endpoint_alias}/run-async",
    response_model=PublishedNativeRunResponse,
)
def invoke_published_native_endpoint_by_alias_async(
    endpoint_alias: str,
    payload: PublishedNativeRunRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> PublishedNativeRunResponse:
    try:
        result = published_gateway_service.invoke_native_endpoint_by_alias_async(
            db,
            endpoint_alias=endpoint_alias,
            input_payload=payload.input_payload,
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
    return PublishedNativeRunResponse.model_validate(result.response_payload)


@router.post(
    "/published-paths/{route_path:path}",
    response_model=PublishedNativeRunResponse,
)
def invoke_published_native_endpoint_by_path(
    route_path: str,
    payload: PublishedNativeRunRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> Response | PublishedNativeRunResponse:
    try:
        result = published_gateway_service.invoke_native_endpoint_by_path(
            db,
            route_path=route_path,
            input_payload=payload.input_payload,
            presented_api_key=extract_presented_api_key(request),
            require_streaming_enabled=payload.stream,
        )
    except PublishedEndpointGatewayError as exc:
        raise_gateway_http_exception(exc)

    run_status = result.response_payload.get("run", {}).get("status")
    if payload.stream:
        return build_publish_streaming_response(
            stream_events=build_native_run_stream(result.response_payload),
            cache_status=result.cache_status,
            run_status=run_status,
            run_id=result.run_id,
        )

    apply_publish_response_headers(
        response,
        cache_status=result.cache_status,
        run_status=run_status,
        run_id=result.run_id,
    )
    return PublishedNativeRunResponse.model_validate(result.response_payload)


@router.post(
    "/published-paths-async/{route_path:path}",
    response_model=PublishedNativeRunResponse,
)
def invoke_published_native_endpoint_by_path_async(
    route_path: str,
    payload: PublishedNativeRunRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> PublishedNativeRunResponse:
    try:
        result = published_gateway_service.invoke_native_endpoint_by_path_async(
            db,
            route_path=route_path,
            input_payload=payload.input_payload,
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
    return PublishedNativeRunResponse.model_validate(result.response_payload)
