from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="SEVENFLOWS_",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "7Flows API"
    env: str = "local"
    debug: bool = True
    host: str = "0.0.0.0"
    port: int = 8000
    secret_key: str = "change-me"

    database_url: str = Field(
        default="postgresql+psycopg://postgres:sevenflows@localhost:5432/sevenflows"
    )
    redis_url: str = Field(default="redis://:sevenflows@localhost:6379/0")

    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin123"
    s3_bucket: str = "sevenflows-local"
    s3_region: str = "us-east-1"
    s3_use_ssl: bool = False

    sandbox_url: str = "http://localhost:8194"
    sandbox_api_key: str = "sevenflows-sandbox"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
