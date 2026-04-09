from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.safe_expressions import (
    BRANCH_EXPRESSION_NAMES,
    SafeExpressionValidationError,
    validate_expression,
)
from app.schemas.workflow_runtime_policy import WorkflowNodeExecutionPolicy

ArtifactType = Literal["text", "json", "file", "tool_result", "message"]
AssistantTriggerMode = Literal[
    "always",
    "on_large_payload",
    "on_search_result",
    "on_multi_tool_results",
    "on_high_risk_mode",
]
SkillBindingPhase = Literal["main_plan", "assistant_distill", "main_finalize"]


def validate_safe_expression(
    expression: object,
    *,
    allowed_names: set[str] | frozenset[str],
    error_prefix: str,
) -> None:
    if not isinstance(expression, str) or not expression.strip():
        raise ValueError(f"{error_prefix} must be a non-empty string.")
    try:
        validate_expression(expression, allowed_names=allowed_names)
    except SafeExpressionValidationError as exc:
        raise ValueError(f"{error_prefix} is invalid: {exc}") from exc


class WorkflowNodeContextArtifactRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nodeId: str = Field(min_length=1, max_length=64)
    artifactType: ArtifactType


class WorkflowNodeContextAccess(BaseModel):
    model_config = ConfigDict(extra="forbid")

    readableNodeIds: list[str] = Field(default_factory=list)
    readableArtifacts: list[WorkflowNodeContextArtifactRef] = Field(default_factory=list)


class WorkflowNodeMcpQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["authorized_context"]
    sourceNodeIds: list[str] | None = None
    artifactTypes: list[ArtifactType] | None = None


class WorkflowNodeReferenceConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceNodeId: str = Field(min_length=1, max_length=64)
    artifactType: Literal["json"] = "json"


class WorkflowNodeModelConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    providerConfigRef: str | None = Field(default=None, min_length=1, max_length=128)
    provider: str | None = Field(default=None, min_length=1, max_length=64)
    modelId: str | None = Field(default=None, min_length=1, max_length=256)
    apiKey: str | None = Field(default=None, min_length=1, max_length=256)
    baseUrl: str | None = Field(default=None, min_length=1, max_length=512)
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    maxTokens: int | None = Field(default=None, ge=1, le=128_000)

    @model_validator(mode="after")
    def validate_reference_or_legacy_fields(self) -> WorkflowNodeModelConfig:
        if self.providerConfigRef is None:
            return self
        if self.provider is not None and not self.provider.strip():
            raise ValueError("config.model.provider must be non-empty when provided.")
        if self.apiKey is not None and not self.apiKey.strip():
            raise ValueError("config.model.apiKey must be non-empty when provided.")
        if self.baseUrl is not None and not self.baseUrl.strip():
            raise ValueError("config.model.baseUrl must be non-empty when provided.")
        return self


class WorkflowNodeToolBinding(BaseModel):
    model_config = ConfigDict(extra="allow")

    toolId: str = Field(min_length=1, max_length=256)
    ecosystem: str | None = Field(default=None, min_length=1, max_length=64)
    adapterId: str | None = Field(default=None, min_length=1, max_length=128)
    credentials: dict[str, str] = Field(default_factory=dict)
    timeoutMs: int | None = Field(default=None, ge=1, le=600_000)

    @model_validator(mode="after")
    def validate_binding_consistency(self) -> WorkflowNodeToolBinding:
        if self.adapterId is not None and self.ecosystem is None:
            raise ValueError("config.tool.adapterId requires config.tool.ecosystem.")
        if self.ecosystem == "native" and self.adapterId is not None:
            raise ValueError("config.tool.adapterId cannot be used with ecosystem 'native'.")
        return self


class WorkflowNodeAssistantConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    enabled: bool = False
    trigger: AssistantTriggerMode = "on_multi_tool_results"
    model: dict[str, Any] | None = None


