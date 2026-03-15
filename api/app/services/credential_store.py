from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.credential import Credential
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


class CredentialStore:
    def __init__(
        self,
        *,
        encryption: CredentialEncryptionService | None = None,
        sensitive_access_service: SensitiveAccessControlService | None = None,
    ) -> None:
        self._encryption = encryption or CredentialEncryptionService()
        self._sensitive_access = sensitive_access_service or SensitiveAccessControlService()

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
        if name is not None:
            record.name = name.strip()
        if description is not None:
            record.description = description.strip()
        if data is not None:
            record.encrypted_data = self._encryption.encrypt(data)
        db.add(record)
        db.flush()
        return record

    def revoke(self, db: Session, *, credential_id: str) -> Credential:
        record = self.get(db, credential_id=credential_id)
        if record.status != "revoked":
            record.status = "revoked"
            record.revoked_at = datetime.now(UTC)
            db.add(record)
        return record

    def decrypt_data(self, db: Session, *, credential_id: str) -> dict[str, str]:
        """Decrypt and return credential data. For runtime use only."""
        record = self.get(db, credential_id=credential_id)
        if record.status == "revoked":
            raise CredentialStoreError("Cannot decrypt a revoked credential.")
        result = self._encryption.decrypt(record.encrypted_data)
        record.last_used_at = datetime.now(UTC)
        db.add(record)
        db.flush()
        return result

    def get_data_keys(self, record: Credential) -> list[str]:
        """Return field names in the encrypted data without exposing values."""
        try:
            data = self._encryption.decrypt(record.encrypted_data)
            return sorted(data.keys())
        except CredentialEncryptionError:
            return []

    def resolve_credential_refs(
        self, db: Session, *, credentials: dict[str, str]
    ) -> dict[str, str]:
        """Resolve credential://{id} references in a credentials dict.

        For each value matching 'credential://<id>', decrypt and merge.
        Plain string values pass through unchanged.
        """
        resolved: dict[str, str] = {}
        for key, value in credentials.items():
            if isinstance(value, str) and value.startswith("credential://"):
                cred_id = value.removeprefix("credential://").strip()
                if not cred_id:
                    raise CredentialStoreError(
                        f"Credential reference for key '{key}' has an empty ID."
                    )
                decrypted = self.decrypt_data(db, credential_id=cred_id)
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

        access_checked: set[str] = set()
        for _, cred_id in credential_refs:
            if cred_id in access_checked:
                continue
            access_checked.add(cred_id)
            resource = self._sensitive_access.find_credential_resource(
                db,
                credential_id=cred_id,
            )
            if resource is None:
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
            if decision == "require_approval":
                raise CredentialAccessPendingError(bundle)
            if decision == "deny":
                reason_code = str(bundle.access_request.reason_code or "access_denied")
                raise CredentialStoreError(
                    "Sensitive access denied for credential resource "
                    f"'{bundle.resource.label}' ({reason_code})."
                )

        resolved = dict(resolved_plain)
        decrypted_cache: dict[str, dict[str, str]] = {}
        for _, cred_id in credential_refs:
            decrypted = decrypted_cache.get(cred_id)
            if decrypted is None:
                decrypted = self.decrypt_data(db, credential_id=cred_id)
                decrypted_cache[cred_id] = decrypted
            resolved.update(decrypted)
        return resolved
