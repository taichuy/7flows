export const WORKBENCH_ENTRY_LINK_REGISTRY = {
  home: {
    href: "/",
    label: "返回系统首页"
  },
  workflowLibrary: {
    href: "/workspace",
    label: "打开 workflow 列表"
  },
  runLibrary: {
    href: "/runs",
    label: "查看 run diagnostics"
  },
  operatorInbox: {
    href: "/sensitive-access",
    label: "打开 sensitive access inbox"
  },
  createWorkflow: {
    href: "/workflows/new",
    label: "新建 workflow"
  },
  workspaceStarterLibrary: {
    href: "/workspace-starters",
    label: "管理 workspace starters"
  }
} as const;

export type WorkbenchEntryLinkKey = keyof typeof WORKBENCH_ENTRY_LINK_REGISTRY;

const WORKBENCH_ENTRY_LINK_KEY_ALIASES = {
  home: "home",
  workflows: "workflowLibrary",
  workflow_library: "workflowLibrary",
  runs: "runLibrary",
  run_library: "runLibrary",
  sensitive_access: "operatorInbox",
  operator_inbox: "operatorInbox",
  workspace_starters: "workspaceStarterLibrary",
  create_workflow: "createWorkflow",
  workspace_starter_library: "workspaceStarterLibrary"
} as const satisfies Record<string, WorkbenchEntryLinkKey>;

export type WorkbenchEntryLinkDefinition = {
  href: string;
  label: string;
};

export type WorkbenchEntryLinkOverride = Partial<WorkbenchEntryLinkDefinition>;

export type WorkbenchEntryLinkOverrides = Partial<
  Record<WorkbenchEntryLinkKey, WorkbenchEntryLinkOverride>
>;

export type WorkbenchEntryLinksConfig = {
  keys: WorkbenchEntryLinkKey[];
  overrides?: WorkbenchEntryLinkOverrides;
  variant?: "hero" | "inline";
  primaryKey?: WorkbenchEntryLinkKey;
};

export function normalizeWorkbenchRelativeHref(href?: string | null) {
  const normalized = href?.trim();
  if (!normalized) {
    return null;
  }

  const url = new URL(normalized, "https://sevenflows.local");
  const sortedParams = [...url.searchParams.entries()].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) {
        return leftValue.localeCompare(rightValue);
      }

      return leftKey.localeCompare(rightKey);
    }
  );
  const params = new URLSearchParams();

  for (const [key, value] of sortedParams) {
    params.append(key, value);
  }

  const query = params.toString();

  return query ? `${url.pathname}?${query}` : url.pathname;
}

export function isCurrentWorkbenchHref(href?: string | null, currentHref?: string | null) {
  const normalizedHref = normalizeWorkbenchRelativeHref(href);
  const normalizedCurrentHref = normalizeWorkbenchRelativeHref(currentHref);

  return Boolean(normalizedHref && normalizedCurrentHref && normalizedHref === normalizedCurrentHref);
}

export function normalizeWorkbenchEntryLinkKey(
  value?: string | null
): WorkbenchEntryLinkKey | null {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return null;
  }

  if (Object.hasOwn(WORKBENCH_ENTRY_LINK_REGISTRY, normalizedValue)) {
    return normalizedValue as WorkbenchEntryLinkKey;
  }

  const aliasKey = normalizedValue as keyof typeof WORKBENCH_ENTRY_LINK_KEY_ALIASES;

  return Object.hasOwn(WORKBENCH_ENTRY_LINK_KEY_ALIASES, aliasKey)
    ? WORKBENCH_ENTRY_LINK_KEY_ALIASES[aliasKey]
    : null;
}

export function resolveWorkbenchEntryLink(
  key: WorkbenchEntryLinkKey,
  override: WorkbenchEntryLinkOverride = {}
) {
  return {
    key,
    href: override.href ?? WORKBENCH_ENTRY_LINK_REGISTRY[key].href,
    label: override.label ?? WORKBENCH_ENTRY_LINK_REGISTRY[key].label
  };
}

export function resolveWorkbenchEntryLinks(
  keys: WorkbenchEntryLinkKey[],
  overrides: WorkbenchEntryLinkOverrides = {}
) {
  return keys.map((key) => resolveWorkbenchEntryLink(key, overrides[key]));
}
