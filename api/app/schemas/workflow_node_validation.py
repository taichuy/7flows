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


def validate_workflow_node_embedded_config(*, node_type: str, config: dict[str, Any]) -> None:
    context_access = config.get("contextAccess")
    if context_access is not None:
        WorkflowNodeContextAccess.model_validate(context_access)

    tool_binding = config.get("tool")
    if tool_binding is not None:
        if node_type != "tool":
            raise ValueError("Only tool nodes may define config.tool.")
        WorkflowNodeToolBinding.model_validate(tool_binding)

    flat_tool_id = config.get("toolId")
    if flat_tool_id is not None:
        if node_type != "tool":
            raise ValueError("Only tool nodes may define config.toolId.")
        if not isinstance(flat_tool_id, str) or not flat_tool_id.strip():
            raise ValueError("config.toolId must be a non-empty string.")
        if tool_binding is not None:
            raise ValueError("Tool nodes cannot define both config.tool and config.toolId.")

    query = config.get("query")
    if node_type == "mcp_query":
        if query is None:
            raise ValueError("MCP query nodes must define config.query.")
        WorkflowNodeMcpQuery.model_validate(query)

    selector = config.get("selector")
    if selector is not None:
        if node_type not in {"condition", "router"}:
            raise ValueError("Only condition/router nodes may define config.selector.")
        WorkflowNodeBranchSelector.model_validate(selector)

    expression = config.get("expression")
    if expression is not None:
        if node_type not in {"condition", "router"}:
            raise ValueError("Only condition/router nodes may define config.expression.")
        validate_safe_expression(
            expression,
            allowed_names=BRANCH_EXPRESSION_NAMES,
            error_prefix="config.expression",
        )

    assistant = config.get("assistant")
    if assistant is not None:
        if node_type != "llm_agent":
            raise ValueError("Only llm_agent nodes may define config.assistant.")
        WorkflowNodeAssistantConfig.model_validate(assistant)

    tool_policy = config.get("toolPolicy")
    if tool_policy is not None:
        if node_type != "llm_agent":
            raise ValueError("Only llm_agent nodes may define config.toolPolicy.")
        WorkflowNodeToolPolicy.model_validate(tool_policy)

    mock_plan = config.get("mockPlan")
    if mock_plan is not None:
        if node_type != "llm_agent":
            raise ValueError("Only llm_agent nodes may define config.mockPlan.")
        WorkflowNodeAgentMockPlan.model_validate(mock_plan)
