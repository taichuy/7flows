import { getApiBaseUrl } from "@/lib/api-base-url";

export type SkillCatalogListItem = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  referenceCount: number;
  updatedAt: string;
};

export type SkillCatalogReferenceSummary = {
  id: string;
  name: string;
  description: string;
};

export type SkillCatalogDetail = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  body: string;
  references: SkillCatalogReferenceSummary[];
  createdAt: string;
  updatedAt: string;
};

export async function getSkillCatalog(
  workspaceId = "default"
): Promise<SkillCatalogListItem[]> {
  const params = new URLSearchParams();
  params.set("workspace_id", workspaceId);

  const response = await fetch(`${getApiBaseUrl()}/api/skills?${params.toString()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Skill catalog request failed with status ${response.status}.`);
  }

  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) {
    return [];
  }

  return body.filter(isRecord).map(normalizeSkillCatalogListItem);
}

export async function getSkillDetail(
  skillId: string,
  workspaceId = "default"
): Promise<SkillCatalogDetail | null> {
  const normalizedSkillId = skillId.trim();
  if (!normalizedSkillId) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("workspace_id", workspaceId);

  const response = await fetch(
    `${getApiBaseUrl()}/api/skills/${encodeURIComponent(normalizedSkillId)}?${params.toString()}`,
    {
      cache: "no-store"
    }
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Skill detail request failed with status ${response.status}.`);
  }

  const body = (await response.json()) as unknown;
  if (!isRecord(body)) {
    return null;
  }

  return normalizeSkillCatalogDetail(body);
}

function normalizeSkillCatalogListItem(input: Record<string, unknown>): SkillCatalogListItem {
  return {
    id: asString(input.id),
    workspaceId: asString(input.workspace_id, "default"),
    name: asString(input.name),
    description: asString(input.description),
    referenceCount: asNumber(input.reference_count),
    updatedAt: asString(input.updated_at)
  };
}

function normalizeSkillCatalogDetail(input: Record<string, unknown>): SkillCatalogDetail {
  return {
    id: asString(input.id),
    workspaceId: asString(input.workspace_id, "default"),
    name: asString(input.name),
    description: asString(input.description),
    body: asString(input.body),
    references: Array.isArray(input.references)
      ? input.references.filter(isRecord).map(normalizeSkillReferenceSummary)
      : [],
    createdAt: asString(input.created_at),
    updatedAt: asString(input.updated_at)
  };
}

function normalizeSkillReferenceSummary(
  input: Record<string, unknown>
): SkillCatalogReferenceSummary {
  return {
    id: asString(input.id),
    name: asString(input.name),
    description: asString(input.description)
  };
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
