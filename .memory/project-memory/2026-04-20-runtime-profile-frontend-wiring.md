# 2026-04-20 runtime profile frontend wiring

- User approved the sequence: first sync the official plugin registry release data, then wire the web console to the new runtime-profile, locale, and plugin-type contracts.
- The sibling repo `../1flowbase-official-plugins` was updated separately and committed as `45fb2c7` so `official-registry.json` now matches the released `openai_compatible` `0.3.7` artifacts and includes `plugin_type`, `i18n_summary`, and six target artifacts.
- Main repo web console now exposes `/settings/system-runtime`, consumes `/api/console/system/runtime-profile`, adds `preferred_locale` to `/me` editing, and filters plugin family/official catalog requests with `plugin_type=model_provider`.
- `web/app/src/features/settings/api/plugins.ts` now keeps the existing UI-facing `display_name` shape by resolving it from the backend `namespace + provider_label_key/label_key + i18n_catalog` contract instead of pushing raw i18n parsing into presentation components.
- Verification for the main repo change set:
  - `rtk pnpm --dir web/app exec tsc -p tsconfig.json --noEmit`
  - `rtk pnpm --dir web/app exec vitest --run src/features/me/_tests/me-page.test.tsx src/features/settings/_tests/settings-page.test.tsx src/features/settings/api/_tests/settings-api.test.ts src/routes/_tests/section-shell-routing.test.tsx`
