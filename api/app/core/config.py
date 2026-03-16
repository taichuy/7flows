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
    migration_enabled: bool = False

    database_url: str = Field(
        default="postgresql+psycopg://postgres:sevenflows@localhost:35432/sevenflows"
    )
    redis_url: str = Field(default="redis://:sevenflows@localhost:36379/0")

    s3_endpoint: str = "http://localhost:39000"
    s3_access_key: str = "rustfsadmin"
    s3_secret_key: str = "rustfsadmin"
    s3_bucket: str = "sevenflows-local"
    s3_region: str = "us-east-1"
    s3_use_ssl: bool = False

    sandbox_url: str = "http://localhost:38194"
    sandbox_api_key: str = "sevenflows-sandbox"
    durable_agent_runtime_enabled: bool = True
    plugin_default_timeout_ms: int = 30_000
    callback_ticket_ttl_seconds: int = 86_400
    callback_ticket_max_expired_cycles: int = 3
    callback_ticket_cleanup_batch_size: int = 100
    callback_ticket_cleanup_schedule_enabled: bool = True
    callback_ticket_cleanup_interval_seconds: int = 300
    notification_delivery_timeout_seconds: float = 10.0
    notification_webhook_default_target: str = ""
    notification_slack_default_target: str = ""
    notification_feishu_default_target: str = ""
    notification_email_default_target: str = ""
    notification_email_smtp_host: str = ""
    notification_email_smtp_port: int = 587
    notification_email_smtp_username: str = ""
    notification_email_smtp_password: str = ""
    notification_email_from_address: str = ""
    notification_email_from_name: str = "7Flows"
    notification_email_use_ssl: bool = False
    notification_email_starttls: bool = True
    credential_encryption_key: str = ""
    llm_http_proxy: str = ""
    llm_default_timeout_seconds: int = 120
    plugin_compat_dify_enabled: bool = False
    plugin_compat_dify_adapter_id: str = "dify-default"
    plugin_compat_dify_endpoint: str = "http://localhost:8091"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
