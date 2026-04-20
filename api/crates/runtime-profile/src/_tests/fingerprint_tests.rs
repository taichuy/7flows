use runtime_profile::{build_host_fingerprint, HostFingerprintInput};

#[test]
fn host_fingerprint_hashes_sorted_fallback_identifiers() {
    let left = build_host_fingerprint(HostFingerprintInput {
        machine_id: None,
        stable_ids: vec!["en0:aa-bb".into(), "eth0:11-22".into()],
    });
    let right = build_host_fingerprint(HostFingerprintInput {
        machine_id: None,
        stable_ids: vec!["eth0:11-22".into(), "en0:aa-bb".into()],
    });

    assert_eq!(left, right);
    assert!(left.starts_with("host_"));
}
