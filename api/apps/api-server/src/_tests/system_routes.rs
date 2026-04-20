use crate::_tests::support::{
    get_json, sample_api_profile, sample_runner_profile, test_app_with_runtime_profile_error,
    test_app_with_runtime_profiles,
};

#[tokio::test]
async fn runtime_profile_merges_same_host_services() {
    let (app, cookie) = test_app_with_runtime_profiles(
        sample_api_profile("host_same"),
        Some(sample_runner_profile("host_same")),
        &["system_runtime.view.all"],
        Some("zh_Hans"),
    )
    .await;

    let payload = get_json(&app, "/api/console/system/runtime-profile", &cookie).await;
    assert_eq!(payload["data"]["topology"]["relationship"], "same_host");
    assert_eq!(payload["data"]["hosts"].as_array().unwrap().len(), 1);
    assert_eq!(
        payload["data"]["locale_meta"]["source"],
        "user_preferred_locale"
    );
}

#[tokio::test]
async fn runtime_profile_reports_runner_unreachable_without_failing_request() {
    let (app, cookie) = test_app_with_runtime_profile_error(&["system_runtime.view.all"]).await;

    let payload = get_json(&app, "/api/console/system/runtime-profile", &cookie).await;
    assert_eq!(
        payload["data"]["topology"]["relationship"],
        "runner_unreachable"
    );
    assert_eq!(
        payload["data"]["services"]["plugin_runner"]["reachable"],
        false
    );
}
