use runtime_profile::{resolve_locale, LocaleResolutionInput, LocaleSource};

#[test]
fn resolve_locale_prefers_user_preference_over_accept_language() {
    let resolution = resolve_locale(LocaleResolutionInput {
        query_locale: None,
        explicit_header_locale: None,
        user_preferred_locale: Some("zh_Hans".into()),
        accept_language: Some("en-US,en;q=0.9".into()),
        fallback_locale: "en_US",
        supported_locales: vec!["en_US".into(), "zh_Hans".into()],
    });

    assert_eq!(resolution.resolved_locale, "zh_Hans");
    assert_eq!(resolution.source, LocaleSource::UserPreferredLocale);
}
