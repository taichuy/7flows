from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.workflow_library import WorkflowLibrarySnapshot
from app.schemas.workspace_starter import (
    WorkflowBusinessTrack,
    WorkspaceStarterSourceGovernanceKind,
)
from app.services.workflow_library import get_workflow_library_service

router = APIRouter(prefix="/workflow-library", tags=["workflow-library"])


@router.get("", response_model=WorkflowLibrarySnapshot)
def get_workflow_library_snapshot(
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    business_track: WorkflowBusinessTrack | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1, max_length=128),
    source_governance_kind: WorkspaceStarterSourceGovernanceKind | None = Query(
        default=None
    ),
    needs_follow_up: bool = Query(default=False),
    include_builtin_starters: bool = Query(default=True),
    include_starter_definitions: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> WorkflowLibrarySnapshot:
    return get_workflow_library_service().build_snapshot(
        db,
        workspace_id=workspace_id,
        business_track=business_track,
        search=search,
        source_governance_kind=source_governance_kind,
        needs_follow_up=needs_follow_up,
        include_builtin_starters=include_builtin_starters,
        include_starter_definitions=include_starter_definitions,
    )
