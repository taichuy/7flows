use storage_durable::{build_main_durable_postgres, DurableBackendKind, MainDurableStore};

#[test]
fn durable_backend_kind_parses_postgres() {
    assert_eq!(
        DurableBackendKind::from_env_value("postgres").unwrap().as_str(),
        "postgres"
    );
}

#[test]
fn main_durable_store_alias_points_at_storage_postgres() {
    let type_name = std::any::type_name::<MainDurableStore>();
    assert!(type_name.contains("storage_postgres"));
}

#[test]
fn postgres_builder_is_part_of_public_surface() {
    let _ = build_main_durable_postgres;
}

#[test]
fn durable_crate_name_and_postgres_crate_name_are_stable() {
    assert_eq!(storage_durable::crate_name(), "storage-durable");
    assert_eq!(storage_postgres::crate_name(), "storage-postgres");
}
