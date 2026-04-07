from __future__ import annotations

import base64
import hmac
import json
import os
import secrets
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Any, Literal

import httpx
import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.workflow import Workflow
from app.models.workspace_access import (
    AuthSessionRecord,
    ExternalIdentityBindingRecord,
    UserAccountRecord,
    WorkspaceMemberRecord,
    WorkspaceRecord,
)
from app.schemas.workspace_access import (
    ConsoleAuthCookieContract,
    ConsoleRoutePermissionItem,
    PublicAuthOptionItem,
    PublicAuthOptionsResponse,
)

DEFAULT_WORKSPACE_ID = "default"
DEFAULT_WORKSPACE_NAME = "7Flows Workspace"
DEFAULT_WORKSPACE_SLUG = "sevenflows"
DEFAULT_ADMIN_EMAIL = "admin@taichuy.com"
DEFAULT_ADMIN_NAME = "7Flows Admin"
DEFAULT_ADMIN_PASSWORD = "admin123"
WORKSPACE_MEMBER_ROLES = ["owner", "admin", "editor", "viewer"]
MANAGE_MEMBER_ROLES = {"owner", "admin"}
SESSION_TTL = timedelta(days=7)
ACCESS_TOKEN_TTL = timedelta(minutes=30)
CSRF_TOKEN_TTL = SESSION_TTL
TOKEN_PURPOSE_ACCESS = "access"
TOKEN_PURPOSE_REFRESH = "refresh"
TOKEN_PURPOSE_CSRF = "csrf"
ACCESS_TOKEN_COOKIE_BASE_NAME = "sevenflows_access_token"
REFRESH_TOKEN_COOKIE_BASE_NAME = "sevenflows_refresh_token"
CSRF_TOKEN_COOKIE_BASE_NAME = "sevenflows_csrf_token"
OIDC_STATE_COOKIE_BASE_NAME = "sevenflows_oidc_state"
CSRF_HEADER_NAME = "X-CSRF-Token"
COOKIE_SAME_SITE = "lax"
OIDC_STATE_TTL = timedelta(minutes=10)
OIDC_HTTP_TIMEOUT_SECONDS = 10.0
TOKEN_PURPOSE_OIDC_STATE = "oidc_state"
CONSOLE_ACCESS_LEVEL_RANK = {"guest": 0, "authenticated": 1, "manager": 2}
WorkspaceAccessResource = Literal[
    "workspace",
    "workflow",
    "run",
    "published_endpoint",
    "invocation",
    "sensitive_resource",
    "approval_ticket",
]
WorkspaceAccessAction = Literal["read", "write", "publish", "debug", "approve", "manage"]
_ROLE_RESOURCE_ACTIONS: dict[
    str, dict[WorkspaceAccessResource, frozenset[WorkspaceAccessAction]]
] = {
    "owner": {
        "workspace": frozenset({"read", "manage"}),
        "workflow": frozenset({"read", "write", "publish", "debug"}),
        "run": frozenset({"read", "write", "debug"}),
        "published_endpoint": frozenset({"read", "publish", "manage"}),
        "invocation": frozenset({"read", "debug"}),
        "sensitive_resource": frozenset({"read", "manage", "approve"}),
        "approval_ticket": frozenset({"read", "approve", "manage"}),
    },
    "admin": {
        "workspace": frozenset({"read", "manage"}),
        "workflow": frozenset({"read", "write", "publish", "debug"}),
        "run": frozenset({"read", "write", "debug"}),
        "published_endpoint": frozenset({"read", "publish", "manage"}),
        "invocation": frozenset({"read", "debug"}),
        "sensitive_resource": frozenset({"read", "manage", "approve"}),
        "approval_ticket": frozenset({"read", "approve", "manage"}),
    },
    "editor": {
        "workspace": frozenset({"read"}),
        "workflow": frozenset({"read", "write", "debug"}),
        "run": frozenset({"read", "write", "debug"}),
        "published_endpoint": frozenset({"read"}),
        "invocation": frozenset({"read", "debug"}),
        "sensitive_resource": frozenset({"read"}),
        "approval_ticket": frozenset({"read"}),
    },
    "viewer": {
        "workspace": frozenset({"read"}),
        "workflow": frozenset({"read"}),
        "run": frozenset({"read", "debug"}),
        "published_endpoint": frozenset({"read"}),
        "invocation": frozenset({"read"}),
        "sensitive_resource": frozenset(),
        "approval_ticket": frozenset(),
    },
}


class WorkspaceAccessError(Exception):
    pass


class AuthenticationError(WorkspaceAccessError):
    pass


class AuthorizationError(WorkspaceAccessError):
    pass


class ConflictError(WorkspaceAccessError):
    pass


class CsrfValidationError(WorkspaceAccessError):
    pass


@dataclass(slots=True)
class WorkspaceAccessContext:
    session: AuthSessionRecord
    workspace: WorkspaceRecord
    user: UserAccountRecord
    member: WorkspaceMemberRecord
    access_expires_at: datetime | None = None


@dataclass(slots=True)
class SignedTokenClaims:
    purpose: str
    session_id: str
    user_id: str
    workspace_id: str
    expires_at: datetime


@dataclass(slots=True)
class WorkspaceIssuedAuthTokens:
    access_token: str
    refresh_token: str
    csrf_token: str
    access_expires_at: datetime
    expires_at: datetime


@dataclass(slots=True)
class ZitadelAuthenticatedUser:
    subject: str
    login_name: str
    display_name: str | None = None


@dataclass(slots=True)
class ResolvedExternalIdentity:
    binding: ExternalIdentityBindingRecord
    workspace: WorkspaceRecord
    user: UserAccountRecord
    member: WorkspaceMemberRecord


@dataclass(frozen=True, slots=True)
class ConsoleRouteAccessPolicy:
    route: str
    access_level: str
    methods: tuple[str, ...]
    description: str
    csrf_protected_methods: tuple[str, ...] = ()
    resource: WorkspaceAccessResource | None = None
    action: WorkspaceAccessAction | None = None
    denied_message: str | None = None
    expose_in_contract: bool = True


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _generate_identifier() -> str:
    return str(uuid.uuid4())


def _generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def _normalize_role(role: str) -> str:
    normalized = role.strip().lower()
    if normalized not in WORKSPACE_MEMBER_ROLES:
        raise ConflictError("Unsupported workspace member role.")
    return normalized


def _build_password_hash(password: str) -> str:
    settings = get_settings()
    digest = sha256(f"{settings.secret_key}:{password}".encode()).hexdigest()
    return digest


def _verify_password(password: str, password_hash: str) -> bool:
    return hmac.compare_digest(_build_password_hash(password), password_hash)


def _build_display_name_from_email(email: str) -> str:
    local_part = email.split("@", 1)[0].strip()
    return local_part or email


def _normalize_external_identity_provider(provider: str) -> str:
    normalized = provider.strip().lower()
    if not normalized:
        raise AuthenticationError("外部身份 provider 缺失。")
    return normalized


def _normalize_workspace_auth_provider(provider: str) -> str:
    normalized = provider.strip().lower()
    if normalized in {"", "builtin"}:
        return "builtin"
    if normalized == "zitadel":
        return normalized
    raise AuthenticationError(f"当前认证 provider 不受支持：{provider}。")


def _normalize_external_identity_subject(subject: str) -> str:
    normalized = subject.strip()
    if not normalized:
        raise AuthenticationError("外部身份 subject 缺失。")
    return normalized


def _auth_cookie_secure() -> bool:
    return get_settings().env.strip().lower() not in {"local", "test", "development"}


def _use_host_cookie_prefix() -> bool:
    return _auth_cookie_secure()


def _real_cookie_name(base_name: str) -> str:
    if _use_host_cookie_prefix():
        return f"__Host-{base_name}"
    return base_name


def get_workspace_access_cookie_name() -> str:
    return _real_cookie_name(ACCESS_TOKEN_COOKIE_BASE_NAME)


def get_workspace_refresh_cookie_name() -> str:
    return _real_cookie_name(REFRESH_TOKEN_COOKIE_BASE_NAME)


def get_workspace_csrf_cookie_name() -> str:
    return _real_cookie_name(CSRF_TOKEN_COOKIE_BASE_NAME)


def get_workspace_oidc_state_cookie_name() -> str:
    return _real_cookie_name(OIDC_STATE_COOKIE_BASE_NAME)


def get_workspace_csrf_header_name() -> str:
    return CSRF_HEADER_NAME


def get_workspace_auth_cookie_contract() -> ConsoleAuthCookieContract:
    return ConsoleAuthCookieContract(
        access_token_cookie_name=get_workspace_access_cookie_name(),
        refresh_token_cookie_name=get_workspace_refresh_cookie_name(),
        csrf_token_cookie_name=get_workspace_csrf_cookie_name(),
        csrf_header_name=get_workspace_csrf_header_name(),
        same_site=COOKIE_SAME_SITE,
        secure=_auth_cookie_secure(),
        use_host_prefix=_use_host_cookie_prefix(),
        access_token_http_only=True,
        refresh_token_http_only=True,
        csrf_token_http_only=False,
    )


