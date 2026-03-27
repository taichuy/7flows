from fastapi.testclient import TestClient


def _login(client: TestClient, *, email: str, password: str) -> dict:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_default_admin_login_and_session(client: TestClient) -> None:
    login_body = _login(
        client,
        email="admin@taichuy.com",
        password="admin123",
    )

    assert login_body["workspace"]["id"] == "default"
    assert login_body["current_user"]["email"] == "admin@taichuy.com"
    assert login_body["current_member"]["role"] == "owner"
    assert set(login_body["available_roles"]) == {"owner", "admin", "editor", "viewer"}

    session_response = client.get(
        "/api/auth/session",
        headers=_auth_headers(login_body["token"]),
    )
    assert session_response.status_code == 200
    session_body = session_response.json()
    assert session_body["current_user"]["display_name"] == "7Flows Admin"

    context_response = client.get(
        "/api/workspace/context",
        headers=_auth_headers(login_body["token"]),
    )
    assert context_response.status_code == 200
    context_body = context_response.json()
    assert context_body["can_manage_members"] is True
    assert context_body["workspace"]["name"] == "7Flows Workspace"


def test_workspace_owner_can_create_and_update_members(client: TestClient) -> None:
    owner_login = _login(client, email="admin@taichuy.com", password="admin123")
    owner_headers = _auth_headers(owner_login["token"])

    create_response = client.post(
        "/api/workspace/members",
        headers=owner_headers,
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

    members_response = client.get("/api/workspace/members", headers=owner_headers)
    assert members_response.status_code == 200
    members_body = members_response.json()
    assert len(members_body) == 2

    update_response = client.patch(
        f"/api/workspace/members/{created_member['id']}",
        headers=owner_headers,
        json={"role": "admin"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["role"] == "admin"


def test_non_admin_member_cannot_manage_workspace_members(client: TestClient) -> None:
    owner_login = _login(client, email="admin@taichuy.com", password="admin123")
    owner_headers = _auth_headers(owner_login["token"])
    create_response = client.post(
        "/api/workspace/members",
        headers=owner_headers,
        json={
            "email": "viewer@taichuy.com",
            "display_name": "Viewer User",
            "password": "viewer123",
            "role": "viewer",
        },
    )
    assert create_response.status_code == 201

    viewer_login = _login(client, email="viewer@taichuy.com", password="viewer123")
    viewer_headers = _auth_headers(viewer_login["token"])

    forbidden_response = client.post(
        "/api/workspace/members",
        headers=viewer_headers,
        json={
            "email": "blocked@taichuy.com",
            "display_name": "Blocked User",
            "password": "blocked123",
            "role": "editor",
        },
    )
    assert forbidden_response.status_code == 403
    assert forbidden_response.json()["detail"] == "当前账号没有成员管理权限。"


def test_login_rejects_invalid_password(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@taichuy.com", "password": "wrongpass"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "邮箱或密码错误。"
