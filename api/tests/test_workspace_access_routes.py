import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.workspace_access import AuthSessionRecord, ExternalIdentityBindingRecord
from app.services.workspace_access import (
    AuthenticationError,
    AuthorizationError,
    WorkspaceAccessContext,
    can_access,
    ensure_console_route_access,
    get_workspace_access_context,
    get_workspace_csrf_cookie_name,
    get_workspace_csrf_header_name,
    get_workspace_oidc_state_cookie_name,
    resolve_external_identity_binding,
)
from tests.workspace_auth_helpers import issue_workspace_console_auth


def _login(client: TestClient, *, email: str, password: str) -> dict:
    return issue_workspace_console_auth(client, email=email, password=password)


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _csrf_headers(login_body: dict) -> dict[str, str]:
    return {login_body["cookie_contract"]["csrf_header_name"]: login_body["csrf_token"]}


def _external_identity_context(resolved_identity) -> WorkspaceAccessContext:
    now = datetime.now(UTC)
    return WorkspaceAccessContext(
        session=AuthSessionRecord(
            token="oidc-binding-test-session",
            user_id=resolved_identity.user.id,
            workspace_id=resolved_identity.workspace.id,
            created_at=now,
            expires_at=now + timedelta(minutes=30),
        ),
        workspace=resolved_identity.workspace,
        user=resolved_identity.user,
        member=resolved_identity.member,
    )


def _build_oidc_settings():
    return SimpleNamespace(
        secret_key="oidc-test-secret",
        env="test",
        oidc_enabled=True,
        oidc_provider="zitadel",
        oidc_issuer="https://zitadel.example.com",
        oidc_client_id="sevenflows-web",
        oidc_client_secret="sevenflows-secret",
        oidc_redirect_uri="http://testserver/api/auth/callback",
        oidc_scopes="openid profile email",
        zitadel_service_user_token="zitadel-service-token",
    )


def _build_oidc_signing_materials() -> tuple[bytes, dict[str, object]]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key()))
    public_jwk["kid"] = "zitadel-test-key"
    return private_key_pem, {"keys": [public_jwk]}


def _install_oidc_mocks(
    monkeypatch: pytest.MonkeyPatch,
    *,
    email: str = "admin@taichuy.com",
    email_verified: bool = True,
    subject: str = "zitadel-admin-subject",
):
    settings = _build_oidc_settings()
    private_key_pem, jwks_payload = _build_oidc_signing_materials()
    runtime = {"nonce": None}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/.well-known/openid-configuration"):
            return httpx.Response(
                200,
                json={
                    "issuer": settings.oidc_issuer,
                    "authorization_endpoint": f"{settings.oidc_issuer}/oauth/v2/authorize",
                    "token_endpoint": f"{settings.oidc_issuer}/oauth/v2/token",
                    "jwks_uri": f"{settings.oidc_issuer}/oauth/v2/keys",
                },
            )

        if request.url.path.endswith("/oauth/v2/token"):
            assert request.method == "POST"
            claims = {
                "iss": settings.oidc_issuer,
                "sub": subject,
                "aud": settings.oidc_client_id,
                "exp": int((datetime.now(UTC) + timedelta(minutes=5)).timestamp()),
                "iat": int(datetime.now(UTC).timestamp()),
                "email": email,
                "email_verified": email_verified,
                "nonce": runtime["nonce"],
            }
            return httpx.Response(
                200,
                json={
                    "access_token": "zitadel-access-token",
                    "token_type": "Bearer",
                    "expires_in": 300,
                    "id_token": jwt.encode(
                        claims,
                        private_key_pem,
                        algorithm="RS256",
                        headers={"kid": "zitadel-test-key"},
                    ),
                },
            )

        if request.url.path.endswith("/oauth/v2/keys"):
            return httpx.Response(200, json=jwks_payload)

        raise AssertionError(f"unexpected OIDC request: {request.method} {request.url}")

    monkeypatch.setattr("app.services.workspace_access.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.services.workspace_access.default_workspace_oidc_http_client_factory",
        lambda: httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=True),
    )
    return settings, runtime


