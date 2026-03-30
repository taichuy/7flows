"use client";

import type { Node } from "@xyflow/react";

import type {
  PluginAdapterRegistryItem,
  PluginToolRegistryItem
} from "@/lib/get-plugin-registry";
import type { CredentialItem } from "@/lib/get-credentials";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";

export type WorkflowNodeConfigFormProps = {
  node: Node<WorkflowCanvasNodeData>;
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  tools: PluginToolRegistryItem[];
  adapters: PluginAdapterRegistryItem[];
  credentials: CredentialItem[];
  currentHref?: string | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  highlightedFieldPath?: string | null;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  onChange: (nextConfig: Record<string, unknown>) => void;
};

export type ToolSchemaField = {
  name: string;
  label: string;
  description: string;
  type: "text" | "number" | "boolean" | "select";
  required: boolean;
  options: string[];
  inputType?: "text" | "password" | "url";
  defaultValue?: unknown;
};

export type BranchMode = "selector" | "expression" | "fixed";

export type ReadableArtifactRef = {
  nodeId: string;
  artifactType: string;
};

export type BranchRule = {
  key: string;
  path: string;
  operator: string;
  value: unknown;
};

export type WorkflowToolBinding = {
  toolId: string;
  ecosystem: string;
  adapterId: string;
  timeoutMs?: number;
  credentials: Record<string, unknown>;
};

export const BRANCH_OPERATORS = [
  "exists",
  "not_exists",
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
  "contains"
] as const;

export const MCP_ARTIFACT_TYPES = [
  "json",
  "text",
  "file",
  "tool_result",
  "message"
] as const;

export const MCP_EXTRA_ARTIFACT_TYPES = MCP_ARTIFACT_TYPES.filter(
  (artifactType) => artifactType !== "json"
);

export function getSupportedToolSchemaFields(inputSchema: Record<string, unknown>) {
  const properties = toRecord(inputSchema.properties);
  if (!properties) {
    return [] as ToolSchemaField[];
  }

  const required = new Set(toStringArray(inputSchema.required));
  const fields: ToolSchemaField[] = [];

  Object.entries(properties).forEach(([name, rawField]) => {
    const field = toRecord(rawField);
    if (!field) {
      return;
    }

    const enumOptions = Array.isArray(field.enum)
      ? field.enum.filter((option): option is string => typeof option === "string")
      : [];
    const fieldType = typeof field.type === "string" ? field.type : "string";
    const label =
      typeof field.title === "string" && field.title.trim() ? field.title : name;
    const description =
      typeof field.description === "string" ? field.description : "";

    if (enumOptions.length > 0) {
      fields.push({
        name,
        label,
        description,
        type: "select",
        required: required.has(name),
        options: enumOptions,
        defaultValue: field.default
      });
      return;
    }

    if (fieldType === "boolean") {
      fields.push({
        name,
        label,
        description,
        type: "boolean",
        required: required.has(name),
        options: [],
        defaultValue: field.default
      });
      return;
    }

    if (fieldType === "number" || fieldType === "integer") {
      fields.push({
        name,
        label,
        description,
        type: "number",
        required: required.has(name),
        options: [],
        defaultValue: field.default
      });
      return;
    }

    if (fieldType === "string") {
      fields.push({
        name,
        label,
        description,
        type: "text",
        required: required.has(name),
        options: [],
        defaultValue: field.default,
        inputType:
          field.format === "password"
            ? "password"
            : field.format === "uri"
              ? "url"
              : "text"
      });
    }
  });

  return fields;
}

export function getUnsupportedToolFieldNames(
  inputSchema: Record<string, unknown>,
  supportedFields: ToolSchemaField[]
) {
  const properties = toRecord(inputSchema.properties);
  if (!properties) {
    return [] as string[];
  }

  const supportedNames = new Set(supportedFields.map((field) => field.name));
  return Object.keys(properties).filter((fieldName) => !supportedNames.has(fieldName));
}

export function readToolBinding(
  config: Record<string, unknown>
): WorkflowToolBinding | null {
  const binding = toRecord(config.tool);
  if (!binding) {
    return null;
  }

  const toolId = typeof binding.toolId === "string" ? binding.toolId : "";
  if (!toolId) {
    return null;
  }

  return {
    toolId,
    ecosystem: typeof binding.ecosystem === "string" ? binding.ecosystem : "native",
    adapterId: typeof binding.adapterId === "string" ? binding.adapterId : "",
    timeoutMs: typeof binding.timeoutMs === "number" ? binding.timeoutMs : undefined,
    credentials: toRecord(binding.credentials) ?? {}
  };
}

