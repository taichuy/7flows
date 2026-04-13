use crate::_tests::support::MemoryRoleRepository;
use crate::role::{
    CreateRoleCommand, DeleteRoleCommand, ReplaceRolePermissionsCommand, RoleService,
    UpdateRoleCommand,
};

#[tokio::test]
async fn role_service_rejects_root_mutation_and_replaces_permissions_for_team_roles() {
    let repository = MemoryRoleRepository::default();
    let service = RoleService::new(repository.clone());

    service
        .create_role(CreateRoleCommand {
            actor_user_id: repository.root_user_id(),
            code: "qa".into(),
            name: "QA".into(),
            introduction: "qa role".into(),
        })
        .await
        .unwrap();

    service
        .update_role(UpdateRoleCommand {
            actor_user_id: repository.root_user_id(),
            role_code: "qa".into(),
            name: "QA Updated".into(),
            introduction: "updated qa role".into(),
        })
        .await
        .unwrap();

    service
        .replace_permissions(ReplaceRolePermissionsCommand {
            actor_user_id: repository.root_user_id(),
            role_code: "qa".into(),
            permission_codes: vec!["route_page.view.all".into(), "application.edit.own".into()],
        })
        .await
        .unwrap();

    service
        .delete_role(DeleteRoleCommand {
            actor_user_id: repository.root_user_id(),
            role_code: "qa".into(),
        })
        .await
        .unwrap();

    assert!(service
        .replace_permissions(ReplaceRolePermissionsCommand {
            actor_user_id: repository.root_user_id(),
            role_code: "root".into(),
            permission_codes: vec!["team.configure.all".into()],
        })
        .await
        .is_err());
    assert_eq!(
        repository.audit_events(),
        vec![
            "role.created",
            "role.updated",
            "role.permissions_replaced",
            "role.deleted",
        ]
    );
}