def _build_route_access_policy(
    *,
    route: str,
    access_level: str,
    methods: list[str],
    description: str,
    csrf_protected_methods: list[str] | None = None,
    resource: WorkspaceAccessResource | None = None,
    action: WorkspaceAccessAction | None = None,
    denied_message: str | None = None,
    expose_in_contract: bool = True,
) -> ConsoleRouteAccessPolicy:
    return ConsoleRouteAccessPolicy(
        route=route,
        access_level=access_level,
        methods=tuple(methods),
        csrf_protected_methods=tuple(csrf_protected_methods or []),
        description=description,
        resource=resource,
        action=action,
        denied_message=denied_message,
        expose_in_contract=expose_in_contract,
    )


def _serialize_route_access_policy(policy: ConsoleRouteAccessPolicy) -> ConsoleRoutePermissionItem:
    return ConsoleRoutePermissionItem(
        route=policy.route,
        access_level=policy.access_level,
        methods=list(policy.methods),
        csrf_protected_methods=list(policy.csrf_protected_methods),
        description=policy.description,
    )


def build_workflow_surface_route_access_policy_matrix() -> list[ConsoleRouteAccessPolicy]:
    return [
        _build_route_access_policy(
            route="/api/workflows",
            access_level="authenticated",
            methods=["GET"],
            description="workflow library 列表，对已登录 workspace 成员开放。",
            resource="workflow",
            action="read",
            expose_in_contract=False,
        ),
        _build_route_access_policy(
            route="/api/workflows",
            access_level="authenticated",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="创建 workflow 仅限可写成员，并要求 CSRF double-submit。",
            resource="workflow",
            action="write",
            expose_in_contract=False,
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}",
            access_level="authenticated",
            methods=["GET"],
            description="workflow overview，对已登录 workspace 成员开放。",
            resource="workflow",
            action="read",
            expose_in_contract=False,
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}",
            access_level="authenticated",
            methods=["PUT"],
            csrf_protected_methods=["PUT"],
            description="更新 workflow 仅限可写成员，并要求 CSRF double-submit。",
            resource="workflow",
            action="write",
            expose_in_contract=False,
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/validate-definition",
            access_level="authenticated",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="workflow definition 预检仅限可写成员，并要求 CSRF double-submit。",
            resource="workflow",
            action="write",
            expose_in_contract=False,
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/versions",
            access_level="authenticated",
            methods=["GET"],
            description="workflow version 列表，对已登录 workspace 成员开放。",
            resource="workflow",
            action="read",
            expose_in_contract=False,
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/detail",
            access_level="authenticated",
            methods=["GET"],
            description="workflow studio shared detail snapshot，对已登录 workspace 成员开放。",
            resource="workflow",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/runs",
            access_level="authenticated",
            methods=["GET"],
            description="workflow logs surface 的 recent runs 摘要，对已登录 workspace 成员开放。",
            resource="run",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/runs",
            access_level="authenticated",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="执行 workflow 仅限可发起 run 的成员，并要求 CSRF double-submit。",
            resource="run",
            action="write",
            expose_in_contract=False,
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/published-endpoints",
            access_level="authenticated",
            methods=["GET"],
            description="workflow publish / api / monitor surface 共用的 published bindings 快照。",
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations",
            access_level="authenticated",
            methods=["GET"],
            description="workflow publish / monitor surface 的 invocation activity 列表。",
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations/export",
            access_level="authenticated",
            methods=["GET"],
            description="workflow publish activity 的导出入口，对已登录 workspace 成员开放。",
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations/{invocation_id}",
            access_level="authenticated",
            methods=["GET"],
            description=(
                "workflow publish activity detail 入口，后续仍可叠加 sensitive access gating。"
            ),
        ),
        _build_route_access_policy(
            route="/api/runs/{run_id}",
            access_level="authenticated",
            methods=["GET"],
            description="workflow logs / diagnostics surface 的 run overview。",
            resource="run",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/runs/{run_id}/detail",
            access_level="authenticated",
            methods=["GET"],
            description="workflow logs surface 的 run detail。",
            resource="run",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/runs/{run_id}/resume",
            access_level="authenticated",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="恢复 waiting run 仅限可修改 run 的成员，并要求 CSRF double-submit。",
            resource="run",
            action="write",
            expose_in_contract=False,
        ),
        _build_route_access_policy(
            route="/api/runs/{run_id}/events",
            access_level="authenticated",
            methods=["GET"],
            description="workflow logs surface 的 run events。",
            resource="run",
            action="debug",
        ),
        _build_route_access_policy(
            route="/api/runs/{run_id}/trace",
            access_level="authenticated",
            methods=["GET"],
            description="workflow logs surface 的 run trace。",
            resource="run",
            action="debug",
        ),
        _build_route_access_policy(
            route="/api/runs/{run_id}/trace/export",
            access_level="authenticated",
            methods=["GET"],
            description="workflow logs surface 的 trace export。",
            resource="run",
            action="debug",
        ),
        _build_route_access_policy(
            route="/api/runs/{run_id}/execution-view",
            access_level="authenticated",
            methods=["GET"],
            description="workflow logs surface 的 execution view。",
            resource="run",
            action="debug",
        ),
        _build_route_access_policy(
            route="/api/runs/{run_id}/evidence-view",
            access_level="authenticated",
            methods=["GET"],
            description="workflow logs surface 的 evidence view。",
            resource="run",
            action="debug",
        ),
    ]


def build_workflow_surface_route_permission_matrix() -> list[ConsoleRoutePermissionItem]:
    return [
        _serialize_route_access_policy(policy)
        for policy in build_workflow_surface_route_access_policy_matrix()
        if policy.expose_in_contract
    ]


def _get_console_access_level_for_role(role: str | None) -> str:
    if role in MANAGE_MEMBER_ROLES:
        return "manager"
    if role:
        return "authenticated"
    return "guest"


def _has_required_console_access_level(current_level: str, required_level: str) -> bool:
    return CONSOLE_ACCESS_LEVEL_RANK[current_level] >= CONSOLE_ACCESS_LEVEL_RANK[required_level]


def can_access(
    access_context: WorkspaceAccessContext,
    *,
    action: WorkspaceAccessAction,
    resource: WorkspaceAccessResource,
) -> bool:
    role = access_context.member.role.strip().lower()
    return action in _ROLE_RESOURCE_ACTIONS.get(role, {}).get(resource, frozenset())


def ensure_can_access(
    access_context: WorkspaceAccessContext,
    *,
    action: WorkspaceAccessAction,
    resource: WorkspaceAccessResource,
    error_message: str,
) -> None:
    if not can_access(access_context, action=action, resource=resource):
        raise AuthorizationError(error_message)


