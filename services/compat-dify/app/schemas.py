from typing import Any

from pydantic import BaseModel, Field


class AdapterHealthResponse(BaseModel):
    status: str
    adapter_id: str
    ecosystem: str
    mode: str


class AdapterInvokeRequest(BaseModel):
    toolId: str = Field(min_length=1, max_length=256)
    ecosystem: str = Field(min_length=1, max_length=64)
    adapterId: str | None = Field(default=None, min_length=1, max_length=128)
    inputs: dict[str, Any] = Field(default_factory=dict)
    credentials: dict[str, str] = Field(default_factory=dict)
    timeout: int = Field(default=30_000, ge=1, le=600_000)
    traceId: str = ""


class AdapterInvokeResponse(BaseModel):
    status: str
    output: dict[str, Any] = Field(default_factory=dict)
    logs: list[str] = Field(default_factory=list)
    durationMs: int = Field(default=0, ge=0)

