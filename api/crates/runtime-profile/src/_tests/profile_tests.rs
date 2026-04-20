use runtime_profile::bytes_to_gb;

#[test]
fn runtime_profile_formats_memory_in_gb_with_two_decimals() {
    assert_eq!(bytes_to_gb(201_326_592), 0.19);
    assert_eq!(bytes_to_gb(17_179_869_184), 16.0);
}
