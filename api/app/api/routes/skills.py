from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.routes.auth import require_console_route_access
from app.core.database import get_db
from app.schemas.skill import (
    SkillDocCreate,
    SkillDocDetail,
    SkillDocListItem,
    SkillDocUpdate,
    SkillMcpCall,
    SkillMcpResponse,
    SkillReferenceDocDetail,
)
from app.services.skill_catalog import SkillCatalogError, SkillCatalogService

router = APIRouter(prefix="/skills", tags=["skills"])
skill_catalog_service = SkillCatalogService()


@router.get("", response_model=list[SkillDocListItem])
def list_skills(
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    _access_context=Depends(require_console_route_access("/api/skills", method="GET")),
    db: Session = Depends(get_db),
) -> list[SkillDocListItem]:
    return skill_catalog_service.list_skills(db, workspace_id=workspace_id)


@router.post("", response_model=SkillDocDetail, status_code=status.HTTP_201_CREATED)
def create_skill(
    payload: SkillDocCreate,
    _access_context=Depends(require_console_route_access("/api/skills", method="POST")),
    db: Session = Depends(get_db),
) -> SkillDocDetail:
    try:
        record = skill_catalog_service.create_skill(db, payload)
    except SkillCatalogError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    db.commit()
    db.refresh(record)
    return skill_catalog_service.serialize_detail(db, record)


@router.post("/mcp/call", response_model=SkillMcpResponse)
def call_skill_catalog_mcp(
    payload: SkillMcpCall,
    _access_context=Depends(require_console_route_access("/api/skills/mcp/call", method="POST")),
    db: Session = Depends(get_db),
) -> SkillMcpResponse:
    try:
        return skill_catalog_service.invoke_mcp_method(
            db,
            method=payload.method,
            params=payload.params,
        )
    except SkillCatalogError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.get("/{skill_id}", response_model=SkillDocDetail)
def get_skill(
    skill_id: str,
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    _access_context=Depends(require_console_route_access("/api/skills/{skill_id}", method="GET")),
    db: Session = Depends(get_db),
) -> SkillDocDetail:
    record = skill_catalog_service.get_skill(db, skill_id=skill_id, workspace_id=workspace_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found.")
    return skill_catalog_service.serialize_detail(db, record)


@router.put("/{skill_id}", response_model=SkillDocDetail)
def update_skill(
    skill_id: str,
    payload: SkillDocUpdate,
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    _access_context=Depends(require_console_route_access("/api/skills/{skill_id}", method="PUT")),
    db: Session = Depends(get_db),
) -> SkillDocDetail:
    record = skill_catalog_service.get_skill(db, skill_id=skill_id, workspace_id=workspace_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found.")
    try:
        record = skill_catalog_service.update_skill(db, record=record, payload=payload)
    except SkillCatalogError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    db.commit()
    db.refresh(record)
    return skill_catalog_service.serialize_detail(db, record)


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_skill(
    skill_id: str,
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    _access_context=Depends(
        require_console_route_access("/api/skills/{skill_id}", method="DELETE")
    ),
    db: Session = Depends(get_db),
) -> None:
    record = skill_catalog_service.get_skill(db, skill_id=skill_id, workspace_id=workspace_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found.")
    skill_catalog_service.delete_skill(db, record=record)
    db.commit()


@router.get(
    "/{skill_id}/references/{reference_id}",
    response_model=SkillReferenceDocDetail,
)
def get_skill_reference(
    skill_id: str,
    reference_id: str,
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    _access_context=Depends(
        require_console_route_access(
            "/api/skills/{skill_id}/references/{reference_id}", method="GET"
        )
    ),
    db: Session = Depends(get_db),
) -> SkillReferenceDocDetail:
    reference = skill_catalog_service.get_reference(
        db,
        skill_id=skill_id,
        reference_id=reference_id,
        workspace_id=workspace_id,
    )
    if reference is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Skill reference not found.",
        )
    return skill_catalog_service.serialize_reference_detail(reference)
