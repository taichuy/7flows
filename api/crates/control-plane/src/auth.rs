use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use argon2::{
    password_hash::{PasswordHash, PasswordVerifier},
    Argon2,
};
use async_trait::async_trait;
use domain::{ActorContext, SessionRecord, UserStatus};
use sha2::{Digest, Sha256};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    errors::ControlPlaneError,
    ports::{
        ApiKeyRepository, AuthRepository, CreateApiKeyInput, SessionStore,
        UpsertApiKeyDataModelPermissionInput,
    },
};

pub struct LoginCommand {
    pub authenticator: String,
    pub identifier: String,
    pub password: String,
}

pub struct LoginResult {
    pub actor: ActorContext,
    pub session: SessionRecord,
}

#[derive(Debug, Clone)]
pub struct ApiKeyDataModelPermissionCommand {
    pub data_model_id: Uuid,
    pub allow_list: bool,
    pub allow_get: bool,
    pub allow_create: bool,
    pub allow_update: bool,
    pub allow_delete: bool,
}

#[derive(Debug, Clone)]
pub struct CreateApiKeyCommand {
    pub actor_user_id: Uuid,
    pub name: String,
    pub scope_kind: Option<domain::DataModelScopeKind>,
    pub scope_id: Option<Uuid>,
    pub expires_at: Option<OffsetDateTime>,
    pub permissions: Vec<ApiKeyDataModelPermissionCommand>,
}

#[derive(Debug, Clone)]
pub struct CreateApiKeyResult {
    pub api_key: domain::ApiKeyRecord,
    pub token: String,
    pub permissions: Vec<domain::ApiKeyDataModelPermissionRecord>,
}

#[derive(Debug, Clone)]
pub struct ApiKeyActor {
    pub api_key: domain::ApiKeyRecord,
    pub actor: ActorContext,
    pub permissions: Vec<domain::ApiKeyDataModelPermissionRecord>,
}

#[async_trait]
pub trait AuthenticatorProvider: Send + Sync {
    fn auth_type(&self) -> &'static str;
    async fn authenticate(
        &self,
        identifier: &str,
        password: &str,
        repository: &dyn AuthRepository,
    ) -> Result<domain::UserRecord>;
}

pub struct PasswordLocalAuthenticator;

#[async_trait]
impl AuthenticatorProvider for PasswordLocalAuthenticator {
    fn auth_type(&self) -> &'static str {
        "password-local"
    }

    async fn authenticate(
        &self,
        identifier: &str,
        password: &str,
        repository: &dyn AuthRepository,
    ) -> Result<domain::UserRecord> {
        let user = repository
            .find_user_for_password_login(identifier)
            .await?
            .ok_or(ControlPlaneError::NotAuthenticated)?;
        let parsed = PasswordHash::new(&user.password_hash)
            .map_err(|_| ControlPlaneError::NotAuthenticated)?;
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .map_err(|_| ControlPlaneError::NotAuthenticated)?;
        Ok(user)
    }
}

pub struct AuthenticatorRegistry {
    providers: HashMap<String, Arc<dyn AuthenticatorProvider>>,
}

impl AuthenticatorRegistry {
    pub fn new() -> Self {
        let password_provider: Arc<dyn AuthenticatorProvider> =
            Arc::new(PasswordLocalAuthenticator);
        let mut providers = HashMap::new();
        providers.insert(password_provider.auth_type().to_string(), password_provider);
        Self { providers }
    }

    pub fn provider(&self, auth_type: &str) -> Option<Arc<dyn AuthenticatorProvider>> {
        self.providers.get(auth_type).cloned()
    }
}

impl Default for AuthenticatorRegistry {
    fn default() -> Self {
        Self::new()
    }
}

pub struct ApiKeyService<R> {
    repository: R,
}

