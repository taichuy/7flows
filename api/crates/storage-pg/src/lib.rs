extern crate self as storage_pg;

mod connection;
mod repositories;

pub use connection::connect;
pub use repositories::PgControlPlaneStore;

use anyhow::Result;
use sqlx::PgPool;

pub fn crate_name() -> &'static str {
    "storage-pg"
}

pub async fn run_migrations(pool: &PgPool) -> Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

#[cfg(test)]
mod _tests;
