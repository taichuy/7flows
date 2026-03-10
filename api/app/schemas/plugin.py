from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class PluginAdapterRegistrationCreate(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    ecosystem: str = Field(min_length=1, max_length=64)
    endpoint: str = Field(min_length=1, max_length=512)
    enabled: bool = True
    healthcheck_path: str = Field(default="/healthz", min_length=1, max_length=128)
    workspace_ids: list[str] = Field(default_factory=list)
    plugin_kinds: list[Literal["node", "provider"]] = Field(
        default_factory=lambda: ["node", "provider"]
    )


class PluginAdapterRegistrationItem(BaseModel):
    id: str
    ecosystem: str
    endpoint: str
    enabled: bool
    healthcheck_path: str
    workspace_ids: list[str] = Field(default_factory=list)
    plugin_kinds: list[str] = Field(default_factory=list)
    status: str
    detail: str | None = None


class PluginToolRegistrationCreate(BaseModel):
    id: str = Field(min_length=1, max_length=256)
    name: str = Field(min_length=1, max_length=128)
    ecosystem: str = Field(min_length=1, max_length=64)
    description: str = ""
    input_schema: dict[str, Any] = Field(default_factory=dict)
    output_schema: dict[str, Any] | None = None
    source: str = "plugin"
    plugin_meta: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_registration_scope(self) -> "PluginToolRegistrationCreate":
        if self.ecosystem == "native":
            raise ValueError("HTTP registration currently supports only compat/plugin tools.")
        return self


class PluginToolItem(BaseModel):
    id: str
    name: str
    ecosystem: str
    description: str
    input_schema: dict[str, Any] = Field(default_factory=dict)
    output_schema: dict[str, Any] | None = None
    source: str
    plugin_meta: dict[str, Any] | None = None
    callable: bool
