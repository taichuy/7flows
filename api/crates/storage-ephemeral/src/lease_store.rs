use async_trait::async_trait;

#[async_trait]
pub trait LeaseStore: Send + Sync {
    async fn acquire(&self, key: &str, owner: &str, ttl: time::Duration)
        -> anyhow::Result<bool>;
    async fn renew(&self, key: &str, owner: &str, ttl: time::Duration) -> anyhow::Result<bool>;
    async fn release(&self, key: &str, owner: &str) -> anyhow::Result<bool>;
}
