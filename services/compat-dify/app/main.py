from __future__ import annotations

import time
from contextlib import asynccontextmanager
from functools import lru_cache

from fastapi import FastAPI, Header, HTTPException, status

from app.catalog import get_catalog_tool, list_catalog_tools
from app.config import get_settings
from app.dify_daemon import DifyPluginDaemonClient, DifyPluginDaemonError, DifyTranslationError
from app.invocation import InvocationValidationError, validate_invocation_request
from app.schemas import (
    AdapterHealthResponse,
    AdapterInvokeRequest,
    AdapterInvokeResponse,
    AdapterToolListResponse,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


@lru_cache(maxsize=1)
def get_dify_plugin_daemon_client() -> DifyPluginDaemonClient:
    return DifyPluginDaemonClient(get_settings())


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
    )

    @application.get("/healthz", response_model=AdapterHealthResponse)
    def healthz() -> AdapterHealthResponse:
        return AdapterHealthResponse(
            status=settings.health_status,
            adapter_id=settings.adapter_id,
            ecosystem=settings.supported_ecosystem,
            mode=settings.invoke_mode,
        )

    def validate_adapter_header(x_sevenflows_adapter_id: str | None) -> None:
        if x_sevenflows_adapter_id and x_sevenflows_adapter_id != settings.adapter_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Header adapter id mismatch: expected '{settings.adapter_id}'.",
            )

    @application.get("/tools", response_model=AdapterToolListResponse)
    def list_tools(
        x_sevenflows_adapter_id: str | None = Header(default=None),
    ) -> AdapterToolListResponse:
        validate_adapter_header(x_sevenflows_adapter_id)
        return AdapterToolListResponse(
            adapter_id=settings.adapter_id,
            ecosystem=settings.supported_ecosystem,
            tools=list_catalog_tools(settings),
        )

    @application.post("/invoke", response_model=AdapterInvokeResponse)
    def invoke(
        payload: AdapterInvokeRequest,
        x_sevenflows_adapter_id: str | None = Header(default=None),
    ) -> AdapterInvokeResponse:
        if payload.ecosystem != settings.supported_ecosystem:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"Adapter only supports ecosystem '{settings.supported_ecosystem}', "
                    f"got '{payload.ecosystem}'."
                ),
            )

        expected_adapter_id = payload.adapterId or settings.adapter_id
        if expected_adapter_id != settings.adapter_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Adapter id mismatch: expected '{settings.adapter_id}'.",
            )

        validate_adapter_header(x_sevenflows_adapter_id)
        tool = get_catalog_tool(settings, payload.toolId)
        if tool is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tool '{payload.toolId}' is not present in the local catalog.",
            )

        try:
            normalized_inputs, normalized_credentials = validate_invocation_request(
                tool=tool,
                execution_contract=payload.executionContract,
                inputs=payload.inputs,
                credentials=payload.credentials,
            )
        except InvocationValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(exc),
            ) from exc

        started_at = time.perf_counter()
        if settings.default_latency_ms > 0:
            time.sleep(settings.default_latency_ms / 1000)

        daemon_client = get_dify_plugin_daemon_client()
        try:
            translated_preview = daemon_client.translate_invoke_request_preview(
                tool=tool,
                inputs=normalized_inputs,
                credentials=normalized_credentials,
                trace_id=payload.traceId,
                timeout_ms=payload.timeout,
            )
            if settings.invoke_mode == "proxy":
                output, logs = daemon_client.invoke_tool(
                    tool=tool,
                    inputs=normalized_inputs,
                    credentials=normalized_credentials,
                    trace_id=payload.traceId,
                    timeout_ms=payload.timeout,
                )
                logs = [
                    f"compat:dify proxied tool '{payload.toolId}' via translated Dify invoke payload",
                    *logs,
                ]
            else:
                output = {
                    "toolId": payload.toolId,
                    "adapterId": settings.adapter_id,
                    "traceId": payload.traceId,
                    "received": normalized_inputs,
                    "credentialFields": sorted(normalized_credentials),
                    "executionContract": {
                        "kind": payload.executionContract.kind,
                        "irVersion": payload.executionContract.irVersion,
                        "toolId": payload.executionContract.toolId,
                    },
                    "translatedRequest": translated_preview,
                }
                logs = [
                    f"compat:dify translated tool '{payload.toolId}' into Dify invoke payload",
                    "mode=translate",
                ]
        except DifyTranslationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(exc),
            ) from exc
        except DifyPluginDaemonError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=str(exc),
            ) from exc

        return AdapterInvokeResponse(
            status="success",
            output=output,
            logs=logs,
            durationMs=int((time.perf_counter() - started_at) * 1000),
        )

    return application


app = create_app()
