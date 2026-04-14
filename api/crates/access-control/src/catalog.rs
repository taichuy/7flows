use domain::{PermissionDefinition, RoleScopeKind, RoleTemplate};

fn push_permissions(
    permissions: &mut Vec<PermissionDefinition>,
    resource: &str,
    actions: &[(&str, &[&str])],
) {
    for (action, scopes) in actions {
        for scope in *scopes {
            permissions.push(PermissionDefinition {
                code: format!("{resource}.{action}.{scope}"),
                resource: resource.to_string(),
                action: (*action).to_string(),
                scope: (*scope).to_string(),
                name: format!("{resource}:{action}:{scope}"),
            });
        }
    }
}

pub fn permission_catalog() -> Vec<PermissionDefinition> {
    let mut permissions = Vec::new();

    push_permissions(
        &mut permissions,
        "application",
        &[
            ("view", &["own", "all"]),
            ("create", &["all"]),
            ("edit", &["own", "all"]),
            ("delete", &["own", "all"]),
            ("manage", &["own", "all"]),
            ("use", &["own", "all"]),
        ],
    );
    push_permissions(
        &mut permissions,
        "flow",
        &[
            ("view", &["own", "all"]),
            ("create", &["all"]),
            ("edit", &["own", "all"]),
            ("delete", &["own", "all"]),
            ("manage", &["own", "all"]),
            ("use", &["own", "all"]),
        ],
    );
    push_permissions(
        &mut permissions,
        "publish_endpoint",
        &[
            ("view", &["own", "all"]),
            ("create", &["all"]),
            ("edit", &["own", "all"]),
            ("delete", &["own", "all"]),
            ("publish", &["own", "all"]),
            ("use", &["own", "all"]),
        ],
    );
    push_permissions(
        &mut permissions,
        "route_page",
        &[
            ("view", &["own", "all"]),
            ("create", &["all"]),
            ("edit", &["own", "all"]),
            ("delete", &["own", "all"]),
            ("publish", &["own", "all"]),
            ("use", &["own", "all"]),
        ],
    );
    push_permissions(
        &mut permissions,
        "state_model",
        &[
            ("view", &["own", "all"]),
            ("create", &["all"]),
            ("edit", &["own", "all"]),
            ("delete", &["own", "all"]),
            ("manage", &["own", "all"]),
        ],
    );
    push_permissions(
        &mut permissions,
        "state_data",
        &[
            ("view", &["own", "all"]),
            ("create", &["all"]),
            ("edit", &["own", "all"]),
            ("delete", &["own", "all"]),
            ("manage", &["own", "all"]),
            ("use", &["own", "all"]),
        ],
    );
    push_permissions(
        &mut permissions,
        "external_data_source",
        &[
            ("view", &["own", "all"]),
            ("create", &["all"]),
            ("edit", &["own", "all"]),
            ("delete", &["own", "all"]),
            ("configure", &["own", "all"]),
            ("use", &["own", "all"]),
        ],
    );
    push_permissions(
        &mut permissions,
        "plugin_config",
        &[
            ("view", &["all"]),
            ("edit", &["all"]),
            ("configure", &["all"]),
        ],
    );
    push_permissions(
        &mut permissions,
        "embedded_app",
        &[
            ("view", &["own", "all"]),
            ("create", &["all"]),
            ("edit", &["own", "all"]),
            ("delete", &["own", "all"]),
            ("use", &["own", "all"]),
        ],
    );
    push_permissions(
        &mut permissions,
        "user",
        &[("view", &["all"]), ("manage", &["all"])],
    );
    push_permissions(
        &mut permissions,
        "role_permission",
        &[("view", &["all"]), ("manage", &["all"])],
    );
    push_permissions(
        &mut permissions,
        "workspace",
        &[("view", &["all"]), ("configure", &["all"])],
    );
    push_permissions(&mut permissions, "api_reference", &[("view", &["all"])]);

    permissions
}

pub fn builtin_role_templates() -> Vec<RoleTemplate> {
    let all_codes = permission_catalog()
        .into_iter()
        .map(|permission| permission.code)
        .collect::<Vec<_>>();

    let manager_resources = [
        "application",
        "flow",
        "publish_endpoint",
        "route_page",
        "state_model",
        "state_data",
        "external_data_source",
        "embedded_app",
    ];
    let manager_permissions = all_codes
        .iter()
        .filter(|code| {
            let matches_resource = manager_resources
                .iter()
                .any(|resource| code.starts_with(resource));

            matches_resource && (!code.ends_with(".all") || code.ends_with(".create.all"))
        })
        .cloned()
        .collect();

    vec![
        RoleTemplate {
            code: "root".to_string(),
            name: "Root".to_string(),
            scope_kind: RoleScopeKind::System,
            is_builtin: true,
            is_editable: false,
            permissions: Vec::new(),
        },
        RoleTemplate {
            code: "admin".to_string(),
            name: "Admin".to_string(),
            scope_kind: RoleScopeKind::Workspace,
            is_builtin: true,
            is_editable: true,
            permissions: all_codes.clone(),
        },
        RoleTemplate {
            code: "manager".to_string(),
            name: "Manager".to_string(),
            scope_kind: RoleScopeKind::Workspace,
            is_builtin: true,
            is_editable: true,
            permissions: manager_permissions,
        },
    ]
}
