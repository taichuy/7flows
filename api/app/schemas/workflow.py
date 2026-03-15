from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.safe_expressions import (
    BRANCH_EXPRESSION_NAMES,
    EDGE_EXPRESSION_NAMES,
    SafeExpressionValidationError,
    validate_expression,
)
from app.schemas.workflow_graph_validation import validate_workflow_graph
from app.schemas.workflow_published_endpoint import (
    WorkflowPublishedEndpointDefinition,
)
from app.schemas.workflow_runtime_policy import (
    WorkflowNodeExecutionPolicy,
    WorkflowNodeRuntimePolicy,
)

NodeType = Literal[
    "trigger",
    "llm_agent",
    "tool",
    "sandbox_code",
    "mcp_query",
    "condition",
    "router",
    "loop",
    "output",
]
EdgeChannel = Literal["control", "data"]
ArtifactType = Literal["text", "json", "file", "tool_result", "message"]
AssistantTriggerMode = Literal[
    "always",
    "on_large_payload",
    "on_search_result",
    "on_multi_tool_results",
    "on_high_risk_mode",
]


def _validate_safe_expression(
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


class WorkflowEdgeFieldTransform(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["identity", "toString", "toNumber", "toBoolean"] = "identity"


class WorkflowEdgeFieldMapping(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceField: str = Field(min_length=1, max_length=256)
    targetField: str = Field(min_length=1, max_length=256)
    transform: WorkflowEdgeFieldTransform | None = None
    template: str | None = Field(default=None, min_length=1, max_length=512)
    fallback: Any = None

    @model_validator(mode="after")
    def validate_target_field(self) -> WorkflowEdgeFieldMapping:
        target_root = self.targetField.split(".", 1)[0].strip()
        if target_root in {
            "trigger_input",
            "upstream",
            "accumulated",
            "mapped",
            "activated_by",
            "authorized_context",
            "attempt",
            "execution",
            "join",
        }:
            raise ValueError(
                "Field mapping targetField cannot override runtime-managed input roots."
            )
        return self


class WorkflowNodeDefinition(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1, max_length=64)
    type: NodeType
    name: str = Field(min_length=1, max_length=128)
    config: dict[str, Any] = Field(default_factory=dict)
    inputSchema: dict[str, Any] | None = None
    outputSchema: dict[str, Any] | None = None
    runtimePolicy: WorkflowNodeRuntimePolicy | None = None

    @model_validator(mode="after")
    def validate_embedded_config(self) -> WorkflowNodeDefinition:
        context_access = self.config.get("contextAccess")
        if context_access is not None:
            WorkflowNodeContextAccess.model_validate(context_access)

        tool_binding = self.config.get("tool")
        if tool_binding is not None:
            if self.type != "tool":
                raise ValueError("Only tool nodes may define config.tool.")
            WorkflowNodeToolBinding.model_validate(tool_binding)

        flat_tool_id = self.config.get("toolId")
        if flat_tool_id is not None:
            if self.type != "tool":
                raise ValueError("Only tool nodes may define config.toolId.")
            if not isinstance(flat_tool_id, str) or not flat_tool_id.strip():
                raise ValueError("config.toolId must be a non-empty string.")
            if tool_binding is not None:
                raise ValueError("Tool nodes cannot define both config.tool and config.toolId.")

        query = self.config.get("query")
        if self.type == "mcp_query":
            if query is None:
                raise ValueError("MCP query nodes must define config.query.")
            WorkflowNodeMcpQuery.model_validate(query)

        selector = self.config.get("selector")
        if selector is not None:
            if self.type not in {"condition", "router"}:
                raise ValueError("Only condition/router nodes may define config.selector.")
            WorkflowNodeBranchSelector.model_validate(selector)

        expression = self.config.get("expression")
        if expression is not None:
            if self.type not in {"condition", "router"}:
                raise ValueError("Only condition/router nodes may define config.expression.")
            _validate_safe_expression(
                expression,
                allowed_names=BRANCH_EXPRESSION_NAMES,
                error_prefix="config.expression",
            )

        assistant = self.config.get("assistant")
        if assistant is not None:
            if self.type != "llm_agent":
                raise ValueError("Only llm_agent nodes may define config.assistant.")
            WorkflowNodeAssistantConfig.model_validate(assistant)

        tool_policy = self.config.get("toolPolicy")
        if tool_policy is not None:
            if self.type != "llm_agent":
                raise ValueError("Only llm_agent nodes may define config.toolPolicy.")
            WorkflowNodeToolPolicy.model_validate(tool_policy)

        mock_plan = self.config.get("mockPlan")
        if mock_plan is not None:
            if self.type != "llm_agent":
                raise ValueError("Only llm_agent nodes may define config.mockPlan.")
            WorkflowNodeAgentMockPlan.model_validate(mock_plan)

        return self


class WorkflowEdgeDefinition(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1, max_length=64)
    sourceNodeId: str = Field(min_length=1, max_length=64)
    targetNodeId: str = Field(min_length=1, max_length=64)
    channel: EdgeChannel = "control"
    condition: str | None = None
    conditionExpression: str | None = Field(default=None, min_length=1, max_length=512)
    mapping: list[WorkflowEdgeFieldMapping] | None = None

    @model_validator(mode="after")
    def validate_condition_expression(self) -> WorkflowEdgeDefinition:
        if self.conditionExpression is not None:
            _validate_safe_expression(
                self.conditionExpression,
                allowed_names=EDGE_EXPRESSION_NAMES,
                error_prefix="conditionExpression",
            )
        return self


class WorkflowVariableDefinition(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str = Field(min_length=1, max_length=128)
    type: str | None = None
    default: Any = None
    description: str | None = None


class WorkflowDefinitionDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nodes: list[WorkflowNodeDefinition] = Field(min_length=1)
    edges: list[WorkflowEdgeDefinition] = Field(default_factory=list)
    variables: list[WorkflowVariableDefinition] = Field(default_factory=list)
    publish: list[WorkflowPublishedEndpointDefinition] = Field(default_factory=list)
    trigger: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_graph(self) -> WorkflowDefinitionDocument:
        validate_workflow_graph(
            self,
            context_access_model=WorkflowNodeContextAccess,
            mcp_query_model=WorkflowNodeMcpQuery,
            branch_selector_model=WorkflowNodeBranchSelector,
        )
        return self


class WorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    definition: dict = Field(default_factory=dict)


class WorkflowUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    definition: dict | None = None

    @model_validator(mode="after")
    def ensure_update_payload(self) -> WorkflowUpdate:
        if self.name is None and self.definition is None:
            raise ValueError("At least one of 'name' or 'definition' must be provided.")
        return self


class WorkflowListItem(BaseModel):
    id: str
    name: str
    version: str
    status: str


class WorkflowVersionItem(BaseModel):
    id: str
    workflow_id: str
    version: str
    created_at: datetime
    compiled_blueprint_id: str | None = None
    compiled_blueprint_compiler_version: str | None = None
    compiled_blueprint_updated_at: datetime | None = None


class WorkflowDetail(WorkflowListItem):
    definition: dict
    created_at: datetime
    updated_at: datetime
    versions: list[WorkflowVersionItem] = Field(default_factory=list)
