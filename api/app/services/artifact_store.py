from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import RunArtifact
from app.services.runtime_types import ArtifactReference

_SUMMARY_LIMIT = 180


def _utcnow() -> datetime:
    return datetime.now(UTC)


class RuntimeArtifactStore:
    def create_artifact(
        self,
        db: Session,
        *,
        run_id: str,
        node_run_id: str | None,
        artifact_kind: str,
        value: Any,
        content_type: str | None = None,
        summary: str | None = None,
        metadata_payload: dict[str, Any] | None = None,
    ) -> ArtifactReference:
        normalized_content_type = content_type or self.infer_content_type(value)
        payload: dict[str, Any] | None = value if isinstance(value, dict) else None
        text_content: str | None = value if isinstance(value, str) else None
        resolved_summary = summary or self.summarize(value)
        artifact = RunArtifact(
            id=str(uuid4()),
            run_id=run_id,
            node_run_id=node_run_id,
            artifact_kind=artifact_kind,
            content_type=normalized_content_type,
            summary=resolved_summary,
            payload=payload,
            text_content=text_content,
            metadata_payload=dict(metadata_payload or {}),
            created_at=_utcnow(),
        )
        db.add(artifact)
        db.flush()
        return self.serialize_reference(artifact)

    def load_run_artifacts(self, db: Session, run_id: str) -> list[RunArtifact]:
        return db.scalars(
            select(RunArtifact)
            .where(RunArtifact.run_id == run_id)
            .order_by(RunArtifact.created_at.asc())
        ).all()

    def serialize_reference(self, artifact: RunArtifact) -> ArtifactReference:
        return ArtifactReference(
            id=artifact.id,
            uri=self.build_uri(artifact.id),
            artifact_kind=artifact.artifact_kind,
            content_type=artifact.content_type,
            summary=artifact.summary,
            metadata_payload=dict(artifact.metadata_payload or {}),
        )

    def build_uri(self, artifact_id: str) -> str:
        return f"artifact://{artifact_id}"

    def infer_content_type(self, value: Any) -> str:
        if isinstance(value, str):
            return "text"
        if isinstance(value, dict):
            return "json"
        if isinstance(value, list):
            return "mixed"
        return "binary"

    def summarize(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value if len(value) <= _SUMMARY_LIMIT else f"{value[:_SUMMARY_LIMIT]}..."
        try:
            raw = json.dumps(value, ensure_ascii=False, sort_keys=True)
        except TypeError:
            raw = str(value)
        return raw if len(raw) <= _SUMMARY_LIMIT else f"{raw[:_SUMMARY_LIMIT]}..."
