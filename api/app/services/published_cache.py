from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.workflow import WorkflowPublishedCacheEntry, WorkflowPublishedEndpoint

_MISSING_VALUE = {"state": "missing"}


@dataclass(frozen=True)
class PublishedEndpointCachePolicy:
    enabled: bool
    ttl: int
    max_entries: int
    vary_by: tuple[str, ...]


@dataclass(frozen=True)
class PublishedEndpointCacheHit:
    cache_key: str
    response_payload: dict


@dataclass(frozen=True)
class PublishedEndpointCacheInventorySummary:
    enabled: bool
    ttl: int | None = None
    max_entries: int | None = None
    vary_by: tuple[str, ...] = ()
    active_entry_count: int = 0
    total_hit_count: int = 0
    last_hit_at: datetime | None = None
    nearest_expires_at: datetime | None = None
    latest_created_at: datetime | None = None


@dataclass(frozen=True)
class PublishedEndpointCacheInventoryItem:
    id: str
    binding_id: str
    cache_key: str
    response_preview: dict
    hit_count: int
    last_hit_at: datetime | None
    expires_at: datetime
    created_at: datetime
    updated_at: datetime


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _build_payload_preview(payload: dict[str, Any]) -> dict[str, Any]:
    keys = sorted(payload.keys())
    preview: dict[str, Any] = {
        "key_count": len(keys),
        "keys": keys[:10],
    }
    if not keys:
        return preview

    sample: dict[str, Any] = {}
    for key in keys[:5]:
        value = payload.get(key)
        if value is None or isinstance(value, (bool, int, float)):
            sample[key] = value
            continue
        if isinstance(value, str):
            sample[key] = value[:120]
            continue
        if isinstance(value, list):
            sample[key] = {
                "type": "list",
                "length": len(value),
            }
            continue
        if isinstance(value, dict):
            nested_keys = sorted(value.keys())
            sample[key] = {
                "type": "object",
                "key_count": len(nested_keys),
                "keys": nested_keys[:5],
            }
            continue
        sample[key] = {"type": type(value).__name__}

    if sample:
        preview["sample"] = sample
    return preview


def _resolve_field_path(payload: dict[str, Any], field_path: str) -> Any:
    current: Any = payload
    for segment in field_path.split("."):
        if not isinstance(current, dict) or segment not in current:
            return _MISSING_VALUE
        current = current[segment]
    return current


