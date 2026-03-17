import type {
  PluginAdapterRegistryItem,
  PluginToolRegistryItem
} from "@/lib/get-plugin-registry";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";

export type WorkflowToolExecutionValidationIssue = {
  nodeId: string;
  nodeName: string;
  message: string;
  path: string;
  field: string;
};

export type WorkflowToolExecutionValidationContext = {
  nodeId: string;
  nodeName: string;
  nodeIndex: number;
  config: Record<string, unknown>;
  toolIndex: Map<string, PluginToolRegistryItem>;
  adapters: PluginAdapterRegistryItem[];
  sandboxReadiness?: SandboxReadinessCheck | null;
};

export type WorkflowExecutionCapabilityIssueOptions = {
  context: string;
  nodeId: string;
  nodeName: string;
  toolId: string;
  tool: PluginToolRegistryItem;
  ecosystem: string | null;
  adapterId: string | null;
  requestedExecutionClass: string;
  adapters: PluginAdapterRegistryItem[];
  sandboxReadiness?: SandboxReadinessCheck | null;
  path: string;
  field: string;
};

export type WorkflowExplicitAdapterBindingValidationOptions = {
  context: string;
  toolId: string;
  ecosystem: string;
  adapterId: string;
  adapters: PluginAdapterRegistryItem[];
  path: string;
  field: string;
  nodeId: string;
  nodeName: string;
};
