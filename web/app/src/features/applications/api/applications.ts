import {
  createConsoleApplication,
  createConsoleApplicationTag,
  getConsoleApplication,
  getConsoleApplicationCatalog,
  getDefaultApiBaseUrl,
  listConsoleApplications,
  updateConsoleApplication,
  type ApiBaseUrlLocation,
  type ConsoleApplicationCatalog,
  type ConsoleApplicationDetail,
  type ConsoleApplicationSummary,
  type ConsoleApplicationTagCatalogEntry,
  type CreateConsoleApplicationInput
} from '@1flowbase/api-client';

export type Application = ConsoleApplicationSummary;
export type ApplicationDetail = ConsoleApplicationDetail;
export type ApplicationCatalog = ConsoleApplicationCatalog;
export type ApplicationTagCatalogEntry = ConsoleApplicationTagCatalogEntry;
export type CreateApplicationInput = CreateConsoleApplicationInput;
export interface UpdateApplicationInput {
  name: string;
  description: string;
  tag_ids: string[];
}
export interface CreateApplicationTagInput {
  name: string;
}

export const applicationsQueryKey = ['applications'] as const;
export const applicationCatalogQueryKey = ['applications', 'catalog'] as const;
export const applicationDetailQueryKey = (applicationId: string) =>
  ['applications', applicationId] as const;

export function getApplicationsApiBaseUrl(
  locationLike: ApiBaseUrlLocation | undefined =
    typeof window !== 'undefined' ? window.location : undefined
): string {
  return import.meta.env.VITE_API_BASE_URL ?? getDefaultApiBaseUrl(locationLike);
}

export function fetchApplications(): Promise<Application[]> {
  return listConsoleApplications(getApplicationsApiBaseUrl());
}

export function fetchApplicationCatalog(): Promise<ApplicationCatalog> {
  return getConsoleApplicationCatalog(getApplicationsApiBaseUrl());
}

export function fetchApplicationDetail(applicationId: string): Promise<ApplicationDetail> {
  return getConsoleApplication(applicationId, getApplicationsApiBaseUrl());
}

export function createApplication(input: CreateApplicationInput, csrfToken: string) {
  return createConsoleApplication(input, csrfToken, getApplicationsApiBaseUrl());
}

export function updateApplication(
  applicationId: string,
  input: UpdateApplicationInput,
  csrfToken: string
) {
  return updateConsoleApplication(applicationId, input, csrfToken, getApplicationsApiBaseUrl());
}

export function createApplicationTag(input: CreateApplicationTagInput, csrfToken: string) {
  return createConsoleApplicationTag(input, csrfToken, getApplicationsApiBaseUrl());
}
