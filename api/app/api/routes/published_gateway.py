from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.workflow_publish import PublishedNativeRunRequest, PublishedNativeRunResponse
from app.services.published_gateway import (
    PublishedEndpointGatewayError,
    PublishedEndpointGatewayService,
)
from app.services.run_views import serialize_run_detail

router = APIRouter(prefix="/v1/workflows", tags=["published-gateway"])
published_gateway_service = PublishedEndpointGatewayService()


@router.post(
    "/{workflow_id}/published-endpoints/{endpoint_id}/run",
    response_model=PublishedNativeRunResponse,
)
def invoke_published_native_endpoint(
    workflow_id: str,
    endpoint_id: str,
    payload: PublishedNativeRunRequest,
    db: Session = Depends(get_db),
) -> PublishedNativeRunResponse:
    try:
        result = published_gateway_service.invoke_native_endpoint(
            db,
            workflow_id=workflow_id,
            endpoint_id=endpoint_id,
            input_payload=payload.input_payload,
        )
    except PublishedEndpointGatewayError as exc:
        detail = str(exc)
        status_code = (
            status.HTTP_404_NOT_FOUND
            if detail
            in {
                "Workflow not found.",
                "Published endpoint binding is not currently active.",
            }
            else status.HTTP_422_UNPROCESSABLE_CONTENT
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc

    return PublishedNativeRunResponse(
        binding_id=result.binding_id,
        endpoint_id=result.endpoint_id,
        endpoint_name=result.endpoint_name,
        workflow_id=result.workflow.id,
        workflow_version=result.workflow_version.version,
        compiled_blueprint_id=result.blueprint_record.id,
        run=serialize_run_detail(result.artifacts),
    )