class WorkflowNodeSkillBinding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    skillIds: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def normalize_skill_ids(self) -> WorkflowNodeSkillBinding:
        normalized_skill_ids: list[str] = []
        for raw_skill_id in self.skillIds:
            skill_id = raw_skill_id.strip()
            if skill_id and skill_id not in normalized_skill_ids:
                normalized_skill_ids.append(skill_id)
        self.skillIds = normalized_skill_ids
        return self


class WorkflowNodeSkillReferenceBinding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    skillId: str = Field(min_length=1, max_length=64)
    referenceId: str = Field(min_length=1, max_length=64)
    phases: list[SkillBindingPhase] = Field(default_factory=list)

    @model_validator(mode="after")
    def normalize_fields(self) -> WorkflowNodeSkillReferenceBinding:
        self.skillId = self.skillId.strip()
        self.referenceId = self.referenceId.strip()
        normalized_phases: list[SkillBindingPhase] = []
        for phase in self.phases:
            if phase not in normalized_phases:
                normalized_phases.append(phase)
        self.phases = normalized_phases
        return self


class WorkflowNodeSkillBindingPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabledPhases: list[SkillBindingPhase] = Field(default_factory=list)
    promptBudgetChars: int | None = Field(default=None, ge=256, le=16_000)
    references: list[WorkflowNodeSkillReferenceBinding] = Field(default_factory=list)

    @model_validator(mode="after")
    def normalize_policy(self) -> WorkflowNodeSkillBindingPolicy:
        normalized_phases: list[SkillBindingPhase] = []
        for phase in self.enabledPhases:
            if phase not in normalized_phases:
                normalized_phases.append(phase)
        self.enabledPhases = normalized_phases

        merged_reference_phases: dict[tuple[str, str], list[SkillBindingPhase]] = {}
        for reference in self.references:
            key = (reference.skillId, reference.referenceId)
            phases = merged_reference_phases.setdefault(key, [])
            for phase in reference.phases:
                if phase not in phases:
                    phases.append(phase)

        self.references = [
            WorkflowNodeSkillReferenceBinding(
                skillId=skill_id,
                referenceId=reference_id,
                phases=phases,
            )
            for (skill_id, reference_id), phases in merged_reference_phases.items()
        ]
        return self


class WorkflowNodeToolPolicy(BaseModel):
    model_config = ConfigDict(extra="allow")

    allowedToolIds: list[str] = Field(default_factory=list)
    timeoutMs: int | None = Field(default=None, ge=1, le=600_000)
    execution: WorkflowNodeExecutionPolicy | None = None


class WorkflowNodeAgentToolCall(BaseModel):
    model_config = ConfigDict(extra="allow")

    toolId: str = Field(min_length=1, max_length=256)
    ecosystem: str = Field(default="native", min_length=1, max_length=64)
    adapterId: str | None = Field(default=None, min_length=1, max_length=128)
    inputs: dict[str, Any] = Field(default_factory=dict)
    timeoutMs: int | None = Field(default=None, ge=1, le=600_000)
    execution: WorkflowNodeExecutionPolicy | None = None


class WorkflowNodeAgentMockPlan(BaseModel):
    model_config = ConfigDict(extra="allow")

    toolCalls: list[WorkflowNodeAgentToolCall] = Field(default_factory=list)
    needAssistant: bool = False
    finalizeFrom: Literal["evidence", "tool_results", "working_context"] = "evidence"


class WorkflowNodeSandboxConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    language: str | None = Field(default=None, min_length=1, max_length=64)
    code: str | None = None
    dependencyMode: Literal["builtin", "dependency_ref", "backend_managed"] | None = None
    builtinPackageSet: str | None = Field(default=None, min_length=1, max_length=128)
    dependencyRef: str | None = Field(default=None, min_length=1, max_length=256)
    backendExtensions: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_dependency_contract(self) -> WorkflowNodeSandboxConfig:
        if self.builtinPackageSet is not None and self.dependencyMode != "builtin":
            raise ValueError(
                "config.builtinPackageSet requires config.dependencyMode = 'builtin'."
            )
        if self.dependencyRef is not None and self.dependencyMode != "dependency_ref":
            raise ValueError(
                "config.dependencyRef requires config.dependencyMode = 'dependency_ref'."
            )
        if self.backendExtensions is not None and not isinstance(self.backendExtensions, dict):
            raise ValueError("config.backendExtensions must be an object when provided.")
        return self


