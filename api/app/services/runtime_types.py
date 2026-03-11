from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

NodePhase = Literal[
    "pending",
    "preparing",
    "running_main",
    "tool_execute",
    "assistant_distill",
    "main_finalize",
    "emit_output",
    "waiting_tool",
    "waiting_callback",
]
ToolContentType = Literal["text", "json", "file", "table", "binary", "mixed"]
AssistantTriggerMode = Literal[
    "always",
    "on_large_payload",
    "on_search_result",
    "on_multi_tool_results",
    "on_high_risk_mode",
]

PHASE_STATUS_MAP: dict[str, str] = {
    "pending": "pending",
    "preparing": "preparing",
    "running_main": "running_main",
    "tool_execute": "running_main",
    "assistant_distill": "running_assistant",
    "main_finalize": "finalizing",
    "emit_output": "finalizing",
    "waiting_tool": "waiting_tool",
    "waiting_callback": "waiting_callback",
}


class WorkflowExecutionError(RuntimeError):
    pass


@dataclass(frozen=True)
class RuntimeEvent:
    event_type: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class CompiledEdge:
    id: str
    source_node_id: str
    target_node_id: str
    channel: str
    condition: str | None = None
    condition_expression: str | None = None
    mapping: tuple[dict[str, Any], ...] = ()


@dataclass(frozen=True)
class CompiledNode:
    id: str
    type: str
    name: str
    config: dict[str, Any]
    runtime_policy: dict[str, Any]
    input_schema: dict[str, Any] | None = None
    output_schema: dict[str, Any] | None = None


@dataclass(frozen=True)
class CompiledWorkflowBlueprint:
    workflow_id: str
    workflow_version: str
    trigger_node_id: str
    output_node_ids: tuple[str, ...]
    workflow_variables: dict[str, Any]
    ordered_nodes: tuple[CompiledNode, ...]
    node_lookup: dict[str, CompiledNode]
    incoming_nodes: dict[str, tuple[str, ...]]
    outgoing_edges: dict[str, tuple[CompiledEdge, ...]]


@dataclass
class RetryPolicy:
    max_attempts: int = 1
    backoff_seconds: float = 0.0
    backoff_multiplier: float = 1.0


@dataclass(frozen=True)
class AuthorizedContextRefs:
    current_node_id: str
    readable_node_ids: tuple[str, ...] = ()
    readable_artifacts: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True)
class JoinPolicy:
    mode: str = "any"
    required_node_ids: tuple[str, ...] = ()
    on_unmet: str = "skip"
    merge_strategy: str = "error"


@dataclass(frozen=True)
class JoinDecision:
    should_execute: bool
    mode: str
    on_unmet: str
    merge_strategy: str
    expected_source_ids: tuple[str, ...]
    activated_source_ids: tuple[str, ...]
    missing_source_ids: tuple[str, ...]
    reason: str | None = None
    block_on_unmet: bool = False


@dataclass(frozen=True)
class ArtifactReference:
    id: str
    uri: str
    artifact_kind: str
    content_type: str
    summary: str
    metadata_payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolExecutionResult:
    status: str
    content_type: ToolContentType
    summary: str
    raw_ref: str | None
    structured: dict[str, Any]
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AgentToolCall:
    tool_id: str
    inputs: dict[str, Any] = field(default_factory=dict)
    ecosystem: str = "native"
    adapter_id: str | None = None
    label: str | None = None
    timeout_ms: int | None = None


@dataclass
class AgentPlan:
    tool_calls: list[AgentToolCall] = field(default_factory=list)
    need_assistant: bool = False
    finalize_from: str = "evidence"

    def as_dict(self) -> dict[str, Any]:
        return {
            "toolCalls": [
                {
                    "toolId": tool_call.tool_id,
                    "inputs": tool_call.inputs,
                    "ecosystem": tool_call.ecosystem,
                    "adapterId": tool_call.adapter_id,
                    "label": tool_call.label,
                    "timeoutMs": tool_call.timeout_ms,
                }
                for tool_call in self.tool_calls
            ],
            "needAssistant": self.need_assistant,
            "finalizeFrom": self.finalize_from,
        }


@dataclass
class EvidencePack:
    summary: str
    key_points: list[str] = field(default_factory=list)
    evidence: list[dict[str, Any]] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)
    unknowns: list[str] = field(default_factory=list)
    recommended_focus: list[str] = field(default_factory=list)
    confidence: float = 0.0
    artifact_refs: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "summary": self.summary,
            "key_points": self.key_points,
            "evidence": self.evidence,
            "conflicts": self.conflicts,
            "unknowns": self.unknowns,
            "recommended_focus": self.recommended_focus,
            "confidence": self.confidence,
            "artifact_refs": self.artifact_refs,
        }


@dataclass
class NodeExecutionResult:
    output: dict[str, Any] | None = None
    suspended: bool = False
    waiting_status: str | None = None
    waiting_reason: str | None = None
    events: list[RuntimeEvent] = field(default_factory=list)


@dataclass
class AgentExecutionResult(NodeExecutionResult):
    evidence_pack: dict[str, Any] | None = None
    artifact_refs: list[str] = field(default_factory=list)
    tool_results: list[ToolExecutionResult] = field(default_factory=list)


@dataclass
class FlowCheckpointState:
    ordered_node_ids: list[str]
    next_node_index: int = 0
    activated_by: dict[str, list[str]] = field(default_factory=dict)
    upstream_inputs: dict[str, dict[str, Any]] = field(default_factory=dict)
    mapped_inputs: dict[str, dict[str, Any]] = field(default_factory=dict)
    outputs: dict[str, dict[str, Any]] = field(default_factory=dict)
    completed_output_nodes: list[str] = field(default_factory=list)
    waiting_node_run_id: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "ordered_node_ids": self.ordered_node_ids,
            "next_node_index": self.next_node_index,
            "activated_by": self.activated_by,
            "upstream_inputs": self.upstream_inputs,
            "mapped_inputs": self.mapped_inputs,
            "outputs": self.outputs,
            "completed_output_nodes": self.completed_output_nodes,
            "waiting_node_run_id": self.waiting_node_run_id,
        }

    @classmethod
    def from_dict(
        cls,
        payload: dict[str, Any] | None,
        *,
        ordered_node_ids: list[str],
    ) -> FlowCheckpointState:
        if not isinstance(payload, dict):
            return cls(ordered_node_ids=ordered_node_ids)
        return cls(
            ordered_node_ids=list(payload.get("ordered_node_ids") or ordered_node_ids),
            next_node_index=int(payload.get("next_node_index") or 0),
            activated_by={
                str(node_id): [str(source_id) for source_id in source_ids]
                for node_id, source_ids in (payload.get("activated_by") or {}).items()
            },
            upstream_inputs={
                str(node_id): dict(source_outputs)
                for node_id, source_outputs in (payload.get("upstream_inputs") or {}).items()
            },
            mapped_inputs={
                str(node_id): dict(mapped)
                for node_id, mapped in (payload.get("mapped_inputs") or {}).items()
            },
            outputs={
                str(node_id): dict(output)
                for node_id, output in (payload.get("outputs") or {}).items()
            },
            completed_output_nodes=[
                str(node_id) for node_id in (payload.get("completed_output_nodes") or [])
            ],
            waiting_node_run_id=payload.get("waiting_node_run_id"),
        )
