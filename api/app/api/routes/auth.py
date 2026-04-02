from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.workspace_access import (
    AuthLoginRequest,
    AuthRefreshRequest,
    AuthSessionResponse,
    UserAccountItem,
    WorkspaceItem,
    WorkspaceLogoutResponse,
    WorkspaceMemberItem,
)
from app.services.workspace_access import (
    AuthenticationError,
    AuthorizationError,
    CsrfValidationError,
    WorkspaceAccessContext,
    WorkspaceIssuedAuthTokens,
    authenticate_workspace_user,
    build_console_route_permission_matrix,
    ensure_console_route_access,
    get_workspace_access_context,
    get_workspace_access_cookie_name,
    get_workspace_auth_cookie_contract,
    get_workspace_csrf_cookie_name,
    get_workspace_csrf_header_name,
    get_workspace_refresh_cookie_name,
    issue_workspace_auth_tokens,
    refresh_workspace_session,
    resolve_console_route_access_policy,
    revoke_workspace_session,
    validate_workspace_csrf_token,
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


def _extract_access_token(request: Request, authorization: str | None) -> str | None:
    return request.cookies.get(get_workspace_access_cookie_name()) or _extract_bearer_token(
        authorization
    )


def _extract_refresh_token(
    request: Request,
    refresh_token_header: str | None,
    payload_refresh_token: str | None,
) -> str | None:
    return (
        request.cookies.get(get_workspace_refresh_cookie_name())
        or (refresh_token_header or "").strip()
        or (payload_refresh_token or "").strip()
        or None
    )


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


def _serialize_access_context(
    access_context: WorkspaceAccessContext,
    *,
    tokens: WorkspaceIssuedAuthTokens | None = None,
) -> AuthSessionResponse:
    expires_at = access_context.session.expires_at
    access_expires_at = tokens.access_expires_at if tokens else access_context.access_expires_at
    return AuthSessionResponse(
        token_type="bearer",
        token=tokens.access_token if tokens else None,
        access_token=tokens.access_token if tokens else None,
        refresh_token=tokens.refresh_token if tokens else None,
        csrf_token=tokens.csrf_token if tokens else None,
        workspace=WorkspaceItem(
            id=access_context.workspace.id,
            name=access_context.workspace.name,
            slug=access_context.workspace.slug,
        ),
        current_user=_serialize_user(access_context.user),
        current_member=_serialize_member(access_context.member, user=access_context.user),
        available_roles=["owner", "admin", "editor", "viewer"],
        expires_at=expires_at,
        access_expires_at=access_expires_at,
        cookie_contract=get_workspace_auth_cookie_contract(),
        route_permissions=build_console_route_permission_matrix(),
    )


def _set_cookie(
    response: Response,
    *,
    name: str,
    value: str,
    max_age: int,
    http_only: bool,
) -> None:
    cookie_contract = get_workspace_auth_cookie_contract()
    response.set_cookie(
        key=name,
        value=value,
        path="/",
        max_age=max_age,
        secure=cookie_contract.secure,
        httponly=http_only,
        samesite=cookie_contract.same_site,
    )


def _apply_auth_cookies(response: Response, tokens: WorkspaceIssuedAuthTokens) -> None:
    now = datetime.now(UTC)
    access_ttl = max(int((tokens.access_expires_at - now).total_seconds()), 0)
    session_ttl = max(int((tokens.expires_at - now).total_seconds()), 0)
    _set_cookie(
        response,
        name=get_workspace_access_cookie_name(),
        value=tokens.access_token,
        max_age=access_ttl,
        http_only=True,
    )
    _set_cookie(
        response,
        name=get_workspace_refresh_cookie_name(),
        value=tokens.refresh_token,
        max_age=session_ttl,
        http_only=True,
    )
    _set_cookie(
        response,
        name=get_workspace_csrf_cookie_name(),
        value=tokens.csrf_token,
        max_age=session_ttl,
        http_only=False,
    )


def _clear_auth_cookies(response: Response) -> None:
    cookie_contract = get_workspace_auth_cookie_contract()
    for name, http_only in (
        (get_workspace_access_cookie_name(), True),
        (get_workspace_refresh_cookie_name(), True),
        (get_workspace_csrf_cookie_name(), False),
    ):
        response.delete_cookie(
            key=name,
            path="/",
            secure=cookie_contract.secure,
            httponly=http_only,
            samesite=cookie_contract.same_site,
        )


def get_authenticated_access_context(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> WorkspaceAccessContext:
    try:
        return get_workspace_access_context(
            db,
            token=_extract_access_token(request, authorization),
        )
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc


def require_console_route_access(route: str, *, method: str = "GET"):
    policy = resolve_console_route_access_policy(route, method=method)
    access_context_dependency = get_authenticated_access_context
    if policy is not None and method.strip().upper() in policy.csrf_protected_methods:
        access_context_dependency = get_authenticated_write_access_context

    def dependency(
        access_context: WorkspaceAccessContext = Depends(access_context_dependency),
    ) -> WorkspaceAccessContext:
        try:
            ensure_console_route_access(
                access_context,
                route=route,
                method=method,
            )
        except AuthorizationError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=str(exc),
            ) from exc
        return access_context

    return dependency


def get_authenticated_write_access_context(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    csrf_token: str | None = Header(default=None, alias=get_workspace_csrf_header_name()),
    db: Session = Depends(get_db),
) -> WorkspaceAccessContext:
    try:
        access_context = get_workspace_access_context(
            db,
            token=_extract_access_token(request, authorization),
        )
        validate_workspace_csrf_token(
            access_context,
            csrf_header_token=csrf_token,
            csrf_cookie_token=request.cookies.get(get_workspace_csrf_cookie_name()),
        )
        return access_context
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    except CsrfValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@router.post("/login", response_model=AuthSessionResponse)
def login(
    payload: AuthLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthSessionResponse:
    try:
        access_context = authenticate_workspace_user(
            db,
            email=payload.email,
            password=payload.password,
        )
        tokens = issue_workspace_auth_tokens(access_context)
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    db.commit()
    _apply_auth_cookies(response, tokens)
    return _serialize_access_context(access_context, tokens=tokens)


@router.get("/session", response_model=AuthSessionResponse)
def get_session(
    access_context: WorkspaceAccessContext = Depends(get_authenticated_access_context),
) -> AuthSessionResponse:
    return _serialize_access_context(access_context)


@router.post("/refresh", response_model=AuthSessionResponse)
def refresh_session(
    request: Request,
    response: Response,
    payload: AuthRefreshRequest | None = None,
    refresh_token_header: str | None = Header(default=None, alias="X-Refresh-Token"),
    csrf_token: str | None = Header(default=None, alias=get_workspace_csrf_header_name()),
    db: Session = Depends(get_db),
) -> AuthSessionResponse:
    refresh_token = _extract_refresh_token(
        request,
        refresh_token_header,
        payload.refresh_token if payload else None,
    )
    try:
        access_context, tokens = refresh_workspace_session(db, refresh_token=refresh_token)
        validate_workspace_csrf_token(
            access_context,
            csrf_header_token=csrf_token,
            csrf_cookie_token=request.cookies.get(get_workspace_csrf_cookie_name()),
        )
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    except CsrfValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    _apply_auth_cookies(response, tokens)
    return _serialize_access_context(access_context, tokens=tokens)


@router.post("/logout", response_model=WorkspaceLogoutResponse)
def logout(
    request: Request,
    response: Response,
    authorization: str | None = Header(default=None, alias="Authorization"),
    refresh_token_header: str | None = Header(default=None, alias="X-Refresh-Token"),
    db: Session = Depends(get_db),
) -> WorkspaceLogoutResponse:
    token = (
        _extract_access_token(request, authorization)
        or _extract_refresh_token(request, refresh_token_header, None)
    )
    revoke_workspace_session(db, token=token)
    db.commit()
    _clear_auth_cookies(response)
    return WorkspaceLogoutResponse(ok=True)
