from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.models.run import NodeRun
from app.services.runtime_types import ArtifactReference


class ContextService:
    def build_global_context(
        self,
        *,
        trigger_input: dict[str, Any],
        workflow_variables: dict[str, Any] | None = None,
        constraints: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {
            "trigger_input": deepcopy(trigger_input),
            "workflow_variables": deepcopy(workflow_variables or {}),
            "constraints": deepcopy(constraints or {}),
        }

    def build_node_context_roots(
        self,
        *,
        node_run: NodeRun | None,
        global_context: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "global_context": deepcopy(global_context),
            "working_context": deepcopy(node_run.working_context if node_run is not None else {}),
            "evidence_context": deepcopy(node_run.evidence_context if node_run is not None else {}),
            "artifact_refs": list(node_run.artifact_refs if node_run is not None else []),
        }

    def update_working_context(
        self,
        node_run: NodeRun,
        **patches: Any,
    ) -> dict[str, Any]:
        working_context = deepcopy(node_run.working_context or {})
        for key, value in patches.items():
            if value is None:
                working_context.pop(key, None)
            else:
                working_context[key] = deepcopy(value)
        node_run.working_context = working_context
        return working_context

    def set_evidence_context(self, node_run: NodeRun, evidence: dict[str, Any] | None) -> None:
        node_run.evidence_context = deepcopy(evidence) if evidence is not None else None

    def append_artifact_ref(
        self,
        node_run: NodeRun,
        artifact_ref: str | ArtifactReference | None,
    ) -> list[str]:
        if artifact_ref is None:
            return list(node_run.artifact_refs or [])
        resolved_ref = (
            artifact_ref.uri
            if isinstance(artifact_ref, ArtifactReference)
            else str(artifact_ref)
        )
        artifact_refs = list(node_run.artifact_refs or [])
        if resolved_ref not in artifact_refs:
            artifact_refs.append(resolved_ref)
        node_run.artifact_refs = artifact_refs
        return artifact_refs

    def replace_artifact_refs(
        self,
        node_run: NodeRun,
        artifact_refs: list[str],
    ) -> None:
        node_run.artifact_refs = list(dict.fromkeys(str(item) for item in artifact_refs if item))
