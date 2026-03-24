from __future__ import annotations

from typing import Any
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CredentialStatus = Literal["active", "revoked"]
CredentialAuditAction = Literal[
    "created",
    "updated",
    "revoked",
    "decrypted",
    "masked_handle_issued",
    "approval_pending",
    "access_denied",
]


class CredentialCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=128)
    credential_type: str = Field(min_length=1, max_length=64)
    data: dict[str, str] = Field(min_length=1)
    description: str = Field(default="", max_length=512)


class CredentialUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=128)
    data: dict[str, str] | None = Field(default=None, min_length=1)
    description: str | None = Field(default=None, max_length=512)


class CredentialItem(BaseModel):
    id: str
    name: str
    credential_type: str
    description: str
    status: CredentialStatus
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class CredentialDetail(CredentialItem):
    """Same as CredentialItem plus the field names (no values)."""

    data_keys: list[str] = Field(default_factory=list)


class CredentialAuditItem(BaseModel):
    id: str
    credential_id: str
    credential_name: str
    credential_type: str
    action: CredentialAuditAction
    actor_type: str
    actor_id: str | None = None
    run_id: str | None = None
    node_run_id: str | None = None
    summary: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
