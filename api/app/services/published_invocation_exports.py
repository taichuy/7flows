from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Any, Literal

from app.models.workflow import WorkflowPublishedEndpoint
from app.schemas.workflow_publish import (
    PublishedEndpointInvocationListResponse,
    WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot,
)

__all__ = [
    "build_published_invocation_export_filename",
    "build_published_invocation_export_payload",
    "serialize_published_invocation_export_jsonl",
]


def _utcnow_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _slug(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip()).strip("-").lower()
    return normalized or "binding"


def build_published_invocation_export_filename(
    binding: WorkflowPublishedEndpoint,
    export_format: Literal["json", "jsonl"],
) -> str:
    suffix = "json" if export_format == "json" else "jsonl"
    return (
        f"published-{_slug(binding.endpoint_alias)}-"
        f"{_slug(binding.endpoint_id)}-invocations.{suffix}"
    )


def build_published_invocation_export_payload(
    *,
    binding: WorkflowPublishedEndpoint,
    export_format: Literal["json", "jsonl"],
    limit: int,
    response: PublishedEndpointInvocationListResponse,
    legacy_auth_governance: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | None = None,
) -> dict[str, Any]:
    payload = {
        "export": {
            "exported_at": _utcnow_iso(),
            "format": export_format,
            "limit": limit,
            "returned_item_count": len(response.items),
        },
        "binding": {
            "workflow_id": binding.workflow_id,
            "binding_id": binding.id,
            "endpoint_id": binding.endpoint_id,
            "endpoint_alias": binding.endpoint_alias,
            "route_path": binding.route_path,
            "protocol": binding.protocol,
            "auth_mode": binding.auth_mode,
            "workflow_version": binding.workflow_version,
            "target_workflow_version": binding.target_workflow_version,
            "lifecycle_status": binding.lifecycle_status,
        },
        **response.model_dump(mode="json"),
    }

    legacy_auth_governance_payload = _serialize_legacy_auth_governance(
        legacy_auth_governance
    )
    if legacy_auth_governance_payload is not None:
        payload["legacy_auth_governance"] = legacy_auth_governance_payload

    return payload


def _serialize_legacy_auth_governance(
    snapshot: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | None,
) -> dict[str, Any] | None:
    if snapshot is None or snapshot.binding_count <= 0:
        return None

    payload = snapshot.model_dump(mode="json")
    workflows = payload.pop("workflows", [])

    return {
        "generated_at": payload.get("generated_at"),
        "workflow_count": payload.get("workflow_count"),
        "binding_count": payload.get("binding_count"),
        "auth_mode_contract": payload.get("auth_mode_contract") or {},
        "workflow": workflows[0] if workflows else None,
        "summary": payload.get("summary") or {},
        "checklist": payload.get("checklist") or [],
        "buckets": payload.get("buckets") or {},
    }


def serialize_published_invocation_export_jsonl(payload: dict[str, Any]) -> str:
    governance = (
        payload.get("legacy_auth_governance")
        if isinstance(payload.get("legacy_auth_governance"), dict)
        else None
    )
    lines = [
        json.dumps(
            {
                "record_type": "published_invocation_export",
                "export": payload.get("export") or {},
                "binding": payload.get("binding") or {},
                "filters": payload.get("filters") or {},
                "summary": payload.get("summary") or {},
                "facets": payload.get("facets") or {},
                "legacy_auth_governance": (
                    {
                        "binding_count": governance.get("binding_count"),
                        "auth_mode_contract": governance.get("auth_mode_contract") or {},
                        "workflow": governance.get("workflow"),
                        "summary": governance.get("summary") or {},
                    }
                    if governance is not None
                    else None
                ),
            },
            ensure_ascii=False,
        )
    ]

    if governance is not None:
        lines.append(
            json.dumps(
                {
                    "record_type": "workflow_legacy_auth_governance",
                    "generated_at": governance.get("generated_at"),
                    "workflow_count": governance.get("workflow_count"),
                    "binding_count": governance.get("binding_count"),
                    "auth_mode_contract": governance.get("auth_mode_contract") or {},
                    "workflow": governance.get("workflow"),
                    "summary": governance.get("summary") or {},
                    "checklist": governance.get("checklist") or [],
                },
                ensure_ascii=False,
            )
        )

        buckets = governance.get("buckets") if isinstance(governance.get("buckets"), dict) else {}
        for bucket in ("draft_candidates", "published_blockers", "offline_inventory"):
            items = buckets.get(bucket)
            if not isinstance(items, list):
                continue

            for item in items:
                if not isinstance(item, dict):
                    continue
                lines.append(
                    json.dumps(
                        {
                            "record_type": "workflow_legacy_auth_binding",
                            "bucket": bucket,
                            **item,
                        },
                        ensure_ascii=False,
                    )
                )

    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    lines.extend(
        json.dumps(
            {
                "record_type": "invocation",
                **item,
            },
            ensure_ascii=False,
        )
        for item in items
        if isinstance(item, dict)
    )
    return "\n".join(lines) + "\n"
