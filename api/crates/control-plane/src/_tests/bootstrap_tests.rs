use crate::_tests::support::MemoryBootstrapRepository;
use crate::bootstrap::{BootstrapConfig, BootstrapService};

#[tokio::test]
async fn bootstrap_service_is_idempotent() {
    let repository = MemoryBootstrapRepository::default();
    let service = BootstrapService::new(repository.clone());
    let config = BootstrapConfig {
        workspace_name: "1flowbase".into(),
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
        workspace_name: "1flowbase".into(),
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

#[tokio::test]
async fn bootstrap_service_returns_ids_needed_for_follow_up_startup_bootstrap() {
    let repository = MemoryBootstrapRepository::default();
    let service = BootstrapService::new(repository.clone());
    let config = BootstrapConfig {
        workspace_name: "1flowbase".into(),
        root_account: "root".into(),
        root_email: "root@example.com".into(),
        root_password_hash: "hash".into(),
        root_name: "Root".into(),
        root_nickname: "Root".into(),
    };

    let first = service.run(&config).await.unwrap();
    let second = service.run(&config).await.unwrap();

    assert_eq!(first.workspace_id, second.workspace_id);
    assert_eq!(first.root_user_id, second.root_user_id);
}
