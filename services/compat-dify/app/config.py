from functools import lru_cache

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
    stub_mode: str = "echo"
    health_status: str = "ok"
    supported_ecosystem: str = "compat:dify"
    default_latency_ms: int = Field(default=5, ge=0, le=30_000)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