class WorkflowNodeReplyTextSegment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["text"]
    text: str


class WorkflowNodeReplyVariableSegment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["variable"]
    refId: str = Field(min_length=1, max_length=64)


class WorkflowNodeReplyDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    segments: list[WorkflowNodeReplyTextSegment | WorkflowNodeReplyVariableSegment] = Field(
        min_length=1
    )


class WorkflowNodeReplyReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refId: str = Field(min_length=1, max_length=64)
    alias: str = Field(min_length=1, max_length=128)
    ownerNodeId: str = Field(min_length=1, max_length=64)
    selector: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def normalize_reference(self) -> WorkflowNodeReplyReference:
        self.refId = self.refId.strip()
        self.alias = self.alias.strip()
        self.ownerNodeId = self.ownerNodeId.strip()
        self.selector = [segment.strip() for segment in self.selector if segment.strip()]
        if not self.selector:
            raise ValueError("config.replyReferences[].selector must contain at least one path segment.")
        return self


BranchSelectorOperator = Literal[
    "exists",
    "not_exists",
    "eq",
    "ne",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "not_in",
    "contains",
]


class WorkflowNodeBranchRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1, max_length=64)
    path: str = Field(min_length=1, max_length=256)
    operator: BranchSelectorOperator = "eq"
    value: Any = None

    @model_validator(mode="after")
    def validate_value_requirement(self) -> WorkflowNodeBranchRule:
        if self.operator in {"exists", "not_exists"}:
            return self
        if self.value is None:
            raise ValueError("Branch selector rules require 'value' for this operator.")
        return self