def build_console_route_access_policy_matrix() -> list[ConsoleRouteAccessPolicy]:
    return [
        _build_route_access_policy(
            route="/api/auth/options",
            access_level="guest",
            methods=["GET"],
            description="公开认证能力摘要，用于登录页选择当前可用的登录入口。",
            expose_in_contract=False,
        ),
        _build_route_access_policy(
            route="/api/auth/password/login",
            access_level="guest",
            methods=["POST"],
            description=(
                "统一账号密码登录入口；当前 provider 可为 builtin 或 ZITADEL，"
                "由 backend 负责校验并换发 workspace session。"
            ),
            expose_in_contract=False,
        ),
        _build_route_access_policy(
            route="/api/auth/oidc/start",
            access_level="guest",
            methods=["GET"],
            description="OIDC 登录入口，签发 state 后跳转到外部 identity provider。",
            expose_in_contract=False,
        ),
        _build_route_access_policy(
            route="/api/auth/callback",
            access_level="guest",
            methods=["GET"],
            description="OIDC 回调入口，完成 code exchange、token 校验与会话签发。",
            expose_in_contract=False,
        ),
        _build_route_access_policy(
            route="/api/auth/session",
            access_level="authenticated",
            methods=["GET"],
            description="已登录会话快照，用于服务端路由守卫与当前用户恢复。",
        ),
        _build_route_access_policy(
            route="/api/auth/refresh",
            access_level="authenticated",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="已登录会话刷新入口，要求 refresh token 与 CSRF double-submit 同时成立。",
        ),
        _build_route_access_policy(
            route="/api/auth/logout",
            access_level="authenticated",
            methods=["POST"],
            description="已登录会话撤销入口，允许使用 access 或 refresh token 主动失效当前会话。",
        ),
        _build_route_access_policy(
            route="/api/workspace/context",
            access_level="authenticated",
            methods=["GET"],
            description="console 主链工作空间上下文，供页面与服务端守卫复用。",
            resource="workspace",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/workspace/members",
            access_level="authenticated",
            methods=["GET"],
            description="成员列表对所有已登录成员可见，供团队页与路由守卫恢复 workspace roster。",
            resource="workspace",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/workspace/members",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="新增成员仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="workspace",
            action="manage",
            denied_message="当前账号没有成员管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workspace/members/{member_id}",
            access_level="manager",
            methods=["PATCH"],
            csrf_protected_methods=["PATCH"],
            description="成员角色更新仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="workspace",
            action="manage",
            denied_message="当前账号没有成员管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workspace/model-providers",
            access_level="authenticated",
            methods=["GET"],
            description=(
                "workspace 原生模型供应商 registry 快照，对已登录成员开放只读，"
                "供 team settings 与后续节点表单消费。"
            ),
            resource="workspace",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/workspace/model-providers/settings",
            access_level="manager",
            methods=["GET"],
            description=(
                "团队模型供应商 settings 聚合读取面，仅 owner/admin 可见，"
                "供 provider settings SSR 在权限成立后再读取敏感 credential 列表。"
            ),
            resource="workspace",
            action="manage",
            denied_message="当前账号没有团队模型供应商管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workspace/model-providers",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description=(
                "新增 workspace 模型供应商配置仅 owner/admin 可调用，并要求 CSRF double-submit。"
            ),
            resource="workspace",
            action="manage",
            denied_message="当前账号没有团队模型供应商管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workspace/model-providers/{provider_config_id}",
            access_level="manager",
            methods=["PUT", "DELETE"],
            csrf_protected_methods=["PUT", "DELETE"],
            description=(
                "更新或停用 workspace 模型供应商配置仅 owner/admin 可调用，"
                "并要求 CSRF double-submit。"
            ),
            resource="workspace",
            action="manage",
            denied_message="当前账号没有团队模型供应商管理权限。",
        ),
        *build_workflow_surface_route_access_policy_matrix(),
        # ---------- credentials ----------
        _build_route_access_policy(
            route="/api/credentials",
            access_level="manager",
            methods=["GET"],
            description="凭证列表仅 owner/admin 可见，防止 editor/viewer 枚举所有凭证元信息。",
            resource="sensitive_resource",
            action="manage",
            denied_message="当前账号没有凭证管理权限。",
        ),
        _build_route_access_policy(
            route="/api/credentials/activity",
            access_level="manager",
            methods=["GET"],
            description="凭证审计日志仅 owner/admin 可见。",
            resource="sensitive_resource",
            action="manage",
            denied_message="当前账号没有凭证管理权限。",
        ),
        _build_route_access_policy(
            route="/api/credentials",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="创建凭证仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="sensitive_resource",
            action="manage",
            denied_message="当前账号没有凭证管理权限。",
        ),
        _build_route_access_policy(
            route="/api/credentials/{credential_id}",
            access_level="manager",
            methods=["GET"],
            description="获取凭证详情仅 owner/admin 可见。",
            resource="sensitive_resource",
            action="manage",
            denied_message="当前账号没有凭证管理权限。",
        ),
        _build_route_access_policy(
            route="/api/credentials/{credential_id}",
            access_level="manager",
            methods=["PUT"],
            csrf_protected_methods=["PUT"],
            description="更新凭证仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="sensitive_resource",
            action="manage",
            denied_message="当前账号没有凭证管理权限。",
        ),
        _build_route_access_policy(
            route="/api/credentials/{credential_id}",
            access_level="manager",
            methods=["DELETE"],
            csrf_protected_methods=["DELETE"],
            description="吊销凭证仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="sensitive_resource",
            action="manage",
            denied_message="当前账号没有凭证管理权限。",
        ),
        # ---------- skills ----------
        _build_route_access_policy(
            route="/api/skills",
            access_level="authenticated",
            methods=["GET"],
            description="skill 目录列表对所有已登录成员开放。",
            resource="workspace",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/skills",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="创建 skill 仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="workspace",
            action="manage",
            denied_message="当前账号没有 skill 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/skills/mcp/call",
            access_level="authenticated",
            methods=["POST"],
            description=(
                "skill MCP call 对所有已登录成员开放（读/调用），"
                "具体权限由 skill 策略决定。"
            ),
            resource="workspace",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/skills/{skill_id}",
            access_level="authenticated",
            methods=["GET"],
            description="获取单个 skill 对所有已登录成员开放。",
            resource="workspace",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/skills/{skill_id}",
            access_level="manager",
            methods=["PUT"],
            csrf_protected_methods=["PUT"],
            description="更新 skill 仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="workspace",
            action="manage",
            denied_message="当前账号没有 skill 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/skills/{skill_id}",
            access_level="manager",
            methods=["DELETE"],
            csrf_protected_methods=["DELETE"],
            description="删除 skill 仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="workspace",
            action="manage",
            denied_message="当前账号没有 skill 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/skills/{skill_id}/references/{reference_id}",
            access_level="authenticated",
            methods=["GET"],
            description="获取 skill reference 文档对所有已登录成员开放。",
            resource="workspace",
            action="read",
        ),
        # ---------- plugins ----------
        _build_route_access_policy(
            route="/api/plugins/adapters",
            access_level="manager",
            methods=["GET"],
            description="plugin adapter 列表仅 owner/admin 可见。",
            resource="workspace",
            action="manage",
            denied_message="当前账号没有 plugin 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/plugins/adapters",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="注册 plugin adapter 仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="workspace",
            action="manage",
            denied_message="当前账号没有 plugin 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/plugins/adapters/{adapter_id}/sync-tools",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description=(
                "同步 plugin adapter tools 仅 owner/admin 可调用，"
                "并要求 CSRF double-submit。"
            ),
            resource="workspace",
            action="manage",
            denied_message="当前账号没有 plugin 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/plugins/tools",
            access_level="authenticated",
            methods=["GET"],
            description="plugin tool 列表对所有已登录成员开放（只读，用于节点编辑表单）。",
            resource="workspace",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/plugins/tools",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="手动注册 plugin tool 仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="workspace",
            action="manage",
            denied_message="当前账号没有 plugin 管理权限。",
        ),
        # ---------- system ----------
        _build_route_access_policy(
            route="/api/system/overview",
            access_level="manager",
            methods=["GET"],
            description="系统总览仅 owner/admin 可见，包含敏感运行时与 sandbox 诊断信息。",
            resource="workspace",
            action="manage",
            denied_message="当前账号没有系统诊断权限。",
        ),
        _build_route_access_policy(
            route="/api/system/plugin-adapters",
            access_level="manager",
            methods=["GET"],
            description="plugin adapter 健康检查仅 owner/admin 可见。",
            resource="workspace",
            action="manage",
            denied_message="当前账号没有系统诊断权限。",
        ),
        _build_route_access_policy(
            route="/api/system/sandbox-backends",
            access_level="manager",
            methods=["GET"],
            description="sandbox backend 健康检查仅 owner/admin 可见。",
            resource="workspace",
            action="manage",
            denied_message="当前账号没有系统诊断权限。",
        ),
        _build_route_access_policy(
            route="/api/system/runtime-activity",
            access_level="manager",
            methods=["GET"],
            description="runtime 活动快照仅 owner/admin 可见。",
            resource="workspace",
            action="manage",
            denied_message="当前账号没有系统诊断权限。",
        ),
        # ---------- workspace starters ----------
        _build_route_access_policy(
            route="/api/workspace-starters",
            access_level="authenticated",
            methods=["GET"],
            description="workspace starter 列表对所有已登录成员开放。",
            resource="workflow",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/workspace-starters",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="创建 workspace starter 仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="workflow",
            action="publish",
            denied_message="当前账号没有 workspace starter 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workspace-starters/bulk",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description=(
                "批量更新 workspace starter 仅 owner/admin 可调用，"
                "并要求 CSRF double-submit。"
            ),
            resource="workflow",
            action="publish",
            denied_message="当前账号没有 workspace starter 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workspace-starters/bulk/preview",
            access_level="manager",
            methods=["POST"],
            description="批量更新预览仅 owner/admin 可调用。",
            resource="workflow",
            action="publish",
            denied_message="当前账号没有 workspace starter 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workspace-starters/governance-summary",
            access_level="manager",
            methods=["GET"],
            description="workspace starter 治理摘要仅 owner/admin 可见。",
            resource="workflow",
            action="publish",
            denied_message="当前账号没有 workspace starter 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workspace-starters/{template_id}",
            access_level="authenticated",
            methods=["GET"],
            description="获取单个 workspace starter 对所有已登录成员开放。",
            resource="workflow",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/workspace-starters/{template_id}",
            access_level="manager",
            methods=["PUT"],
            csrf_protected_methods=["PUT"],
            description="更新 workspace starter 仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="workflow",
            action="publish",
            denied_message="当前账号没有 workspace starter 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workspace-starters/{template_id}",
            access_level="manager",
            methods=["DELETE"],
            csrf_protected_methods=["DELETE"],
            description="删除 workspace starter 仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="workflow",
            action="publish",
            denied_message="当前账号没有 workspace starter 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workspace-starters/{template_id}/history",
            access_level="authenticated",
            methods=["GET"],
            description="workspace starter 变更历史对所有已登录成员开放。",
            resource="workflow",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/workspace-starters/{template_id}/source-diff",
            access_level="authenticated",
            methods=["GET"],
            description="workspace starter source diff 对所有已登录成员开放。",
            resource="workflow",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/workspace-starters/{template_id}/archive",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="归档 workspace starter 仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="workflow",
            action="publish",
            denied_message="当前账号没有 workspace starter 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workspace-starters/{template_id}/restore",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="恢复 workspace starter 仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="workflow",
            action="publish",
            denied_message="当前账号没有 workspace starter 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workspace-starters/{template_id}/rebase",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description=(
                "rebase workspace starter 仅 owner/admin 可调用，"
                "并要求 CSRF double-submit。"
            ),
            resource="workflow",
            action="publish",
            denied_message="当前账号没有 workspace starter 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workspace-starters/{template_id}/refresh",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="刷新 workspace starter 仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="workflow",
            action="publish",
            denied_message="当前账号没有 workspace starter 管理权限。",
        ),
        # ---------- published endpoint api keys ----------
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/published-endpoints/{binding_id}/api-keys",
            access_level="manager",
            methods=["GET"],
            description="published endpoint API key 列表仅 owner/admin 可见。",
            resource="published_endpoint",
            action="publish",
            denied_message="当前账号没有发布端点 API key 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/published-endpoints/{binding_id}/api-keys",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description=(
                "创建 published endpoint API key 仅 owner/admin 可调用，"
                "并要求 CSRF double-submit。"
            ),
            resource="published_endpoint",
            action="publish",
            denied_message="当前账号没有发布端点 API key 管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/published-endpoints/{binding_id}/api-keys/{key_id}",
            access_level="manager",
            methods=["DELETE"],
            csrf_protected_methods=["DELETE"],
            description=(
                "吊销 published endpoint API key 仅 owner/admin 可调用，"
                "并要求 CSRF double-submit。"
            ),
            resource="published_endpoint",
            action="publish",
            denied_message="当前账号没有发布端点 API key 管理权限。",
        ),
        # ---------- published endpoint cache entries ----------
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/published-endpoints/{binding_id}/cache-entries",
            access_level="authenticated",
            methods=["GET"],
            description="published endpoint cache entries 对已登录 workspace 成员开放。",
            resource="published_endpoint",
            action="read",
        ),
        # ---------- sensitive access ----------
        _build_route_access_policy(
            route="/api/sensitive-access/resources",
            access_level="manager",
            methods=["GET"],
            description="敏感资源列表仅 owner/admin 可见。",
            resource="sensitive_resource",
            action="manage",
            denied_message="当前账号没有敏感资源管理权限。",
        ),
        _build_route_access_policy(
            route="/api/sensitive-access/resources",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="创建敏感资源仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="sensitive_resource",
            action="manage",
            denied_message="当前账号没有敏感资源管理权限。",
        ),
        _build_route_access_policy(
            route="/api/sensitive-access/requests",
            access_level="authenticated",
            methods=["GET"],
            description="敏感访问请求列表对已登录成员开放（runtime 触发，可被所有成员查看）。",
            resource="approval_ticket",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/sensitive-access/requests",
            access_level="authenticated",
            methods=["POST"],
            description="创建敏感访问请求由 runtime 或 operator 发起，已登录成员可触发。",
            resource="approval_ticket",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/sensitive-access/approval-tickets",
            access_level="authenticated",
            methods=["GET"],
            description="审批 ticket 列表对已登录成员开放，operator 查看待处理工单。",
            resource="approval_ticket",
            action="read",
        ),
        _build_route_access_policy(
            route="/api/sensitive-access/inbox",
            access_level="manager",
            methods=["GET"],
            description="敏感访问 inbox（含通知通道诊断）仅 owner/admin 可见。",
            resource="approval_ticket",
            action="approve",
            denied_message="当前账号没有敏感访问审批权限。",
        ),
        _build_route_access_policy(
            route="/api/sensitive-access/notification-channels",
            access_level="manager",
            methods=["GET"],
            description="通知通道配置诊断仅 owner/admin 可见。",
            resource="sensitive_resource",
            action="manage",
            denied_message="当前账号没有敏感访问管理权限。",
        ),
        _build_route_access_policy(
            route="/api/sensitive-access/notification-dispatches",
            access_level="manager",
            methods=["GET"],
            description="通知派发记录仅 owner/admin 可见。",
            resource="sensitive_resource",
            action="manage",
            denied_message="当前账号没有敏感访问管理权限。",
        ),
        _build_route_access_policy(
            route="/api/sensitive-access/approval-tickets/{ticket_id}/decision",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="审批 ticket 决策仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="approval_ticket",
            action="approve",
            denied_message="当前账号没有审批权限。",
        ),
        _build_route_access_policy(
            route="/api/sensitive-access/approval-tickets/bulk-decision",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="批量审批仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="approval_ticket",
            action="approve",
            denied_message="当前账号没有审批权限。",
        ),
        _build_route_access_policy(
            route="/api/sensitive-access/notification-dispatches/{dispatch_id}/retry",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="通知派发重试仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="sensitive_resource",
            action="manage",
            denied_message="当前账号没有敏感访问管理权限。",
        ),
        _build_route_access_policy(
            route="/api/sensitive-access/notification-dispatches/bulk-retry",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description="通知派发批量重试仅 owner/admin 可调用，并要求 CSRF double-submit。",
            resource="sensitive_resource",
            action="manage",
            denied_message="当前账号没有敏感访问管理权限。",
        ),
        # ---------- workflow library ----------
        _build_route_access_policy(
            route="/api/workflow-library",
            access_level="authenticated",
            methods=["GET"],
            description="workflow library 快照对所有已登录成员开放。",
            resource="workflow",
            action="read",
        ),
        # ---------- run callback tickets ----------
        _build_route_access_policy(
            route="/api/runs/callback-tickets/cleanup",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description=(
                "callback ticket cleanup 属于运维操作，仅 owner/admin 可调用，"
                "并要求 CSRF double-submit。"
            ),
            resource="run",
            action="write",
            denied_message="当前账号没有 run callback ticket 管理权限。",
        ),
        # ---------- published endpoint lifecycle / legacy-auth ----------
        _build_route_access_policy(
            route="/api/workflows/published-endpoints/legacy-auth-governance",
            access_level="manager",
            methods=["GET"],
            description=(
                "published endpoint legacy-auth 治理快照仅 owner/admin 可见，"
                "包含敏感发布配置信息。"
            ),
            resource="published_endpoint",
            action="manage",
            denied_message="当前账号没有发布端点治理权限。",
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/published-endpoints/legacy-auth-cleanup",
            access_level="manager",
            methods=["POST"],
            csrf_protected_methods=["POST"],
            description=(
                "批量下线 legacy-auth draft 绑定仅 owner/admin 可调用，"
                "并要求 CSRF double-submit。"
            ),
            resource="published_endpoint",
            action="publish",
            denied_message="当前账号没有发布端点管理权限。",
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/published-endpoints/{binding_id}/lifecycle",
            access_level="manager",
            methods=["PATCH"],
            csrf_protected_methods=["PATCH"],
            description=(
                "更新发布端点生命周期状态（上线/下线）仅 owner/admin 可调用，"
                "并要求 CSRF double-submit。"
            ),
            resource="published_endpoint",
            action="publish",
            denied_message="当前账号没有发布端点管理权限。",
        ),
    ]


