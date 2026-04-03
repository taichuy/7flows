from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.routes.auth import require_console_route_access
from app.core.database import get_db
from app.schemas.workflow_publish import (
    PublishedEndpointApiKeyCreateRequest,
    PublishedEndpointApiKeyCreateResponse,
    PublishedEndpointApiKeyItem,
)
from app.services.published_api_keys import (
    PublishedEndpointApiKeyError,
    PublishedEndpointApiKeyService,
)

router = APIRouter(prefix="/workflows", tags=["workflow-publish"])
published_endpoint_api_key_service = PublishedEndpointApiKeyService()


def _serialize_api_key_item(item) -> PublishedEndpointApiKeyItem:
    return PublishedEndpointApiKeyItem(
        id=item.id,
        workflow_id=item.workflow_id,
        endpoint_id=item.endpoint_id,
        name=item.name,
        key_prefix=item.key_prefix,
        status=item.status,
        last_used_at=item.last_used_at,
        revoked_at=item.revoked_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _raise_api_key_http_error(exc: PublishedEndpointApiKeyError) -> None:
    detail = str(exc)
    not_found_details = {
        "Published endpoint binding not found.",
        "Published endpoint API key not found.",
    }
    status_code = (
        status.HTTP_404_NOT_FOUND
        if detail in not_found_details
        else status.HTTP_422_UNPROCESSABLE_CONTENT
    )
    raise HTTPException(status_code=status_code, detail=detail) from exc


@router.get(
    "/{workflow_id}/published-endpoints/{binding_id}/api-keys",
    response_model=list[PublishedEndpointApiKeyItem],
)
def list_published_endpoint_api_keys(
    workflow_id: str,
    binding_id: str,
    include_revoked: bool = Query(default=False),
    _access_context=Depends(
        require_console_route_access(
            "/api/workflows/{workflow_id}/published-endpoints/{binding_id}/api-keys", method="GET"
        )
    ),
    db: Session = Depends(get_db),
) -> list[PublishedEndpointApiKeyItem]:
    try:
        binding = published_endpoint_api_key_service.get_binding_for_api_key_management(
            db,
            workflow_id=workflow_id,
            binding_id=binding_id,
        )
        items = published_endpoint_api_key_service.list_keys(
            db,
            workflow_id=workflow_id,
            endpoint_id=binding.endpoint_id,
            include_revoked=include_revoked,
        )
    except PublishedEndpointApiKeyError as exc:
        _raise_api_key_http_error(exc)
    return [_serialize_api_key_item(item) for item in items]


@router.post(
    "/{workflow_id}/published-endpoints/{binding_id}/api-keys",
    response_model=PublishedEndpointApiKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_published_endpoint_api_key(
    workflow_id: str,
    binding_id: str,
    payload: PublishedEndpointApiKeyCreateRequest,
    _access_context=Depends(
        require_console_route_access(
            "/api/workflows/{workflow_id}/published-endpoints/{binding_id}/api-keys", method="POST"
        )
    ),
    db: Session = Depends(get_db),
) -> PublishedEndpointApiKeyCreateResponse:
    try:
        binding = published_endpoint_api_key_service.get_binding_for_api_key_management(
            db,
            workflow_id=workflow_id,
            binding_id=binding_id,
        )
        created = published_endpoint_api_key_service.create_key(
            db,
            workflow_id=workflow_id,
            endpoint_id=binding.endpoint_id,
            name=payload.name,
        )
    except PublishedEndpointApiKeyError as exc:
        _raise_api_key_http_error(exc)

    db.commit()
    db.refresh(created.record)
    return PublishedEndpointApiKeyCreateResponse(
        **_serialize_api_key_item(created.record).model_dump(),
        secret_key=created.secret_key,
    )


@router.delete(
    "/{workflow_id}/published-endpoints/{binding_id}/api-keys/{key_id}",
    response_model=PublishedEndpointApiKeyItem,
)
def revoke_published_endpoint_api_key(
    workflow_id: str,
    binding_id: str,
    key_id: str,
    _access_context=Depends(
        require_console_route_access(
            "/api/workflows/{workflow_id}/published-endpoints/{binding_id}/api-keys/{key_id}",
            method="DELETE",
        )
    ),
    db: Session = Depends(get_db),
) -> PublishedEndpointApiKeyItem:
    try:
        binding = published_endpoint_api_key_service.get_binding_for_api_key_management(
            db,
            workflow_id=workflow_id,
            binding_id=binding_id,
        )
        item = published_endpoint_api_key_service.revoke_key(
            db,
            workflow_id=workflow_id,
            endpoint_id=binding.endpoint_id,
            key_id=key_id,
        )
    except PublishedEndpointApiKeyError as exc:
        _raise_api_key_http_error(exc)

    db.commit()
    db.refresh(item)
    return _serialize_api_key_item(item)