class WorkflowNodeBranchSelector(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rules: list[WorkflowNodeBranchRule] = Field(min_length=1)
    default: str | None = Field(default=None, min_length=1, max_length=64)

    @model_validator(mode="after")
    def validate_unique_rule_keys(self) -> WorkflowNodeBranchSelector:
        rule_keys = [rule.key for rule in self.rules]
        if len(set(rule_keys)) != len(rule_keys):
            raise ValueError("Branch selector rule keys must be unique.")
        return self


def validate_workflow_node_embedded_config(*, node_type: str, config: dict[str, Any]) -> None:
    context_access = config.get("contextAccess")
    if context_access is not None:
        WorkflowNodeContextAccess.model_validate(context_access)

    tool_binding = config.get("tool")
    if tool_binding is not None:
        if node_type != "toolNode":
            raise ValueError("Only toolNode nodes may define config.tool.")
        WorkflowNodeToolBinding.model_validate(tool_binding)

    flat_tool_id = config.get("toolId")
    if flat_tool_id is not None:
        if node_type != "toolNode":
            raise ValueError("Only toolNode nodes may define config.toolId.")
        if not isinstance(flat_tool_id, str) or not flat_tool_id.strip():
            raise ValueError("config.toolId must be a non-empty string.")
        if tool_binding is not None:
            raise ValueError("toolNode nodes cannot define both config.tool and config.toolId.")

    query = config.get("query")
    if node_type == "mcpQueryNode":
        if query is None:
            raise ValueError("mcpQueryNode nodes must define config.query.")
        WorkflowNodeMcpQuery.model_validate(query)

    reference = config.get("reference")
    if node_type == "referenceNode":
        if reference is None:
            raise ValueError("referenceNode nodes must define config.reference.")
        WorkflowNodeReferenceConfig.model_validate(reference)
    elif reference is not None:
        raise ValueError("Only referenceNode nodes may define config.reference.")

    selector = config.get("selector")
    if selector is not None:
        if node_type not in {"conditionNode", "routerNode"}:
            raise ValueError("Only conditionNode/routerNode nodes may define config.selector.")
        WorkflowNodeBranchSelector.model_validate(selector)

    expression = config.get("expression")
    if expression is not None:
        if node_type not in {"conditionNode", "routerNode"}:
            raise ValueError("Only conditionNode/routerNode nodes may define config.expression.")
        validate_safe_expression(
            expression,
            allowed_names=BRANCH_EXPRESSION_NAMES,
            error_prefix="config.expression",
        )

    assistant = config.get("assistant")
    if assistant is not None:
        if node_type != "llmAgentNode":
            raise ValueError("Only llmAgentNode nodes may define config.assistant.")
        WorkflowNodeAssistantConfig.model_validate(assistant)

    model = config.get("model")
    if model is not None:
        if node_type != "llmAgentNode":
            raise ValueError("Only llmAgentNode nodes may define config.model.")
        WorkflowNodeModelConfig.model_validate(model)

    skill_ids = config.get("skillIds")
    if skill_ids is not None:
        if node_type != "llmAgentNode":
            raise ValueError("Only llmAgentNode nodes may define config.skillIds.")
        WorkflowNodeSkillBinding.model_validate({"skillIds": skill_ids})

    skill_binding = config.get("skillBinding")
    if skill_binding is not None:
        if node_type != "llmAgentNode":
            raise ValueError("Only llmAgentNode nodes may define config.skillBinding.")
        if not skill_ids:
            raise ValueError("config.skillBinding requires non-empty config.skillIds.")
        WorkflowNodeSkillBindingPolicy.model_validate(skill_binding)

    tool_policy = config.get("toolPolicy")
    if tool_policy is not None:
        if node_type != "llmAgentNode":
            raise ValueError("Only llmAgentNode nodes may define config.toolPolicy.")
        WorkflowNodeToolPolicy.model_validate(tool_policy)

    mock_plan = config.get("mockPlan")
    if mock_plan is not None:
        if node_type != "llmAgentNode":
            raise ValueError("Only llmAgentNode nodes may define config.mockPlan.")
        WorkflowNodeAgentMockPlan.model_validate(mock_plan)

    reply_template = config.get("replyTemplate")
    if reply_template is not None:
        if node_type != "endNode":
            raise ValueError("Only endNode nodes may define config.replyTemplate.")
        if not isinstance(reply_template, str) or not reply_template.strip():
            raise ValueError("config.replyTemplate must be a non-empty string.")

    reply_document = config.get("replyDocument")
    if reply_document is not None:
        if node_type != "endNode":
            raise ValueError("Only endNode nodes may define config.replyDocument.")
        validated_reply_document = WorkflowNodeReplyDocument.model_validate(reply_document)
    else:
        validated_reply_document = None

    reply_references = config.get("replyReferences")
    if reply_references is not None:
        if node_type != "endNode":
            raise ValueError("Only endNode nodes may define config.replyReferences.")
        if not isinstance(reply_references, list):
            raise ValueError("config.replyReferences must be a list.")
        validated_reply_references = [
            WorkflowNodeReplyReference.model_validate(reference)
            for reference in reply_references
        ]
        reference_ids = [reference.refId for reference in validated_reply_references]
        if len(set(reference_ids)) != len(reference_ids):
            raise ValueError("config.replyReferences refId values must be unique.")
    else:
        validated_reply_references = None

    if validated_reply_document is not None:
        available_ref_ids = {
            reference.refId for reference in validated_reply_references or []
        }
        missing_ref_ids = [
            segment.refId
            for segment in validated_reply_document.segments
            if isinstance(segment, WorkflowNodeReplyVariableSegment)
            and segment.refId not in available_ref_ids
        ]
        if missing_ref_ids:
            raise ValueError("config.replyDocument references unknown config.replyReferences refId.")

    response_key = config.get("responseKey")
    if response_key is not None:
        if node_type != "endNode":
            raise ValueError("Only endNode nodes may define config.responseKey.")
        if not isinstance(response_key, str) or not response_key.strip():
            raise ValueError("config.responseKey must be a non-empty string.")

    if node_type == "sandboxCodeNode":
        WorkflowNodeSandboxConfig.model_validate(config)
