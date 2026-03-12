from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.workflow import Workflow, WorkflowPublishedEndpoint
from app.schemas.workflow_publish import (
    PublishedEndpointCacheInventoryItem,
    PublishedEndpointCacheInventoryResponse,
    PublishedEndpointCacheInventorySummary,
)
from app.services.published_cache import PublishedEndpointCacheService

router = APIRouter(prefix="/workflows", tags=["published-endpoint-cache"])
published_cache_service = PublishedEndpointCacheService()


def _serialize_cache_inventory_summary(summary) -> PublishedEndpointCacheInventorySummary:
    return PublishedEndpointCacheInventorySummary(
        enabled=summary.enabled,
        ttl=summary.ttl,
        max_entries=summary.max_entries,
        vary_by=list(summary.vary_by),
        active_entry_count=summary.active_entry_count,
        total_hit_count=summary.total_hit_count,
        last_hit_at=summary.last_hit_at,
        nearest_expires_at=summary.nearest_expires_at,
        latest_created_at=summary.latest_created_at,
    )


def _serialize_cache_inventory_item(item) -> PublishedEndpointCacheInventoryItem:
    return PublishedEndpointCacheInventoryItem(
        id=item.id,
        binding_id=item.binding_id,
        cache_key=item.cache_key,
        response_preview=item.response_preview,
        hit_count=item.hit_count,
        last_hit_at=item.last_hit_at,
        expires_at=item.expires_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.get(
    "/{workflow_id}/published-endpoints/{binding_id}/cache-entries",
    response_model=PublishedEndpointCacheInventoryResponse,
)
def list_published_endpoint_cache_entries(
    workflow_id: str,
    binding_id: str,
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
) -> PublishedEndpointCacheInventoryResponse:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    binding = db.get(WorkflowPublishedEndpoint, binding_id)
    if binding is None or binding.workflow_id != workflow_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published endpoint binding not found.",
        )

    summary = published_cache_service.build_binding_summary(db, binding=binding)
    items = published_cache_service.list_inventory_items(
        db,
        binding=binding,
        limit=limit,
    )
    return PublishedEndpointCacheInventoryResponse(
        summary=_serialize_cache_inventory_summary(summary),
        items=[_serialize_cache_inventory_item(item) for item in items],
    )
