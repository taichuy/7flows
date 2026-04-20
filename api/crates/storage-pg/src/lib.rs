extern crate self as storage_pg;

pub mod application_repository;
pub mod auth_repository;
mod connection;
pub mod flow_repository;
pub mod mappers;
pub mod member_repository;
pub mod model_definition_repository;
pub mod model_provider_repository;
pub mod node_contribution_repository;
pub mod orchestration_runtime_repository;
pub mod physical_schema_repository;
pub mod plugin_repository;
pub mod repositories;
pub mod role_repository;
pub mod runtime_record_repository;
pub mod workspace_repository;

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
