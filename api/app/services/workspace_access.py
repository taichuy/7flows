from __future__ import annotations

import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.workflow import Workflow
from app.models.workspace_access import (
    AuthSessionRecord,
    UserAccountRecord,
    WorkspaceMemberRecord,
    WorkspaceRecord,
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


class WorkspaceAccessError(Exception):
    pass


class AuthenticationError(WorkspaceAccessError):
    pass


class AuthorizationError(WorkspaceAccessError):
    pass


class ConflictError(WorkspaceAccessError):
    pass


@dataclass(slots=True)
class WorkspaceAccessContext:
    session: AuthSessionRecord
    workspace: WorkspaceRecord
    user: UserAccountRecord
    member: WorkspaceMemberRecord


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


def get_workspace_access_context(db: Session, *, token: str | None) -> WorkspaceAccessContext:
    normalized_token = (token or "").strip()
    if not normalized_token:
        raise AuthenticationError("缺少登录会话。")

    session_record = db.get(AuthSessionRecord, normalized_token)
    if session_record is None or session_record.revoked_at is not None:
        raise AuthenticationError("登录会话无效，请重新登录。")
    expires_at = _normalize_datetime(session_record.expires_at)
    if expires_at is None or expires_at <= _utc_now():
        raise AuthenticationError("登录会话已过期，请重新登录。")

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
    )


def revoke_workspace_session(db: Session, *, token: str | None) -> None:
    normalized_token = (token or "").strip()
    if not normalized_token:
        return

    session_record = db.get(AuthSessionRecord, normalized_token)
    if session_record is None or session_record.revoked_at is not None:
        return

    session_record.revoked_at = _utc_now()
    db.flush()


def ensure_can_manage_members(access_context: WorkspaceAccessContext) -> None:
    if access_context.member.role not in MANAGE_MEMBER_ROLES:
        raise AuthorizationError("当前账号没有成员管理权限。")


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
