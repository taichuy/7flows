extern crate self as domain;

pub mod audit;
pub mod auth;
pub mod base;
pub mod team;

pub use audit::AuditLogRecord;
pub use auth::{
    ActorContext, AuthenticatorRecord, BoundRole, PermissionDefinition, RoleScopeKind,
    RoleTemplate, SessionRecord, UserAuthIdentity, UserRecord, UserStatus,
};
pub use base::BaseFields;
pub use team::TeamRecord;

pub fn crate_name() -> &'static str {
    "domain"
}

#[cfg(test)]
mod _tests;
