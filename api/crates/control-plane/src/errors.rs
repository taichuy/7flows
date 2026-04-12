use thiserror::Error;

#[derive(Debug, Error)]
pub enum ControlPlaneError {
    #[error("not authenticated")]
    NotAuthenticated,
    #[error("permission denied: {0}")]
    PermissionDenied(&'static str),
    #[error("resource not found: {0}")]
    NotFound(&'static str),
    #[error("conflict: {0}")]
    Conflict(&'static str),
    #[error("invalid input: {0}")]
    InvalidInput(&'static str),
}
