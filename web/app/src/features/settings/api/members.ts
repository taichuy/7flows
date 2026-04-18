import {
  createConsoleMember,
  disableConsoleMember,
  listConsoleMembers,
  replaceConsoleMemberRoles,
  resetConsoleMemberPassword,
  type ConsoleMember,
  type CreateConsoleMemberInput,
  type ReplaceConsoleMemberRolesInput,
  type ResetConsoleMemberPasswordInput
} from '@1flowbase/api-client';

export type SettingsMember = ConsoleMember;
export type CreateSettingsMemberInput = CreateConsoleMemberInput;

export const settingsMembersQueryKey = ['settings', 'members'] as const;

export function fetchSettingsMembers(): Promise<SettingsMember[]> {
  return listConsoleMembers();
}

export function createSettingsMember(
  input: CreateSettingsMemberInput,
  csrfToken: string
): Promise<SettingsMember> {
  return createConsoleMember(input, csrfToken);
}

export function disableSettingsMember(memberId: string, csrfToken: string): Promise<void> {
  return disableConsoleMember(memberId, csrfToken);
}

export function resetSettingsMemberPassword(
  memberId: string,
  input: ResetConsoleMemberPasswordInput,
  csrfToken: string
): Promise<void> {
  return resetConsoleMemberPassword(memberId, input, csrfToken);
}

export function replaceSettingsMemberRoles(
  memberId: string,
  input: ReplaceConsoleMemberRolesInput,
  csrfToken: string
): Promise<void> {
  return replaceConsoleMemberRoles(memberId, input, csrfToken);
}
