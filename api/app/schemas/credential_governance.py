from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

SensitivityLevel = Literal["L0", "L1", "L2", "L3"]

CredentialGovernanceStatus = Literal["active", "revoked"]


class CredentialGovernanceSummary(BaseModel):
    credential_id: str
    credential_name: str
    credential_type: str
    credential_status: CredentialGovernanceStatus
    sensitivity_level: SensitivityLevel
    sensitive_resource_id: str
    sensitive_resource_label: str
    credential_ref: str
    summary: str