def resolve_console_route_access_policy(
    route: str,
    *,
    method: str,
) -> ConsoleRouteAccessPolicy | None:
    normalized_method = method.strip().upper()
    for item in build_console_route_access_policy_matrix():
        if item.route == route and normalized_method in item.methods:
            return item
    return None


def resolve_console_route_permission(
    route: str,
    *,
    method: str,
) -> ConsoleRoutePermissionItem | None:
    policy = resolve_console_route_access_policy(route, method=method)
    if policy is None or not policy.expose_in_contract:
        return None
    return _serialize_route_access_policy(policy)


def ensure_console_route_access(
    access_context: WorkspaceAccessContext,
    *,
    route: str,
    method: str,
) -> ConsoleRoutePermissionItem:
    policy = resolve_console_route_access_policy(route, method=method)
    if policy is None:
        raise AuthorizationError(f"工作台路由契约缺失：{method.upper()} {route}")

    if policy.resource is not None and policy.action is not None:
        ensure_can_access(
            access_context,
            action=policy.action,
            resource=policy.resource,
            error_message=policy.denied_message or "当前账号没有访问该工作台路由的权限。",
        )
    else:
        current_level = _get_console_access_level_for_role(access_context.member.role)
        if not _has_required_console_access_level(current_level, policy.access_level):
            raise AuthorizationError("当前账号没有访问该工作台路由的权限。")

    return _serialize_route_access_policy(policy)


def build_console_route_permission_matrix() -> list[ConsoleRoutePermissionItem]:
    return [
        _serialize_route_access_policy(policy)
        for policy in build_console_route_access_policy_matrix()
        if policy.expose_in_contract
    ]


