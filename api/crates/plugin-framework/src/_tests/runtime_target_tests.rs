use plugin_framework::RuntimeTarget;

#[test]
fn runtime_target_parses_linux_musl_rust_triples() {
    let target = RuntimeTarget::from_rust_target_triple("aarch64-unknown-linux-musl").unwrap();

    assert_eq!(target.os, "linux");
    assert_eq!(target.arch, "arm64");
    assert_eq!(target.libc.as_deref(), Some("musl"));
    assert_eq!(target.asset_suffix(), "linux-arm64");
}
