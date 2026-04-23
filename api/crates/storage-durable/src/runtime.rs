use crate::DurableBackendKind;

pub type MainDurableStore = storage_postgres::PgControlPlaneStore;

#[derive(Clone)]
pub struct MainDurableRuntime {
    pub kind: DurableBackendKind,
    pub store: MainDurableStore,
}

pub async fn build_main_durable_postgres(database_url: &str) -> anyhow::Result<MainDurableRuntime> {
    let pool = storage_postgres::connect(database_url).await?;
    storage_postgres::run_migrations(&pool).await?;

    Ok(MainDurableRuntime {
        kind: DurableBackendKind::Postgres,
        store: storage_postgres::PgControlPlaneStore::new(pool),
    })
}
