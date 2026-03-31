import pytest
from fastapi.testclient import TestClient

from app.services.workspace_access import (
    AuthorizationError,
    ensure_console_route_access,
    get_workspace_access_context,
)


def _login(client: TestClient, *, email: str, password: str) -> dict:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _csrf_headers(login_body: dict) -> dict[str, str]:
    return {login_body["cookie_contract"]["csrf_header_name"]: login_body["csrf_token"]}


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
    assert refresh_body["expires_at"] == login_body["expires_at"]


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
            "email": "viewer-route@taichuy.com",
            "display_name": "Viewer Route",
            "password": "viewer123",
            "role": "viewer",
        },
    )
    assert create_response.status_code == 201

    viewer_login = _login(client, email="viewer-route@taichuy.com", password="viewer123")
    viewer_context = get_workspace_access_context(
        sqlite_session,
        token=viewer_login["access_token"],
    )

    ensure_console_route_access(
        viewer_context,
        route="/api/workflows/{workflow_id}/detail",
        method="GET",
    )

    with pytest.raises(AuthorizationError, match="当前账号没有访问该工作台路由的权限。"):
        ensure_console_route_access(
            viewer_context,
            route="/api/workspace/model-providers/settings",
            method="GET",
        )


def test_logout_revokes_current_session(client: TestClient) -> None:
    _login(client, email="admin@taichuy.com", password="admin123")

    logout_response = client.post("/api/auth/logout")
    assert logout_response.status_code == 200
    assert logout_response.json() == {"ok": True}

    session_response = client.get("/api/auth/session")
    assert session_response.status_code == 401
    assert session_response.json()["detail"] == "登录会话无效，请重新登录。"


def test_login_rejects_invalid_password(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@taichuy.com", "password": "wrongpass"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "邮箱或密码错误。"
