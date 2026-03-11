from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.safe_expressions import (
    BRANCH_EXPRESSION_NAMES,
    EDGE_EXPRESSION_NAMES,
    SafeExpressionValidationError,
    validate_expression,
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
PublishProtocol = Literal["native", "openai", "anthropic"]
AuthMode = Literal["api_key", "token", "internal"]
ArtifactType = Literal["text", "json", "file", "tool_result", "message"]
AssistantTriggerMode = Literal[
    "always",
    "on_large_payload",
    "on_search_result",
    "on_multi_tool_results",
    "on_high_risk_mode",
]
_SEMVER_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")
_FAILURE_EDGE_CONDITIONS = {"error", "failed", "on_error"}
_SUCCESS_EDGE_CONDITIONS = {"success", "succeeded", "default"}


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


class WorkflowNodeAgentToolCall(BaseModel):
    model_config = ConfigDict(extra="allow")

    toolId: str = Field(min_length=1, max_length=256)
    ecosystem: str = Field(default="native", min_length=1, max_length=64)
    adapterId: str | None = Field(default=None, min_length=1, max_length=128)
    inputs: dict[str, Any] = Field(default_factory=dict)
    timeoutMs: int | None = Field(default=None, ge=1, le=600_000)


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
JoinMode = Literal["any", "all"]
JoinUnmetBehavior = Literal["skip", "fail"]
JoinMergeStrategy = Literal["error", "overwrite", "keep_first", "append"]


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


class WorkflowNodeRetryPolicy(BaseModel):
    model_config = ConfigDict(extra="allow")

    maxAttempts: int = Field(default=1, ge=1)
    backoffSeconds: float = Field(default=0.0, ge=0.0)
    backoffMultiplier: float = Field(default=1.0, ge=1.0)


class WorkflowNodeJoinPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: JoinMode = "any"
    requiredNodeIds: list[str] = Field(default_factory=list)
    onUnmet: JoinUnmetBehavior = "skip"
    mergeStrategy: JoinMergeStrategy = "error"

    @model_validator(mode="after")
    def validate_required_node_ids(self) -> WorkflowNodeJoinPolicy:
        normalized_ids = [node_id for node_id in self.requiredNodeIds if node_id.strip()]
        if len(set(normalized_ids)) != len(normalized_ids):
            raise ValueError("Join policy requiredNodeIds must be unique.")
        self.requiredNodeIds = normalized_ids
        return self


class WorkflowNodeRuntimePolicy(BaseModel):
    model_config = ConfigDict(extra="allow")

    retry: WorkflowNodeRetryPolicy | None = None
    join: WorkflowNodeJoinPolicy | None = None


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


class WorkflowPublishedEndpointDefinition(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    protocol: PublishProtocol
    workflowVersion: str | None = Field(default=None, min_length=1, max_length=32)
    authMode: AuthMode
    streaming: bool
    inputSchema: dict[str, Any] = Field(default_factory=dict)
    outputSchema: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_workflow_version_format(self) -> WorkflowPublishedEndpointDefinition:
        if self.workflowVersion is not None and not _SEMVER_PATTERN.match(self.workflowVersion):
            raise ValueError(
                "workflowVersion must use semantic version format 'major.minor.patch'."
            )
        return self


class WorkflowDefinitionDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nodes: list[WorkflowNodeDefinition] = Field(min_length=1)
    edges: list[WorkflowEdgeDefinition] = Field(default_factory=list)
    variables: list[WorkflowVariableDefinition] = Field(default_factory=list)
    publish: list[WorkflowPublishedEndpointDefinition] = Field(default_factory=list)
    trigger: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_graph(self) -> WorkflowDefinitionDocument:
        node_ids = [node.id for node in self.nodes]
        if len(set(node_ids)) != len(node_ids):
            raise ValueError("Workflow node ids must be unique.")

        variable_names = [variable.name for variable in self.variables]
        if len(set(variable_names)) != len(variable_names):
            raise ValueError("Workflow variable names must be unique.")

        publish_ids = [endpoint.id for endpoint in self.publish]
        if len(set(publish_ids)) != len(publish_ids):
            raise ValueError("Workflow published endpoint ids must be unique.")

        publish_names = [endpoint.name for endpoint in self.publish]
        if len(set(publish_names)) != len(publish_names):
            raise ValueError("Workflow published endpoint names must be unique.")

        edge_ids = [edge.id for edge in self.edges]
        if len(set(edge_ids)) != len(edge_ids):
            raise ValueError("Workflow edge ids must be unique.")

        node_id_set = set(node_ids)
        trigger_count = sum(node.type == "trigger" for node in self.nodes)
        if trigger_count != 1:
            raise ValueError("Workflow definition must contain exactly one trigger node.")

        if not any(node.type == "output" for node in self.nodes):
            raise ValueError("Workflow definition must contain at least one output node.")

        for node in self.nodes:
            context_access = WorkflowNodeContextAccess.model_validate(
                node.config.get("contextAccess") or {}
            )
            authorized_node_ids = set(context_access.readableNodeIds)
            authorized_node_ids.update(
                artifact.nodeId for artifact in context_access.readableArtifacts
            )

            for readable_node_id in sorted(authorized_node_ids):
                if readable_node_id not in node_id_set:
                    raise ValueError(
                        f"Node '{node.id}' contextAccess references missing node "
                        f"'{readable_node_id}'."
                    )

            if node.type == "mcp_query":
                query = WorkflowNodeMcpQuery.model_validate(node.config["query"])
                requested_source_ids = set(query.sourceNodeIds or [])
                for source_node_id in sorted(requested_source_ids):
                    if source_node_id not in node_id_set:
                        raise ValueError(
                            f"Node '{node.id}' query references missing source node "
                            f"'{source_node_id}'."
                        )
                unauthorized_sources = sorted(requested_source_ids - authorized_node_ids)
                if unauthorized_sources:
                    joined_sources = ", ".join(unauthorized_sources)
                    raise ValueError(
                        f"Node '{node.id}' query references unauthorized source nodes: "
                        f"{joined_sources}."
                    )
                if query.artifactTypes is not None:
                    authorized_artifacts: dict[str, set[str]] = {
                        readable_node_id: {"json"}
                        for readable_node_id in context_access.readableNodeIds
                    }
                    for artifact in context_access.readableArtifacts:
                        authorized_artifacts.setdefault(artifact.nodeId, {"json"}).add(
                            artifact.artifactType
                        )
                    artifact_source_ids = requested_source_ids or authorized_node_ids
                    requested_artifact_types = set(query.artifactTypes)
                    for source_node_id in sorted(artifact_source_ids):
                        allowed_artifact_types = authorized_artifacts.get(source_node_id, {"json"})
                        unauthorized_artifact_types = sorted(
                            requested_artifact_types - allowed_artifact_types
                        )
                        if unauthorized_artifact_types:
                            raise ValueError(
                                f"Node '{node.id}' query requests unauthorized artifact types "
                                f"from '{source_node_id}': "
                                f"{', '.join(unauthorized_artifact_types)}."
                            )

        for edge in self.edges:
            if edge.sourceNodeId not in node_id_set:
                raise ValueError(
                    f"Edge '{edge.id}' references missing source node "
                    f"'{edge.sourceNodeId}'."
                )
            if edge.targetNodeId not in node_id_set:
                raise ValueError(
                    f"Edge '{edge.id}' references missing target node "
                    f"'{edge.targetNodeId}'."
                )
            if edge.sourceNodeId == edge.targetNodeId:
                raise ValueError(f"Edge '{edge.id}' cannot point to the same node on both ends.")

        incoming_by_target: dict[str, set[str]] = {}
        outgoing_by_source: dict[str, list[WorkflowEdgeDefinition]] = {}
        for edge in self.edges:
            incoming_by_target.setdefault(edge.targetNodeId, set()).add(edge.sourceNodeId)
            outgoing_by_source.setdefault(edge.sourceNodeId, []).append(edge)

        for node in self.nodes:
            join_policy = node.runtimePolicy.join if node.runtimePolicy is not None else None
            if join_policy is None:
                continue
            incoming_sources = incoming_by_target.get(node.id, set())
            if node.type == "trigger":
                raise ValueError("Trigger nodes cannot define runtimePolicy.join.")
            if not incoming_sources:
                raise ValueError(
                    f"Node '{node.id}' defines runtimePolicy.join but has no incoming edges."
                )
            unknown_required_sources = sorted(set(join_policy.requiredNodeIds) - incoming_sources)
            if unknown_required_sources:
                raise ValueError(
                    f"Node '{node.id}' join.requiredNodeIds references non-incoming sources: "
                    f"{', '.join(unknown_required_sources)}."
                )

        for node in self.nodes:
            outgoing_edges = outgoing_by_source.get(node.id, [])
            if node.type in {"condition", "router"}:
                explicit_branch_conditions: list[str] = []
                fallback_edges = 0
                for edge in outgoing_edges:
                    normalized_condition = _normalize_edge_condition(edge.condition)
                    if normalized_condition is None:
                        fallback_edges += 1
                        continue
                    if normalized_condition in _FAILURE_EDGE_CONDITIONS:
                        continue
                    explicit_branch_conditions.append(normalized_condition)

                if len(set(explicit_branch_conditions)) != len(explicit_branch_conditions):
                    raise ValueError(
                        f"Node '{node.id}' has duplicate outgoing branch conditions."
                    )
                if fallback_edges > 1:
                    raise ValueError(
                        f"Node '{node.id}' may define at most one fallback outgoing edge."
                    )

                selector = node.config.get("selector")
                expression = node.config.get("expression")
                if selector is not None:
                    selector_model = WorkflowNodeBranchSelector.model_validate(selector)
                    allowed_branch_conditions = {
                        rule.key.strip().lower()
                        for rule in selector_model.rules
                    }
                    if selector_model.default is not None:
                        allowed_branch_conditions.add(selector_model.default.strip().lower())
                    else:
                        allowed_branch_conditions.add("default")
                    invalid_branch_conditions = sorted(
                        condition
                        for condition in explicit_branch_conditions
                        if condition not in allowed_branch_conditions
                    )
                    if invalid_branch_conditions:
                        raise ValueError(
                            f"Node '{node.id}' has outgoing branch conditions not declared by "
                            f"config.selector: {', '.join(invalid_branch_conditions)}."
                        )
                elif expression is not None and node.type == "condition":
                    allowed_branch_conditions = {"true", "false"}
                    invalid_branch_conditions = sorted(
                        condition
                        for condition in explicit_branch_conditions
                        if condition not in allowed_branch_conditions
                    )
                    if invalid_branch_conditions:
                        raise ValueError(
                            f"Condition node '{node.id}' expression may only target "
                            f"'true'/'false' branch conditions."
                        )
            else:
                for edge in outgoing_edges:
                    normalized_condition = _normalize_edge_condition(edge.condition)
                    if normalized_condition is None:
                        continue
                    if normalized_condition in _FAILURE_EDGE_CONDITIONS:
                        continue
                    if normalized_condition not in _SUCCESS_EDGE_CONDITIONS:
                        raise ValueError(
                            f"Edge '{edge.id}' uses unsupported condition '{edge.condition}' "
                            f"for non-branch node '{node.id}'."
                        )

        return self


def _normalize_edge_condition(condition: str | None) -> str | None:
    if condition is None:
        return None
    normalized = condition.strip().lower()
    return normalized or None


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


class WorkflowDetail(WorkflowListItem):
    definition: dict
    created_at: datetime
    updated_at: datetime
    versions: list[WorkflowVersionItem] = Field(default_factory=list)
