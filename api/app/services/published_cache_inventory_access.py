from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.sensitive_access import SensitiveResourceRecord
from app.models.workflow import (
    Workflow,
    WorkflowPublishedCacheEntry,
    WorkflowPublishedEndpoint,
    WorkflowPublishedInvocation,
)
from app.services.run_sensitive_access_summary import (
    SENSITIVITY_RANK,
    resolve_highest_sensitivity_for_runs,
)
from app.services.sensitive_access_control import SensitiveAccessControlService
from app.services.sensitive_access_types import SensitiveAccessRequestBundle

_PUBLISHED_CACHE_INVENTORY_RESOURCE_KIND = "published_cache_inventory"


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _match_cache_inventory_resource(
    record: SensitiveResourceRecord,
    *,
    binding_id: str,
) -> bool:
    if record.source != "workspace_resource":
        return False
    metadata_payload = record.metadata_payload if isinstance(record.metadata_payload, dict) else {}
    return (
        str(metadata_payload.get("resource_kind") or "").strip()
        == _PUBLISHED_CACHE_INVENTORY_RESOURCE_KIND
        and str(metadata_payload.get("binding_id") or "").strip() == binding_id
    )


class PublishedCacheInventoryAccessService:
    def __init__(
        self,
        *,
        sensitive_access_service: SensitiveAccessControlService | None = None,
    ) -> None:
        self._sensitive_access = sensitive_access_service or SensitiveAccessControlService()

    def ensure_access(
        self,
        db: Session,
        *,
        binding: WorkflowPublishedEndpoint,
        requester_id: str,
        purpose_text: str | None = None,
        notification_channel: str = "in_app",
        notification_target: str = "sensitive-access-inbox",
    ) -> SensitiveAccessRequestBundle | None:
        active_entry_ids = self._list_active_cache_entry_ids(db, binding=binding)
        if not active_entry_ids:
            return None

        run_ids = self._list_inventory_run_ids(
            db,
            binding=binding,
            active_entry_ids=active_entry_ids,
        )
        sensitivity_level = resolve_highest_sensitivity_for_runs(db, run_ids=run_ids)
        if sensitivity_level is None:
            return None

        resource, require_revalidation = self._find_or_create_inventory_resource(
            db,
            binding=binding,
            sensitivity_level=sensitivity_level,
            active_entry_ids=active_entry_ids,
            run_ids=run_ids,
        )
        return self._sensitive_access.ensure_access(
            db,
            run_id=None,
            node_run_id=None,
            requester_type="human",
            requester_id=requester_id,
            resource_id=resource.id,
            action_type="read",
            purpose_text=purpose_text or f"read published cache inventory for {binding.id}",
            notification_channel=notification_channel,
            notification_target=notification_target,
            reuse_existing=not require_revalidation,
        )

    def _find_or_create_inventory_resource(
        self,
        db: Session,
        *,
        binding: WorkflowPublishedEndpoint,
        sensitivity_level: str,
        active_entry_ids: list[str],
        run_ids: list[str],
    ) -> tuple[SensitiveResourceRecord, bool]:
        metadata = {
            "resource_kind": _PUBLISHED_CACHE_INVENTORY_RESOURCE_KIND,
            "workflow_id": binding.workflow_id,
            "binding_id": binding.id,
            "endpoint_id": binding.endpoint_id,
            "endpoint_alias": binding.endpoint_alias,
            "active_entry_count": len(active_entry_ids),
            "run_ids": list(run_ids),
        }
        existing = self._find_inventory_resource(db, binding_id=binding.id)
        if existing is not None:
            require_revalidation = False
            metadata_changed = existing.metadata_payload != metadata
            if SENSITIVITY_RANK.get(existing.sensitivity_level, 0) < SENSITIVITY_RANK.get(
                sensitivity_level,
                0,
            ):
                existing.sensitivity_level = sensitivity_level
                require_revalidation = True
            if metadata_changed:
                existing.metadata_payload = metadata
            if require_revalidation or metadata_changed:
                existing.updated_at = _utcnow()
                db.flush()
            return existing, require_revalidation

        workflow = db.get(Workflow, binding.workflow_id)
        workflow_label = workflow.name if workflow is not None else binding.workflow_id
        return (
            self._sensitive_access.create_resource(
                db,
                label=f"Published cache inventory · {workflow_label} / {binding.endpoint_alias}",
                description=(
                    "Sensitive cache inventory surface for published endpoint binding "
                    f"{binding.id}."
                ),
                sensitivity_level=sensitivity_level,
                source="workspace_resource",
                metadata=metadata,
            ),
            False,
        )

    def _find_inventory_resource(
        self,
        db: Session,
        *,
        binding_id: str,
    ) -> SensitiveResourceRecord | None:
        records = db.scalars(
            select(SensitiveResourceRecord).where(
                SensitiveResourceRecord.source == "workspace_resource"
            )
        ).all()
        for record in records:
            if _match_cache_inventory_resource(record, binding_id=binding_id):
                return record
        return None

    def _list_active_cache_entry_ids(
        self,
        db: Session,
        *,
        binding: WorkflowPublishedEndpoint,
    ) -> list[str]:
        effective_now = _utcnow()
        return list(
            db.scalars(
                select(WorkflowPublishedCacheEntry.id)
                .where(
                    WorkflowPublishedCacheEntry.binding_id == binding.id,
                    WorkflowPublishedCacheEntry.expires_at > effective_now,
                )
                .order_by(
                    WorkflowPublishedCacheEntry.created_at.desc(),
                    WorkflowPublishedCacheEntry.id.desc(),
                )
            ).all()
        )

    def _list_inventory_run_ids(
        self,
        db: Session,
        *,
        binding: WorkflowPublishedEndpoint,
        active_entry_ids: list[str],
    ) -> list[str]:
        if not active_entry_ids:
            return []

        run_ids = db.scalars(
            select(WorkflowPublishedInvocation.run_id)
            .where(
                WorkflowPublishedInvocation.binding_id == binding.id,
                WorkflowPublishedInvocation.cache_entry_id.in_(active_entry_ids),
                WorkflowPublishedInvocation.run_id.is_not(None),
            )
            .order_by(
                WorkflowPublishedInvocation.created_at.desc(),
                WorkflowPublishedInvocation.id.desc(),
            )
        ).all()
        return list(dict.fromkeys(run_id for run_id in run_ids if run_id))
