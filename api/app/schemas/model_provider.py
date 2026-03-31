from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.credential import CredentialItem


ProviderConfigStatus = Literal["active", "inactive"]
ProviderConfigMethod = Literal["predefined-model", "customizable-model"]


class NativeModelProviderCredentialFieldOption(BaseModel):
    value: str
    label: str


class NativeModelProviderCredentialField(BaseModel):
    variable: str
    label: str
    type: Literal["secret-input", "text-input", "select"]
    required: bool
    placeholder: str = ""
    help: str | None = None
    default: str | None = None
    options: list[NativeModelProviderCredentialFieldOption] = Field(default_factory=list)


class NativeModelProviderCatalogItem(BaseModel):
    id: str
    label: str
    description: str
    help_url: str | None = None
    supported_model_types: list[str] = Field(default_factory=list)
    configuration_methods: list[ProviderConfigMethod] = Field(default_factory=list)
    credential_type: str
    compatible_credential_types: list[str] = Field(default_factory=list)
    default_base_url: str
    default_protocol: str
    default_models: list[str] = Field(default_factory=list)
    credential_fields: list[NativeModelProviderCredentialField] = Field(default_factory=list)


class WorkspaceModelProviderConfigCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=512)
    credential_ref: str = Field(min_length=1, max_length=256)
    base_url: str | None = Field(default=None, max_length=512)
    default_model: str | None = Field(default=None, max_length=128)
    protocol: str | None = Field(default=None, max_length=64)
    status: ProviderConfigStatus = "active"


class WorkspaceModelProviderConfigUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_id: str | None = Field(default=None, min_length=1, max_length=64)
    label: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    credential_ref: str | None = Field(default=None, min_length=1, max_length=256)
    base_url: str | None = Field(default=None, max_length=512)
    default_model: str | None = Field(default=None, max_length=128)
    protocol: str | None = Field(default=None, max_length=64)
    status: ProviderConfigStatus | None = None


class WorkspaceModelProviderConfigItem(BaseModel):
    id: str
    workspace_id: str
    provider_id: str
    provider_label: str
    label: str
    description: str
    credential_id: str
    credential_ref: str
    credential_name: str
    credential_type: str
    base_url: str
    default_model: str
    protocol: str
    status: ProviderConfigStatus
    supported_model_types: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    disabled_at: datetime | None = None


class WorkspaceModelProviderRegistryResponse(BaseModel):
    catalog: list[NativeModelProviderCatalogItem] = Field(default_factory=list)
    items: list[WorkspaceModelProviderConfigItem] = Field(default_factory=list)


class WorkspaceModelProviderSettingsResponse(BaseModel):
    registry: WorkspaceModelProviderRegistryResponse
    credentials: list[CredentialItem] = Field(default_factory=list)
