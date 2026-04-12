use domain::{ActorContext, BoundRole, RoleScopeKind, UserRecord, UserStatus};
use uuid::Uuid;

fn sample_user(default_display_role: Option<&str>, roles: &[&str]) -> UserRecord {
    UserRecord {
        id: Uuid::now_v7(),
        account: "root".into(),
        email: "root@example.com".into(),
        phone: None,
        password_hash: "hash".into(),
        name: "Root".into(),
        nickname: "Root".into(),
        avatar_url: None,
        introduction: String::new(),
        default_display_role: default_display_role.map(str::to_string),
        email_login_enabled: true,
        phone_login_enabled: false,
        status: UserStatus::Active,
        session_version: 1,
        roles: roles
            .iter()
            .map(|code| BoundRole {
                code: (*code).into(),
                scope_kind: RoleScopeKind::Team,
                team_id: Some(Uuid::nil()),
            })
            .collect(),
    }
}

#[test]
fn resolved_display_role_falls_back_to_first_bound_role() {
    let user = sample_user(Some("deleted-role"), &["manager", "admin"]);

    assert_eq!(user.resolved_display_role().as_deref(), Some("manager"));
}

#[test]
fn root_actor_short_circuits_permission_checks() {
    let actor = ActorContext::root(Uuid::now_v7(), Uuid::now_v7(), "root");

    assert!(actor.has_permission("role_permission.manage.all"));
}
