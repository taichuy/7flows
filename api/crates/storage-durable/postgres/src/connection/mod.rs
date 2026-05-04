use anyhow::Result;
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::time::Duration;

pub async fn connect(database_url: &str) -> Result<PgPool> {
    connect_with_max_connections(database_url, 5).await
}

pub async fn connect_with_max_connections(
    database_url: &str,
    max_connections: u32,
) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(max_connections)
        .acquire_timeout(Duration::from_secs(5))
        .connect(database_url)
        .await?;

    Ok(pool)
}
