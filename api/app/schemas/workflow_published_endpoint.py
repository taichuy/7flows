from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.workflow_contract_validation import validate_contract_schema

PublishProtocol = Literal["native", "openai", "anthropic"]
AuthMode = Literal["api_key", "token", "internal"]

_SEMVER_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")
_PUBLISHED_ALIAS_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{0,127}$")
_PUBLISHED_PATH_SEGMENT_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{0,127}$")


def normalize_published_endpoint_alias(value: str) -> str:
    normalized = value.strip().lower()
    if not normalized:
        raise ValueError("Published endpoint alias must be a non-empty string.")
    if not _PUBLISHED_ALIAS_PATTERN.fullmatch(normalized):
        raise ValueError(
            "Published endpoint alias may only contain lowercase letters, digits, '.', '_' "
            "or '-', and must start with a letter or digit."
        )
    return normalized


def normalize_published_endpoint_path(value: str) -> str:
    normalized = "/" + value.strip().strip("/")
    if normalized == "/":
        raise ValueError("Published endpoint path must contain at least one segment.")

    segments = normalized.lstrip("/").split("/")
    if any(not segment for segment in segments):
        raise ValueError("Published endpoint path cannot contain empty segments.")
    invalid_segments = [
        segment
        for segment in segments
        if not _PUBLISHED_PATH_SEGMENT_PATTERN.fullmatch(segment.lower())
    ]
    if invalid_segments:
        raise ValueError(
            "Published endpoint path segments may only contain lowercase letters, digits, "
            "'.', '_' or '-'."
        )
    return "/" + "/".join(segment.lower() for segment in segments)


class WorkflowPublishedEndpointRateLimitPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requests: int = Field(ge=1, le=100_000)
    windowSeconds: int = Field(ge=1, le=86_400)


class WorkflowPublishedEndpointCachePolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = True
    ttl: int = Field(ge=1, le=86_400)
    maxEntries: int = Field(default=128, ge=1, le=100_000)
    varyBy: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_vary_by(self) -> WorkflowPublishedEndpointCachePolicy:
        normalized_fields: list[str] = []
        for field_path in self.varyBy:
            normalized = field_path.strip()
            if not normalized:
                raise ValueError("cache.varyBy cannot contain empty field paths.")
            normalized_fields.append(normalized)
        if len(set(normalized_fields)) != len(normalized_fields):
            raise ValueError("cache.varyBy must contain unique field paths.")
        self.varyBy = normalized_fields
        return self


class WorkflowPublishedEndpointDefinition(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    alias: str | None = Field(default=None, min_length=1, max_length=128)
    path: str | None = Field(default=None, min_length=1, max_length=256)
    protocol: PublishProtocol
    workflowVersion: str | None = Field(default=None, min_length=1, max_length=32)
    authMode: AuthMode
    streaming: bool
    inputSchema: dict[str, Any] = Field(default_factory=dict)
    outputSchema: dict[str, Any] | None = None
    rateLimit: WorkflowPublishedEndpointRateLimitPolicy | None = None
    cache: WorkflowPublishedEndpointCachePolicy | None = None

    @model_validator(mode="after")
    def validate_workflow_version_format(self) -> WorkflowPublishedEndpointDefinition:
        self.alias = normalize_published_endpoint_alias(self.alias or self.id)
        self.path = normalize_published_endpoint_path(self.path or f"/{self.alias}")
        validate_contract_schema(
            self.inputSchema,
            error_prefix=f"Published endpoint '{self.id}' inputSchema",
        )
        if self.outputSchema is not None:
            validate_contract_schema(
                self.outputSchema,
                error_prefix=f"Published endpoint '{self.id}' outputSchema",
            )
        if self.workflowVersion is not None and not _SEMVER_PATTERN.match(self.workflowVersion):
            raise ValueError(
                "workflowVersion must use semantic version format 'major.minor.patch'."
            )
        return self
