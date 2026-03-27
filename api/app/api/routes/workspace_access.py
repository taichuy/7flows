from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.routes.auth import get_authenticated_access_context
from app.core.database import get_db
from app.schemas.workspace_access import (
    UserAccountItem,
    WorkspaceContextResponse,
    WorkspaceItem,
    WorkspaceMemberCreateRequest,
    WorkspaceMemberItem,
    WorkspaceMemberRoleUpdateRequest,
)
from app.services.workspace_access import (
    AuthorizationError,
    ConflictError,
    WorkspaceAccessContext,
    create_workspace_member,
    get_workspace_user_index,
    list_workspace_members,
    update_workspace_member_role,
)

router = APIRouter(prefix="/workspace", tags=["workspace"])


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


def _serialize_workspace_context(
    access_context: WorkspaceAccessContext,
) -> WorkspaceContextResponse:
    return WorkspaceContextResponse(
        workspace=WorkspaceItem(
            id=access_context.workspace.id,
            name=access_context.workspace.name,
            slug=access_context.workspace.slug,
        ),
        current_user=_serialize_user(access_context.user),
        current_member=_serialize_member(access_context.member, user=access_context.user),
        available_roles=["owner", "admin", "editor", "viewer"],
        can_manage_members=access_context.member.role in {"owner", "admin"},
    )


@router.get("/context", response_model=WorkspaceContextResponse)
def get_workspace_context(
    access_context: WorkspaceAccessContext = Depends(get_authenticated_access_context),
) -> WorkspaceContextResponse:
    return _serialize_workspace_context(access_context)


@router.get("/members", response_model=list[WorkspaceMemberItem])
def get_workspace_members(
    access_context: WorkspaceAccessContext = Depends(get_authenticated_access_context),
    db: Session = Depends(get_db),
) -> list[WorkspaceMemberItem]:
    members = list_workspace_members(db, workspace_id=access_context.workspace.id)
    users_by_id = get_workspace_user_index(db, user_ids=[member.user_id for member in members])
    return [
        _serialize_member(member, user=users_by_id[member.user_id])
        for member in members
        if member.user_id in users_by_id
    ]


@router.post("/members", response_model=WorkspaceMemberItem, status_code=status.HTTP_201_CREATED)
def create_member(
    payload: WorkspaceMemberCreateRequest,
    access_context: WorkspaceAccessContext = Depends(get_authenticated_access_context),
    db: Session = Depends(get_db),
) -> WorkspaceMemberItem:
    try:
        member = create_workspace_member(
            db,
            access_context=access_context,
            email=payload.email,
            display_name=payload.display_name,
            password=payload.password,
            role=payload.role,
        )
    except AuthorizationError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    db.commit()
    db.refresh(member)
    users_by_id = get_workspace_user_index(db, user_ids=[member.user_id])
    return _serialize_member(member, user=users_by_id[member.user_id])


@router.patch("/members/{member_id}", response_model=WorkspaceMemberItem)
def update_member_role(
    member_id: str,
    payload: WorkspaceMemberRoleUpdateRequest,
    access_context: WorkspaceAccessContext = Depends(get_authenticated_access_context),
    db: Session = Depends(get_db),
) -> WorkspaceMemberItem:
    try:
        member = update_workspace_member_role(
            db,
            access_context=access_context,
            member_id=member_id,
            role=payload.role,
        )
    except AuthorizationError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    db.commit()
    db.refresh(member)
    users_by_id = get_workspace_user_index(db, user_ids=[member.user_id])
    return _serialize_member(member, user=users_by_id[member.user_id])
