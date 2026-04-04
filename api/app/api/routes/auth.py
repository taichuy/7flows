from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.workspace_access import (
    AuthRefreshRequest,
    AuthSessionResponse,
    PublicAuthOptionsResponse,
    UserAccountItem,
    WorkspaceItem,
    WorkspaceLogoutResponse,
    WorkspaceMemberItem,
    ZitadelPasswordLoginRequest,
)
from app.services.workspace_access import (
    AuthenticationError,
    AuthorizationError,
    CsrfValidationError,
    WorkspaceAccessContext,
    WorkspaceIssuedAuthTokens,
    authenticate_workspace_oidc_callback,
    authenticate_workspace_zitadel_password_login,
    build_console_route_permission_matrix,
    build_workspace_oidc_authorization_redirect,
    build_workspace_public_auth_options,
    ensure_console_route_access,
    get_workspace_access_context,
    get_workspace_access_cookie_name,
    get_workspace_auth_cookie_contract,
    get_workspace_csrf_cookie_name,
    get_workspace_csrf_header_name,
    get_workspace_oidc_state_cookie_name,
    get_workspace_refresh_cookie_name,
    issue_workspace_auth_tokens,
    refresh_workspace_session,
    resolve_console_route_access_policy,
    revoke_workspace_session,
    validate_workspace_csrf_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])
OIDC_STATE_COOKIE_MAX_AGE_SECONDS = 600


def build_auth_error_response(*, status_code: int, code: str, detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "code": code,
            "detail": detail,
            "message": detail,
        },
    )


def build_auth_validation_error_response(errors: Sequence[dict[str, Any]]) -> JSONResponse:
    normalized_errors: list[dict[str, Any]] = []
    for error in errors:
        location = [str(part) for part in error.get("loc", ()) if str(part) != "body"]
        normalized_errors.append(
            {
                "loc": [str(part) for part in error.get("loc", ())],
                "field": ".".join(location) if location else None,
                "message": str(error.get("msg") or "Invalid value"),
                "type": str(error.get("type") or "invalid"),
            }
        )

    detail = "认证请求参数无效，请检查请求内容。"
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={
            "code": "auth_invalid_request",
            "detail": detail,
            "message": detail,
            "errors": normalized_errors,
        },
    )


def map_authentication_error(detail: str) -> tuple[int, str]:
    if any(
        marker in detail
        for marker in (
            "缺少 issuer",
            "缺少 service user token",
            "OIDC 配置缺失",
            "当前 OIDC provider 不支持",
            "服务暂时不可用",
            "用户信息获取失败",
            "代理配置",
            "初始化失败",
            "OIDC discovery",
            "OIDC issuer 与配置不一致",
        )
    ):
        return status.HTTP_503_SERVICE_UNAVAILABLE, "auth_provider_unavailable"
    return status.HTTP_401_UNAUTHORIZED, "auth_invalid_credentials"


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


def _clear_oidc_state_cookie(response: Response) -> None:
    cookie_contract = get_workspace_auth_cookie_contract()
    response.delete_cookie(
        key=get_workspace_oidc_state_cookie_name(),
        path="/",
        secure=cookie_contract.secure,
        httponly=True,
        samesite=cookie_contract.same_site,
    )


def _build_oidc_failure_redirect(error_code: str) -> RedirectResponse:
    response = RedirectResponse(
        url=f"/login?error={error_code}",
        status_code=status.HTTP_303_SEE_OTHER,
    )
    _clear_oidc_state_cookie(response)
    return response


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


@router.post("/zitadel/login", response_model=AuthSessionResponse)
def login_with_zitadel_password(
    payload: ZitadelPasswordLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> Response:
    try:
        access_context = authenticate_workspace_zitadel_password_login(
            db,
            login_name=payload.login_name,
            password=payload.password,
        )
        tokens = issue_workspace_auth_tokens(access_context)
    except AuthenticationError:
        raise
    except Exception:
        return build_auth_error_response(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="auth_provider_unavailable",
            detail="认证服务暂时不可用，请稍后重试。",
        )

    db.commit()
    _apply_auth_cookies(response, tokens)
    return _serialize_access_context(access_context, tokens=tokens)


@router.get("/options", response_model=PublicAuthOptionsResponse)
def get_public_auth_options() -> PublicAuthOptionsResponse:
    return build_workspace_public_auth_options()


@router.get("/oidc/start", response_model=None)
def start_oidc_login(
    next_path: str | None = Query(default=None, alias="next"),
) -> Response:
    try:
        authorization_url, state_token = build_workspace_oidc_authorization_redirect(
            next_path=next_path,
        )
    except AuthenticationError:
        raise
    except Exception:
        return build_auth_error_response(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="auth_provider_unavailable",
            detail="认证服务暂时不可用，请稍后重试。",
        )

    response = RedirectResponse(
        url=authorization_url,
        status_code=status.HTTP_302_FOUND,
    )
    _set_cookie(
        response,
        name=get_workspace_oidc_state_cookie_name(),
        value=state_token,
        max_age=OIDC_STATE_COOKIE_MAX_AGE_SECONDS,
        http_only=True,
    )
    return response


@router.get("/callback")
def oidc_callback(
    request: Request,
    response: Response,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: Session = Depends(get_db),
) -> Response:
    if error:
        return _build_oidc_failure_redirect(str(error).strip() or "oidc_callback_failed")
    _ = error_description
    try:
        access_context, tokens, next_path = authenticate_workspace_oidc_callback(
            db,
            code=code,
            state_token=state,
            state_cookie_token=request.cookies.get(get_workspace_oidc_state_cookie_name()),
        )
    except AuthenticationError:
        db.rollback()
        return _build_oidc_failure_redirect("oidc_callback_failed")

    db.commit()
    redirect_response = RedirectResponse(
        url=next_path,
        status_code=status.HTTP_303_SEE_OTHER,
    )
    _clear_oidc_state_cookie(redirect_response)
    _apply_auth_cookies(redirect_response, tokens)
    return redirect_response


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
