from datetime import datetime

from pydantic import BaseModel, Field

WorkspaceMemberRole = str


class WorkspaceItem(BaseModel):
    id: str
    name: str
    slug: str


class UserAccountItem(BaseModel):
    id: str
    email: str
    display_name: str
    status: str
    last_login_at: datetime | None = None


class WorkspaceMemberItem(BaseModel):
    id: str
    role: WorkspaceMemberRole
    user: UserAccountItem
    invited_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime


class AuthLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class AuthSessionResponse(BaseModel):
    token: str
    workspace: WorkspaceItem
    current_user: UserAccountItem
    current_member: WorkspaceMemberItem
    available_roles: list[WorkspaceMemberRole]
    expires_at: datetime


class WorkspaceContextResponse(BaseModel):
    workspace: WorkspaceItem
    current_user: UserAccountItem
    current_member: WorkspaceMemberItem
    available_roles: list[WorkspaceMemberRole]
    can_manage_members: bool


class WorkspaceMemberCreateRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    display_name: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=6, max_length=128)
    role: WorkspaceMemberRole = Field(default="viewer")


class WorkspaceMemberRoleUpdateRequest(BaseModel):
    role: WorkspaceMemberRole


class WorkspaceLogoutResponse(BaseModel):
    ok: bool = True
