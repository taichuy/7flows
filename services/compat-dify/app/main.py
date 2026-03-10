from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, status

from app.config import get_settings
from app.schemas import AdapterHealthResponse, AdapterInvokeRequest, AdapterInvokeResponse


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


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
            mode=settings.stub_mode,
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

        if x_sevenflows_adapter_id and x_sevenflows_adapter_id != settings.adapter_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Header adapter id mismatch: expected '{settings.adapter_id}'.",
            )

        started_at = time.perf_counter()
        if settings.default_latency_ms > 0:
            time.sleep(settings.default_latency_ms / 1000)

        output = {
            "toolId": payload.toolId,
            "adapterId": settings.adapter_id,
            "traceId": payload.traceId,
            "received": payload.inputs,
        }
        logs = [
            f"compat:dify stub handled tool '{payload.toolId}'",
            f"mode={settings.stub_mode}",
        ]

        return AdapterInvokeResponse(
            status="success",
            output=output,
            logs=logs,
            durationMs=int((time.perf_counter() - started_at) * 1000),
        )

    return application


app = create_app()
