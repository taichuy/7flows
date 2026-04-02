from __future__ import annotations

import base64
import hmac
import json
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Any, Literal

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
from app.schemas.workspace_access import ConsoleAuthCookieContract, ConsoleRoutePermissionItem

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
CSRF_HEADER_NAME = "X-CSRF-Token"
COOKIE_SAME_SITE = "lax"
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
            description="创建 workflow 仅限可写成员。",
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
            description="更新 workflow 仅限可写成员。",
            resource="workflow",
            action="write",
            expose_in_contract=False,
        ),
        _build_route_access_policy(
            route="/api/workflows/{workflow_id}/validate-definition",
            access_level="authenticated",
            methods=["POST"],
            description="workflow definition 预检仅限可写成员。",
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
            description="执行 workflow 仅限可发起 run 的成员。",
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
                "workflow publish activity detail 入口，"
                "后续仍可叠加 sensitive access gating。"
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
            description="恢复 waiting run 仅限可修改 run 的成员。",
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
            route="/api/auth/login",
            access_level="guest",
            methods=["POST"],
            description="访客登录入口，签发 access/refresh/csrf 三类令牌。",
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
                "新增 workspace 模型供应商配置仅 owner/admin 可调用，"
                "并要求 CSRF double-submit。"
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
        isinstance(item, str) and item
        for item in (purpose, session_id, user_id, workspace_id)
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
    if (
        not header_token
        or not cookie_token
        or not hmac.compare_digest(header_token, cookie_token)
    ):
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
