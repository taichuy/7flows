use std::{collections::HashMap, sync::Arc};

use async_trait::async_trait;
use time::OffsetDateTime;
use tokio::sync::RwLock;

use crate::LeaseStore;

#[derive(Clone)]
pub struct MemoryLeaseStore {
    namespace: String,
    inner: Arc<RwLock<HashMap<String, LeaseEntry>>>,
}

#[derive(Clone)]
struct LeaseEntry {
    owner: String,
    expires_at: OffsetDateTime,
}

impl MemoryLeaseStore {
    pub fn new(namespace: impl Into<String>) -> Self {
        Self {
            namespace: namespace.into(),
            inner: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    fn namespaced_key(&self, key: &str) -> String {
        format!("{}:{}", self.namespace, key)
    }

    fn expires_at(ttl: time::Duration) -> OffsetDateTime {
        OffsetDateTime::now_utc() + ttl
    }
}

#[async_trait]
impl LeaseStore for MemoryLeaseStore {
    async fn acquire(&self, key: &str, owner: &str, ttl: time::Duration) -> anyhow::Result<bool> {
        let namespaced_key = self.namespaced_key(key);
        let mut map = self.inner.write().await;
        let now = OffsetDateTime::now_utc();

        match map.get(&namespaced_key) {
            Some(entry) if entry.expires_at > now && entry.owner != owner => return Ok(false),
            _ => {}
        }

        map.insert(
            namespaced_key,
            LeaseEntry {
                owner: owner.to_string(),
                expires_at: Self::expires_at(ttl),
            },
        );
        Ok(true)
    }

    async fn renew(&self, key: &str, owner: &str, ttl: time::Duration) -> anyhow::Result<bool> {
        let namespaced_key = self.namespaced_key(key);
        let mut map = self.inner.write().await;
        let now = OffsetDateTime::now_utc();
        let Some(entry) = map.get_mut(&namespaced_key) else {
            return Ok(false);
        };

        if entry.expires_at <= now {
            map.remove(&namespaced_key);
            return Ok(false);
        }
        if entry.owner != owner {
            return Ok(false);
        }

        entry.expires_at = Self::expires_at(ttl);
        Ok(true)
    }

    async fn release(&self, key: &str, owner: &str) -> anyhow::Result<bool> {
        let namespaced_key = self.namespaced_key(key);
        let mut map = self.inner.write().await;
        let now = OffsetDateTime::now_utc();
        let Some(entry) = map.get(&namespaced_key) else {
            return Ok(false);
        };

        if entry.expires_at <= now {
            map.remove(&namespaced_key);
            return Ok(false);
        }
        if entry.owner != owner {
            return Ok(false);
        }

        map.remove(&namespaced_key);
        Ok(true)
    }
}
