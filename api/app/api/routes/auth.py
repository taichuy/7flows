from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.workspace_access import (
    AuthLoginRequest,
    AuthSessionResponse,
    UserAccountItem,
    WorkspaceItem,
    WorkspaceLogoutResponse,
    WorkspaceMemberItem,
)
from app.services.workspace_access import (
    AuthenticationError,
    WorkspaceAccessContext,
    authenticate_workspace_user,
    get_workspace_access_context,
    revoke_workspace_session,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return None
    normalized_token = token.strip()
    return normalized_token or None


def _serialize_user(user) -> UserAccountItem:
    return UserAccountItem(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        status=user.status,
        last_login_at=user.last_login_at,
    )


def _serialize_member(member, *, user) -> WorkspaceMemberItem:
    return WorkspaceMemberItem(
        id=member.id,
        role=member.role,
        user=_serialize_user(user),
        invited_by_user_id=member.invited_by_user_id,
        created_at=member.created_at,
        updated_at=member.updated_at,
    )


def _serialize_access_context(access_context: WorkspaceAccessContext) -> AuthSessionResponse:
    return AuthSessionResponse(
        token=access_context.session.token,
        workspace=WorkspaceItem(
            id=access_context.workspace.id,
            name=access_context.workspace.name,
            slug=access_context.workspace.slug,
        ),
        current_user=_serialize_user(access_context.user),
        current_member=_serialize_member(access_context.member, user=access_context.user),
        available_roles=["owner", "admin", "editor", "viewer"],
        expires_at=access_context.session.expires_at,
    )


def get_authenticated_access_context(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> WorkspaceAccessContext:
    try:
        return get_workspace_access_context(db, token=_extract_bearer_token(authorization))
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc


@router.post("/login", response_model=AuthSessionResponse)
def login(payload: AuthLoginRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    try:
        access_context = authenticate_workspace_user(
            db,
            email=payload.email,
            password=payload.password,
        )
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    db.commit()
    return _serialize_access_context(access_context)


@router.get("/session", response_model=AuthSessionResponse)
def get_session(
    access_context: WorkspaceAccessContext = Depends(get_authenticated_access_context),
) -> AuthSessionResponse:
    return _serialize_access_context(access_context)


@router.post("/logout", response_model=WorkspaceLogoutResponse)
def logout(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> WorkspaceLogoutResponse:
    revoke_workspace_session(db, token=_extract_bearer_token(authorization))
    db.commit()
    return WorkspaceLogoutResponse(ok=True)
