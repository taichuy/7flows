use crate::_tests::support::MemoryBootstrapRepository;
use crate::bootstrap::{BootstrapConfig, BootstrapService};

#[tokio::test]
async fn bootstrap_service_is_idempotent() {
    let repository = MemoryBootstrapRepository::default();
    let service = BootstrapService::new(repository.clone());
    let config = BootstrapConfig {
        workspace_name: "1Flowbase".into(),
        root_account: "root".into(),
        root_email: "root@example.com".into(),
        root_password_hash: "hash".into(),
        root_name: "Root".into(),
        root_nickname: "Root".into(),
    };

    service.run(&config).await.unwrap();
    service.run(&config).await.unwrap();

    assert_eq!(repository.authenticator_upserts(), 2);
    assert_eq!(repository.root_user_creates(), 1);
}

#[tokio::test]
async fn bootstrap_service_seeds_single_root_tenant_and_default_workspace() {
    let repository = MemoryBootstrapRepository::default();
    let service = BootstrapService::new(repository.clone());
    let config = BootstrapConfig {
        workspace_name: "1Flowbase".into(),
        root_account: "root".into(),
        root_email: "root@example.com".into(),
        root_password_hash: "hash".into(),
        root_name: "Root".into(),
        root_nickname: "Root".into(),
    };

    service.run(&config).await.unwrap();
    service.run(&config).await.unwrap();

    assert_eq!(repository.root_tenant_upserts(), 2);
    assert_eq!(repository.workspace_upserts(), 2);
    assert_eq!(repository.root_user_creates(), 1);
}
