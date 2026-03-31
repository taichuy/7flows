from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.credential import Credential
from app.models.model_provider import WorkspaceModelProviderConfigRecord


class ModelProviderRegistryError(ValueError):
    pass


@dataclass(frozen=True)
class NativeModelProviderCredentialFieldOption:
    value: str
    label: str


@dataclass(frozen=True)
class NativeModelProviderCredentialField:
    variable: str
    label: str
    type: str
    required: bool
    placeholder: str = ""
    help: str | None = None
    default: str | None = None
    options: list[NativeModelProviderCredentialFieldOption] = field(default_factory=list)


@dataclass(frozen=True)
class NativeModelProviderDefinition:
    id: str
    label: str
    description: str
    help_url: str | None
    supported_model_types: list[str]
    configuration_methods: list[str]
    credential_type: str
    compatible_credential_types: list[str]
    default_base_url: str
    default_protocol: str
    default_models: list[str]
    credential_fields: list[NativeModelProviderCredentialField] = field(default_factory=list)


_OPENAI_PROVIDER = NativeModelProviderDefinition(
    id="openai",
    label="OpenAI",
    description=(
        "参考 Dify provider manifest 的原生 OpenAI 厂商定义，"
        "团队先配置 endpoint / credential，再由节点引用。"
    ),
    help_url="https://platform.openai.com/account/api-keys",
    supported_model_types=["llm"],
    configuration_methods=["predefined-model", "customizable-model"],
    credential_type="openai_api_key",
    compatible_credential_types=["openai_api_key", "api_key"],
    default_base_url="https://api.openai.com/v1",
    default_protocol="chat_completions",
    default_models=["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
    credential_fields=[
        NativeModelProviderCredentialField(
            variable="openai_api_key",
            label="API Key",
            type="secret-input",
            required=True,
            placeholder="Enter your API Key",
        ),
        NativeModelProviderCredentialField(
            variable="openai_organization",
            label="Organization",
            type="text-input",
            required=False,
            placeholder="Enter your Organization ID",
        ),
        NativeModelProviderCredentialField(
            variable="openai_api_base",
            label="API Base",
            type="text-input",
            required=False,
            placeholder="https://api.openai.com/v1",
        ),
        NativeModelProviderCredentialField(
            variable="api_protocol",
            label="API Protocol",
            type="select",
            required=False,
            help=(
                "选择 OpenAI Provider 使用的 API 协议。"
                "大多数模型使用 Chat Completions，Responses API 适用于 o3 / gpt-5 等新协议模型。"
            ),
            default="chat_completions",
            options=[
                NativeModelProviderCredentialFieldOption(
                    value="chat_completions",
                    label="Chat Completions",
                ),
                NativeModelProviderCredentialFieldOption(
                    value="responses",
                    label="Responses API",
                ),
            ],
        ),
    ],
)

_ANTHROPIC_PROVIDER = NativeModelProviderDefinition(
    id="anthropic",
    label="Anthropic",
    description=(
        "参考 Dify provider manifest 的原生 Anthropic / Claude 厂商定义，"
        "默认走 Messages API。"
    ),
    help_url="https://console.anthropic.com/account/keys",
    supported_model_types=["llm"],
    configuration_methods=["predefined-model", "customizable-model"],
    credential_type="anthropic_api_key",
    compatible_credential_types=["anthropic_api_key", "api_key"],
    default_base_url="https://api.anthropic.com",
    default_protocol="messages",
    default_models=["claude-3-7-sonnet-latest", "claude-3-5-sonnet-latest"],
    credential_fields=[
        NativeModelProviderCredentialField(
            variable="anthropic_api_key",
            label="API Key",
            type="secret-input",
            required=True,
            placeholder="Enter your API Key",
        ),
        NativeModelProviderCredentialField(
            variable="anthropic_api_url",
            label="API URL",
            type="text-input",
            required=False,
            placeholder="https://api.anthropic.com",
        ),
    ],
)

_PROVIDER_DEFINITIONS = {
    provider.id: provider for provider in (_OPENAI_PROVIDER, _ANTHROPIC_PROVIDER)
}


def _utcnow() -> datetime:
    return datetime.now(UTC)


def build_credential_ref(credential_id: str) -> str:
    return f"credential://{credential_id}"


def resolve_credential_id(credential_ref: str) -> str:
    normalized = credential_ref.strip()
    if not normalized.startswith("credential://"):
        raise ModelProviderRegistryError("模型供应商必须引用现有 credential:// 记录。")
    credential_id = normalized.removeprefix("credential://").strip()
    if not credential_id:
        raise ModelProviderRegistryError("模型供应商引用的 credential:// 不能为空。")
    return credential_id


def resolve_provider_config_id(provider_config_ref: str) -> str:
    normalized = provider_config_ref.strip()
    if normalized.startswith("provider_config://"):
        normalized = normalized.removeprefix("provider_config://").strip()
    if not normalized:
        raise ModelProviderRegistryError("模型供应商引用不能为空。")
    return normalized


class ModelProviderRegistryService:
    def list_catalog(self) -> list[NativeModelProviderDefinition]:
        return list(_PROVIDER_DEFINITIONS.values())

    def get_catalog_item(self, provider_id: str) -> NativeModelProviderDefinition:
        normalized_provider_id = provider_id.strip().lower()
        provider = _PROVIDER_DEFINITIONS.get(normalized_provider_id)
        if provider is None:
            raise ModelProviderRegistryError("当前只支持 OpenAI 与 Anthropic 原生模型供应商。")
        return provider

    def list_provider_configs(
        self,
        db: Session,
        *,
        workspace_id: str,
        include_inactive: bool = True,
    ) -> list[WorkspaceModelProviderConfigRecord]:
        stmt = (
            select(WorkspaceModelProviderConfigRecord)
            .where(WorkspaceModelProviderConfigRecord.workspace_id == workspace_id)
            .order_by(
                WorkspaceModelProviderConfigRecord.updated_at.desc(),
                WorkspaceModelProviderConfigRecord.created_at.desc(),
            )
        )
        if not include_inactive:
            stmt = stmt.where(WorkspaceModelProviderConfigRecord.status == "active")
        return list(db.scalars(stmt).all())

    def get_provider_config(
        self,
        db: Session,
        *,
        workspace_id: str,
        provider_config_id: str,
    ) -> WorkspaceModelProviderConfigRecord:
        record = db.get(WorkspaceModelProviderConfigRecord, provider_config_id)
        if record is None or record.workspace_id != workspace_id:
            raise ModelProviderRegistryError("模型供应商配置不存在。")
        return record

    def create_provider_config(
        self,
        db: Session,
        *,
        workspace_id: str,
        provider_id: str,
        label: str,
        description: str,
        credential_ref: str,
        base_url: str | None,
        default_model: str | None,
        protocol: str | None,
        status: str,
    ) -> WorkspaceModelProviderConfigRecord:
        provider = self.get_catalog_item(provider_id)
        normalized_status = self._normalize_status(status)
        credential = self._get_valid_credential(
            db,
            credential_id=resolve_credential_id(credential_ref),
            provider=provider,
        )
        record = WorkspaceModelProviderConfigRecord(
            id=str(uuid4()),
            workspace_id=workspace_id,
            provider_id=provider.id,
            label=label.strip(),
            description=description.strip(),
            credential_id=credential.id,
            base_url=self._resolve_base_url(provider=provider, base_url=base_url),
            default_model=self._resolve_default_model(
                provider=provider,
                default_model=default_model,
            ),
            protocol=self._resolve_protocol(provider=provider, protocol=protocol),
            status=normalized_status,
            supported_model_types=list(provider.supported_model_types),
            disabled_at=_utcnow() if normalized_status == "inactive" else None,
        )
        db.add(record)
        db.flush()
        return record

    def update_provider_config(
        self,
        db: Session,
        *,
        workspace_id: str,
        provider_config_id: str,
        provider_id: str | None = None,
        label: str | None = None,
        description: str | None = None,
        credential_ref: str | None = None,
        base_url: str | None = None,
        default_model: str | None = None,
        protocol: str | None = None,
        status: str | None = None,
    ) -> WorkspaceModelProviderConfigRecord:
        record = self.get_provider_config(
            db,
            workspace_id=workspace_id,
            provider_config_id=provider_config_id,
        )
        provider = self.get_catalog_item(provider_id or record.provider_id)
        if label is not None:
            record.label = label.strip()
        if description is not None:
            record.description = description.strip()
        if credential_ref is not None:
            credential = self._get_valid_credential(
                db,
                credential_id=resolve_credential_id(credential_ref),
                provider=provider,
            )
            record.credential_id = credential.id
        else:
            self._get_valid_credential(db, credential_id=record.credential_id, provider=provider)
        if provider_id is not None:
            record.provider_id = provider.id
        if base_url is not None:
            record.base_url = self._resolve_base_url(provider=provider, base_url=base_url)
        if default_model is not None:
            record.default_model = self._resolve_default_model(
                provider=provider,
                default_model=default_model,
            )
        if protocol is not None:
            record.protocol = self._resolve_protocol(provider=provider, protocol=protocol)
        if status is not None:
            record.status = self._normalize_status(status)
            record.disabled_at = _utcnow() if record.status == "inactive" else None
        record.supported_model_types = list(provider.supported_model_types)
        db.add(record)
        db.flush()
        return record

    def deactivate_provider_config(
        self,
        db: Session,
        *,
        workspace_id: str,
        provider_config_id: str,
    ) -> WorkspaceModelProviderConfigRecord:
        record = self.get_provider_config(
            db,
            workspace_id=workspace_id,
            provider_config_id=provider_config_id,
        )
        record.status = "inactive"
        record.disabled_at = _utcnow()
        db.add(record)
        db.flush()
        return record

    def list_credentials_index(
        self,
        db: Session,
        *,
        credential_ids: list[str],
    ) -> dict[str, Credential]:
        normalized_ids = sorted({item.strip() for item in credential_ids if item.strip()})
        if not normalized_ids:
            return {}
        stmt = select(Credential).where(Credential.id.in_(normalized_ids))
        return {item.id: item for item in db.scalars(stmt).all()}

    def _get_valid_credential(
        self,
        db: Session,
        *,
        credential_id: str,
        provider: NativeModelProviderDefinition,
    ) -> Credential:
        credential = db.get(Credential, credential_id)
        if credential is None:
            raise ModelProviderRegistryError("引用的 credential:// 记录不存在。")
        if credential.status != "active":
            raise ModelProviderRegistryError(
                "引用的 credential:// 记录已停用，不能继续绑定模型供应商。"
            )
        if credential.credential_type not in provider.compatible_credential_types:
            raise ModelProviderRegistryError(
                f"{provider.label} 仅接受 "
                f"{', '.join(provider.compatible_credential_types)} 类型的凭证。"
            )
        return credential

    def _normalize_status(self, status: str) -> str:
        normalized = status.strip().lower()
        if normalized not in {"active", "inactive"}:
            raise ModelProviderRegistryError("模型供应商状态只支持 active / inactive。")
        return normalized

    def _resolve_base_url(
        self,
        *,
        provider: NativeModelProviderDefinition,
        base_url: str | None,
    ) -> str:
        return (base_url or provider.default_base_url).strip() or provider.default_base_url

    def _resolve_default_model(
        self,
        *,
        provider: NativeModelProviderDefinition,
        default_model: str | None,
    ) -> str:
        normalized = (default_model or "").strip()
        if normalized:
            return normalized
        if provider.default_models:
            return provider.default_models[0]
        raise ModelProviderRegistryError(f"{provider.label} 缺少默认模型定义，无法创建团队配置。")

    def _resolve_protocol(
        self,
        *,
        provider: NativeModelProviderDefinition,
        protocol: str | None,
    ) -> str:
        normalized = (protocol or provider.default_protocol).strip() or provider.default_protocol
        supported_protocols = self._list_supported_protocols(provider)
        if supported_protocols and normalized not in supported_protocols:
            raise ModelProviderRegistryError(
                f"{provider.label} 仅支持 {', '.join(supported_protocols)} 协议。"
            )
        return normalized

    def _list_supported_protocols(
        self,
        provider: NativeModelProviderDefinition,
    ) -> list[str]:
        for field in provider.credential_fields:
            if field.variable != "api_protocol":
                continue
            if field.options:
                return [option.value for option in field.options]
            if field.default:
                return [field.default]
        if provider.default_protocol:
            return [provider.default_protocol]
        return []
