from pydantic import BaseModel


class ServiceCheck(BaseModel):
    name: str
    status: str
    detail: str | None = None


class CompatibilityAdapterCheck(BaseModel):
    id: str
    ecosystem: str
    endpoint: str
    enabled: bool
    status: str
    detail: str | None = None


class SystemOverview(BaseModel):
    status: str
    environment: str
    services: list[ServiceCheck]
    capabilities: list[str]
    plugin_adapters: list[CompatibilityAdapterCheck] = []
