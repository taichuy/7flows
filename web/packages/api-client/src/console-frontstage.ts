import { apiFetch } from './transport';

export interface ConsoleFrontstagePageTreeNode {
  id: string;
  title: string | null;
  kind: 'group' | 'page';
  children: ConsoleFrontstagePageTreeNode[];
}

export function listFrontstagePages(workspaceId: string, baseUrl?: string): Promise<ConsoleFrontstagePageTreeNode[]> {
  return apiFetch<ConsoleFrontstagePageTreeNode[]>({
    path: `/api/console/frontstage/${workspaceId}/pages`,
    method: 'GET',
    baseUrl,
  });
}
