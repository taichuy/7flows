use control_plane::ports::{CreateModelDefinitionInput, ModelDefinitionRepository};
use domain::ModelDefinitionStatus;
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
use uuid::Uuid;

fn database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows".into())
}

#[tokio::test]
async fn model_definition_repository_creates_and_publishes_model() {
    let pool = connect(&database_url()).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let code = format!("orders_{}", Uuid::now_v7().simple());

    let created = ModelDefinitionRepository::create_model_definition(
        &store,
        &CreateModelDefinitionInput {
            actor_user_id: Uuid::nil(),
            code: code.clone(),
            name: "Orders".into(),
        },
    )
    .await
    .unwrap();

    let published =
        ModelDefinitionRepository::publish_model_definition(&store, Uuid::nil(), created.id)
            .await
            .unwrap();

    assert_eq!(published.code, code);
    assert_eq!(published.status, ModelDefinitionStatus::Published);
    assert_eq!(published.published_version, Some(1));
}
