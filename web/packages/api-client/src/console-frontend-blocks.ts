import { apiFetch } from './transport';

export interface ConsoleFrontendBlockContextContract {
  primitives: string[];
  input_schema: Record<string, unknown>;
}

export interface ConsoleFrontendBlockPermissions {
  network: string;
  storage: string;
  secrets: string;
}

export interface ConsoleFrontendBlockCatalogEntry {
  installation_id: string;
  provider_code: string;
  plugin_id: string;
  plugin_version: string;
  contribution_code: string;
  title: string;
  runtime: string;
  entry: string;
  context_contract: ConsoleFrontendBlockContextContract;
  permissions: ConsoleFrontendBlockPermissions;
  ui_capabilities: string[];
}

export function listConsoleFrontendBlocks(
  baseUrl?: string
): Promise<ConsoleFrontendBlockCatalogEntry[]> {
  return apiFetch<ConsoleFrontendBlockCatalogEntry[]>({
    path: '/api/console/frontend-blocks',
    method: 'GET',
    baseUrl
  });
}
