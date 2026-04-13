use runtime_core::runtime_model_registry::RuntimeModelRegistry;

#[test]
fn runtime_model_registry_rebuilds_and_refreshes_by_model_code() {
    let registry = RuntimeModelRegistry::default();
    registry.rebuild(vec![runtime_core::model_metadata::ModelMetadata {
        model_id: uuid::Uuid::nil(),
        model_code: "orders".into(),
        scope_kind: domain::DataModelScopeKind::Team,
        scope_id: uuid::Uuid::nil(),
        physical_table_name: "rtm_team_demo_orders".into(),
        scope_column_name: "team_id".into(),
        fields: vec![],
        resource: runtime_core::resource_descriptor::ResourceDescriptor::runtime_model(
            "orders",
            domain::DataModelScopeKind::Team,
        ),
    }]);

    assert!(registry
        .get(
            domain::DataModelScopeKind::Team,
            uuid::Uuid::nil(),
            "orders"
        )
        .is_some());
}
