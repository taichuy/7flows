import { apiFetch } from './transport';

export interface ConsoleApiDocsCatalogOperation {
  id: string;
  method: string;
  path: string;
  summary: string | null;
  description: string | null;
  tags: string[];
  group: string;
  deprecated: boolean;
}

export interface ConsoleApiDocsCatalog {
  title: string;
  version: string;
  categories: ConsoleApiDocsCatalogCategory[];
}

export interface ConsoleApiDocsCatalogCategory {
  id: string;
  label: string;
  operation_count: number;
}

export interface ConsoleApiDocsCategoryOperations {
  id: string;
  label: string;
  operations: ConsoleApiDocsCatalogOperation[];
}

export function fetchConsoleApiDocsCatalog(
  baseUrl?: string
): Promise<ConsoleApiDocsCatalog> {
  return apiFetch<ConsoleApiDocsCatalog>({
    path: '/api/console/docs/catalog',
    baseUrl
  });
}

export function fetchConsoleApiDocsCategoryOperations(
  categoryId: string,
  baseUrl?: string
): Promise<ConsoleApiDocsCategoryOperations> {
  return apiFetch<ConsoleApiDocsCategoryOperations>({
    path: `/api/console/docs/categories/${encodeURIComponent(categoryId)}/operations`,
    baseUrl
  });
}

export function fetchConsoleApiOperationSpec(
  operationId: string,
  baseUrl?: string
): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>({
    path: `/api/console/docs/operations/${operationId}/openapi.json`,
    baseUrl,
    unwrapSuccess: false
  });
}
