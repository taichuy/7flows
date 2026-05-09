import {
  createConsoleApplicationApiKey,
  fetchConsoleApplicationApiDocsCatalog,
  fetchConsoleApplicationApiDocsCategoryOperations,
  fetchConsoleApplicationApiOperationSpec,
  getConsoleApplicationApiMapping,
  getConsoleApplicationApiPublication,
  listConsoleApplicationApiKeys,
  publishConsoleApplicationApiVersion,
  replaceConsoleApplicationApiMapping,
  revokeConsoleApplicationApiKey,
  updateConsoleApplicationApiStatus,
  type ConsoleApplicationApiKey,
  type ConsoleApplicationApiMapping,
  type ConsoleApplicationApiPublication,
  type CreatedConsoleApplicationApiKey
} from '@1flowbase/api-client';

import { getApplicationsApiBaseUrl } from './applications';

export type ApplicationApiKey = ConsoleApplicationApiKey;
export type CreatedApplicationApiKey = CreatedConsoleApplicationApiKey;
export type ApplicationApiMapping = ConsoleApplicationApiMapping;
export type ApplicationApiPublication = ConsoleApplicationApiPublication;

export const applicationApiKeysQueryKey = (applicationId: string) =>
  ['applications', applicationId, 'public-api', 'keys'] as const;
export const applicationApiMappingQueryKey = (applicationId: string) =>
  ['applications', applicationId, 'public-api', 'mapping'] as const;
export const applicationApiPublicationQueryKey = (applicationId: string) =>
  ['applications', applicationId, 'public-api', 'publication'] as const;
export const applicationApiDocsCatalogQueryKey = (applicationId: string) =>
  ['applications', applicationId, 'public-api', 'docs', 'catalog'] as const;
export const applicationApiDocsCategoryOperationsQueryKey = (
  applicationId: string,
  categoryId: string
) =>
  [
    'applications',
    applicationId,
    'public-api',
    'docs',
    'category',
    categoryId,
    'operations'
  ] as const;
export const applicationApiDocsOperationSpecQueryKey = (
  applicationId: string,
  operationId: string
) =>
  [
    'applications',
    applicationId,
    'public-api',
    'docs',
    'operation',
    operationId,
    'openapi'
  ] as const;

export function fetchApplicationApiKeys(applicationId: string) {
  return listConsoleApplicationApiKeys(applicationId, getApplicationsApiBaseUrl());
}

export function createApplicationApiKey(
  applicationId: string,
  name: string,
  csrfToken: string
) {
  return createConsoleApplicationApiKey(
    applicationId,
    { name, expires_at: null },
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}

export function revokeApplicationApiKey(
  applicationId: string,
  keyId: string,
  csrfToken: string
) {
  return revokeConsoleApplicationApiKey(
    applicationId,
    keyId,
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}

export function fetchApplicationApiMapping(applicationId: string) {
  return getConsoleApplicationApiMapping(applicationId, getApplicationsApiBaseUrl());
}

export function saveApplicationApiMapping(
  applicationId: string,
  mapping: ApplicationApiMapping,
  csrfToken: string
) {
  return replaceConsoleApplicationApiMapping(
    applicationId,
    mapping,
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}

export function fetchApplicationApiPublication(applicationId: string) {
  return getConsoleApplicationApiPublication(
    applicationId,
    getApplicationsApiBaseUrl()
  );
}

export function publishApplicationApiVersion(
  applicationId: string,
  mapping: ApplicationApiMapping,
  csrfToken: string
) {
  return publishConsoleApplicationApiVersion(
    applicationId,
    { mapping, api_enabled: true },
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}

export function setApplicationApiEnabled(
  applicationId: string,
  apiEnabled: boolean,
  csrfToken: string
) {
  return updateConsoleApplicationApiStatus(
    applicationId,
    { api_enabled: apiEnabled },
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}

export function fetchApplicationApiDocsCatalog(applicationId: string) {
  return fetchConsoleApplicationApiDocsCatalog(
    applicationId,
    getApplicationsApiBaseUrl()
  );
}

export function fetchApplicationApiDocsCategoryOperations(
  applicationId: string,
  categoryId: string
) {
  return fetchConsoleApplicationApiDocsCategoryOperations(
    applicationId,
    categoryId,
    getApplicationsApiBaseUrl()
  );
}

export function fetchApplicationApiDocsOperationSpec(
  applicationId: string,
  operationId: string
) {
  return fetchConsoleApplicationApiOperationSpec(
    applicationId,
    operationId,
    getApplicationsApiBaseUrl()
  );
}