def _install_zitadel_password_login_mocks(
    monkeypatch: pytest.MonkeyPatch,
    *,
    login_name: str = "admin@taichuy.com",
    password: str = "zitadel-admin-pass",
    user_id: str = "zitadel-admin-user",
    email: str = "admin@taichuy.com",
    email_verified: bool = True,
    display_name: str = "7Flows Admin",
):
    settings = _build_oidc_settings()
    issued_session_id = "zitadel-session-id"

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("authorization") == (
            f"Bearer {settings.zitadel_service_user_token}"
        )

        if request.method == "POST" and request.url.path.endswith("/v2/sessions"):
            payload = json.loads(request.content.decode())
            assert payload["checks"]["user"]["loginName"] == login_name
            return httpx.Response(200, json={"sessionId": issued_session_id})

        if request.method == "PATCH" and request.url.path.endswith(
            f"/v2/sessions/{issued_session_id}"
        ):
            payload = json.loads(request.content.decode())
            if payload["checks"]["password"]["password"] != password:
                return httpx.Response(400, json={"message": "invalid password"})
            return httpx.Response(200, json={"sessionId": issued_session_id})

        if request.method == "GET" and request.url.path.endswith(
            f"/v2/sessions/{issued_session_id}"
        ):
            return httpx.Response(
                200,
                json={
                    "session": {
                        "id": issued_session_id,
                        "factors": {
                            "user": {
                                "id": user_id,
                                "loginName": login_name,
                                "displayName": display_name,
                            },
                            "password": {
                                "verifiedAt": "2026-04-04T00:00:00Z",
                            },
                        },
                    }
                },
            )

        if request.method == "GET" and request.url.path.endswith(f"/v2/users/{user_id}"):
            return httpx.Response(
                200,
                json={
                    "user": {
                        "id": user_id,
                        "loginName": login_name,
                        "preferredLoginName": email,
                        "human": {
                            "email": {
                                "email": email,
                                "isVerified": email_verified,
                            }
                        },
                    }
                },
            )

        raise AssertionError(f"unexpected ZITADEL request: {request.method} {request.url}")

    monkeypatch.setattr("app.services.workspace_access.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.services.workspace_access.default_workspace_oidc_http_client_factory",
        lambda: httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=True),
    )
    return settings


def test_default_admin_login_and_session_contract(client: TestClient) -> None:
    login_body = _login(
        client,
        email="admin@taichuy.com",
        password="admin123",
    )

    assert login_body["token_type"] == "bearer"
    assert login_body["workspace"]["id"] == "default"
    assert login_body["current_user"]["email"] == "admin@taichuy.com"
    assert login_body["current_member"]["role"] == "owner"
    assert login_body["token"] == login_body["access_token"]
    assert login_body["refresh_token"]
    assert login_body["csrf_token"]
    assert set(login_body["available_roles"]) == {"owner", "admin", "editor", "viewer"}
    assert login_body["cookie_contract"]["csrf_header_name"] == "X-CSRF-Token"
    assert any(
        item["route"] == "/api/workspace/members/{member_id}" and item["access_level"] == "manager"
        for item in login_body["route_permissions"]
    )
    assert any(
        item["route"] == "/api/workspace/members"
        and item["access_level"] == "authenticated"
        and item["methods"] == ["GET"]
        for item in login_body["route_permissions"]
    )
    assert any(
        item["route"] == "/api/workspace/members"
        and item["access_level"] == "manager"
        and item["methods"] == ["POST"]
        for item in login_body["route_permissions"]
    )
    assert any(
        item["route"] == "/api/workspace/model-providers/settings"
        and item["access_level"] == "manager"
        and item["methods"] == ["GET"]
        for item in login_body["route_permissions"]
    )
    assert any(
        item["route"] == "/api/workflows/{workflow_id}/detail"
        and item["access_level"] == "authenticated"
        and item["methods"] == ["GET"]
        for item in login_body["route_permissions"]
    )
    assert any(
        item["route"] == "/api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations"
        and item["access_level"] == "authenticated"
        and item["methods"] == ["GET"]
        for item in login_body["route_permissions"]
    )
    assert any(
        item["route"] == "/api/runs/{run_id}/execution-view"
        and item["access_level"] == "authenticated"
        and item["methods"] == ["GET"]
        for item in login_body["route_permissions"]
    )

    access_cookie_name = login_body["cookie_contract"]["access_token_cookie_name"]
    refresh_cookie_name = login_body["cookie_contract"]["refresh_token_cookie_name"]
    csrf_cookie_name = login_body["cookie_contract"]["csrf_token_cookie_name"]
    assert client.cookies.get(access_cookie_name) == login_body["access_token"]
    assert client.cookies.get(refresh_cookie_name) == login_body["refresh_token"]
    assert client.cookies.get(csrf_cookie_name) == login_body["csrf_token"]

    session_response = client.get("/api/auth/session")
    assert session_response.status_code == 200
    session_body = session_response.json()
    assert session_body["current_user"]["display_name"] == "7Flows Admin"
    assert session_body["access_token"] is None
    assert session_body["cookie_contract"]["access_token_cookie_name"] == access_cookie_name

    bearer_session_response = client.get(
        "/api/auth/session",
        headers=_auth_headers(login_body["access_token"]),
    )
    assert bearer_session_response.status_code == 200

    context_response = client.get("/api/workspace/context")
    assert context_response.status_code == 200
    context_body = context_response.json()
    assert context_body["can_manage_members"] is True
    assert context_body["workspace"]["name"] == "7Flows Workspace"
    assert len(context_body["route_permissions"]) >= 5


