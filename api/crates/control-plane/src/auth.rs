use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use argon2::{
    password_hash::{PasswordHash, PasswordVerifier},
    Argon2,
};
use async_trait::async_trait;
use domain::{ActorContext, SessionRecord, UserStatus};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    errors::ControlPlaneError,
    ports::{AuthRepository, SessionStore},
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
