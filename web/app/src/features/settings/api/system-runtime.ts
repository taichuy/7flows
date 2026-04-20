import {
  fetchConsoleSystemRuntimeProfile,
  type ConsoleSystemRuntimeProfile
} from '@1flowbase/api-client';

export type SettingsSystemRuntimeProfile = ConsoleSystemRuntimeProfile;

export const settingsSystemRuntimeQueryKey = [
  'settings',
  'system-runtime'
] as const;

export function fetchSettingsSystemRuntimeProfile() {
  return fetchConsoleSystemRuntimeProfile();
}