def _encode_segment(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode_segment(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def _sign_payload_bytes(payload_bytes: bytes) -> bytes:
    settings = get_settings()
    return hmac.new(settings.secret_key.encode(), payload_bytes, sha256).digest()


def _encode_signed_payload(payload: dict[str, Any]) -> str:
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    signature = _sign_payload_bytes(payload_bytes)
    return f"{_encode_segment(payload_bytes)}.{_encode_segment(signature)}"


def _decode_signed_payload(token: str, *, error_message: str) -> dict[str, Any]:
    token_value = (token or "").strip()
    if not token_value:
        raise AuthenticationError(error_message)

    payload_segment, separator, signature_segment = token_value.partition(".")
    if not separator:
        raise AuthenticationError(error_message)

    try:
        payload_bytes = _decode_segment(payload_segment)
        signature = _decode_segment(signature_segment)
        expected_signature = _sign_payload_bytes(payload_bytes)
        if not hmac.compare_digest(signature, expected_signature):
            raise AuthenticationError(error_message)
        payload = json.loads(payload_bytes)
    except (AuthenticationError, ValueError, json.JSONDecodeError):
        raise AuthenticationError(error_message) from None

    if not isinstance(payload, dict):
        raise AuthenticationError(error_message)
    return payload


def _decode_workspace_token(
    token: str | None,
    *,
    error_message: str,
    ignore_expiration: bool = False,
) -> SignedTokenClaims:
    payload = _decode_signed_payload(token or "", error_message=error_message)
    purpose = payload.get("purpose")
    session_id = payload.get("session_id")
    user_id = payload.get("user_id")
    workspace_id = payload.get("workspace_id")
    exp = payload.get("exp")
    if not all(
        isinstance(item, str) and item for item in (purpose, session_id, user_id, workspace_id)
    ) or not isinstance(exp, int):
        raise AuthenticationError(error_message)

    expires_at = datetime.fromtimestamp(exp, UTC)
    if not ignore_expiration and expires_at <= _utc_now():
        raise AuthenticationError(error_message)

    return SignedTokenClaims(
        purpose=purpose,
        session_id=session_id,
        user_id=user_id,
        workspace_id=workspace_id,
        expires_at=expires_at,
    )


def _issue_workspace_token(
    *,
    purpose: str,
    access_context: WorkspaceAccessContext,
    expires_at: datetime,
) -> str:
    return _encode_signed_payload(
        {
            "purpose": purpose,
            "session_id": access_context.session.token,
            "user_id": access_context.user.id,
            "workspace_id": access_context.workspace.id,
            "exp": int(expires_at.timestamp()),
            "nonce": secrets.token_urlsafe(8),
        }
    )


def _build_workspace_access_context(
    db: Session,
    *,
    session_record: AuthSessionRecord,
    access_expires_at: datetime | None = None,
) -> WorkspaceAccessContext:
    workspace = db.get(WorkspaceRecord, session_record.workspace_id)
    user = db.get(UserAccountRecord, session_record.user_id)
    member = db.scalar(
        select(WorkspaceMemberRecord).where(
            WorkspaceMemberRecord.workspace_id == session_record.workspace_id,
            WorkspaceMemberRecord.user_id == session_record.user_id,
        )
    )
    if workspace is None or user is None or member is None:
        raise AuthenticationError("登录会话对应的工作空间上下文已失效。")

    return WorkspaceAccessContext(
        session=session_record,
        workspace=workspace,
        user=user,
        member=member,
        access_expires_at=access_expires_at,
    )


def _get_active_session_record(db: Session, *, session_id: str) -> AuthSessionRecord:
    session_record = db.get(AuthSessionRecord, session_id)
    if session_record is None or session_record.revoked_at is not None:
        raise AuthenticationError("登录会话无效，请重新登录。")

    expires_at = _normalize_datetime(session_record.expires_at)
    if expires_at is None or expires_at <= _utc_now():
        raise AuthenticationError("登录会话已过期，请重新登录。")

    return session_record


def _normalize_workspace_oidc_next_path(next_path: str | None) -> str:
    normalized = (next_path or "").strip()
    if (
        not normalized
        or not normalized.startswith("/")
        or normalized.startswith("//")
        or "\\" in normalized
    ):
        return "/workspace"
    return normalized


def _require_workspace_oidc_settings():
    settings = get_settings()
    if _normalize_workspace_auth_provider(settings.auth_provider) != "zitadel":
        raise AuthenticationError("当前认证 provider 不支持 OIDC 跳转登录。")
    if not settings.oidc_enabled:
        raise AuthenticationError("OIDC 登录当前未启用。")

    missing_fields = _collect_workspace_oidc_missing_fields(settings)
    if missing_fields:
        joined_fields = ", ".join(missing_fields)
        raise AuthenticationError(f"OIDC 配置缺失：{joined_fields}。")
    return settings


def _require_workspace_zitadel_password_login_settings():
    settings = get_settings()
    if _normalize_workspace_auth_provider(settings.auth_provider) != "zitadel":
        raise AuthenticationError("当前认证 provider 不支持 ZITADEL 账号密码登录。")
    missing_fields = _collect_workspace_zitadel_password_login_missing_fields(settings)
    if "issuer" in missing_fields:
        raise AuthenticationError("ZITADEL 账号密码登录缺少 issuer 配置。")
    if "service user token" in missing_fields:
        raise AuthenticationError("ZITADEL 账号密码登录缺少 service user token 配置。")
    return settings


def _collect_workspace_oidc_missing_fields(settings) -> list[str]:
    required_fields = {
        "issuer": settings.oidc_issuer,
        "client_id": settings.oidc_client_id,
        "client_secret": settings.oidc_client_secret,
        "redirect_uri": settings.oidc_redirect_uri,
    }
    return [name for name, value in required_fields.items() if not str(value).strip()]


def _collect_workspace_zitadel_password_login_missing_fields(settings) -> list[str]:
    required_fields = {
        "issuer": settings.oidc_issuer,
        "service user token": settings.zitadel_service_user_token,
    }
    return [name for name, value in required_fields.items() if not str(value).strip()]


def build_workspace_public_auth_options() -> PublicAuthOptionsResponse:
    settings = get_settings()
    auth_provider = _normalize_workspace_auth_provider(settings.auth_provider)

    oidc_redirect_enabled = False
    oidc_redirect_reason: str | None = None
    if auth_provider != "zitadel":
        oidc_redirect_reason = "当前认证 provider 不支持 OIDC 跳转登录。"
    elif not settings.oidc_enabled:
        oidc_redirect_reason = "OIDC 登录当前未启用。"
    else:
        oidc_missing_fields = _collect_workspace_oidc_missing_fields(settings)
        if oidc_missing_fields:
            oidc_redirect_reason = f"OIDC 配置缺失：{', '.join(oidc_missing_fields)}。"
        else:
            oidc_redirect_enabled = True

    password_enabled = False
    password_reason: str | None = None
    if auth_provider == "builtin":
        password_enabled = True
    elif auth_provider != "zitadel":
        password_reason = "当前认证 provider 不支持账号密码登录。"
    else:
        zitadel_missing_fields = _collect_workspace_zitadel_password_login_missing_fields(settings)
        if zitadel_missing_fields:
            password_reason = (
                f"ZITADEL 账号密码登录配置缺失：{', '.join(zitadel_missing_fields)}。"
            )
        else:
            password_enabled = True

    recommended_method: Literal["password", "oidc_redirect", "unavailable"] = "unavailable"
    if password_enabled:
        recommended_method = "password"
    elif oidc_redirect_enabled:
        recommended_method = "oidc_redirect"

    return PublicAuthOptionsResponse(
        provider=auth_provider,
        recommended_method=recommended_method,
        password=PublicAuthOptionItem(
            enabled=password_enabled,
            reason=password_reason,
        ),
        oidc_redirect=PublicAuthOptionItem(
            enabled=oidc_redirect_enabled,
            reason=oidc_redirect_reason,
        ),
    )


def _build_zitadel_api_headers(service_token: str) -> dict[str, str]:
    return {
        "Accept": "application/json",
        "Authorization": f"Bearer {service_token}",
        "Content-Type": "application/json",
    }


def _parse_zitadel_json_response(
    response: httpx.Response,
    *,
    error_message: str,
) -> dict[str, Any]:
    if response.status_code >= 400:
        raise AuthenticationError(error_message)

    try:
        payload = response.json()
    except ValueError as exc:
        raise AuthenticationError(error_message) from exc

    if not isinstance(payload, dict):
        raise AuthenticationError(error_message)
    return payload


def _extract_zitadel_session_id(payload: dict[str, Any]) -> str:
    session_id = str(payload.get("sessionId") or "").strip()
    if session_id:
        return session_id

    session_payload = payload.get("session")
    if isinstance(session_payload, dict):
        nested_session_id = str(session_payload.get("id") or "").strip()
        if nested_session_id:
            return nested_session_id

    raise AuthenticationError("ZITADEL 登录会话创建失败，请稍后重试。")


def _extract_zitadel_verified_user(session_payload: dict[str, Any]) -> ZitadelAuthenticatedUser:
    session = session_payload.get("session")
    resolved_session = session if isinstance(session, dict) else session_payload
    factors = resolved_session.get("factors")
    if not isinstance(factors, dict):
        raise AuthenticationError("ZITADEL 登录状态无效，请重新输入账号密码。")

    user_factor = factors.get("user")
    password_factor = factors.get("password")
    if not isinstance(user_factor, dict) or not isinstance(password_factor, dict):
        raise AuthenticationError("ZITADEL 登录状态无效，请重新输入账号密码。")

    subject = str(user_factor.get("id") or "").strip()
    login_name = str(user_factor.get("loginName") or "").strip()
    display_name = str(user_factor.get("displayName") or "").strip() or None
    password_verified_at = str(password_factor.get("verifiedAt") or "").strip()
    if not subject or not login_name or not password_verified_at:
        raise AuthenticationError("ZITADEL 账号或密码错误。")

    return ZitadelAuthenticatedUser(
        subject=subject,
        login_name=login_name,
        display_name=display_name,
    )


def _extract_zitadel_user_email(
    user_payload: dict[str, Any],
    *,
    fallback_login_name: str,
) -> tuple[str | None, bool]:
    email_candidates: list[str] = []
    email_verified = False

    def _add_email_candidate(value: Any) -> None:
        if not isinstance(value, str):
            return
        normalized_value = value.strip().lower()
        if normalized_value and normalized_value not in email_candidates:
            email_candidates.append(normalized_value)

    human_payload = user_payload.get("human")
    if isinstance(human_payload, dict):
        human_email_payload = human_payload.get("email")
        if isinstance(human_email_payload, dict):
            _add_email_candidate(human_email_payload.get("email"))
            email_verified = (
                human_email_payload.get("isVerified") is True
                or str(human_email_payload.get("isVerified") or "").strip().lower() == "true"
            )
        else:
            _add_email_candidate(human_email_payload)

    preferred_login_name = user_payload.get("preferredLoginName")
    if isinstance(preferred_login_name, str) and "@" in preferred_login_name:
        _add_email_candidate(preferred_login_name)

    user_login_name = user_payload.get("loginName")
    if isinstance(user_login_name, str) and "@" in user_login_name:
        _add_email_candidate(user_login_name)

    if "@" in fallback_login_name:
        _add_email_candidate(fallback_login_name)

    return (email_candidates[0] if email_candidates else None), email_verified


def _fetch_zitadel_user_profile(
    *,
    client: httpx.Client,
    issuer: str,
    service_token: str,
    user_id: str,
) -> dict[str, Any]:
    response = client.get(
        f"{issuer}/v2/users/{user_id}",
        headers=_build_zitadel_api_headers(service_token),
    )
    payload = _parse_zitadel_json_response(
        response,
        error_message="ZITADEL 用户信息获取失败，请稍后重试。",
    )
    user_payload = payload.get("user")
    if not isinstance(user_payload, dict):
        raise AuthenticationError("ZITADEL 用户信息获取失败，请稍后重试。")
    return user_payload


def default_workspace_oidc_http_client_factory() -> httpx.Client:
    client_kwargs: dict[str, Any] = {
        "timeout": httpx.Timeout(OIDC_HTTP_TIMEOUT_SECONDS, connect=OIDC_HTTP_TIMEOUT_SECONDS),
        "follow_redirects": True,
        # Avoid inheriting unsupported ALL_PROXY=socks://... values from the host shell.
        # Workspace auth only honors explicit HTTP(S) proxies here.
        "trust_env": False,
    }
    proxy = _resolve_workspace_outbound_proxy()
    if proxy:
        client_kwargs["proxy"] = proxy
    try:
        return httpx.Client(**client_kwargs)
    except ValueError as exc:
        raise AuthenticationError("认证服务初始化失败，请检查代理配置。") from exc


def _resolve_workspace_outbound_proxy() -> str | None:
    for env_name in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
        candidate = str(os.environ.get(env_name) or "").strip()
        if candidate:
            return candidate
    return None


def _fetch_workspace_oidc_discovery_document(
    *,
    client: httpx.Client,
    issuer: str,
) -> dict[str, Any]:
    discovery_url = f"{issuer.rstrip('/')}/.well-known/openid-configuration"
    response = client.get(discovery_url)
    if response.status_code >= 400:
        raise AuthenticationError("OIDC discovery 获取失败，请稍后重试。")

    try:
        payload = response.json()
    except ValueError as exc:
        raise AuthenticationError("OIDC discovery 返回了无效响应。") from exc

    if not isinstance(payload, dict):
        raise AuthenticationError("OIDC discovery 返回了无效响应。")

    configured_issuer = issuer.rstrip("/")
    discovered_issuer = str(payload.get("issuer") or "").strip().rstrip("/")
    if not discovered_issuer or discovered_issuer != configured_issuer:
        raise AuthenticationError("OIDC issuer 与配置不一致。")

    required_keys = ("authorization_endpoint", "token_endpoint", "jwks_uri")
    if any(not str(payload.get(key) or "").strip() for key in required_keys):
        raise AuthenticationError("OIDC discovery 缺少必要端点配置。")
    return payload


def _decode_workspace_oidc_state_token(state_token: str) -> tuple[str, str]:
    payload = _decode_signed_payload(
        state_token,
        error_message="OIDC state 无效，请重新发起登录。",
    )
    purpose = payload.get("purpose")
    expires_at_raw = payload.get("exp")
    nonce = payload.get("nonce")
    next_path = payload.get("next")
    provider = payload.get("provider")
    if (
        purpose != TOKEN_PURPOSE_OIDC_STATE
        or not isinstance(expires_at_raw, int)
        or not isinstance(nonce, str)
        or not nonce.strip()
        or not isinstance(provider, str)
    ):
        raise AuthenticationError("OIDC state 无效，请重新发起登录。")

    expires_at = datetime.fromtimestamp(expires_at_raw, UTC)
    if expires_at <= _utc_now():
        raise AuthenticationError("OIDC state 已过期，请重新发起登录。")

    expected_provider = _normalize_external_identity_provider(
        _require_workspace_oidc_settings().auth_provider
    )
    if _normalize_external_identity_provider(provider) != expected_provider:
        raise AuthenticationError("OIDC state 与当前 provider 不匹配。")

    return (
        _normalize_workspace_oidc_next_path(next_path if isinstance(next_path, str) else None),
        nonce,
    )


def _extract_workspace_oidc_signing_key(
    jwks_payload: dict[str, Any],
    *,
    key_id: str | None,
):
    try:
        jwk_set = jwt.PyJWKSet.from_dict(jwks_payload)
    except jwt.PyJWTError as exc:
        raise AuthenticationError("OIDC JWKS 无效。") from exc

    if key_id:
        for key in jwk_set.keys:
            if key.key_id == key_id:
                return key.key
        raise AuthenticationError("OIDC token signing key 不存在。")

    if len(jwk_set.keys) == 1:
        return jwk_set.keys[0].key
    raise AuthenticationError("OIDC token signing key 缺失。")


def _decode_workspace_oidc_id_token(
    id_token: str,
    *,
    client: httpx.Client,
    discovery_payload: dict[str, Any],
    issuer: str,
    client_id: str,
    expected_nonce: str,
) -> dict[str, Any]:
    try:
        unverified_header = jwt.get_unverified_header(id_token)
    except jwt.PyJWTError as exc:
        raise AuthenticationError("OIDC id_token 无法解析。") from exc

    algorithm = str(unverified_header.get("alg") or "").strip()
    if not algorithm or algorithm.lower() == "none":
        raise AuthenticationError("OIDC id_token 算法无效。")

    jwks_response = client.get(str(discovery_payload["jwks_uri"]))
    if jwks_response.status_code >= 400:
        raise AuthenticationError("OIDC JWKS 获取失败，请稍后重试。")

    try:
        jwks_payload = jwks_response.json()
    except ValueError as exc:
        raise AuthenticationError("OIDC JWKS 返回了无效响应。") from exc

    signing_key = _extract_workspace_oidc_signing_key(
        jwks_payload,
        key_id=str(unverified_header.get("kid") or "") or None,
    )
    try:
        claims = jwt.decode(
            id_token,
            key=signing_key,
            algorithms=[algorithm],
            audience=client_id,
            issuer=issuer,
            options={"require": ["sub", "iss", "aud", "exp"]},
        )
    except jwt.PyJWTError as exc:
        raise AuthenticationError("OIDC id_token 校验失败，请重新登录。") from exc

    if claims.get("nonce") != expected_nonce:
        raise AuthenticationError("OIDC nonce 校验失败，请重新发起登录。")
    if not isinstance(claims.get("sub"), str) or not str(claims.get("sub") or "").strip():
        raise AuthenticationError("OIDC id_token 缺少 subject。")
    return claims


def create_workspace_access_session(
    db: Session,
    *,
    workspace: WorkspaceRecord,
    user: UserAccountRecord,
    member: WorkspaceMemberRecord,
) -> WorkspaceAccessContext:
    user.last_login_at = _utc_now()
    session_record = AuthSessionRecord(
        token=_generate_session_token(),
        user_id=user.id,
        workspace_id=workspace.id,
        expires_at=_utc_now() + SESSION_TTL,
    )
    db.add(session_record)
    db.flush()
    return WorkspaceAccessContext(
        session=session_record,
        workspace=workspace,
        user=user,
        member=member,
    )


def ensure_default_workspace_access_seed(db: Session) -> None:
    workspace = db.get(WorkspaceRecord, DEFAULT_WORKSPACE_ID)
    if workspace is None:
        workspace = WorkspaceRecord(
            id=DEFAULT_WORKSPACE_ID,
            name=DEFAULT_WORKSPACE_NAME,
            slug=DEFAULT_WORKSPACE_SLUG,
        )
        db.add(workspace)
        db.flush()

    admin_user = db.scalar(
        select(UserAccountRecord).where(UserAccountRecord.email == DEFAULT_ADMIN_EMAIL)
    )
    if admin_user is None:
        admin_user = UserAccountRecord(
            id=_generate_identifier(),
            email=DEFAULT_ADMIN_EMAIL,
            display_name=DEFAULT_ADMIN_NAME,
            password_hash=_build_password_hash(DEFAULT_ADMIN_PASSWORD),
        )
        db.add(admin_user)
        db.flush()

    membership = db.scalar(
        select(WorkspaceMemberRecord).where(
            WorkspaceMemberRecord.workspace_id == DEFAULT_WORKSPACE_ID,
            WorkspaceMemberRecord.user_id == admin_user.id,
        )
    )
    if membership is None:
        db.add(
            WorkspaceMemberRecord(
                id=_generate_identifier(),
                workspace_id=DEFAULT_WORKSPACE_ID,
                user_id=admin_user.id,
                role="owner",
            )
        )
        db.flush()


def resolve_external_identity_binding(
    db: Session,
    *,
    provider: str,
    subject: str,
    email: str | None = None,
    email_verified: bool = False,
) -> ResolvedExternalIdentity:
    ensure_default_workspace_access_seed(db)
    normalized_provider = _normalize_external_identity_provider(provider)
    normalized_subject = _normalize_external_identity_subject(subject)
    workspace = db.get(WorkspaceRecord, DEFAULT_WORKSPACE_ID)
    if workspace is None:
        raise AuthenticationError("默认工作空间不存在。")

    binding = db.scalar(
        select(ExternalIdentityBindingRecord).where(
            ExternalIdentityBindingRecord.provider == normalized_provider,
            ExternalIdentityBindingRecord.subject == normalized_subject,
        )
    )

    if binding is None:
        normalized_email = (email or "").strip().lower()
        if not normalized_email or not email_verified:
            raise AuthenticationError("当前外部身份尚未完成可信邮箱绑定。")

        user = db.scalar(
            select(UserAccountRecord).where(UserAccountRecord.email == normalized_email)
        )
        if user is None:
            raise AuthenticationError("当前外部身份还没有绑定到 7Flows 账号。")

        existing_provider_binding = db.scalar(
            select(ExternalIdentityBindingRecord).where(
                ExternalIdentityBindingRecord.provider == normalized_provider,
                ExternalIdentityBindingRecord.user_id == user.id,
            )
        )
        if existing_provider_binding is not None:
            raise AuthenticationError("当前账号已经绑定了另一个外部身份。")

        binding = ExternalIdentityBindingRecord(
            id=_generate_identifier(),
            provider=normalized_provider,
            subject=normalized_subject,
            user_id=user.id,
        )
        db.add(binding)
        db.flush()
    else:
        user = db.get(UserAccountRecord, binding.user_id)
        if user is None:
            raise AuthenticationError("当前外部身份绑定已失效。")
        binding.updated_at = _utc_now()
        db.flush()

    member = db.scalar(
        select(WorkspaceMemberRecord).where(
            WorkspaceMemberRecord.workspace_id == workspace.id,
            WorkspaceMemberRecord.user_id == user.id,
        )
    )
    if member is None:
        raise AuthenticationError("当前账号尚未加入默认工作空间。")

    return ResolvedExternalIdentity(
        binding=binding,
        workspace=workspace,
        user=user,
        member=member,
    )


def authenticate_workspace_user(
    db: Session, *, email: str, password: str
) -> WorkspaceAccessContext:
    ensure_default_workspace_access_seed(db)
    normalized_email = email.strip().lower()
    user = db.scalar(select(UserAccountRecord).where(UserAccountRecord.email == normalized_email))
    if user is None or not _verify_password(password, user.password_hash):
        raise AuthenticationError("邮箱或密码错误。")

    member = db.scalar(
        select(WorkspaceMemberRecord).where(
            WorkspaceMemberRecord.workspace_id == DEFAULT_WORKSPACE_ID,
            WorkspaceMemberRecord.user_id == user.id,
        )
    )
    workspace = db.get(WorkspaceRecord, DEFAULT_WORKSPACE_ID)
    if member is None or workspace is None:
        raise AuthenticationError("当前账号尚未加入默认工作空间。")

    return create_workspace_access_session(
        db,
        workspace=workspace,
        user=user,
        member=member,
    )


def authenticate_workspace_password_login(
    db: Session,
    *,
    login_name: str,
    password: str,
    client_factory: Callable[[], httpx.Client] | None = None,
) -> WorkspaceAccessContext:
    auth_provider = _normalize_workspace_auth_provider(get_settings().auth_provider)
    if auth_provider == "builtin":
        return authenticate_workspace_user(db, email=login_name, password=password)

    if auth_provider == "zitadel":
        return authenticate_workspace_zitadel_password_login(
            db,
            login_name=login_name,
            password=password,
            client_factory=client_factory,
        )

    raise AuthenticationError(f"当前认证 provider 不受支持：{auth_provider}。")


def authenticate_workspace_zitadel_password_login(
    db: Session,
    *,
    login_name: str,
    password: str,
    client_factory: Callable[[], httpx.Client] | None = None,
) -> WorkspaceAccessContext:
    normalized_login_name = login_name.strip()
    if not normalized_login_name or not password.strip():
        raise AuthenticationError("账号和密码不能为空。")

    settings = _require_workspace_zitadel_password_login_settings()
    issuer = settings.oidc_issuer.strip().rstrip("/")
    service_token = settings.zitadel_service_user_token.strip()
    http_client_factory = client_factory or default_workspace_oidc_http_client_factory

    with http_client_factory() as client:
        create_session_response = client.post(
            f"{issuer}/v2/sessions",
            headers=_build_zitadel_api_headers(service_token),
            json={
                "checks": {
                    "user": {
                        "loginName": normalized_login_name,
                    }
                }
            },
        )
        create_session_payload = _parse_zitadel_json_response(
            create_session_response,
            error_message="ZITADEL 登录服务暂时不可用，请稍后重试。",
        )
        session_id = _extract_zitadel_session_id(create_session_payload)

        verify_password_response = client.patch(
            f"{issuer}/v2/sessions/{session_id}",
            headers=_build_zitadel_api_headers(service_token),
            json={
                "checks": {
                    "password": {
                        "password": password,
                    }
                }
            },
        )
        if verify_password_response.status_code >= 400:
            raise AuthenticationError("ZITADEL 账号或密码错误。")

        session_response = client.get(
            f"{issuer}/v2/sessions/{session_id}",
            headers=_build_zitadel_api_headers(service_token),
        )
        session_payload = _parse_zitadel_json_response(
            session_response,
            error_message="ZITADEL 登录状态确认失败，请稍后重试。",
        )
        authenticated_user = _extract_zitadel_verified_user(session_payload)
        user_payload = _fetch_zitadel_user_profile(
            client=client,
            issuer=issuer,
            service_token=service_token,
            user_id=authenticated_user.subject,
        )

    resolved_email, email_verified = _extract_zitadel_user_email(
        user_payload,
        fallback_login_name=authenticated_user.login_name,
    )
    resolved_identity = resolve_external_identity_binding(
        db,
        provider=settings.auth_provider,
        subject=authenticated_user.subject,
        email=resolved_email,
        email_verified=(
            email_verified
            or (
                resolved_email is not None
                and "@" in authenticated_user.login_name
                and resolved_email == authenticated_user.login_name.lower()
            )
        ),
    )
    if authenticated_user.display_name and not resolved_identity.user.display_name:
        resolved_identity.user.display_name = authenticated_user.display_name

    return create_workspace_access_session(
        db,
        workspace=resolved_identity.workspace,
        user=resolved_identity.user,
        member=resolved_identity.member,
    )


def build_workspace_oidc_authorization_redirect(
    *,
    next_path: str | None,
    client_factory: Callable[[], httpx.Client] | None = None,
) -> tuple[str, str]:
    settings = _require_workspace_oidc_settings()
    issuer = settings.oidc_issuer.strip().rstrip("/")
    normalized_next_path = _normalize_workspace_oidc_next_path(next_path)
    http_client_factory = client_factory or default_workspace_oidc_http_client_factory
    with http_client_factory() as client:
        discovery_payload = _fetch_workspace_oidc_discovery_document(
            client=client,
            issuer=issuer,
        )

    nonce = secrets.token_urlsafe(16)
    state_token = _encode_signed_payload(
        {
            "purpose": TOKEN_PURPOSE_OIDC_STATE,
            "provider": _normalize_external_identity_provider(settings.auth_provider),
            "next": normalized_next_path,
            "nonce": nonce,
            "exp": int((_utc_now() + OIDC_STATE_TTL).timestamp()),
        }
    )
    authorization_url = str(
        httpx.URL(str(discovery_payload["authorization_endpoint"])).copy_merge_params(
            {
                "response_type": "code",
                "client_id": settings.oidc_client_id.strip(),
                "redirect_uri": settings.oidc_redirect_uri.strip(),
                "scope": settings.oidc_scopes.strip() or "openid profile email",
                "state": state_token,
                "nonce": nonce,
            }
        )
    )
    return authorization_url, state_token


def authenticate_workspace_oidc_callback(
    db: Session,
    *,
    code: str | None,
    state_token: str | None,
    state_cookie_token: str | None,
    client_factory: Callable[[], httpx.Client] | None = None,
) -> tuple[WorkspaceAccessContext, WorkspaceIssuedAuthTokens, str]:
    normalized_code = (code or "").strip()
    normalized_state_token = (state_token or "").strip()
    normalized_state_cookie = (state_cookie_token or "").strip()
    if not normalized_code:
        raise AuthenticationError("OIDC authorization code 缺失。")
    if (
        not normalized_state_token
        or not normalized_state_cookie
        or not hmac.compare_digest(normalized_state_token, normalized_state_cookie)
    ):
        raise AuthenticationError("OIDC state 无效，请重新发起登录。")

    next_path, expected_nonce = _decode_workspace_oidc_state_token(normalized_state_token)
    settings = _require_workspace_oidc_settings()
    issuer = settings.oidc_issuer.strip().rstrip("/")
    http_client_factory = client_factory or default_workspace_oidc_http_client_factory
    with http_client_factory() as client:
        discovery_payload = _fetch_workspace_oidc_discovery_document(
            client=client,
            issuer=issuer,
        )
        token_response = client.post(
            str(discovery_payload["token_endpoint"]),
            data={
                "grant_type": "authorization_code",
                "code": normalized_code,
                "redirect_uri": settings.oidc_redirect_uri.strip(),
                "client_id": settings.oidc_client_id.strip(),
                "client_secret": settings.oidc_client_secret.strip(),
            },
            headers={"Accept": "application/json"},
        )
        if token_response.status_code >= 400:
            raise AuthenticationError("OIDC token exchange 失败，请重新登录。")
        try:
            token_payload = token_response.json()
        except ValueError as exc:
            raise AuthenticationError("OIDC token 响应无效。") from exc

        id_token = token_payload.get("id_token")
        if not isinstance(id_token, str) or not id_token.strip():
            raise AuthenticationError("OIDC token 响应缺少 id_token。")
        identity_claims = _decode_workspace_oidc_id_token(
            id_token,
            client=client,
            discovery_payload=discovery_payload,
            issuer=issuer,
            client_id=settings.oidc_client_id.strip(),
            expected_nonce=expected_nonce,
        )

    email = identity_claims.get("email")
    email_verified = identity_claims.get("email_verified") is True or (
        isinstance(identity_claims.get("email_verified"), str)
        and identity_claims.get("email_verified", "").strip().lower() == "true"
    )
    resolved_identity = resolve_external_identity_binding(
        db,
        provider=settings.auth_provider,
        subject=str(identity_claims["sub"]),
        email=str(email).strip().lower() if isinstance(email, str) else None,
        email_verified=email_verified,
    )
    access_context = create_workspace_access_session(
        db,
        workspace=resolved_identity.workspace,
        user=resolved_identity.user,
        member=resolved_identity.member,
    )
    tokens = issue_workspace_auth_tokens(access_context)
    return access_context, tokens, next_path


def issue_workspace_auth_tokens(
    access_context: WorkspaceAccessContext,
) -> WorkspaceIssuedAuthTokens:
    session_expires_at = _normalize_datetime(access_context.session.expires_at)
    if session_expires_at is None:
        raise AuthenticationError("登录会话已失效，请重新登录。")

    access_expires_at = _utc_now() + ACCESS_TOKEN_TTL
    refresh_expires_at = session_expires_at
    return WorkspaceIssuedAuthTokens(
        access_token=_issue_workspace_token(
            purpose=TOKEN_PURPOSE_ACCESS,
            access_context=access_context,
            expires_at=access_expires_at,
        ),
        refresh_token=_issue_workspace_token(
            purpose=TOKEN_PURPOSE_REFRESH,
            access_context=access_context,
            expires_at=refresh_expires_at,
        ),
        csrf_token=_issue_workspace_token(
            purpose=TOKEN_PURPOSE_CSRF,
            access_context=access_context,
            expires_at=min(_utc_now() + CSRF_TOKEN_TTL, refresh_expires_at),
        ),
        access_expires_at=access_expires_at,
        expires_at=refresh_expires_at,
    )


def get_workspace_access_context(db: Session, *, token: str | None) -> WorkspaceAccessContext:
    claims = _decode_workspace_token(
        token,
        error_message="登录会话无效，请重新登录。",
    )
    if claims.purpose != TOKEN_PURPOSE_ACCESS:
        raise AuthenticationError("登录会话无效，请重新登录。")

    session_record = _get_active_session_record(db, session_id=claims.session_id)
    if (
        session_record.user_id != claims.user_id
        or session_record.workspace_id != claims.workspace_id
    ):
        raise AuthenticationError("登录会话对应的工作空间上下文已失效。")

    return _build_workspace_access_context(
        db,
        session_record=session_record,
        access_expires_at=claims.expires_at,
    )


def refresh_workspace_session(
    db: Session, *, refresh_token: str | None
) -> tuple[WorkspaceAccessContext, WorkspaceIssuedAuthTokens]:
    claims = _decode_workspace_token(
        refresh_token,
        error_message="refresh token 无效，请重新登录。",
    )
    if claims.purpose != TOKEN_PURPOSE_REFRESH:
        raise AuthenticationError("refresh token 无效，请重新登录。")

    session_record = _get_active_session_record(db, session_id=claims.session_id)
    if (
        session_record.user_id != claims.user_id
        or session_record.workspace_id != claims.workspace_id
    ):
        raise AuthenticationError("登录会话对应的工作空间上下文已失效。")

    access_context = _build_workspace_access_context(db, session_record=session_record)
    return access_context, issue_workspace_auth_tokens(access_context)


def revoke_workspace_session(db: Session, *, token: str | None) -> None:
    normalized_token = (token or "").strip()
    if not normalized_token:
        return

    try:
        claims = _decode_workspace_token(
            normalized_token,
            error_message="登录会话无效，请重新登录。",
            ignore_expiration=True,
        )
    except AuthenticationError:
        return

    session_record = db.get(AuthSessionRecord, claims.session_id)
    if session_record is None or session_record.revoked_at is not None:
        return

    session_record.revoked_at = _utc_now()
    db.flush()


def validate_workspace_csrf_token(
    access_context: WorkspaceAccessContext,
    *,
    csrf_header_token: str | None,
    csrf_cookie_token: str | None,
) -> None:
    header_token = (csrf_header_token or "").strip()
    cookie_token = (csrf_cookie_token or "").strip()
    if not header_token or not cookie_token or not hmac.compare_digest(header_token, cookie_token):
        raise CsrfValidationError("CSRF token 缺失或不匹配。")

    claims = _decode_workspace_token(
        header_token,
        error_message="CSRF token 无效，请刷新页面后重试。",
    )
    if claims.purpose != TOKEN_PURPOSE_CSRF:
        raise CsrfValidationError("CSRF token 无效，请刷新页面后重试。")
    if (
        claims.session_id != access_context.session.token
        or claims.user_id != access_context.user.id
    ):
        raise CsrfValidationError("CSRF token 无效，请刷新页面后重试。")


def ensure_can_manage_members(access_context: WorkspaceAccessContext) -> None:
    ensure_can_access(
        access_context,
        action="manage",
        resource="workspace",
        error_message="当前账号没有成员管理权限。",
    )


def ensure_can_manage_model_providers(access_context: WorkspaceAccessContext) -> None:
    ensure_can_access(
        access_context,
        action="manage",
        resource="workspace",
        error_message="当前账号没有团队模型供应商管理权限。",
    )


def list_workspace_members(db: Session, *, workspace_id: str) -> list[WorkspaceMemberRecord]:
    return db.scalars(
        select(WorkspaceMemberRecord)
        .where(WorkspaceMemberRecord.workspace_id == workspace_id)
        .order_by(WorkspaceMemberRecord.created_at.asc())
    ).all()


def get_workspace_user_index(db: Session, *, user_ids: list[str]) -> dict[str, UserAccountRecord]:
    if not user_ids:
        return {}
    users = db.scalars(select(UserAccountRecord).where(UserAccountRecord.id.in_(user_ids))).all()
    return {user.id: user for user in users}


def create_workspace_member(
    db: Session,
    *,
    access_context: WorkspaceAccessContext,
    email: str,
    display_name: str,
    password: str,
    role: str,
) -> WorkspaceMemberRecord:
    ensure_can_manage_members(access_context)
    normalized_email = email.strip().lower()
    normalized_role = _normalize_role(role)
    if normalized_role == "owner":
        raise ConflictError("当前阶段暂不支持通过工作台新增 owner。")

    existing_user = db.scalar(
        select(UserAccountRecord).where(UserAccountRecord.email == normalized_email)
    )
    if existing_user is None:
        existing_user = UserAccountRecord(
            id=_generate_identifier(),
            email=normalized_email,
            display_name=display_name.strip() or _build_display_name_from_email(normalized_email),
            password_hash=_build_password_hash(password),
        )
        db.add(existing_user)
        db.flush()

    existing_member = db.scalar(
        select(WorkspaceMemberRecord).where(
            WorkspaceMemberRecord.workspace_id == access_context.workspace.id,
            WorkspaceMemberRecord.user_id == existing_user.id,
        )
    )
    if existing_member is not None:
        raise ConflictError("该账号已经在当前工作空间中。")

    member = WorkspaceMemberRecord(
        id=_generate_identifier(),
        workspace_id=access_context.workspace.id,
        user_id=existing_user.id,
        role=normalized_role,
        invited_by_user_id=access_context.user.id,
    )
    db.add(member)
    db.flush()
    return member


def update_workspace_member_role(
    db: Session,
    *,
    access_context: WorkspaceAccessContext,
    member_id: str,
    role: str,
) -> WorkspaceMemberRecord:
    ensure_can_manage_members(access_context)
    member = db.get(WorkspaceMemberRecord, member_id)
    if member is None or member.workspace_id != access_context.workspace.id:
        raise ConflictError("目标成员不存在。")

    normalized_role = _normalize_role(role)
    if member.user_id == access_context.user.id and normalized_role not in MANAGE_MEMBER_ROLES:
        raise ConflictError("不能把当前管理者降级为无管理权限角色。")

    member.role = normalized_role
    member.updated_at = _utc_now()
    db.flush()
    return member


def count_workspace_workflows(db: Session) -> int:
    return db.query(Workflow).count()
