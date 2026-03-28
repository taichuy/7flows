from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.safe_expressions import EDGE_EXPRESSION_NAMES
from app.schemas.workflow_contract_validation import validate_contract_schema
from app.schemas.workflow_graph_validation import validate_workflow_graph
from app.schemas.workflow_node_validation import (
    WorkflowNodeBranchSelector,
    WorkflowNodeContextAccess,
    WorkflowNodeMcpQuery,
    validate_safe_expression,
    validate_workflow_node_embedded_config,
)
from app.schemas.workflow_published_endpoint import (
    WorkflowPublishedEndpointDefinition,
)
from app.schemas.workflow_runtime_policy import WorkflowNodeRuntimePolicy

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
        validate_workflow_node_embedded_config(node_type=self.type, config=self.config)
        if self.inputSchema is not None:
            validate_contract_schema(
                self.inputSchema,
                error_prefix=f"Node '{self.id}' inputSchema",
            )
        if self.outputSchema is not None:
            validate_contract_schema(
                self.outputSchema,
                error_prefix=f"Node '{self.id}' outputSchema",
            )
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
            validate_safe_expression(
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


class WorkflowDefinitionPreflightRequest(BaseModel):
    definition: dict = Field(default_factory=dict)


class WorkflowDefinitionPreflightIssue(BaseModel):
    category: str
    message: str
    path: str | None = None
    field: str | None = None


class WorkflowDefinitionPreflightResult(BaseModel):
    definition: dict
    next_version: str
    issues: list[WorkflowDefinitionPreflightIssue] = Field(default_factory=list)


class WorkflowToolGovernanceSummary(BaseModel):
    referenced_tool_ids: list[str] = Field(default_factory=list)
    missing_tool_ids: list[str] = Field(default_factory=list)
    governed_tool_count: int = Field(default=0, ge=0)
    strong_isolation_tool_count: int = Field(default=0, ge=0)


class WorkflowLegacyAuthGovernanceSummary(BaseModel):
    binding_count: int = Field(default=0, ge=0)
    draft_candidate_count: int = Field(default=0, ge=0)
    published_blocker_count: int = Field(default=0, ge=0)
    offline_inventory_count: int = Field(default=0, ge=0)


class WorkflowListItem(BaseModel):
    id: str
    name: str
    version: str
    status: str
    updated_at: datetime
    node_count: int = Field(default=0, ge=0)
    node_types: list[str] = Field(default_factory=list)
    publish_count: int = Field(default=0, ge=0)
    tool_governance: WorkflowToolGovernanceSummary = Field(
        default_factory=WorkflowToolGovernanceSummary
    )
    legacy_auth_governance: WorkflowLegacyAuthGovernanceSummary | None = None
    definition_issues: list[WorkflowDefinitionPreflightIssue] = Field(default_factory=list)


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
    versions: list[WorkflowVersionItem] = Field(default_factory=list)
