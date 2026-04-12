use access_control::{builtin_role_templates, permission_catalog};

#[test]
fn permission_catalog_seeds_expected_codes() {
    let codes: Vec<String> = permission_catalog()
        .into_iter()
        .map(|permission| permission.code)
        .collect();

    assert!(codes.contains(&"user.manage.all".to_string()));
    assert!(codes.contains(&"team.configure.all".to_string()));
    assert!(codes.contains(&"route_page.view.all".to_string()));
}

#[test]
fn builtin_roles_lock_root_but_keep_admin_and_manager_editable() {
    let templates = builtin_role_templates();

    let root = templates.iter().find(|role| role.code == "root").unwrap();
    let admin = templates.iter().find(|role| role.code == "admin").unwrap();
    let manager = templates.iter().find(|role| role.code == "manager").unwrap();

    assert!(!root.is_editable);
    assert!(admin.is_editable);
    assert!(manager.is_editable);
}
