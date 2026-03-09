from pydantic import BaseModel, Field


class WorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    definition: dict = Field(default_factory=dict)


class WorkflowListItem(BaseModel):
    id: str
    name: str
    version: str
    status: str


class WorkflowDetail(WorkflowListItem):
    definition: dict
