use serde::{Deserialize, Serialize};

pub const FALLBACK_LOCALE: &str = "en_US";
pub const SUPPORTED_LOCALES: [&str; 2] = ["en_US", "zh_Hans"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LocaleSource {
    Query,
    ExplicitHeader,
    UserPreferredLocale,
    AcceptLanguage,
    Fallback,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocaleResolutionInput<'a> {
    pub query_locale: Option<String>,
    pub explicit_header_locale: Option<String>,
    pub user_preferred_locale: Option<String>,
    pub accept_language: Option<String>,
    pub fallback_locale: &'a str,
    pub supported_locales: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocaleResolution {
    pub requested_locale: Option<String>,
    pub resolved_locale: String,
    pub source: LocaleSource,
    pub fallback_locale: String,
    pub supported_locales: Vec<String>,
}

impl LocaleResolution {
    fn new(
        requested_locale: impl Into<String>,
        fallback_locale: &str,
        supported_locales: Vec<String>,
        source: LocaleSource,
    ) -> Self {
        Self {
            requested_locale: Some(requested_locale.into()),
            resolved_locale: normalize_supported_locale(fallback_locale, &supported_locales)
                .unwrap_or_else(|| fallback_locale.to_string()),
            source,
            fallback_locale: fallback_locale.to_string(),
            supported_locales,
        }
    }

    fn fallback(fallback_locale: &str, supported_locales: Vec<String>) -> Self {
        let resolved_locale = normalize_supported_locale(fallback_locale, &supported_locales)
            .unwrap_or_else(|| fallback_locale.to_string());
        Self {
            requested_locale: None,
            resolved_locale,
            source: LocaleSource::Fallback,
            fallback_locale: fallback_locale.to_string(),
            supported_locales,
        }
    }
}

pub fn resolve_locale(input: LocaleResolutionInput<'_>) -> LocaleResolution {
    let supported_locales =
        normalize_supported_locales(input.supported_locales, input.fallback_locale);

    if let Some(locale) = input
        .query_locale
        .as_deref()
        .and_then(|value| normalize_supported_locale(value, &supported_locales))
    {
        return LocaleResolution {
            resolved_locale: locale.clone(),
            ..LocaleResolution::new(
                input.query_locale.unwrap_or(locale),
                input.fallback_locale,
                supported_locales,
                LocaleSource::Query,
            )
        };
    }

    if let Some(locale) = input
        .explicit_header_locale
        .as_deref()
        .and_then(|value| normalize_supported_locale(value, &supported_locales))
    {
        return LocaleResolution {
            resolved_locale: locale.clone(),
            ..LocaleResolution::new(
                input.explicit_header_locale.unwrap_or(locale),
                input.fallback_locale,
                supported_locales,
                LocaleSource::ExplicitHeader,
            )
        };
    }

    if let Some(locale) = input
        .user_preferred_locale
        .as_deref()
        .and_then(|value| normalize_supported_locale(value, &supported_locales))
    {
        return LocaleResolution {
            resolved_locale: locale.clone(),
            ..LocaleResolution::new(
                input.user_preferred_locale.unwrap_or(locale),
                input.fallback_locale,
                supported_locales,
                LocaleSource::UserPreferredLocale,
            )
        };
    }

    if let Some(locale) =
        normalize_accept_language(input.accept_language.as_deref(), &supported_locales)
    {
        return LocaleResolution {
            resolved_locale: locale.clone(),
            ..LocaleResolution::new(
                locale,
                input.fallback_locale,
                supported_locales,
                LocaleSource::AcceptLanguage,
            )
        };
    }

    LocaleResolution::fallback(input.fallback_locale, supported_locales)
}

pub fn normalize_supported_locale(value: &str, supported_locales: &[String]) -> Option<String> {
    canonical_locale(value).and_then(|normalized| {
        supported_locales
            .iter()
            .find(|candidate| candidate.as_str() == normalized)
            .cloned()
    })
}

fn normalize_supported_locales(
    supported_locales: Vec<String>,
    fallback_locale: &str,
) -> Vec<String> {
    let mut normalized = supported_locales
        .into_iter()
        .filter_map(|value| canonical_locale(&value).map(str::to_string))
        .collect::<Vec<_>>();
    if normalized.is_empty() {
        normalized = SUPPORTED_LOCALES
            .iter()
            .map(|value| value.to_string())
            .collect();
    }

    let fallback = canonical_locale(fallback_locale)
        .map(str::to_string)
        .unwrap_or_else(|| FALLBACK_LOCALE.to_string());
    if !normalized.iter().any(|candidate| candidate == &fallback) {
        normalized.push(fallback);
    }

    normalized.sort();
    normalized.dedup();
    normalized
}

fn normalize_accept_language(value: Option<&str>, supported_locales: &[String]) -> Option<String> {
    value.and_then(|raw| {
        raw.split(',')
            .filter_map(|part| part.split(';').next())
            .find_map(|candidate| normalize_supported_locale(candidate.trim(), supported_locales))
    })
}

fn canonical_locale(value: &str) -> Option<&'static str> {
    let normalized = value.trim().replace('-', "_").to_ascii_lowercase();
    match normalized.as_str() {
        "en" | "en_us" | "en_gb" => Some("en_US"),
        "zh" | "zh_cn" | "zh_hans" | "zh_sg" => Some("zh_Hans"),
        _ => None,
    }
}
