from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.credential import (
    CredentialAuditItem,
    CredentialCreateRequest,
    CredentialDetail,
    CredentialItem,
    CredentialUpdateRequest,
)
from app.services.credential_encryption import CredentialEncryptionError
from app.services.credential_store import CredentialStore, CredentialStoreError

router = APIRouter(prefix="/credentials", tags=["credentials"])
credential_store = CredentialStore()


def _serialize_item(record) -> CredentialItem:
    return CredentialItem(
        id=record.id,
        name=record.name,
        credential_type=record.credential_type,
        description=record.description,
        status=record.status,
        last_used_at=record.last_used_at,
        revoked_at=record.revoked_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _serialize_detail(record, data_keys: list[str]) -> CredentialDetail:
    return CredentialDetail(
        **_serialize_item(record).model_dump(),
        data_keys=data_keys,
    )


def _format_audit_actor(actor_type: str, actor_id: str | None) -> str:
    normalized_actor_id = (actor_id or "").strip()
    if normalized_actor_id:
        return f"{actor_type}:{normalized_actor_id}"
    return actor_type


def _format_audit_field_list(metadata: dict[str, Any], key: str) -> str | None:
    values = metadata.get(key)
    if not isinstance(values, list):
        return None
    field_names = [str(value).strip() for value in values if str(value).strip()]
    if not field_names:
        return None
    return "、".join(field_names)


def _build_audit_summary(record) -> str:
    metadata = record.metadata_payload if isinstance(record.metadata_payload, dict) else {}
    actor = _format_audit_actor(record.actor_type, record.actor_id)
    if record.action == "created":
        field_names = _format_audit_field_list(metadata, "data_keys")
        if field_names:
            return f"{actor} 创建了凭证，并写入字段 {field_names}。"
        return f"{actor} 创建了凭证。"
    if record.action == "updated":
        changed_fields = _format_audit_field_list(metadata, "changed_fields")
        data_keys = _format_audit_field_list(metadata, "data_keys")
        if changed_fields and data_keys:
            return f"{actor} 更新了 {changed_fields}，并重写字段 {data_keys}。"
        if changed_fields:
            return f"{actor} 更新了 {changed_fields}。"
        return f"{actor} 更新了凭证。"
    if record.action == "revoked":
        return f"{actor} 吊销了凭证，后续 runtime 不再允许解密。"
    if record.action == "decrypted":
        field_names = _format_audit_field_list(metadata, "field_names")
        if field_names:
            return f"{actor} 在运行时解密了字段 {field_names}。"
        return f"{actor} 在运行时解密了凭证。"
    if record.action == "masked_handle_issued":
        field_names = _format_audit_field_list(metadata, "field_names")
        if field_names:
            return f"{actor} 命中 allow_masked，已下发字段 {field_names} 的 masked handle。"
        return f"{actor} 命中 allow_masked，已下发 masked handle。"
    if record.action == "approval_pending":
        return f"{actor} 访问命中审批，当前凭证仍在等待 operator 处理。"
    if record.action == "access_denied":
        reason_code = str(metadata.get("reason_code") or "access_denied")
        return f"{actor} 对该凭证的访问被策略拒绝（{reason_code}）。"
    return f"{actor} 记录了凭证活动 {record.action}。"


def _serialize_audit_item(record) -> CredentialAuditItem:
    metadata = record.metadata_payload if isinstance(record.metadata_payload, dict) else {}
    return CredentialAuditItem(
        id=record.id,
        credential_id=record.credential_id,
        credential_name=record.credential_name,
        credential_type=record.credential_type,
        action=record.action,
        actor_type=record.actor_type,
        actor_id=record.actor_id,
        run_id=record.run_id,
        node_run_id=record.node_run_id,
        summary=_build_audit_summary(record),
        metadata=metadata,
        created_at=record.created_at,
    )


def _raise_credential_error(
    exc: CredentialStoreError | CredentialEncryptionError,
) -> None:
    detail = str(exc)
    if "not found" in detail.lower():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=detail
        ) from exc
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail
    ) from exc


@router.get("", response_model=list[CredentialItem])
def list_credentials(
    include_revoked: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[CredentialItem]:
    items = credential_store.list_credentials(db, include_revoked=include_revoked)
    return [_serialize_item(item) for item in items]


@router.get("/activity", response_model=list[CredentialAuditItem])
def list_credential_activity(
    credential_id: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[CredentialAuditItem]:
    items = credential_store.list_audit_events(
        db,
        credential_id=credential_id,
        limit=limit,
    )
    return [_serialize_audit_item(item) for item in items]


@router.post("", response_model=CredentialDetail, status_code=status.HTTP_201_CREATED)
def create_credential(
    payload: CredentialCreateRequest,
    db: Session = Depends(get_db),
) -> CredentialDetail:
    try:
        record = credential_store.create(
            db,
            name=payload.name,
            credential_type=payload.credential_type,
            data=payload.data,
            description=payload.description,
        )
    except (CredentialStoreError, CredentialEncryptionError) as exc:
        _raise_credential_error(exc)
    db.commit()
    db.refresh(record)
    data_keys = credential_store.get_data_keys(record)
    return _serialize_detail(record, data_keys)


@router.get("/{credential_id}", response_model=CredentialDetail)
def get_credential(
    credential_id: str,
    db: Session = Depends(get_db),
) -> CredentialDetail:
    try:
        record = credential_store.get(db, credential_id=credential_id)
    except CredentialStoreError as exc:
        _raise_credential_error(exc)
    data_keys = credential_store.get_data_keys(record)
    return _serialize_detail(record, data_keys)


@router.put("/{credential_id}", response_model=CredentialDetail)
def update_credential(
    credential_id: str,
    payload: CredentialUpdateRequest,
    db: Session = Depends(get_db),
) -> CredentialDetail:
    try:
        record = credential_store.update(
            db,
            credential_id=credential_id,
            name=payload.name,
            data=payload.data,
            description=payload.description,
        )
    except (CredentialStoreError, CredentialEncryptionError) as exc:
        _raise_credential_error(exc)
    db.commit()
    db.refresh(record)
    data_keys = credential_store.get_data_keys(record)
    return _serialize_detail(record, data_keys)


@router.delete("/{credential_id}", response_model=CredentialItem)
def revoke_credential(
    credential_id: str,
    db: Session = Depends(get_db),
) -> CredentialItem:
    try:
        record = credential_store.revoke(db, credential_id=credential_id)
    except CredentialStoreError as exc:
        _raise_credential_error(exc)
    db.commit()
    db.refresh(record)
    return _serialize_item(record)
