use uuid::Uuid;

use crate::physical_schema_repository::sanitize_identifier_fragment;

pub(super) fn build_physical_table_name(
    scope_kind: domain::DataModelScopeKind,
    code: &str,
) -> String {
    let prefix = match scope_kind {
        domain::DataModelScopeKind::Workspace => "workspace",
        domain::DataModelScopeKind::System => "system",
    };
    let suffix = Uuid::now_v7().simple().to_string();

    format!(
        "rtm_{prefix}_{}_{}",
        &suffix[suffix.len() - 8..],
        sanitize_identifier_fragment(code)
    )
}

pub(super) fn build_physical_column_name(code: &str) -> String {
    sanitize_identifier_fragment(code)
}

pub(super) fn nullable_actor_user_id(actor_user_id: Uuid) -> Option<Uuid> {
    (!actor_user_id.is_nil()).then_some(actor_user_id)
}
