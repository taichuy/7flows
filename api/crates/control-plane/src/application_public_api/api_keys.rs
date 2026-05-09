use anyhow::{anyhow, Result};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    application_public_api::{
        ensure_application_edit_permission, ensure_application_view_permission,
    },
    auth::hash_api_key_token,
    errors::ControlPlaneError,
    ports::{ApiKeyRepository, ApplicationRepository, AuthRepository, CreateApiKeyInput},
};

#[derive(Debug, Clone)]
pub struct CreateApplicationApiKeyCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub name: String,
    pub expires_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone)]
pub struct ListApplicationApiKeysCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct RevokeApplicationApiKeyCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub api_key_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct CreateApplicationApiKeyResult {
    pub api_key: domain::ApiKeyRecord,
    pub token: String,
}

#[derive(Debug, Clone)]
pub struct ApplicationApiKeyActor {
    pub api_key_id: Uuid,
    pub application_id: Uuid,
    pub creator_user_id: Uuid,
    pub tenant_id: Uuid,
    pub workspace_id: Uuid,
    pub actor: domain::ActorContext,
}

pub struct ApplicationApiKeyService<R> {
    repository: R,
}

impl<R> ApplicationApiKeyService<R>
where
    R: AuthRepository + ApiKeyRepository + ApplicationRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn create_api_key(
        &self,
        command: CreateApplicationApiKeyCommand,
    ) -> Result<CreateApplicationApiKeyResult> {
        let actor =
            AuthRepository::load_actor_context_for_user(&self.repository, command.actor_user_id)
                .await?;
        let application = self
            .repository
            .get_application(actor.current_workspace_id, command.application_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("application"))?;
        ensure_application_edit_permission(&actor, &application)?;

        let key_id = Uuid::now_v7();
        let token_prefix = format!("apk_{}", key_id.simple());
        let secret = format!("{}{}", Uuid::now_v7().simple(), Uuid::now_v7().simple());
        let token = format!("{token_prefix}_{secret}");
        let api_key = self
            .repository
            .create_api_key(&CreateApiKeyInput {
                id: key_id,
                name: command.name,
                token_hash: hash_api_key_token(&token),
                token_prefix,
                key_kind: domain::ApiKeyKind::ApplicationApiKey,
                application_id: Some(application.id),
                creator_user_id: command.actor_user_id,
                tenant_id: actor.tenant_id,
                scope_kind: domain::DataModelScopeKind::Workspace,
                scope_id: application.workspace_id,
                enabled: true,
                expires_at: command.expires_at,
            })
            .await?;

        Ok(CreateApplicationApiKeyResult { api_key, token })
    }

    pub async fn list_api_keys(
        &self,
        command: ListApplicationApiKeysCommand,
    ) -> Result<Vec<domain::ApiKeyRecord>> {
        let actor =
            AuthRepository::load_actor_context_for_user(&self.repository, command.actor_user_id)
                .await?;
        self.repository
            .get_application(actor.current_workspace_id, command.application_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("application"))
            .and_then(|application| {
                ensure_application_view_permission(&actor, &application)?;
                Ok(application)
            })?;

        self.repository
            .list_application_api_keys(command.application_id, command.actor_user_id)
            .await
    }

    pub async fn revoke_api_key(&self, command: RevokeApplicationApiKeyCommand) -> Result<()> {
        let actor =
            AuthRepository::load_actor_context_for_user(&self.repository, command.actor_user_id)
                .await?;
        self.repository
            .get_application(actor.current_workspace_id, command.application_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("application"))
            .and_then(|application| {
                ensure_application_edit_permission(&actor, &application)?;
                Ok(application)
            })?;

        self.repository
            .revoke_application_api_key(
                command.api_key_id,
                command.application_id,
                command.actor_user_id,
            )
            .await
    }

    pub async fn authenticate_bearer_token(&self, token: &str) -> Result<ApplicationApiKeyActor> {
        if !token.starts_with("apk_") {
            return Err(anyhow!("not_authenticated"));
        }

        let api_key = self
            .repository
            .find_api_key_by_token_hash(&hash_api_key_token(token))
            .await?
            .ok_or_else(|| anyhow!("not_authenticated"))?;
        if api_key.key_kind != domain::ApiKeyKind::ApplicationApiKey
            || !api_key.enabled
            || api_key
                .expires_at
                .is_some_and(|expires_at| expires_at <= OffsetDateTime::now_utc())
        {
            return Err(anyhow!("not_authenticated"));
        }

        let application_id = api_key
            .application_id
            .ok_or_else(|| anyhow!("not_authenticated"))?;
        let application = self
            .repository
            .get_application(api_key.scope_id, application_id)
            .await?
            .ok_or_else(|| anyhow!("not_authenticated"))?;
        let actor = domain::ActorContext::scoped_in_scope(
            api_key.creator_user_id,
            api_key.tenant_id,
            application.workspace_id,
            "application_api_key",
            Vec::<String>::new(),
        );

        Ok(ApplicationApiKeyActor {
            api_key_id: api_key.id,
            application_id,
            creator_user_id: api_key.creator_user_id,
            tenant_id: api_key.tenant_id,
            workspace_id: application.workspace_id,
            actor,
        })
    }
}