impl<R> ApiKeyService<R>
where
    R: AuthRepository + ApiKeyRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn create_api_key(&self, command: CreateApiKeyCommand) -> Result<CreateApiKeyResult> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_api_key_manage_permission(&actor)?;

        let scope_kind = command
            .scope_kind
            .unwrap_or(domain::DataModelScopeKind::Workspace);
        let scope_id = match (scope_kind, command.scope_id) {
            (domain::DataModelScopeKind::Workspace, Some(scope_id)) => scope_id,
            (domain::DataModelScopeKind::Workspace, None) => actor.current_workspace_id,
            (domain::DataModelScopeKind::System, Some(scope_id)) => scope_id,
            (domain::DataModelScopeKind::System, None) => domain::SYSTEM_SCOPE_ID,
        };
        if !actor.is_root && scope_id != actor.current_workspace_id {
            return Err(ControlPlaneError::PermissionDenied("permission_denied").into());
        }

        let key_id = Uuid::now_v7();
        let token_prefix = format!("dmk_{}", key_id.simple());
        let secret = format!("{}{}", Uuid::now_v7().simple(), Uuid::now_v7().simple());
        let token = format!("{token_prefix}_{secret}");
        let token_hash = hash_api_key_token(&token);
        let api_key = self
            .repository
            .create_api_key(&CreateApiKeyInput {
                id: key_id,
                name: command.name,
                token_hash,
                token_prefix,
                key_kind: domain::ApiKeyKind::DataModelApiKey,
                application_id: None,
                creator_user_id: command.actor_user_id,
                tenant_id: actor.tenant_id,
                scope_kind,
                scope_id,
                enabled: true,
                expires_at: command.expires_at,
            })
            .await?;
        let permission_inputs = command
            .permissions
            .into_iter()
            .map(|permission| UpsertApiKeyDataModelPermissionInput {
                api_key_id: api_key.id,
                data_model_id: permission.data_model_id,
                allow_list: permission.allow_list,
                allow_get: permission.allow_get,
                allow_create: permission.allow_create,
                allow_update: permission.allow_update,
                allow_delete: permission.allow_delete,
            })
            .collect::<Vec<_>>();
        let permissions = self
            .repository
            .replace_api_key_data_model_permissions(api_key.id, &permission_inputs)
            .await?;

        Ok(CreateApiKeyResult {
            api_key,
            token,
            permissions,
        })
    }

    pub async fn authenticate_bearer_token(&self, token: &str) -> Result<ApiKeyActor> {
        if !token.starts_with("dmk_") {
            return Err(ControlPlaneError::NotAuthenticated.into());
        }
        let token_hash = hash_api_key_token(token);
        let api_key = self
            .repository
            .find_api_key_by_token_hash(&token_hash)
            .await?
            .ok_or(ControlPlaneError::NotAuthenticated)?;
        if !api_key.enabled {
            return Err(ControlPlaneError::NotAuthenticated.into());
        }
        if api_key.key_kind != domain::ApiKeyKind::DataModelApiKey
            || api_key.application_id.is_some()
        {
            return Err(ControlPlaneError::NotAuthenticated.into());
        }
        if api_key
            .expires_at
            .is_some_and(|expires_at| expires_at <= OffsetDateTime::now_utc())
        {
            return Err(ControlPlaneError::NotAuthenticated.into());
        }

        let permissions = self
            .repository
            .list_api_key_data_model_permissions(api_key.id)
            .await?;
        let actor = ActorContext::scoped_in_scope(
            api_key.creator_user_id,
            api_key.tenant_id,
            api_key.scope_id,
            "api_key",
            Vec::<String>::new(),
        );

        Ok(ApiKeyActor {
            api_key,
            actor,
            permissions,
        })
    }
}

fn ensure_api_key_manage_permission(actor: &ActorContext) -> Result<(), ControlPlaneError> {
    if actor.is_root
        || actor.has_permission("state_model.manage.all")
        || actor.has_permission("state_model.manage.own")
    {
        return Ok(());
    }

    Err(ControlPlaneError::PermissionDenied("permission_denied"))
}

pub fn hash_api_key_token(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

pub struct SessionIssuer<S> {
    store: S,
    ttl_days: i64,
}

impl<S> SessionIssuer<S>
where
    S: SessionStore,
{
    pub fn new(store: S, ttl_days: i64) -> Self {
        Self { store, ttl_days }
    }

    pub async fn issue(
        &self,
        user_id: Uuid,
        tenant_id: Uuid,
        current_workspace_id: Uuid,
        session_version: i64,
    ) -> Result<SessionRecord> {
        let session = SessionRecord {
            session_id: Uuid::now_v7().to_string(),
            user_id,
            tenant_id,
            current_workspace_id,
            session_version,
            csrf_token: Uuid::now_v7().to_string(),
            expires_at_unix: (OffsetDateTime::now_utc() + time::Duration::days(self.ttl_days))
                .unix_timestamp(),
        };
        self.store.put(session.clone()).await?;
        Ok(session)
    }
}

pub struct AuthKernel<R, S> {
    repository: R,
    registry: AuthenticatorRegistry,
    issuer: SessionIssuer<S>,
}

impl<R, S> AuthKernel<R, S>
where
    R: AuthRepository,
    S: SessionStore,
{
    pub fn new(repository: R, issuer: SessionIssuer<S>) -> Self {
        Self {
            repository,
            registry: AuthenticatorRegistry::new(),
            issuer,
        }
    }

    pub async fn login(&self, command: LoginCommand) -> Result<LoginResult> {
        let authenticator = self
            .repository
            .find_authenticator(&command.authenticator)
            .await?
            .ok_or(ControlPlaneError::NotFound("authenticator"))?;
        if !authenticator.enabled {
            return Err(ControlPlaneError::PermissionDenied("authenticator_disabled").into());
        }

        let provider = self
            .registry
            .provider(&authenticator.auth_type)
            .ok_or(ControlPlaneError::NotFound("auth_provider"))?;
        let user = provider
            .authenticate(&command.identifier, &command.password, &self.repository)
            .await?;
        if matches!(user.status, UserStatus::Disabled) {
            return Err(ControlPlaneError::PermissionDenied("user_disabled").into());
        }

        let scope = self.repository.default_scope_for_user(user.id).await?;
        let actor = self
            .repository
            .load_actor_context(
                user.id,
                scope.tenant_id,
                scope.workspace_id,
                user.default_display_role.as_deref(),
            )
            .await?;
        let session = self
            .issuer
            .issue(
                user.id,
                scope.tenant_id,
                scope.workspace_id,
                user.session_version,
            )
            .await?;

        Ok(LoginResult { actor, session })
    }
}
