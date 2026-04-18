use anyhow::Result;
use async_trait::async_trait;
use control_plane::ports::SessionStore;
use domain::SessionRecord;
use redis::{aio::ConnectionManager, AsyncCommands};

#[derive(Clone)]
pub struct RedisSessionStore {
    manager: ConnectionManager,
    key_prefix: String,
}

impl RedisSessionStore {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let manager = ConnectionManager::new(client).await?;

        Ok(Self {
            manager,
            key_prefix: "flowbase:console:session".to_string(),
        })
    }

    fn key(&self, session_id: &str) -> String {
        format!("{}:{}", self.key_prefix, session_id)
    }
}

#[async_trait]
impl SessionStore for RedisSessionStore {
    async fn put(&self, session: SessionRecord) -> Result<()> {
        let key = self.key(&session.session_id);
        let ttl = (session.expires_at_unix - time::OffsetDateTime::now_utc().unix_timestamp())
            .max(1) as u64;
        let payload = serde_json::to_string(&session)?;
        let mut connection = self.manager.clone();

        let _: () = connection.set_ex(key, payload, ttl).await?;
        Ok(())
    }

    async fn get(&self, session_id: &str) -> Result<Option<SessionRecord>> {
        let mut connection = self.manager.clone();
        let value: Option<String> = connection.get(self.key(session_id)).await?;

        Ok(value
            .map(|raw| serde_json::from_str::<SessionRecord>(&raw))
            .transpose()?)
    }

    async fn delete(&self, session_id: &str) -> Result<()> {
        let mut connection = self.manager.clone();
        let _: usize = connection.del(self.key(session_id)).await?;
        Ok(())
    }

    async fn touch(&self, session_id: &str, expires_at_unix: i64) -> Result<()> {
        let ttl = (expires_at_unix - time::OffsetDateTime::now_utc().unix_timestamp()).max(1);
        let mut connection = self.manager.clone();
        let _: bool = connection.expire(self.key(session_id), ttl).await?;
        Ok(())
    }
}
