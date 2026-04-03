"""Tests for credential store: encryption service, store service, and API routes."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.credential_encryption import (
    CredentialEncryptionError,
    CredentialEncryptionService,
)
from app.services.credential_store import (
    CredentialAccessPendingError,
    CredentialStore,
    CredentialStoreError,
)
from app.services.sensitive_access_control import SensitiveAccessControlService

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_TEST_KEY = Fernet.generate_key().decode("utf-8")


def _make_settings(**overrides):
    """Return a mock settings object with a valid encryption key."""

    class _FakeSettings:
        credential_encryption_key = overrides.get("credential_encryption_key", _TEST_KEY)

    return _FakeSettings()


# ---------------------------------------------------------------------------
# CredentialEncryptionService
# ---------------------------------------------------------------------------


class TestCredentialEncryptionService:
    def test_roundtrip_encrypt_decrypt(self) -> None:
        with patch(
            "app.services.credential_encryption.get_settings",
            return_value=_make_settings(),
        ):
            svc = CredentialEncryptionService()
            plain = {"api_key": "sk-abc123", "secret": "s3cret"}
            encrypted = svc.encrypt(plain)
            assert isinstance(encrypted, str)
            assert encrypted != str(plain)
            decrypted = svc.decrypt(encrypted)
            assert decrypted == plain

    def test_encrypt_empty_dict(self) -> None:
        with patch(
            "app.services.credential_encryption.get_settings",
            return_value=_make_settings(),
        ):
            svc = CredentialEncryptionService()
            encrypted = svc.encrypt({})
            assert svc.decrypt(encrypted) == {}

    def test_encrypt_unicode_values(self) -> None:
        with patch(
            "app.services.credential_encryption.get_settings",
            return_value=_make_settings(),
        ):
            svc = CredentialEncryptionService()
            plain = {"name": "测试密钥", "token": "🔑"}
            assert svc.decrypt(svc.encrypt(plain)) == plain

    def test_decrypt_with_wrong_key_raises(self) -> None:
        with patch(
            "app.services.credential_encryption.get_settings",
            return_value=_make_settings(),
        ):
            svc = CredentialEncryptionService()
            encrypted = svc.encrypt({"key": "value"})

        other_key = Fernet.generate_key().decode("utf-8")
        with patch(
            "app.services.credential_encryption.get_settings",
            return_value=_make_settings(credential_encryption_key=other_key),
        ):
            svc2 = CredentialEncryptionService()
            with pytest.raises(CredentialEncryptionError, match="decrypt"):
                svc2.decrypt(encrypted)

    def test_missing_key_raises(self) -> None:
        with patch(
            "app.services.credential_encryption.get_settings",
            return_value=_make_settings(credential_encryption_key=""),
        ):
            svc = CredentialEncryptionService()
            with pytest.raises(CredentialEncryptionError, match="not configured"):
                svc.encrypt({"k": "v"})

    def test_invalid_key_raises(self) -> None:
        with patch(
            "app.services.credential_encryption.get_settings",
            return_value=_make_settings(credential_encryption_key="not-a-valid-fernet-key"),
        ):
            svc = CredentialEncryptionService()
            with pytest.raises(CredentialEncryptionError, match="not a valid"):
                svc.encrypt({"k": "v"})


# ---------------------------------------------------------------------------
# CredentialStore
# ---------------------------------------------------------------------------


class TestCredentialStore:
    @pytest.fixture(autouse=True)
    def _patch_encryption(self):
        with patch(
            "app.services.credential_encryption.get_settings",
            return_value=_make_settings(),
        ):
            yield

    def test_create_and_get(self, sqlite_session: Session) -> None:
        store = CredentialStore()
        record = store.create(
            sqlite_session,
            name="  OpenAI Key  ",
            credential_type="  api_key  ",
            data={"api_key": "sk-test"},
            description="  Test credential  ",
        )
        sqlite_session.commit()

        assert record.id
        assert record.name == "OpenAI Key"
        assert record.credential_type == "api_key"
        assert record.description == "Test credential"
        assert record.status == "active"
        assert record.encrypted_data != "sk-test"

        fetched = store.get(sqlite_session, credential_id=record.id)
        assert fetched.id == record.id

        resource = store.get_sensitive_resource(sqlite_session, credential_id=record.id)
        assert resource is not None
        assert resource.sensitivity_level == "L2"
        assert resource.label == "Credential · OpenAI Key"
        assert resource.metadata_payload == {
            "credential_id": record.id,
            "credential_name": "OpenAI Key",
            "credential_type": "api_key",
            "credential_status": "active",
            "credential_ref": f"credential://{record.id}",
        }

    def test_list_credentials_excludes_revoked(self, sqlite_session: Session) -> None:
        store = CredentialStore()
        store.create(sqlite_session, name="Active", credential_type="t", data={"k": "v"})
        revoked = store.create(sqlite_session, name="Revoked", credential_type="t", data={"k": "v"})
        sqlite_session.commit()

        store.revoke(sqlite_session, credential_id=revoked.id)
        sqlite_session.commit()

        active_list = store.list_credentials(sqlite_session)
        assert len(active_list) == 1
        assert active_list[0].name == "Active"

        all_list = store.list_credentials(sqlite_session, include_revoked=True)
        assert len(all_list) == 2

    def test_update(self, sqlite_session: Session) -> None:
        store = CredentialStore()
        record = store.create(sqlite_session, name="Old", credential_type="t", data={"k": "old"})
        sqlite_session.commit()

        store.update(
            sqlite_session,
            credential_id=record.id,
            name="New",
            data={"k": "new"},
            description="Updated",
        )
        sqlite_session.commit()
        sqlite_session.refresh(record)

        assert record.name == "New"
        assert record.description == "Updated"
        decrypted = store.decrypt_data(sqlite_session, credential_id=record.id)
        assert decrypted == {"k": "new"}

        resource = store.get_sensitive_resource(sqlite_session, credential_id=record.id)
        assert resource is not None
        assert resource.label == "Credential · New"
        assert resource.description == "Updated"
        assert resource.sensitivity_level == "L2"

    def test_update_can_raise_credential_sensitivity_level(
        self,
        sqlite_session: Session,
    ) -> None:
        store = CredentialStore()
        record = store.create(
            sqlite_session,
            name="Ops Key",
            credential_type="api_key",
            data={"api_key": "sk-ops"},
        )
        sqlite_session.commit()

        store.update(
            sqlite_session,
            credential_id=record.id,
            sensitivity_level="L3",
        )
        sqlite_session.commit()

        resource = store.get_sensitive_resource(sqlite_session, credential_id=record.id)
        assert resource is not None
        assert resource.sensitivity_level == "L3"

    def test_update_revoked_raises(self, sqlite_session: Session) -> None:
        store = CredentialStore()
        record = store.create(sqlite_session, name="C", credential_type="t", data={"k": "v"})
        sqlite_session.commit()
        store.revoke(sqlite_session, credential_id=record.id)
        sqlite_session.commit()

        with pytest.raises(CredentialStoreError, match="revoked"):
            store.update(sqlite_session, credential_id=record.id, name="X")

    def test_revoke(self, sqlite_session: Session) -> None:
        store = CredentialStore()
        record = store.create(sqlite_session, name="C", credential_type="t", data={"k": "v"})
        sqlite_session.commit()

        store.revoke(sqlite_session, credential_id=record.id)
        sqlite_session.commit()
        sqlite_session.refresh(record)

        assert record.status == "revoked"
        assert record.revoked_at is not None

        resource = store.get_sensitive_resource(sqlite_session, credential_id=record.id)
        assert resource is not None
        assert resource.metadata_payload["credential_status"] == "revoked"

    def test_revoke_idempotent(self, sqlite_session: Session) -> None:
        store = CredentialStore()
        record = store.create(sqlite_session, name="C", credential_type="t", data={"k": "v"})
        sqlite_session.commit()

        store.revoke(sqlite_session, credential_id=record.id)
        first_revoked_at = record.revoked_at
        store.revoke(sqlite_session, credential_id=record.id)
        assert record.revoked_at == first_revoked_at

    def test_decrypt_data(self, sqlite_session: Session) -> None:
        store = CredentialStore()
        record = store.create(sqlite_session, name="C", credential_type="t", data={"key": "secret"})
        sqlite_session.commit()

        result = store.decrypt_data(sqlite_session, credential_id=record.id)
        assert result == {"key": "secret"}
        sqlite_session.refresh(record)
        assert record.last_used_at is not None

    def test_decrypt_revoked_raises(self, sqlite_session: Session) -> None:
        store = CredentialStore()
        record = store.create(sqlite_session, name="C", credential_type="t", data={"k": "v"})
        sqlite_session.commit()
        store.revoke(sqlite_session, credential_id=record.id)
        sqlite_session.commit()

        with pytest.raises(CredentialStoreError, match="revoked"):
            store.decrypt_data(sqlite_session, credential_id=record.id)

    def test_get_data_keys(self, sqlite_session: Session) -> None:
        store = CredentialStore()
        record = store.create(
            sqlite_session, name="C", credential_type="t", data={"b_key": "1", "a_key": "2"}
        )
        sqlite_session.commit()

        keys = store.get_data_keys(record)
        assert keys == ["a_key", "b_key"]

    def test_get_not_found_raises(self, sqlite_session: Session) -> None:
        store = CredentialStore()
        with pytest.raises(CredentialStoreError, match="not found"):
            store.get(sqlite_session, credential_id="nonexistent")

    def test_resolve_credential_refs(self, sqlite_session: Session) -> None:
        store = CredentialStore()
        record = store.create(
            sqlite_session,
            name="C",
            credential_type="t",
            data={"api_key": "sk-real", "secret": "s3cret"},
        )
        sqlite_session.commit()

        resolved = store.resolve_credential_refs(
            sqlite_session,
            credentials={
                "ref": f"credential://{record.id}",
                "plain": "literal-value",
            },
        )
        assert resolved["api_key"] == "sk-real"
        assert resolved["secret"] == "s3cret"
        assert resolved["plain"] == "literal-value"

    def test_resolve_runtime_credential_refs_returns_masked_handles_for_allow_masked(
        self,
        sqlite_session: Session,
    ) -> None:
        sensitive_access = SensitiveAccessControlService()
        store = CredentialStore(sensitive_access_service=sensitive_access)
        record = store.create(
            sqlite_session,
            name="Masked Credential",
            credential_type="api_key",
            data={"api_key": "sk-masked", "region": "us-east-1"},
            sensitivity_level="L2",
        )
        sqlite_session.commit()

        resolved = store.resolve_runtime_credential_refs(
            sqlite_session,
            credentials={"ref": f"credential://{record.id}", "plain": "literal-value"},
            run_id=None,
            node_run_id=None,
            requester_type="tool",
            requester_id="tool-node",
            action_type="use",
        )

        assert resolved["plain"] == "literal-value"
        assert resolved["api_key"] == f"credential+masked://{record.id}#api_key"
        assert resolved["region"] == f"credential+masked://{record.id}#region"

        final_credentials = store.resolve_masked_runtime_credentials(
            sqlite_session,
            credentials=resolved,
            requester_type="tool",
            requester_id="tool-node",
        )

        assert final_credentials == {
            "plain": "literal-value",
            "api_key": "sk-masked",
            "region": "us-east-1",
        }

        audit_events = store.list_audit_events(
            sqlite_session,
            credential_id=record.id,
            limit=10,
        )
        assert [event.action for event in audit_events[:3]] == [
            "decrypted",
            "masked_handle_issued",
            "created",
        ]
        assert audit_events[0].actor_type == "tool"
        assert audit_events[0].actor_id == "tool-node"
        assert audit_events[0].run_id is None
        assert audit_events[0].metadata_payload == {"field_names": ["api_key", "region"]}
        assert audit_events[1].metadata_payload == {
            "action_type": "use",
            "purpose_text": None,
            "field_names": ["api_key", "region"],
        }

    def test_resolve_runtime_credential_refs_records_pending_approval_audit_event(
        self,
        sqlite_session: Session,
    ) -> None:
        sensitive_access = SensitiveAccessControlService()
        store = CredentialStore(sensitive_access_service=sensitive_access)
        record = store.create(
            sqlite_session,
            name="High Sensitivity Credential",
            credential_type="api_key",
            data={"api_key": "sk-sensitive"},
            sensitivity_level="L3",
        )
        sqlite_session.commit()

        with pytest.raises(CredentialAccessPendingError, match="approval is still pending"):
            store.resolve_runtime_credential_refs(
                sqlite_session,
                credentials={"auth": f"credential://{record.id}"},
                run_id=None,
                node_run_id=None,
                requester_type="tool",
                requester_id="tool-node",
                action_type="use",
                purpose_text="Need privileged credential for runtime access.",
            )

        audit_events = store.list_audit_events(
            sqlite_session,
            credential_id=record.id,
            limit=5,
        )
        assert audit_events[0].action == "approval_pending"
        assert audit_events[0].actor_type == "tool"
        assert audit_events[0].actor_id == "tool-node"
        assert audit_events[0].run_id is None
        assert audit_events[0].node_run_id is None
        assert audit_events[0].metadata_payload["action_type"] == "use"
        assert audit_events[0].metadata_payload["purpose_text"] == (
            "Need privileged credential for runtime access."
        )
        assert audit_events[0].metadata_payload["approval_ticket_id"]

    def test_resolve_runtime_credential_refs_records_denied_audit_event(
        self,
        sqlite_session: Session,
    ) -> None:
        sensitive_access = SensitiveAccessControlService()
        store = CredentialStore(sensitive_access_service=sensitive_access)
        record = store.create(
            sqlite_session,
            name="High Sensitivity Export Credential",
            credential_type="api_key",
            data={"api_key": "sk-sensitive-export"},
            sensitivity_level="L3",
        )
        sqlite_session.commit()

        with pytest.raises(CredentialStoreError, match="deny_non_human_high_sensitive_mutation"):
            store.resolve_runtime_credential_refs(
                sqlite_session,
                credentials={"auth": f"credential://{record.id}"},
                run_id=None,
                node_run_id=None,
                requester_type="tool",
                requester_id="tool-node",
                action_type="export",
                purpose_text="Attempt export.",
            )

        audit_events = store.list_audit_events(
            sqlite_session,
            credential_id=record.id,
            limit=5,
        )
        assert audit_events[0].action == "access_denied"
        assert audit_events[0].actor_type == "tool"
        assert audit_events[0].actor_id == "tool-node"
        assert audit_events[0].run_id is None
        assert audit_events[0].node_run_id is None
        assert audit_events[0].metadata_payload == {
            "action_type": "export",
            "purpose_text": "Attempt export.",
            "reason_code": "deny_non_human_high_sensitive_mutation",
        }

    def test_resolve_empty_ref_raises(self, sqlite_session: Session) -> None:
        store = CredentialStore()
        with pytest.raises(CredentialStoreError, match="empty ID"):
            store.resolve_credential_refs(sqlite_session, credentials={"ref": "credential://"})


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------


class TestCredentialRoutes:
    @pytest.fixture(autouse=True)
    def _patch_encryption(self):
        with patch(
            "app.services.credential_encryption.get_settings",
            return_value=_make_settings(),
        ):
            yield

    @pytest.fixture(autouse=True)
    def _setup_headers(self, auth_headers: dict, write_headers: dict) -> None:
        self._auth = auth_headers
        self._write = write_headers

    def test_create_credential(self, client: TestClient, sqlite_session: Session) -> None:
        resp = client.post(
            "/api/credentials",
            json={
                "name": "Test Key",
                "credential_type": "api_key",
                "data": {"api_key": "sk-test"},
                "description": "A test credential",
            },
            headers=self._write,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "Test Key"
        assert body["credential_type"] == "api_key"
        assert body["status"] == "active"
        assert "data_keys" in body
        assert body["data_keys"] == ["api_key"]
        assert body["sensitivity_level"] == "L2"
        assert body["sensitive_resource_id"]

        resource = CredentialStore().get_sensitive_resource(
            sqlite_session,
            credential_id=body["id"],
        )
        assert resource is not None
        assert resource.sensitivity_level == "L2"

    def test_create_credential_accepts_explicit_sensitivity_level(
        self,
        client: TestClient,
    ) -> None:
        resp = client.post(
            "/api/credentials",
            json={
                "name": "Privileged Key",
                "credential_type": "api_key",
                "data": {"api_key": "sk-privileged"},
                "sensitivity_level": "L3",
            },
            headers=self._write,
        )

        assert resp.status_code == 201
        assert resp.json()["sensitivity_level"] == "L3"

    def test_list_credentials(self, client: TestClient) -> None:
        client.post(
            "/api/credentials",
            json={"name": "C1", "credential_type": "t", "data": {"k": "v"}},
            headers=self._write,
        )
        client.post(
            "/api/credentials",
            json={"name": "C2", "credential_type": "t", "data": {"k": "v"}},
            headers=self._write,
        )

        resp = client.get("/api/credentials", headers=self._auth)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_get_credential(self, client: TestClient) -> None:
        create_resp = client.post(
            "/api/credentials",
            json={"name": "C", "credential_type": "t", "data": {"k": "v"}},
            headers=self._write,
        )
        cid = create_resp.json()["id"]

        resp = client.get(f"/api/credentials/{cid}", headers=self._auth)
        assert resp.status_code == 200
        assert resp.json()["id"] == cid
        assert resp.json()["data_keys"] == ["k"]

    def test_get_credential_not_found(self, client: TestClient) -> None:
        resp = client.get("/api/credentials/nonexistent", headers=self._auth)
        assert resp.status_code == 404

    def test_update_credential(self, client: TestClient) -> None:
        create_resp = client.post(
            "/api/credentials",
            json={"name": "Old", "credential_type": "t", "data": {"k": "v"}},
            headers=self._write,
        )
        cid = create_resp.json()["id"]

        resp = client.put(
            f"/api/credentials/{cid}",
            json={"name": "New", "data": {"new_key": "new_val"}},
            headers=self._write,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New"
        assert resp.json()["data_keys"] == ["new_key"]

    def test_update_credential_can_change_sensitivity_level(
        self,
        client: TestClient,
    ) -> None:
        create_resp = client.post(
            "/api/credentials",
            json={"name": "Ops", "credential_type": "t", "data": {"k": "v"}},
            headers=self._write,
        )
        cid = create_resp.json()["id"]

        resp = client.put(
            f"/api/credentials/{cid}",
            json={"sensitivity_level": "L3"},
            headers=self._write,
        )

        assert resp.status_code == 200
        assert resp.json()["sensitivity_level"] == "L3"

    def test_revoke_credential(self, client: TestClient) -> None:
        create_resp = client.post(
            "/api/credentials",
            json={"name": "C", "credential_type": "t", "data": {"k": "v"}},
            headers=self._write,
        )
        cid = create_resp.json()["id"]

        resp = client.delete(f"/api/credentials/{cid}", headers=self._write)
        assert resp.status_code == 200
        assert resp.json()["status"] == "revoked"

    def test_revoked_excluded_from_list(self, client: TestClient) -> None:
        create_resp = client.post(
            "/api/credentials",
            json={"name": "C", "credential_type": "t", "data": {"k": "v"}},
            headers=self._write,
        )
        cid = create_resp.json()["id"]
        client.delete(f"/api/credentials/{cid}", headers=self._write)

        resp = client.get("/api/credentials", headers=self._auth)
        assert len(resp.json()) == 0

        resp = client.get("/api/credentials?include_revoked=true", headers=self._auth)
        assert len(resp.json()) == 1

    def test_list_credential_activity_returns_recent_audit_entries(
        self,
        client: TestClient,
    ) -> None:
        create_resp = client.post(
            "/api/credentials",
            json={
                "name": "Audit Key",
                "credential_type": "api_key",
                "data": {"api_key": "sk-audit"},
                "description": "first version",
            },
            headers=self._write,
        )
        credential_id = create_resp.json()["id"]

        update_resp = client.put(
            f"/api/credentials/{credential_id}",
            json={
                "description": "second version",
                "data": {"api_key": "sk-audit-2", "region": "us-east-1"},
            },
            headers=self._write,
        )
        assert update_resp.status_code == 200

        revoke_resp = client.delete(f"/api/credentials/{credential_id}", headers=self._write)
        assert revoke_resp.status_code == 200

        resp = client.get(
            f"/api/credentials/activity?credential_id={credential_id}&limit=2",
            headers=self._auth,
        )

        assert resp.status_code == 200
        body = resp.json()
        assert [entry["action"] for entry in body] == ["revoked", "updated"]
        assert body[0]["credential_id"] == credential_id
        assert body[0]["summary"] == (
            "control_plane:credentials_api 吊销了凭证，后续 runtime 不再允许解密。"
        )
        assert body[1]["summary"] == (
            "control_plane:credentials_api 更新了 description、data，并重写字段 api_key、region。"
        )
        assert body[1]["metadata"] == {
            "changed_fields": ["description", "data"],
            "data_keys": ["api_key", "region"],
        }

    def test_credential_sensitive_resource_exposes_governance_summary(
        self,
        client: TestClient,
    ) -> None:
        create_resp = client.post(
            "/api/credentials",
            json={
                "name": "Privileged Key",
                "credential_type": "api_key",
                "data": {"api_key": "sk-privileged"},
                "sensitivity_level": "L3",
            },
            headers=self._write,
        )

        assert create_resp.status_code == 201
        body = create_resp.json()

        resources_resp = client.get(
            "/api/sensitive-access/resources",
            params={"sensitivity_level": "L3"},
            headers=self._auth,
        )

        assert resources_resp.status_code == 200
        resources = resources_resp.json()
        resource = next(item for item in resources if item["id"] == body["sensitive_resource_id"])
        assert resource["credential_governance"] == {
            "credential_id": body["id"],
            "credential_name": "Privileged Key",
            "credential_type": "api_key",
            "credential_status": "active",
            "sensitivity_level": "L3",
            "sensitive_resource_id": body["sensitive_resource_id"],
            "sensitive_resource_label": "Credential · Privileged Key",
            "credential_ref": f"credential://{body['id']}",
            "summary": "本次命中的凭据是 Privileged Key（api_key）；当前治理级别 L3，状态 生效中。",
        }

    def test_create_rejects_extra_fields(self, client: TestClient) -> None:
        resp = client.post(
            "/api/credentials",
            json={
                "name": "C",
                "credential_type": "t",
                "data": {"k": "v"},
                "unexpected_field": "bad",
            },
            headers=self._write,
        )
        assert resp.status_code == 422

    def test_create_rejects_empty_name(self, client: TestClient) -> None:
        resp = client.post(
            "/api/credentials",
            json={"name": "", "credential_type": "t", "data": {"k": "v"}},
            headers=self._write,
        )
        assert resp.status_code == 422

    def test_create_rejects_empty_data(self, client: TestClient) -> None:
        resp = client.post(
            "/api/credentials",
            json={"name": "C", "credential_type": "t", "data": {}},
            headers=self._write,
        )
        assert resp.status_code == 422
