from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="SEVENFLOWS_COMPAT_DIFY_",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "7Flows compat:dify adapter"
    env: str = "local"
    host: str = "0.0.0.0"
    port: int = 8091
    adapter_id: str = "dify-default"
    health_status: str = "ok"
    supported_ecosystem: str = "compat:dify"
    default_latency_ms: int = Field(default=5, ge=0, le=30_000)
    catalog_root: str = "catalog"
    invoke_mode: Literal["translate", "proxy"] = "translate"
    plugin_daemon_url: str = ""
    plugin_daemon_api_key: str = ""
    plugin_daemon_tenant_id: str = "sevenflows-local"
    plugin_daemon_user_id: str = "sevenflows-adapter"
    plugin_daemon_app_id: str | None = None
    plugin_daemon_timeout_ms: int = Field(default=30_000, ge=1, le=600_000)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
