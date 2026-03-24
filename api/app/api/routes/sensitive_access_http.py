from __future__ import annotations

from fastapi import status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.services.operator_run_follow_up import (
    build_operator_run_follow_up_summary,
    load_operator_run_snapshot,
    resolve_operator_run_snapshot_from_follow_up,
)
from app.services.sensitive_access_presenters import serialize_sensitive_resource
from app.services.sensitive_access_action_explanations import (
    build_sensitive_access_timeline_outcome_explanation,
)
from app.services.sensitive_access_reasoning import describe_sensitive_access_reasoning
from app.services.sensitive_access_run_resolution import collect_sensitive_access_run_ids
from app.services.sensitive_access_types import SensitiveAccessRequestBundle

__all__ = [
    "build_sensitive_access_blocking_response",
    "serialize_sensitive_access_bundle",
]


def serialize_sensitive_access_bundle(bundle: SensitiveAccessRequestBundle) -> dict:
    approval_ticket = bundle.approval_ticket
    reasoning = describe_sensitive_access_reasoning(
        decision=bundle.access_request.decision,
        reason_code=bundle.access_request.reason_code,
    )
    return {
        "resource": serialize_sensitive_resource(bundle.resource).model_dump(mode="json"),
        "access_request": {
            "id": bundle.access_request.id,
            "run_id": bundle.access_request.run_id,
            "node_run_id": bundle.access_request.node_run_id,
            "requester_type": bundle.access_request.requester_type,
            "requester_id": bundle.access_request.requester_id,
            "resource_id": bundle.access_request.resource_id,
            "action_type": bundle.access_request.action_type,
            "purpose_text": bundle.access_request.purpose_text,
            "decision": bundle.access_request.decision,
            "decision_label": reasoning.decision_label,
            "reason_code": bundle.access_request.reason_code,
            "reason_label": reasoning.reason_label,
            "policy_summary": reasoning.policy_summary,
        },
        "approval_ticket": (
            {
                "id": approval_ticket.id,
                "access_request_id": approval_ticket.access_request_id,
                "run_id": approval_ticket.run_id,
                "node_run_id": approval_ticket.node_run_id,
                "status": approval_ticket.status,
                "waiting_status": approval_ticket.waiting_status,
                "approved_by": approval_ticket.approved_by,
            }
            if approval_ticket is not None
            else None
        ),
        "notifications": [
            {
                "id": item.id,
                "approval_ticket_id": item.approval_ticket_id,
                "channel": item.channel,
                "target": item.target,
                "status": item.status,
            }
            for item in bundle.notifications
        ],
    }


def _build_sensitive_access_run_context(
    db: Session,
    bundle: SensitiveAccessRequestBundle,
) -> dict:
    payload: dict[str, object | None] = {
        "outcome_explanation": build_sensitive_access_timeline_outcome_explanation(
            bundle
        ).model_dump(mode="json")
    }

    metadata_payload = (
        bundle.resource.metadata_payload
        if isinstance(bundle.resource.metadata_payload, dict)
        else {}
    )
    metadata_run_ids = metadata_payload.get("run_ids")
    extra_run_ids: list[object | None] = [metadata_payload.get("run_id")]
    if isinstance(metadata_run_ids, (list, tuple, set)):
        extra_run_ids.extend(metadata_run_ids)
    elif isinstance(metadata_run_ids, str):
        extra_run_ids.append(metadata_run_ids)

    run_ids = collect_sensitive_access_run_ids(
        db,
        scopes=[
            (bundle.access_request.run_id, bundle.access_request.node_run_id),
            (
                bundle.approval_ticket.run_id if bundle.approval_ticket is not None else None,
                bundle.approval_ticket.node_run_id if bundle.approval_ticket is not None else None,
            ),
        ],
        extra_run_ids=extra_run_ids,
    )

    if not run_ids:
        return payload

    primary_run_id = run_ids[0]
    run_follow_up = build_operator_run_follow_up_summary(db, run_ids)
    run_snapshot = resolve_operator_run_snapshot_from_follow_up(
        run_follow_up,
        run_id=primary_run_id,
    )
    if run_snapshot is None:
        run_snapshot = load_operator_run_snapshot(db, primary_run_id)

    payload["run_snapshot"] = (
        run_snapshot.model_dump(mode="json") if run_snapshot is not None else None
    )
    payload["run_follow_up"] = run_follow_up.model_dump(mode="json")
    return payload


def build_sensitive_access_blocking_response(
    bundle: SensitiveAccessRequestBundle | None,
    *,
    db: Session,
    approval_detail: str,
    deny_detail: str,
) -> JSONResponse | None:
    if bundle is None or bundle.access_request.decision == "allow":
        return None

    payload = serialize_sensitive_access_bundle(bundle)
    payload.update(_build_sensitive_access_run_context(db, bundle))
    if (
        bundle.access_request.decision == "require_approval"
        and bundle.approval_ticket is not None
        and bundle.approval_ticket.status == "pending"
    ):
        payload["detail"] = approval_detail
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=payload)

    payload["detail"] = deny_detail
    return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content=payload)
