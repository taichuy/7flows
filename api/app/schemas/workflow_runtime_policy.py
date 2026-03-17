from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ExecutionClass = Literal["inline", "subprocess", "sandbox", "microvm"]
ExecutionNetworkPolicy = Literal["inherit", "restricted", "isolated"]
ExecutionFilesystemPolicy = Literal["inherit", "readonly_tmp", "ephemeral"]
ExecutionDependencyMode = Literal["builtin", "dependency_ref", "backend_managed"]
JoinMode = Literal["any", "all"]
JoinUnmetBehavior = Literal["skip", "fail"]
JoinMergeStrategy = Literal["error", "overwrite", "keep_first", "append"]


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


class WorkflowNodeExecutionPolicy(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        serialize_by_alias=True,
    )

    class_name: ExecutionClass = Field(alias="class")
    profile: str | None = Field(default=None, min_length=1, max_length=128)
    timeoutMs: int | None = Field(default=None, ge=1, le=600_000)
    networkPolicy: ExecutionNetworkPolicy | None = None
    filesystemPolicy: ExecutionFilesystemPolicy | None = None
    dependencyMode: ExecutionDependencyMode | None = None
    builtinPackageSet: str | None = Field(default=None, min_length=1, max_length=128)
    dependencyRef: str | None = Field(default=None, min_length=1, max_length=256)
    backendExtensions: dict[str, Any] | None = None

    @model_validator(mode="after")
    def normalize_execution_fields(self) -> WorkflowNodeExecutionPolicy:
        if self.profile is not None:
            normalized_profile = self.profile.strip()
            self.profile = normalized_profile or None
        if self.builtinPackageSet is not None and self.dependencyMode != "builtin":
            raise ValueError(
                "execution.builtinPackageSet requires execution.dependencyMode = 'builtin'."
            )
        if self.dependencyRef is not None and self.dependencyMode != "dependency_ref":
            raise ValueError(
                "execution.dependencyRef requires execution.dependencyMode = 'dependency_ref'."
            )
        if self.backendExtensions is not None and not isinstance(self.backendExtensions, dict):
            raise ValueError("execution.backendExtensions must be an object when provided.")
        return self


class WorkflowNodeRuntimePolicy(BaseModel):
    model_config = ConfigDict(extra="allow")

    execution: WorkflowNodeExecutionPolicy | None = None
    retry: WorkflowNodeRetryPolicy | None = None
    join: WorkflowNodeJoinPolicy | None = None