export function readToolInputValue(value: unknown, defaultValue: unknown) {
  if (value !== undefined) {
    return value;
  }
  return defaultValue;
}

export function readReadableArtifacts(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as ReadableArtifactRef[];
  }

  return value.flatMap((item) => {
    const artifact = toRecord(item);
    if (!artifact) {
      return [];
    }
    const nodeId = typeof artifact.nodeId === "string" ? artifact.nodeId.trim() : "";
    const artifactType =
      typeof artifact.artifactType === "string" ? artifact.artifactType.trim() : "";
    if (!nodeId || !artifactType) {
      return [];
    }
    return [{ nodeId, artifactType }];
  });
}

export function readBranchMode(config: Record<string, unknown>): BranchMode {
  if (toRecord(config.selector)) {
    return "selector";
  }
  if (typeof config.expression === "string" && config.expression.trim()) {
    return "expression";
  }
  return "fixed";
}

export function readDefaultBranch(config: Record<string, unknown>) {
  if (typeof config.default === "string" && config.default.trim()) {
    return config.default;
  }
  if (typeof config.selected === "string" && config.selected.trim()) {
    return config.selected;
  }
  return "default";
}

export function readSelectorRules(value: unknown, nodeType: string) {
  if (!Array.isArray(value) || value.length === 0) {
    return [createDefaultBranchRule(nodeType)];
  }

  return value.flatMap((item, index) => {
    const rule = toRecord(item);
    if (!rule) {
      return [];
    }
    return [
      {
        key:
          typeof rule.key === "string" && rule.key.trim()
            ? rule.key
            : `branch_${index + 1}`,
        path:
          typeof rule.path === "string" && rule.path.trim()
            ? rule.path
            : "trigger_input.value",
        operator:
          typeof rule.operator === "string" && rule.operator.trim()
            ? rule.operator
            : "eq",
        value: rule.value
      } satisfies BranchRule
    ];
  });
}

export function createDefaultBranchRule(nodeType: string, index = 1): BranchRule {
  return {
    key: nodeType === "condition" && index === 1 ? "true" : `branch_${index}`,
    path: "trigger_input.value",
    operator: "eq",
    value: ""
  };
}

export function formatBranchRuleValue(value: unknown) {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function parseBranchRuleValue(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  if (/^(\{|\[|true$|false$|null$|-?\d)/.test(normalized)) {
    try {
      return JSON.parse(normalized);
    } catch {
      return value;
    }
  }

  return value;
}

export function parseNumericFieldValue(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatJsonObjectFieldValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  return JSON.stringify(value, null, 2);
}

export function parseJsonObjectFieldValue(
  value: string,
  fieldLabel: string
): { value?: Record<string, unknown>; error: string | null } {
  const normalized = value.trim();
  if (!normalized) {
    return {
      value: undefined,
      error: null
    };
  }

  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        value: undefined,
        error: `${fieldLabel} 必须是 JSON object。`
      };
    }

    return {
      value: parsed as Record<string, unknown>,
      error: null
    };
  } catch {
    return {
      value: undefined,
      error: `${fieldLabel} 必须是有效的 JSON object。`
    };
  }
}

export function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

export function dedupeArtifactRefs(values: ReadableArtifactRef[]) {
  const seen = new Set<string>();
  const nextValues: ReadableArtifactRef[] = [];

  values.forEach((value) => {
    const nodeId = value.nodeId.trim();
    const artifactType = value.artifactType.trim();
    if (!nodeId || !artifactType) {
      return;
    }
    const key = `${nodeId}:${artifactType}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    nextValues.push({ nodeId, artifactType });
  });

  return nextValues.sort((left, right) =>
    `${left.nodeId}:${left.artifactType}`.localeCompare(
      `${right.nodeId}:${right.artifactType}`
    )
  );
}

export function cloneRecord<T extends Record<string, unknown>>(value: T) {
  return structuredClone(value);
}

export function toRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : null;
}

export function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}
