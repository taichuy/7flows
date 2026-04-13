use std::fmt;

use domain::ActorContext;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeDataAction {
    View,
    Create,
    Edit,
    Delete,
}

impl RuntimeDataAction {
    fn as_permission_action(self) -> &'static str {
        match self {
            Self::View => "view",
            Self::Create => "create",
            Self::Edit => "edit",
            Self::Delete => "delete",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeAccessScope {
    pub owner_user_id: Option<Uuid>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeAclError {
    PermissionDenied(&'static str),
}

impl fmt::Display for RuntimeAclError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::PermissionDenied(reason) => write!(f, "permission denied: {reason}"),
        }
    }
}

impl std::error::Error for RuntimeAclError {}

pub fn resolve_access_scope(
    actor: &ActorContext,
    action: RuntimeDataAction,
) -> Result<RuntimeAccessScope, RuntimeAclError> {
    if actor.is_root {
        return Ok(RuntimeAccessScope {
            owner_user_id: None,
        });
    }

    if matches!(action, RuntimeDataAction::Create) {
        return if actor.has_permission("state_data.create.all") {
            Ok(RuntimeAccessScope {
                owner_user_id: None,
            })
        } else {
            Err(RuntimeAclError::PermissionDenied("permission_denied"))
        };
    }

    let action_code = action.as_permission_action();
    let all_code = format!("state_data.{action_code}.all");
    let own_code = format!("state_data.{action_code}.own");

    if actor.has_permission("state_data.manage.all") || actor.has_permission(&all_code) {
        return Ok(RuntimeAccessScope {
            owner_user_id: None,
        });
    }

    if actor.has_permission("state_data.manage.own") || actor.has_permission(&own_code) {
        return Ok(RuntimeAccessScope {
            owner_user_id: Some(actor.user_id),
        });
    }

    Err(RuntimeAclError::PermissionDenied("permission_denied"))
}
