use async_trait::async_trait;
use control_plane::ports::SessionStore;
use domain::SessionRecord;
use redis::{aio::ConnectionManager, AsyncCommands};

use crate::session_store::{is_session_expired, session_ttl};

#[derive(Clone)]
pub struct RedisSessionStore {
    manager: ConnectionManager,
    key_prefix: String,
}

impl RedisSessionStore {
    pub async fn new(redis_url: &str, key_prefix: impl Into<String>) -> anyhow::Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let manager = ConnectionManager::new(client).await?;

        Ok(Self {
            manager,
            key_prefix: key_prefix.into(),
        })
    }

    fn key(&self, session_id: &str) -> String {
        format!("{}:{}", self.key_prefix, session_id)
    }

    async fn read_session(&self, session_id: &str) -> anyhow::Result<Option<SessionRecord>> {
        let mut connection = self.manager.clone();
        let value: Option<String> = connection.get(self.key(session_id)).await?;

        value
            .map(|raw| serde_json::from_str::<SessionRecord>(&raw))
            .transpose()
            .map_err(Into::into)
    }
}

#[async_trait]
impl SessionStore for RedisSessionStore {
    async fn put(&self, session: SessionRecord) -> anyhow::Result<()> {
        let ttl = session_ttl(session.expires_at_unix).whole_seconds().max(1) as u64;
        let payload = serde_json::to_string(&session)?;
        let mut connection = self.manager.clone();

        let _: () = connection
            .set_ex(self.key(&session.session_id), payload, ttl)
            .await?;
        Ok(())
    }

    async fn get(&self, session_id: &str) -> anyhow::Result<Option<SessionRecord>> {
        let Some(session) = self.read_session(session_id).await? else {
            return Ok(None);
        };

        if is_session_expired(&session) {
            self.delete(session_id).await?;
            return Ok(None);
        }

        Ok(Some(session))
    }

    async fn delete(&self, session_id: &str) -> anyhow::Result<()> {
        let mut connection = self.manager.clone();
        let _: usize = connection.del(self.key(session_id)).await?;
        Ok(())
    }

    async fn touch(&self, session_id: &str, expires_at_unix: i64) -> anyhow::Result<()> {
        let ttl = session_ttl(expires_at_unix).whole_seconds();
        if ttl <= 0 {
            self.delete(session_id).await?;
            return Ok(());
        }

        let Some(mut session) = self.read_session(session_id).await? else {
            return Ok(());
        };
        if is_session_expired(&session) {
            self.delete(session_id).await?;
            return Ok(());
        }

        session.expires_at_unix = expires_at_unix;
        let mut connection = self.manager.clone();
        let _: () = connection
            .set_ex(
                self.key(session_id),
                serde_json::to_string(&session)?,
                ttl as u64,
            )
            .await?;
        Ok(())
    }
}