def test_zitadel_password_login_issues_existing_workspace_session_contract(
    client: TestClient,
    sqlite_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _install_zitadel_password_login_mocks(monkeypatch)

    response = client.post(
        "/api/auth/zitadel/login",
        json={"login_name": "admin@taichuy.com", "password": "zitadel-admin-pass"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["current_user"]["email"] == "admin@taichuy.com"
    assert body["current_member"]["role"] == "owner"
    assert body["cookie_contract"]["access_token_cookie_name"] in client.cookies
    assert body["cookie_contract"]["refresh_token_cookie_name"] in client.cookies
    assert body["cookie_contract"]["csrf_token_cookie_name"] in client.cookies

    session_response = client.get("/api/auth/session")
    assert session_response.status_code == 200
    assert session_response.json()["current_user"]["email"] == "admin@taichuy.com"

    bindings = sqlite_session.scalars(select(ExternalIdentityBindingRecord)).all()
    assert len(bindings) == 1
    assert bindings[0].provider == settings.oidc_provider
    assert bindings[0].subject == "zitadel-admin-user"


def test_zitadel_password_login_does_not_require_full_oidc_client_config(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _install_zitadel_password_login_mocks(monkeypatch)
    settings.oidc_enabled = False
    settings.oidc_client_id = ""
    settings.oidc_client_secret = ""
    settings.oidc_redirect_uri = ""

    response = client.post(
        "/api/auth/zitadel/login",
        json={"login_name": "admin@taichuy.com", "password": "zitadel-admin-pass"},
    )

    assert response.status_code == 200
    assert response.json()["current_user"]["email"] == "admin@taichuy.com"


def test_zitadel_password_login_requires_service_token(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _build_oidc_settings()
    settings.zitadel_service_user_token = ""
    monkeypatch.setattr("app.services.workspace_access.get_settings", lambda: settings)

    response = client.post(
        "/api/auth/zitadel/login",
        json={"login_name": "admin@taichuy.com", "password": "zitadel-admin-pass"},
    )

    assert response.status_code == 503
    assert response.json()["code"] == "auth_provider_unavailable"
    assert response.json()["detail"] == "ZITADEL 账号密码登录缺少 service user token 配置。"


def test_zitadel_password_login_requires_issuer(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _build_oidc_settings()
    settings.oidc_issuer = ""
    monkeypatch.setattr("app.services.workspace_access.get_settings", lambda: settings)

    response = client.post(
        "/api/auth/zitadel/login",
        json={"login_name": "admin@taichuy.com", "password": "zitadel-admin-pass"},
    )

    assert response.status_code == 503
    assert response.json()["code"] == "auth_provider_unavailable"
    assert response.json()["detail"] == "ZITADEL 账号密码登录缺少 issuer 配置。"


def test_zitadel_password_login_reports_provider_init_failures_as_restful_json(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _build_oidc_settings()
    monkeypatch.setattr("app.services.workspace_access.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.services.workspace_access.httpx.Client",
        lambda **_: (_ for _ in ()).throw(ValueError("Unknown scheme for proxy URL")),
    )

    response = client.post(
        "/api/auth/zitadel/login",
        json={"login_name": "admin@taichuy.com", "password": "zitadel-admin-pass"},
    )

    assert response.status_code == 503
    body = response.json()
    assert body["code"] == "auth_provider_unavailable"
    assert body["detail"] == "认证服务初始化失败，请检查代理配置。"
    assert body["message"] == body["detail"]


def test_zitadel_password_login_reports_validation_failures_as_restful_json(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/auth/zitadel/login",
        json={"email": "admin@taichuy.com", "password": "admin123"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "auth_invalid_request"
    assert body["detail"] == "认证请求参数无效，请检查请求内容。"
    assert body["message"] == body["detail"]
    assert body["errors"][0]["field"] == "login_name"
    assert body["errors"][0]["type"] == "missing"


def test_public_auth_options_report_unavailable_when_remote_auth_is_incomplete(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _build_oidc_settings()
    settings.oidc_client_id = ""
    settings.oidc_client_secret = ""
    settings.zitadel_service_user_token = ""
    monkeypatch.setattr("app.services.workspace_access.get_settings", lambda: settings)

    response = client.get("/api/auth/options")

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "zitadel"
    assert body["recommended_method"] == "unavailable"
    assert body["zitadel_password"]["enabled"] is False
    assert (
        body["zitadel_password"]["reason"]
        == "ZITADEL 账号密码登录配置缺失：service user token。"
    )
    assert body["oidc_redirect"]["enabled"] is False
    assert body["oidc_redirect"]["reason"] == "OIDC 配置缺失：client_id, client_secret。"


def test_public_auth_options_prefer_zitadel_password_when_full_remote_auth_config_exists(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _build_oidc_settings()
    monkeypatch.setattr("app.services.workspace_access.get_settings", lambda: settings)

    response = client.get("/api/auth/options")

    assert response.status_code == 200
    body = response.json()
    assert body["recommended_method"] == "zitadel_password"
    assert body["zitadel_password"]["enabled"] is True
    assert body["oidc_redirect"]["enabled"] is True


def test_public_auth_options_fall_back_to_oidc_when_password_login_is_not_configured(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _build_oidc_settings()
    settings.zitadel_service_user_token = ""
    monkeypatch.setattr("app.services.workspace_access.get_settings", lambda: settings)

    response = client.get("/api/auth/options")

    assert response.status_code == 200
    body = response.json()
    assert body["recommended_method"] == "oidc_redirect"
    assert body["oidc_redirect"]["enabled"] is True
    assert body["zitadel_password"]["enabled"] is False


def test_refresh_issues_new_access_and_csrf_tokens(client: TestClient) -> None:
    login_body = _login(client, email="admin@taichuy.com", password="admin123")

    refresh_response = client.post(
        "/api/auth/refresh",
        headers=_csrf_headers(login_body),
    )
    assert refresh_response.status_code == 200
    refresh_body = refresh_response.json()
    assert refresh_body["access_token"]
    assert refresh_body["csrf_token"]
    assert refresh_body["access_token"] != login_body["access_token"]
    assert refresh_body["csrf_token"] != login_body["csrf_token"]
    assert refresh_body["expires_at"].removesuffix("Z") == login_body["expires_at"].removesuffix(
        "Z"
    )


def test_external_identity_binding_can_bind_existing_workspace_member(sqlite_session) -> None:
    resolved_identity = resolve_external_identity_binding(
        sqlite_session,
        provider="zitadel",
        subject="oidc-admin-subject",
        email="admin@taichuy.com",
        email_verified=True,
    )

    persisted_bindings = sqlite_session.scalars(select(ExternalIdentityBindingRecord)).all()
    assert len(persisted_bindings) == 1
    binding = persisted_bindings[0]
    assert binding.provider == "zitadel"
    assert binding.subject == "oidc-admin-subject"
    assert binding.user_id == resolved_identity.user.id
    assert resolved_identity.member.role == "owner"
    assert (
        can_access(
            _external_identity_context(resolved_identity),
            action="manage",
            resource="workspace",
        )
        is True
    )


def test_external_identity_binding_reuses_existing_subject_mapping(sqlite_session) -> None:
    first_resolution = resolve_external_identity_binding(
        sqlite_session,
        provider="zitadel",
        subject="oidc-admin-existing-subject",
        email="admin@taichuy.com",
        email_verified=True,
    )

    second_resolution = resolve_external_identity_binding(
        sqlite_session,
        provider="zitadel",
        subject="oidc-admin-existing-subject",
    )

    persisted_bindings = sqlite_session.scalars(select(ExternalIdentityBindingRecord)).all()
    assert len(persisted_bindings) == 1
    assert second_resolution.binding.id == first_resolution.binding.id
    assert second_resolution.user.id == first_resolution.user.id


def test_external_identity_binding_requires_verified_email_for_first_link(sqlite_session) -> None:
    with pytest.raises(AuthenticationError, match="可信邮箱绑定"):
        resolve_external_identity_binding(
            sqlite_session,
            provider="zitadel",
            subject="oidc-admin-unverified",
            email="admin@taichuy.com",
            email_verified=False,
        )


def test_oidc_start_redirects_to_provider_and_sets_state_cookie(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings, runtime = _install_oidc_mocks(monkeypatch)

    response = client.get(
        "/api/auth/oidc/start",
        params={"next": "/workspace"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    location = response.headers["location"]
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    assert location.startswith(f"{settings.oidc_issuer}/oauth/v2/authorize")
    assert query["client_id"] == [settings.oidc_client_id]
    assert query["redirect_uri"] == [settings.oidc_redirect_uri]
    assert query["scope"] == [settings.oidc_scopes]
    assert query["state"]
    assert query["nonce"]
    runtime["nonce"] = query["nonce"][0]
    assert client.cookies.get(get_workspace_oidc_state_cookie_name()) == query["state"][0]


def test_oidc_start_reports_provider_init_failures_as_restful_json(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _build_oidc_settings()
    monkeypatch.setattr("app.services.workspace_access.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.services.workspace_access.httpx.Client",
        lambda **_: (_ for _ in ()).throw(ValueError("Unknown scheme for proxy URL")),
    )

    response = client.get(
        "/api/auth/oidc/start",
        params={"next": "/workspace"},
        follow_redirects=False,
    )

    assert response.status_code == 503
    body = response.json()
    assert body["code"] == "auth_provider_unavailable"
    assert body["detail"] == "认证服务初始化失败，请检查代理配置。"
    assert body["message"] == body["detail"]


def test_oidc_start_reports_missing_config_as_provider_unavailable(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _build_oidc_settings()
    settings.oidc_client_id = ""
    settings.oidc_client_secret = ""
    monkeypatch.setattr("app.services.workspace_access.get_settings", lambda: settings)

    response = client.get(
        "/api/auth/oidc/start",
        params={"next": "/workspace"},
        follow_redirects=False,
    )

    assert response.status_code == 503
    body = response.json()
    assert body["code"] == "auth_provider_unavailable"
    assert body["detail"] == "OIDC 配置缺失：client_id, client_secret。"
    assert body["message"] == body["detail"]


def test_oidc_callback_issues_existing_workspace_session_contract(
    client: TestClient,
    sqlite_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings, runtime = _install_oidc_mocks(monkeypatch)

    start_response = client.get(
        "/api/auth/oidc/start",
        params={"next": "/workspace"},
        follow_redirects=False,
    )
    start_query = parse_qs(urlparse(start_response.headers["location"]).query)
    runtime["nonce"] = start_query["nonce"][0]
    state_token = start_query["state"][0]

    callback_response = client.get(
        "/api/auth/callback",
        params={"code": "oidc-good-code", "state": state_token},
        follow_redirects=False,
    )

    assert callback_response.status_code == 303
    assert callback_response.headers["location"] == "/workspace"
    assert client.cookies.get(get_workspace_oidc_state_cookie_name()) is None

    session_response = client.get("/api/auth/session")
    assert session_response.status_code == 200
    session_body = session_response.json()
    assert session_body["current_user"]["email"] == "admin@taichuy.com"
    assert session_body["current_member"]["role"] == "owner"
    assert session_body["cookie_contract"]["access_token_cookie_name"] in client.cookies
    assert session_body["cookie_contract"]["refresh_token_cookie_name"] in client.cookies
    assert session_body["cookie_contract"]["csrf_token_cookie_name"] in client.cookies

    refresh_response = client.post(
        "/api/auth/refresh",
        headers={
            get_workspace_csrf_header_name(): str(
                client.cookies.get(get_workspace_csrf_cookie_name())
            )
        },
    )
    assert refresh_response.status_code == 200

    logout_response = client.post("/api/auth/logout")
    assert logout_response.status_code == 200
    assert logout_response.json() == {"ok": True}

    bindings = sqlite_session.scalars(select(ExternalIdentityBindingRecord)).all()
    assert len(bindings) == 1
    assert bindings[0].provider == settings.oidc_provider
    assert bindings[0].subject == "zitadel-admin-subject"


def test_oidc_callback_rejects_unverified_first_time_identity_binding(
    client: TestClient,
    sqlite_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, runtime = _install_oidc_mocks(
        monkeypatch,
        email="admin@taichuy.com",
        email_verified=False,
        subject="zitadel-unverified-subject",
    )

    start_response = client.get(
        "/api/auth/oidc/start",
        params={"next": "/workspace"},
        follow_redirects=False,
    )
    start_query = parse_qs(urlparse(start_response.headers["location"]).query)
    runtime["nonce"] = start_query["nonce"][0]
    state_token = start_query["state"][0]

    callback_response = client.get(
        "/api/auth/callback",
        params={"code": "oidc-unverified-code", "state": state_token},
        follow_redirects=False,
    )

    assert callback_response.status_code == 303
    assert callback_response.headers["location"] == "/login?error=oidc_callback_failed"
    assert client.cookies.get(get_workspace_oidc_state_cookie_name()) is None
    assert sqlite_session.scalars(select(ExternalIdentityBindingRecord)).all() == []

    session_response = client.get("/api/auth/session")
    assert session_response.status_code == 401


def test_workspace_member_writes_require_csrf_double_submit(client: TestClient) -> None:
    owner_login = _login(client, email="admin@taichuy.com", password="admin123")

    missing_csrf_response = client.post(
        "/api/workspace/members",
        json={
            "email": "editor@taichuy.com",
            "display_name": "Editor User",
            "password": "editor123",
            "role": "editor",
        },
    )
    assert missing_csrf_response.status_code == 403
    assert missing_csrf_response.json()["detail"] == "CSRF token 缺失或不匹配。"

    create_response = client.post(
        "/api/workspace/members",
        headers=_csrf_headers(owner_login),
        json={
            "email": "editor@taichuy.com",
            "display_name": "Editor User",
            "password": "editor123",
            "role": "editor",
        },
    )
    assert create_response.status_code == 201
    created_member = create_response.json()
    assert created_member["role"] == "editor"
    assert created_member["user"]["email"] == "editor@taichuy.com"

    members_response = client.get("/api/workspace/members")
    assert members_response.status_code == 200
    members_body = members_response.json()
    assert len(members_body) == 2

    update_response = client.patch(
        f"/api/workspace/members/{created_member['id']}",
        headers=_csrf_headers(owner_login),
        json={"role": "admin"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["role"] == "admin"


def test_non_admin_member_cannot_manage_workspace_members(client: TestClient) -> None:
    owner_login = _login(client, email="admin@taichuy.com", password="admin123")
    create_response = client.post(
        "/api/workspace/members",
        headers=_csrf_headers(owner_login),
        json={
            "email": "viewer@taichuy.com",
            "display_name": "Viewer User",
            "password": "viewer123",
            "role": "viewer",
        },
    )
    assert create_response.status_code == 201

    viewer_login = _login(client, email="viewer@taichuy.com", password="viewer123")
    forbidden_response = client.post(
        "/api/workspace/members",
        headers=_csrf_headers(viewer_login),
        json={
            "email": "blocked@taichuy.com",
            "display_name": "Blocked User",
            "password": "blocked123",
            "role": "editor",
        },
    )
    assert forbidden_response.status_code == 403
    assert forbidden_response.json()["detail"] == "当前账号没有成员管理权限。"


def test_console_route_access_resolver_covers_workflow_surface_contracts(
    client: TestClient,
    sqlite_session,
) -> None:
    owner_login = _login(client, email="admin@taichuy.com", password="admin123")
    owner_context = get_workspace_access_context(
        sqlite_session,
        token=owner_login["access_token"],
    )

    workflow_permission = ensure_console_route_access(
        owner_context,
        route="/api/workflows/{workflow_id}/detail",
        method="GET",
    )
    assert workflow_permission.access_level == "authenticated"
    assert can_access(owner_context, action="manage", resource="workspace") is True

    provider_settings_permission = ensure_console_route_access(
        owner_context,
        route="/api/workspace/model-providers/settings",
        method="GET",
    )
    assert provider_settings_permission.access_level == "manager"

    create_response = client.post(
        "/api/workspace/members",
        headers=_csrf_headers(owner_login),
        json={
            "email": "editor-route@taichuy.com",
            "display_name": "Editor Route",
            "password": "editor123",
            "role": "editor",
        },
    )
    assert create_response.status_code == 201

    create_response = client.post(
        "/api/workspace/members",
        headers=_csrf_headers(owner_login),
        json={
            "email": "viewer-route@taichuy.com",
            "display_name": "Viewer Route",
            "password": "viewer123",
            "role": "viewer",
        },
    )
    assert create_response.status_code == 201

    editor_login = _login(client, email="editor-route@taichuy.com", password="editor123")
    editor_context = get_workspace_access_context(
        sqlite_session,
        token=editor_login["access_token"],
    )
    viewer_login = _login(client, email="viewer-route@taichuy.com", password="viewer123")
    viewer_context = get_workspace_access_context(
        sqlite_session,
        token=viewer_login["access_token"],
    )

    assert can_access(editor_context, action="write", resource="workflow") is True
    assert can_access(editor_context, action="write", resource="run") is True
    assert can_access(editor_context, action="manage", resource="workspace") is False
    assert can_access(viewer_context, action="read", resource="workflow") is True
    assert can_access(viewer_context, action="debug", resource="run") is True
    assert can_access(viewer_context, action="write", resource="workflow") is False
    assert can_access(viewer_context, action="write", resource="run") is False

    ensure_console_route_access(
        editor_context,
        route="/api/workflows",
        method="POST",
    )
    ensure_console_route_access(
        editor_context,
        route="/api/workflows/{workflow_id}/validate-definition",
        method="POST",
    )
    ensure_console_route_access(
        editor_context,
        route="/api/workflows/{workflow_id}/runs",
        method="POST",
    )

    ensure_console_route_access(
        viewer_context,
        route="/api/workflows/{workflow_id}/detail",
        method="GET",
    )

    with pytest.raises(AuthorizationError, match="当前账号没有团队模型供应商管理权限。"):
        ensure_console_route_access(
            viewer_context,
            route="/api/workspace/model-providers/settings",
            method="GET",
        )

    with pytest.raises(AuthorizationError, match="当前账号没有访问该工作台路由的权限。"):
        ensure_console_route_access(
            viewer_context,
            route="/api/workflows",
            method="POST",
        )

    with pytest.raises(AuthorizationError, match="当前账号没有访问该工作台路由的权限。"):
        ensure_console_route_access(
            viewer_context,
            route="/api/workflows/{workflow_id}/runs",
            method="POST",
        )


def test_logout_revokes_current_session(client: TestClient) -> None:
    _login(client, email="admin@taichuy.com", password="admin123")

    logout_response = client.post("/api/auth/logout")
    assert logout_response.status_code == 200
    assert logout_response.json() == {"ok": True}

    session_response = client.get("/api/auth/session")
    assert session_response.status_code == 401
    assert session_response.json()["detail"] == "登录会话无效，请重新登录。"


def test_test_auth_helper_rejects_invalid_password(client: TestClient) -> None:
    with pytest.raises(AuthenticationError, match="邮箱或密码错误。"):
        issue_workspace_console_auth(client, email="admin@taichuy.com", password="wrongpass")


def test_local_password_login_route_is_not_registered(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@taichuy.com", "password": "admin123"},
    )
    assert response.status_code == 404
