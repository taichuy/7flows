import type { Edge, Node } from "@xyflow/react";

import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import {
  resolveDefaultExecutionClass,
  type WorkflowExecutionClass
} from "@/lib/workflow-runtime-policy";
import type {
  WorkflowCanvasEdgeData,
  WorkflowCanvasNodeData
} from "@/lib/workflow-editor";

type WorkflowEditorAssistantContextInput = {
  selectedNode: Node<WorkflowCanvasNodeData>;
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  edges: Array<Edge<WorkflowCanvasEdgeData>>;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

export type WorkflowEditorAssistantContext = {
  key: string;
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  executionClass: WorkflowExecutionClass;
  upstreamLabels: string[];
  downstreamLabels: string[];
  hasInputSchema: boolean;
  hasOutputSchema: boolean;
  runtimeHint: string;
  topologyHint: string;
  summary: string;
  promptSuggestions: string[];
  contextPack: string;
};

export function buildWorkflowEditorAssistantContext({
  selectedNode,
  nodes,
  edges,
  sandboxReadiness = null
}: WorkflowEditorAssistantContextInput): WorkflowEditorAssistantContext {
  const upstreamLabels = edges
    .filter((edge) => edge.target === selectedNode.id)
    .map((edge) => nodes.find((node) => node.id === edge.source)?.data.label ?? edge.source);
  const downstreamLabels = edges
    .filter((edge) => edge.source === selectedNode.id)
    .map((edge) => nodes.find((node) => node.id === edge.target)?.data.label ?? edge.target);
  const executionClass = readExecutionClass(selectedNode);
  const hasInputSchema = Boolean(selectedNode.data.inputSchema && Object.keys(selectedNode.data.inputSchema).length);
  const hasOutputSchema = Boolean(
    selectedNode.data.outputSchema && Object.keys(selectedNode.data.outputSchema).length
  );
  const runtimeHint = buildRuntimeHint({
    node: selectedNode,
    executionClass,
    sandboxReadiness
  });
  const topologyHint = buildTopologyHint({
    nodeType: selectedNode.data.nodeType,
    upstreamLabels,
    downstreamLabels
  });
  const promptSuggestions = buildPromptSuggestions(selectedNode.data.nodeType);
  const summary = `${selectedNode.data.label} 当前有 ${upstreamLabels.length} 个上游、${downstreamLabels.length} 个下游，默认执行级别为 ${formatExecutionClassLabel(executionClass)}。`;
  const contextPack = [
    `节点：${selectedNode.data.label}`,
    `类型：${selectedNode.data.nodeType}`,
    `执行级别：${formatExecutionClassLabel(executionClass)}`,
    `上游：${upstreamLabels.length > 0 ? upstreamLabels.join(" / ") : "无"}`,
    `下游：${downstreamLabels.length > 0 ? downstreamLabels.join(" / ") : "无"}`,
    `Input schema：${hasInputSchema ? "已声明" : "未声明"}`,
    `Output schema：${hasOutputSchema ? "已声明" : "未声明"}`,
    `运行提示：${runtimeHint}`,
    `拓扑提示：${topologyHint}`
  ].join("\n");

  return {
    key: [
      selectedNode.id,
      selectedNode.data.nodeType,
      upstreamLabels.join(","),
      downstreamLabels.join(","),
      executionClass,
      hasInputSchema ? "in" : "",
      hasOutputSchema ? "out" : ""
    ].join("|"),
    nodeId: selectedNode.id,
    nodeLabel: selectedNode.data.label,
    nodeType: selectedNode.data.nodeType,
    executionClass,
    upstreamLabels,
    downstreamLabels,
    hasInputSchema,
    hasOutputSchema,
    runtimeHint,
    topologyHint,
    summary,
    promptSuggestions,
    contextPack
  };
}

export function createWorkflowEditorAssistantGreeting(
  context: WorkflowEditorAssistantContext
) {
  return `已载入 ${context.nodeLabel} 节点上下文。${context.summary} 你可以直接问我“怎么配”“下一步接什么节点”或“运行风险在哪里”。`;
}

export function buildWorkflowEditorAssistantReply(
  context: WorkflowEditorAssistantContext,
  prompt: string
) {
  const normalizedPrompt = prompt.trim().toLowerCase();
  if (!normalizedPrompt) {
    return createWorkflowEditorAssistantGreeting(context);
  }

  if (matchesAny(normalizedPrompt, ["下一", "后续", "接什么", "next"])) {
    return buildNextNodeReply(context);
  }

  if (matchesAny(normalizedPrompt, ["风险", "运行", "发布", "sandbox", "隔离"])) {
    return buildRiskReply(context);
  }

  if (matchesAny(normalizedPrompt, ["配置", "字段", "参数", "怎么配", "schema"])) {
    return buildConfigReply(context);
  }

  return [
    `先看当前节点：${context.summary}`,
    `配置上优先处理：${context.hasInputSchema ? "确认输入映射是否覆盖关键字段" : "补充输入 schema 或至少明确需要哪些上游字段"}。`,
    `编排上优先处理：${context.topologyHint}`,
    `运行上优先处理：${context.runtimeHint}`
  ].join("\n");
}

function buildNextNodeReply(context: WorkflowEditorAssistantContext) {
  const suggestions = buildNextNodeSuggestions(context.nodeType);
  return [
    `如果要继续从 ${context.nodeLabel} 往后编排，建议优先考虑：`,
    ...suggestions.map((item, index) => `${index + 1}. ${item}`),
    `当前拓扑提醒：${context.topologyHint}`
  ].join("\n");
}

function buildRiskReply(context: WorkflowEditorAssistantContext) {
  return [
    `当前节点的运行关注点：`,
    `1. 执行级别：${formatExecutionClassLabel(context.executionClass)}。${context.runtimeHint}`,
    `2. 上下游衔接：${context.topologyHint}`,
    `3. 契约完整度：${
      context.hasInputSchema && context.hasOutputSchema
        ? "输入/输出 schema 都已声明，可以继续核对字段映射。"
        : "schema 仍不完整，建议先把关键输入输出字段补齐。"
    }`
  ].join("\n");
}

function buildConfigReply(context: WorkflowEditorAssistantContext) {
  return [
    `给 ${context.nodeLabel} 的配置建议：`,
    `1. 先确认这个节点要消费的上游字段：${
      context.upstreamLabels.length > 0 ? context.upstreamLabels.join(" / ") : "当前还没有上游，优先接入入口或前置节点。"
    }`,
    `2. ${context.hasInputSchema ? "输入 schema 已有骨架，继续核对字段命名和必填项。" : "补一个最小 input schema，避免后续变量映射靠猜。"}`,
    `3. ${context.hasOutputSchema ? "输出 schema 已声明，继续确认下游真实会消费哪些字段。" : "补一个最小 output schema，方便后续节点和 AI 辅助理解结果。"}`,
    `4. 运行策略：${context.runtimeHint}`
  ].join("\n");
}

function readExecutionClass(node: Node<WorkflowCanvasNodeData>): WorkflowExecutionClass {
  const runtimePolicy = node.data.runtimePolicy;
  const executionPolicy =
    runtimePolicy && typeof runtimePolicy === "object" && "execution" in runtimePolicy
      ? runtimePolicy.execution
      : null;

  if (
    executionPolicy &&
    typeof executionPolicy === "object" &&
    "class" in executionPolicy &&
    typeof executionPolicy.class === "string"
  ) {
    return executionPolicy.class as WorkflowExecutionClass;
  }

  return resolveDefaultExecutionClass(node.data.nodeType);
}

function buildRuntimeHint({
  node,
  executionClass,
  sandboxReadiness
}: {
  node: Node<WorkflowCanvasNodeData>;
  executionClass: WorkflowExecutionClass;
  sandboxReadiness?: SandboxReadinessCheck | null;
}) {
  const executionCheck = sandboxReadiness?.execution_classes.find(
    (item) => item.execution_class === executionClass
  );

  if ((executionClass === "sandbox" || executionClass === "microvm") && executionCheck?.available === false) {
    return `${formatExecutionClassLabel(executionClass)} 当前不可用，强隔离节点应继续 fail-closed，不要静默退回宿主执行。`;
  }

  if (node.data.nodeType === "tool") {
    return "Tool 节点要同时确认工具绑定、超时策略和下游结果消费方式。";
  }

  if (node.data.nodeType === "llm_agent") {
    return "LLM/Agent 节点要优先确认模型输入、可用工具和输出结构，不要把临时说明堆进 prompt。";
  }

  if (executionClass === "inline") {
    return "当前走 inline，响应会更轻，但要注意把复杂副作用留在边界节点而不是塞进描述文案。";
  }

  return `${formatExecutionClassLabel(executionClass)} 已作为当前默认执行级别，继续核对它是否符合节点职责。`;
}

function buildTopologyHint({
  nodeType,
  upstreamLabels,
  downstreamLabels
}: {
  nodeType: string;
  upstreamLabels: string[];
  downstreamLabels: string[];
}) {
  if (nodeType === "trigger" && downstreamLabels.length === 0) {
    return "Trigger 还是孤立入口，建议先接一个 AI / Tool / Output 节点形成最小主链。";
  }

  if (downstreamLabels.length === 0 && nodeType !== "output") {
    return "当前还是末端中间节点，建议补一个下游消费者，避免结果停在画布中间。";
  }

  if (upstreamLabels.length === 0 && nodeType !== "trigger") {
    return "当前节点没有上游输入，先确认它是否应该作为入口节点。";
  }

  return "当前上下游已经成链，继续核对字段映射和节点职责是否一致。";
}

function buildPromptSuggestions(nodeType: string) {
  const baseSuggestions = ["帮我检查这个节点怎么配", "这个节点的运行风险在哪里"];
  const nextNodePrompt = "如果继续编排，下一步应该接什么节点";

  if (nodeType === "trigger") {
    return [nextNodePrompt, ...baseSuggestions];
  }

  return [...baseSuggestions, nextNodePrompt];
}

function buildNextNodeSuggestions(nodeType: string) {
  switch (nodeType) {
    case "trigger":
      return [
        "接一个 AI / Agent 节点，把入口参数先变成结构化计划或回答。",
        "如果需要查资料或调工具，先接 Tool 节点，再让 AI 节点消费工具结果。",
        "如果只是验收入口是否通，可直接接 Output 做最小闭环。"
      ];
    case "llm_agent":
      return [
        "如果还需要外部知识或动作，接 Tool 节点补外部能力。",
        "如果已经得到最终结果，直接接 Output 收口。",
        "如果要批处理或重试分流，再接 Loop / Condition 类节点。"
      ];
    case "tool":
      return [
        "接一个 AI / Agent 节点消化工具结果并形成对人可读输出。",
        "如果工具结果已经足够稳定，也可以直接接 Output。",
        "如果工具返回多分支结果，再接 Condition / Router 做分流。"
      ];
    case "output":
      return [
        "Output 已是终点，优先回头检查上游字段是否都能稳定落到这里。",
        "如果还想补观测或治理，放在应用级发布/诊断侧，而不是继续往后接执行节点。"
      ];
    default:
      return [
        "优先确认这个节点产出的字段由谁消费，再决定接 AI、Tool 还是 Output。",
        "如果它承担副作用，优先给它一个明确下游，别让结果悬空。"
      ];
  }
}

function formatExecutionClassLabel(executionClass: WorkflowExecutionClass) {
  switch (executionClass) {
    case "inline":
      return "inline";
    case "subprocess":
      return "subprocess";
    case "sandbox":
      return "sandbox";
    case "microvm":
      return "microvm";
    default:
      return executionClass;
  }
}

function matchesAny(input: string, needles: string[]) {
  return needles.some((needle) => input.includes(needle));
}