class PublishedEndpointCacheService:
    def is_enabled(
        self,
        binding: WorkflowPublishedEndpoint,
    ) -> bool:
        return self._resolve_policy(binding) is not None

    def get_hit(
        self,
        db: Session,
        *,
        binding: WorkflowPublishedEndpoint,
        input_payload: dict,
        now: datetime | None = None,
    ) -> PublishedEndpointCacheHit | None:
        policy = self._resolve_policy(binding)
        if policy is None or not policy.enabled:
            return None

        effective_now = now or _utcnow()
        self._delete_expired_entries(db, binding_id=binding.id, now=effective_now)
        cache_key = self.build_cache_key(
            binding=binding,
            input_payload=input_payload,
            policy=policy,
        )
        entry = db.scalar(
            select(WorkflowPublishedCacheEntry).where(
                WorkflowPublishedCacheEntry.binding_id == binding.id,
                WorkflowPublishedCacheEntry.cache_key == cache_key,
                WorkflowPublishedCacheEntry.expires_at > effective_now,
            )
        )
        if entry is None:
            return None

        entry.hit_count += 1
        entry.last_hit_at = effective_now
        db.add(entry)
        db.flush()
        return PublishedEndpointCacheHit(
            cache_key=cache_key,
            response_payload=dict(entry.response_payload or {}),
        )

    def store_response(
        self,
        db: Session,
        *,
        binding: WorkflowPublishedEndpoint,
        input_payload: dict,
        response_payload: dict,
        now: datetime | None = None,
    ) -> WorkflowPublishedCacheEntry | None:
        policy = self._resolve_policy(binding)
        if policy is None or not policy.enabled:
            return None

        effective_now = now or _utcnow()
        self._delete_expired_entries(db, binding_id=binding.id, now=effective_now)
        cache_key = self.build_cache_key(
            binding=binding,
            input_payload=input_payload,
            policy=policy,
        )
        expires_at = effective_now + timedelta(seconds=policy.ttl)
        entry = db.scalar(
            select(WorkflowPublishedCacheEntry).where(
                WorkflowPublishedCacheEntry.binding_id == binding.id,
                WorkflowPublishedCacheEntry.cache_key == cache_key,
            )
        )
        if entry is None:
            entry = WorkflowPublishedCacheEntry(
                id=str(uuid4()),
                workflow_id=binding.workflow_id,
                binding_id=binding.id,
                endpoint_id=binding.endpoint_id,
                cache_key=cache_key,
                response_payload=response_payload,
                expires_at=expires_at,
            )
        else:
            entry.response_payload = response_payload
            entry.expires_at = expires_at

        db.add(entry)
        db.flush()
        self._prune_entries(db, binding_id=binding.id, max_entries=policy.max_entries)
        return entry

    def summarize_for_bindings(
        self,
        db: Session,
        *,
        bindings: list[WorkflowPublishedEndpoint],
        now: datetime | None = None,
    ) -> dict[str, PublishedEndpointCacheInventorySummary]:
        if not bindings:
            return {}

        summaries: dict[str, PublishedEndpointCacheInventorySummary] = {}
        effective_now = now or _utcnow()
        for binding in bindings:
            summaries[binding.id] = self.build_binding_summary(
                db,
                binding=binding,
                now=effective_now,
            )
        return summaries

    def build_binding_summary(
        self,
        db: Session,
        *,
        binding: WorkflowPublishedEndpoint,
        now: datetime | None = None,
    ) -> PublishedEndpointCacheInventorySummary:
        policy = self._resolve_policy(binding)
        if policy is None:
            return PublishedEndpointCacheInventorySummary(enabled=False)

        effective_now = now or _utcnow()
        records = self._list_active_records(
            db,
            binding_id=binding.id,
            now=effective_now,
        )
        return PublishedEndpointCacheInventorySummary(
            enabled=True,
            ttl=policy.ttl,
            max_entries=policy.max_entries,
            vary_by=policy.vary_by,
            active_entry_count=len(records),
            total_hit_count=sum(record.hit_count for record in records),
            last_hit_at=max((record.last_hit_at for record in records if record.last_hit_at), default=None),
            nearest_expires_at=min((record.expires_at for record in records), default=None),
            latest_created_at=max((record.created_at for record in records), default=None),
        )

    def list_inventory_items(
        self,
        db: Session,
        *,
        binding: WorkflowPublishedEndpoint,
        limit: int = 10,
        now: datetime | None = None,
    ) -> list[PublishedEndpointCacheInventoryItem]:
        policy = self._resolve_policy(binding)
        if policy is None:
            return []

        effective_now = now or _utcnow()
        records = self._list_active_records(
            db,
            binding_id=binding.id,
            now=effective_now,
            limit=limit,
        )
        return [
            PublishedEndpointCacheInventoryItem(
                id=record.id,
                binding_id=record.binding_id,
                cache_key=record.cache_key,
                response_preview=_build_payload_preview(dict(record.response_payload or {})),
                hit_count=record.hit_count,
                last_hit_at=record.last_hit_at,
                expires_at=record.expires_at,
                created_at=record.created_at,
                updated_at=record.updated_at,
            )
            for record in records
        ]

    def build_cache_key(
        self,
        *,
        binding: WorkflowPublishedEndpoint,
        input_payload: dict,
        policy: PublishedEndpointCachePolicy | None = None,
    ) -> str:
        effective_policy = policy or self._resolve_policy(binding)
        if effective_policy is None:
            raise ValueError("Published endpoint cache policy is not enabled.")

        cacheable_payload = self._build_cacheable_payload(
            input_payload=input_payload,
            vary_by=effective_policy.vary_by,
        )
        serialized_payload = json.dumps(
            cacheable_payload,
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        )
        return hashlib.sha256(
            f"{binding.id}:{serialized_payload}".encode("utf-8")
        ).hexdigest()

    def _resolve_policy(
        self,
        binding: WorkflowPublishedEndpoint,
    ) -> PublishedEndpointCachePolicy | None:
        raw_policy = binding.cache_policy
        if not isinstance(raw_policy, dict):
            return None
        if raw_policy.get("enabled") is False:
            return None
        if binding.streaming:
            return None

        ttl = raw_policy.get("ttl")
        max_entries = raw_policy.get("maxEntries", 128)
        vary_by = tuple(
            field_path.strip()
            for field_path in raw_policy.get("varyBy") or []
            if isinstance(field_path, str) and field_path.strip()
        )
        if not isinstance(ttl, int) or ttl <= 0:
            return None
        if not isinstance(max_entries, int) or max_entries <= 0:
            return None

        return PublishedEndpointCachePolicy(
            enabled=True,
            ttl=ttl,
            max_entries=max_entries,
            vary_by=vary_by,
        )

    def _build_cacheable_payload(
        self,
        *,
        input_payload: dict,
        vary_by: tuple[str, ...],
    ) -> dict:
        if not vary_by:
            return input_payload
        return {
            field_path: _resolve_field_path(input_payload, field_path)
            for field_path in vary_by
        }

    def _list_active_records(
        self,
        db: Session,
        *,
        binding_id: str,
        now: datetime,
        limit: int | None = None,
    ) -> list[WorkflowPublishedCacheEntry]:
        self._delete_expired_entries(db, binding_id=binding_id, now=now)
        statement = (
            select(WorkflowPublishedCacheEntry)
            .where(
                WorkflowPublishedCacheEntry.binding_id == binding_id,
                WorkflowPublishedCacheEntry.expires_at > now,
            )
            .order_by(
                WorkflowPublishedCacheEntry.last_hit_at.desc(),
                WorkflowPublishedCacheEntry.created_at.desc(),
                WorkflowPublishedCacheEntry.id.desc(),
            )
        )
        if limit is not None:
            statement = statement.limit(limit)
        return db.scalars(statement).all()

    def _delete_expired_entries(
        self,
        db: Session,
        *,
        binding_id: str,
        now: datetime,
    ) -> None:
        expired_entries = db.scalars(
            select(WorkflowPublishedCacheEntry).where(
                WorkflowPublishedCacheEntry.binding_id == binding_id,
                WorkflowPublishedCacheEntry.expires_at <= now,
            )
        ).all()
        for entry in expired_entries:
            db.delete(entry)
        if expired_entries:
            db.flush()

    def _prune_entries(
        self,
        db: Session,
        *,
        binding_id: str,
        max_entries: int,
    ) -> None:
        records = db.scalars(
            select(WorkflowPublishedCacheEntry)
            .where(WorkflowPublishedCacheEntry.binding_id == binding_id)
            .order_by(
                WorkflowPublishedCacheEntry.created_at.desc(),
                WorkflowPublishedCacheEntry.id.desc(),
            )
        ).all()
        for stale_record in records[max_entries:]:
            db.delete(stale_record)
        if len(records) > max_entries:
            db.flush()
