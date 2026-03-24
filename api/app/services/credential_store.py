from __future__ import annotations

from typing import Any
from datetime import UTC, datetime
from urllib.parse import quote, unquote
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.credential import Credential, CredentialAuditRecord
from app.services.credential_encryption import (
    CredentialEncryptionError,
    CredentialEncryptionService,
)
from app.services.sensitive_access_control import (
    SensitiveAccessControlService,
    SensitiveAccessRequestBundle,
)


class CredentialStoreError(ValueError):
    """Raised for credential store domain errors."""


class CredentialAccessPendingError(CredentialStoreError):
    def __init__(self, bundle: SensitiveAccessRequestBundle) -> None:
        self.bundle = bundle
        approval_ticket_id = (
            bundle.approval_ticket.id if bundle.approval_ticket is not None else None
        )
        waiting_suffix = (
            f" (ticket: {approval_ticket_id})" if approval_ticket_id is not None else ""
        )
        super().__init__(
            "Sensitive access approval is still pending for "
            f"resource '{bundle.resource.label}'{waiting_suffix}."
        )


_MASKED_CREDENTIAL_HANDLE_PREFIX = "credential+masked://"


class CredentialStore:
    def __init__(
        self,
        *,
        encryption: CredentialEncryptionService | None = None,
        sensitive_access_service: SensitiveAccessControlService | None = None,
    ) -> None:
        self._encryption = encryption or CredentialEncryptionService()
        self._sensitive_access = sensitive_access_service or SensitiveAccessControlService()

    @property
    def sensitive_access_service(self) -> SensitiveAccessControlService:
        return self._sensitive_access

    def create(
        self,
        db: Session,
        *,
        name: str,
        credential_type: str,
        data: dict[str, str],
        description: str = "",
    ) -> Credential:
        encrypted = self._encryption.encrypt(data)
        record = Credential(
            id=str(uuid4()),
            name=name.strip(),
            credential_type=credential_type.strip(),
            encrypted_data=encrypted,
            description=description.strip(),
            status="active",
        )
        db.add(record)
        db.flush()
        self._record_audit_event(
            db,
            record=record,
            action="created",
            actor_type="control_plane",
            actor_id="credentials_api",
            metadata={"data_keys": sorted(data.keys())},
        )
        return record

    def list_credentials(
        self, db: Session, *, include_revoked: bool = False
    ) -> list[Credential]:
        stmt = select(Credential).order_by(Credential.created_at.desc())
        if not include_revoked:
            stmt = stmt.where(Credential.status == "active")
        return list(db.scalars(stmt).all())

    def get(self, db: Session, *, credential_id: str) -> Credential:
        record = db.get(Credential, credential_id)
        if record is None:
            raise CredentialStoreError("Credential not found.")
        return record

    def update(
        self,
        db: Session,
        *,
        credential_id: str,
        name: str | None = None,
        data: dict[str, str] | None = None,
        description: str | None = None,
    ) -> Credential:
        record = self.get(db, credential_id=credential_id)
        if record.status == "revoked":
            raise CredentialStoreError("Cannot update a revoked credential.")
        changed_fields: list[str] = []
        if name is not None:
            record.name = name.strip()
            changed_fields.append("name")
        if description is not None:
            record.description = description.strip()
            changed_fields.append("description")
        if data is not None:
            record.encrypted_data = self._encryption.encrypt(data)
            changed_fields.append("data")
        db.add(record)
        db.flush()
        self._record_audit_event(
            db,
            record=record,
            action="updated",
            actor_type="control_plane",
            actor_id="credentials_api",
            metadata={
                "changed_fields": changed_fields,
                "data_keys": sorted(data.keys()) if data is not None else [],
            },
        )
        return record

    def revoke(self, db: Session, *, credential_id: str) -> Credential:
        record = self.get(db, credential_id=credential_id)
        if record.status != "revoked":
            record.status = "revoked"
            record.revoked_at = datetime.now(UTC)
            db.add(record)
            db.flush()
            self._record_audit_event(
                db,
                record=record,
                action="revoked",
                actor_type="control_plane",
                actor_id="credentials_api",
            )
        return record

    def decrypt_data(
        self,
        db: Session,
        *,
        credential_id: str,
        actor_type: str = "system",
        actor_id: str | None = None,
        run_id: str | None = None,
        node_run_id: str | None = None,
    ) -> dict[str, str]:
        """Decrypt and return credential data. For runtime use only."""
        record = self.get(db, credential_id=credential_id)
        if record.status == "revoked":
            raise CredentialStoreError("Cannot decrypt a revoked credential.")
        result = self._encryption.decrypt(record.encrypted_data)
        record.last_used_at = datetime.now(UTC)
        db.add(record)
        db.flush()
        self._record_audit_event(
            db,
            record=record,
            action="decrypted",
            actor_type=actor_type,
            actor_id=actor_id,
            run_id=run_id,
            node_run_id=node_run_id,
            metadata={"field_names": sorted(result.keys())},
        )
        return result

    def get_data_keys(self, record: Credential) -> list[str]:
        """Return field names in the encrypted data without exposing values."""
        try:
            data = self._encryption.decrypt(record.encrypted_data)
            return sorted(data.keys())
        except CredentialEncryptionError:
            return []

    def resolve_masked_runtime_credentials(
        self,
        db: Session,
        *,
        credentials: dict[str, str],
        run_id: str | None = None,
        node_run_id: str | None = None,
        requester_type: str = "workflow",
        requester_id: str | None = None,
    ) -> dict[str, str]:
        resolved: dict[str, str] = {}
        decrypted_cache: dict[str, dict[str, str]] = {}

        for key, value in credentials.items():
            handle = self._parse_masked_credential_handle(value)
            if handle is None:
                resolved[key] = str(value)
                continue

            cred_id, field_name = handle
            decrypted = decrypted_cache.get(cred_id)
            if decrypted is None:
                decrypted = self.decrypt_data(
                    db,
                    credential_id=cred_id,
                    actor_type=requester_type,
                    actor_id=requester_id,
                    run_id=run_id,
                    node_run_id=node_run_id,
                )
                decrypted_cache[cred_id] = decrypted

            if field_name not in decrypted:
                raise CredentialStoreError(
                    "Masked credential handle references unknown field "
                    f"'{field_name}' for credential '{cred_id}'."
                )
            resolved[key] = decrypted[field_name]

        return resolved

    def resolve_credential_refs(
        self, db: Session, *, credentials: dict[str, str]
    ) -> dict[str, str]:
        """Resolve credential://{id} references in a credentials dict.

        For each value matching 'credential://<id>', decrypt and merge.
        Plain string values pass through unchanged.
        """
        resolved: dict[str, str] = {}
        decrypted_cache: dict[str, dict[str, str]] = {}
        for key, value in credentials.items():
            if isinstance(value, str) and value.startswith("credential://"):
                cred_id = value.removeprefix("credential://").strip()
                if not cred_id:
                    raise CredentialStoreError(
                        f"Credential reference for key '{key}' has an empty ID."
                    )
                decrypted = decrypted_cache.get(cred_id)
                if decrypted is None:
                    decrypted = self.decrypt_data(
                        db,
                        credential_id=cred_id,
                        actor_type="system",
                        actor_id="credential_ref_resolver",
                    )
                    decrypted_cache[cred_id] = decrypted
                resolved.update(decrypted)
            else:
                resolved[key] = str(value)
        return resolved

    def resolve_runtime_credential_refs(
        self,
        db: Session,
        *,
        credentials: dict[str, str],
        run_id: str | None,
        node_run_id: str | None,
        requester_type: str,
        requester_id: str,
        action_type: str = "use",
        purpose_text: str | None = None,
    ) -> dict[str, str]:
        resolved_plain: dict[str, str] = {}
        credential_refs: list[tuple[str, str]] = []
        for key, value in credentials.items():
            if isinstance(value, str) and value.startswith("credential://"):
                cred_id = value.removeprefix("credential://").strip()
                if not cred_id:
                    raise CredentialStoreError(
                        f"Credential reference for key '{key}' has an empty ID."
                    )
                credential_refs.append((key, cred_id))
            else:
                resolved_plain[key] = str(value)

        access_decisions: dict[str, str] = {}
        credential_records: dict[str, Credential] = {}
        access_checked: set[str] = set()
        for _, cred_id in credential_refs:
            if cred_id in access_checked:
                continue
            access_checked.add(cred_id)
            credential_records[cred_id] = self.get(db, credential_id=cred_id)
            resource = self._sensitive_access.find_credential_resource(
                db,
                credential_id=cred_id,
            )
            if resource is None:
                access_decisions[cred_id] = "allow"
                continue
            bundle = self._sensitive_access.ensure_access(
                db,
                run_id=run_id,
                node_run_id=node_run_id,
                requester_type=requester_type,
                requester_id=requester_id,
                resource_id=resource.id,
                action_type=action_type,
                purpose_text=purpose_text,
                reuse_existing=True,
            )
            decision = str(bundle.access_request.decision or "")
            access_decisions[cred_id] = decision or "allow"
            if decision == "require_approval":
                self._record_audit_event(
                    db,
                    record=credential_records[cred_id],
                    action="approval_pending",
                    actor_type=requester_type,
                    actor_id=requester_id,
                    run_id=run_id,
                    node_run_id=node_run_id,
                    metadata={
                        "action_type": action_type,
                        "purpose_text": purpose_text,
                        "approval_ticket_id": (
                            bundle.approval_ticket.id
                            if bundle.approval_ticket is not None
                            else None
                        ),
                    },
                )
                raise CredentialAccessPendingError(bundle)
            if decision == "deny":
                reason_code = str(bundle.access_request.reason_code or "access_denied")
                self._record_audit_event(
                    db,
                    record=credential_records[cred_id],
                    action="access_denied",
                    actor_type=requester_type,
                    actor_id=requester_id,
                    run_id=run_id,
                    node_run_id=node_run_id,
                    metadata={
                        "action_type": action_type,
                        "purpose_text": purpose_text,
                        "reason_code": reason_code,
                    },
                )
                raise CredentialStoreError(
                    "Sensitive access denied for credential resource "
                    f"'{bundle.resource.label}' ({reason_code})."
                )

        resolved = dict(resolved_plain)
        decrypted_cache: dict[str, dict[str, str]] = {}
        masked_handle_cache: dict[str, dict[str, str]] = {}
        for _, cred_id in credential_refs:
            decision = access_decisions.get(cred_id, "allow")
            if decision == "allow_masked":
                if cred_id not in masked_handle_cache:
                    masked_handle_cache[cred_id] = self._build_masked_credential_handles(
                        db,
                        credential_id=cred_id,
                    )
                    self._record_audit_event(
                        db,
                        record=credential_records[cred_id],
                        action="masked_handle_issued",
                        actor_type=requester_type,
                        actor_id=requester_id,
                        run_id=run_id,
                        node_run_id=node_run_id,
                        metadata={
                            "action_type": action_type,
                            "purpose_text": purpose_text,
                            "field_names": sorted(masked_handle_cache[cred_id].keys()),
                        },
                    )
                resolved.update(masked_handle_cache[cred_id])
                continue

            if cred_id not in decrypted_cache:
                decrypted_cache[cred_id] = self.decrypt_data(
                    db,
                    credential_id=cred_id,
                    actor_type=requester_type,
                    actor_id=requester_id,
                    run_id=run_id,
                    node_run_id=node_run_id,
                )
            resolved.update(decrypted_cache[cred_id])
        return resolved

    def list_audit_events(
        self,
        db: Session,
        *,
        credential_id: str | None = None,
        limit: int = 20,
    ) -> list[CredentialAuditRecord]:
        stmt = select(CredentialAuditRecord).order_by(CredentialAuditRecord.created_at.desc())
        if credential_id is not None:
            stmt = stmt.where(CredentialAuditRecord.credential_id == credential_id)
        stmt = stmt.limit(limit)
        return list(db.scalars(stmt).all())

    def _record_audit_event(
        self,
        db: Session,
        *,
        record: Credential,
        action: str,
        actor_type: str,
        actor_id: str | None = None,
        run_id: str | None = None,
        node_run_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> CredentialAuditRecord:
        audit_record = CredentialAuditRecord(
            id=str(uuid4()),
            credential_id=record.id,
            credential_name=record.name,
            credential_type=record.credential_type,
            action=action,
            actor_type=actor_type,
            actor_id=actor_id,
            run_id=run_id,
            node_run_id=node_run_id,
            metadata_payload=dict(metadata or {}),
        )
        db.add(audit_record)
        db.flush()
        return audit_record

    def _build_masked_credential_handles(
        self,
        db: Session,
        *,
        credential_id: str,
    ) -> dict[str, str]:
        record = self.get(db, credential_id=credential_id)
        if record.status == "revoked":
            raise CredentialStoreError("Cannot use a revoked credential.")

        field_names = self.get_data_keys(record)
        return {
            field_name: self._format_masked_credential_handle(
                credential_id=credential_id,
                field_name=field_name,
            )
            for field_name in field_names
        }

    @staticmethod
    def _format_masked_credential_handle(
        *,
        credential_id: str,
        field_name: str,
    ) -> str:
        return (
            f"{_MASKED_CREDENTIAL_HANDLE_PREFIX}{credential_id}"
            f"#{quote(field_name, safe='')}"
        )

    @staticmethod
    def _parse_masked_credential_handle(value: str) -> tuple[str, str] | None:
        if not isinstance(value, str) or not value.startswith(
            _MASKED_CREDENTIAL_HANDLE_PREFIX
        ):
            return None

        raw_value = value.removeprefix(_MASKED_CREDENTIAL_HANDLE_PREFIX)
        credential_id, separator, encoded_field_name = raw_value.partition("#")
        if not credential_id or separator != "#" or not encoded_field_name:
            raise CredentialStoreError("Masked credential handle is malformed.")
        return credential_id, unquote(encoded_field_name)
