use domain::ActorContext;

pub fn ensure_permission(actor: &ActorContext, code: &str) -> Result<(), &'static str> {
    if actor.has_permission(code) {
        Ok(())
    } else {
        Err("permission_denied")
    }
}
