"use client";

import React from "react";
import type { Node } from "@xyflow/react";

import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";
import { cloneRecord, toRecord } from "@/components/workflow-node-config-form/shared";
import {
  parseReplyTemplateToDocument,
  serializeReplyDocumentToTemplate,
  type WorkflowVariableReference,
  type WorkflowVariableReferenceGroup,
  type WorkflowVariableReferenceItem,
  type WorkflowVariableTextDocument,
} from "@/components/workflow-node-config-form/workflow-variable-text-document";
import { WorkflowVariableTextEditor } from "@/components/workflow-node-config-form/workflow-variable-text-editor";

type OutputNodeConfigFormProps = {
  node: Node<WorkflowCanvasNodeData>;
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  onChange: (nextConfig: Record<string, unknown>) => void;
};

function isWorkflowVariableTextDocument(value: unknown): value is WorkflowVariableTextDocument {
  const record = toRecord(value);
  return (
    record?.version === 1 &&
    Array.isArray(record.segments) &&
    record.segments.every((segment) => {
      const segmentRecord = toRecord(segment);
      if (!segmentRecord || typeof segmentRecord.type !== "string") {
        return false;
      }

      if (segmentRecord.type === "text") {
        return typeof segmentRecord.text === "string";
      }

      if (segmentRecord.type === "variable") {
        return typeof segmentRecord.refId === "string";
      }

      return false;
    })
  );
}

function isWorkflowVariableReference(value: unknown): value is WorkflowVariableReference {
  const record = toRecord(value);
  return (
    typeof record?.refId === "string" &&
    typeof record.alias === "string" &&
    typeof record.ownerNodeId === "string" &&
    Array.isArray(record.selector) &&
    record.selector.every((segment) => typeof segment === "string")
  );
}

function readSchemaFieldNames(schema: unknown) {
  const schemaRecord = toRecord(schema);
  const properties = toRecord(schemaRecord?.properties);
  return properties ? Object.keys(properties) : [];
}

function readSchemaProperty(schema: unknown, fieldName: string) {
  const schemaRecord = toRecord(schema);
  const properties = toRecord(schemaRecord?.properties);
  return toRecord(properties?.[fieldName]);
}

function formatSchemaTypeLabel(schema: unknown) {
  const schemaRecord = toRecord(schema);
  const type = typeof schemaRecord?.type === "string" ? schemaRecord.type : "string";

  if (type === "string") {
    return "String";
  }
  if (type === "number" || type === "integer") {
    return "Number";
  }
  if (type === "boolean") {
    return "Boolean";
  }
  if (type === "array") {
    const itemType = toRecord(schemaRecord?.items)?.type;
    if (itemType === "string" && String(schemaRecord?.items).toLowerCase().includes("file")) {
      return "Array[File]";
    }
    if (typeof itemType === "string") {
      return `Array[${itemType[0]?.toUpperCase() ?? "V"}${itemType.slice(1)}]`;
    }
    return "Array[Value]";
  }
  return "Object";
}

function inferFallbackTypeLabel(fieldName: string) {
  if (fieldName === "files") {
    return "Array[File]";
  }
  return "String";
}

function buildLeafItem({
  key,
  label,
  selector,
  ownerNodeId,
  valueTypeLabel,
  inlineLabel,
}: {
  key: string;
  label: string;
  selector: string[];
  ownerNodeId: string;
  valueTypeLabel: string;
  inlineLabel: string;
}): WorkflowVariableReferenceItem {
  const aliasBase = selector.at(-1) || "value";
  const machineName = `${ownerNodeId}.${aliasBase}`;

  return {
    key,
    label,
    selector,
    previewPath: selector.join("."),
    machineName,
    token: `{{#${machineName}#}}`,
    valueTypeLabel,
    inlineLabel,
  };
}

function buildReplyVariableGroups({
  ownerNodeId,
  node,
  nodes,
}: {
  ownerNodeId: string;
  node: Node<WorkflowCanvasNodeData>;
  nodes: Array<Node<WorkflowCanvasNodeData>>;
}) {
  const currentFieldNames = readSchemaFieldNames(node.data.inputSchema);
  const currentNodeItems = (currentFieldNames.length > 0 ? currentFieldNames : ["text"]).map(
    (fieldName) => {
      const schema = readSchemaProperty(node.data.inputSchema, fieldName);
      return buildLeafItem({
        key: `mapped-${fieldName}`,
        label: fieldName,
        selector: [fieldName],
        ownerNodeId,
        valueTypeLabel: schema ? formatSchemaTypeLabel(schema) : inferFallbackTypeLabel(fieldName),
        inlineLabel: `[${node.data.label}] ${fieldName}`,
      });
    },
  );

  const startNode = nodes.find((candidate) => candidate.data.nodeType === "startNode");
  const triggerFieldNames = readSchemaFieldNames(startNode?.data.inputSchema);
  const triggerItems = (triggerFieldNames.length > 0 ? triggerFieldNames : ["query", "files"]).map(
    (fieldName) => {
      const schema = readSchemaProperty(startNode?.data.inputSchema, fieldName);
      return buildLeafItem({
        key: `trigger-${fieldName}`,
        label: `trigger_input.${fieldName}`,
        selector: ["trigger_input", fieldName],
        ownerNodeId,
        valueTypeLabel: schema ? formatSchemaTypeLabel(schema) : inferFallbackTypeLabel(fieldName),
        inlineLabel: `[用户输入] ${fieldName}`,
      });
    },
  );

  const upstreamItems = nodes
    .filter((candidate) => candidate.id !== node.id && candidate.data.nodeType !== "startNode")
    .map((candidate) => {
      const outputFieldNames = readSchemaFieldNames(candidate.data.outputSchema);
      const fieldNames = outputFieldNames.length > 0 ? outputFieldNames : ["text", "answer"];

      return {
        key: `upstream-${candidate.id}`,
        label: candidate.data.label,
        selector: ["accumulated", candidate.id],
        previewPath: `accumulated.${candidate.id}`,
        machineName: `${ownerNodeId}.${candidate.id}`,
        token: `{{#${ownerNodeId}.${candidate.id}#}}`,
        children: fieldNames.map((fieldName) => {
          const schema = readSchemaProperty(candidate.data.outputSchema, fieldName);
          return buildLeafItem({
            key: `upstream-${candidate.id}-${fieldName}`,
            label: `${candidate.data.label}.${fieldName}`,
            selector: ["accumulated", candidate.id, fieldName],
            ownerNodeId,
            valueTypeLabel: schema ? formatSchemaTypeLabel(schema) : inferFallbackTypeLabel(fieldName),
            inlineLabel: `[${candidate.data.label}] ${fieldName}`,
          });
        }),
      } satisfies WorkflowVariableReferenceItem;
    });

  return [
    {
      key: "upstream-nodes",
      label: "上游节点",
      items: upstreamItems,
    },
    {
      key: "trigger-input",
      label: "用户输入",
      items: triggerItems,
    },
    {
      key: "current-node",
      label: "当前节点变量",
      items: currentNodeItems,
    },
  ] satisfies WorkflowVariableReferenceGroup[];
}

function normalizeReplyState({
  nodeId,
  ownerLabel,
  config,
}: {
  nodeId: string;
  ownerLabel: string;
  config: Record<string, unknown>;
}) {
  const replyDocument = config.replyDocument;
  const replyReferences = config.replyReferences;

  if (
    isWorkflowVariableTextDocument(replyDocument) &&
    Array.isArray(replyReferences) &&
    replyReferences.every(isWorkflowVariableReference)
  ) {
    return {
      document: replyDocument,
      references: replyReferences,
    };
  }

  return parseReplyTemplateToDocument({
    ownerNodeId: nodeId,
    ownerLabel,
    replyTemplate: typeof config.replyTemplate === "string" ? config.replyTemplate : "",
  });
}

export function OutputNodeConfigForm({
  node,
  nodes,
  onChange,
}: OutputNodeConfigFormProps) {
  const config = cloneRecord(node.data.config);
  const normalizedReplyState = normalizeReplyState({
    nodeId: node.id,
    ownerLabel: node.data.label,
    config,
  });
  const variableGroups = buildReplyVariableGroups({
    ownerNodeId: node.id,
    node,
    nodes,
  });

  const updateField = (field: string, value: unknown) => {
    const nextConfig = cloneRecord(config);

    if (value === undefined || value === "") {
      delete nextConfig[field];
    } else {
      nextConfig[field] = value;
    }

    onChange(nextConfig);
  };

  return (
    <div className="binding-form">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Direct reply</p>
          <h3>直接回复</h3>
        </div>
      </div>

      <div className="binding-field compact-stack">
        <span className="binding-label">回复内容</span>
        <WorkflowVariableTextEditor
          ownerNodeId={node.id}
          ownerLabel={node.data.label}
          value={normalizedReplyState.document}
          references={normalizedReplyState.references}
          variables={variableGroups}
          placeholder="输入正文，输入 / 插入变量"
          ariaLabel="回复内容"
          onChange={({ document, references }) => {
            const nextConfig = cloneRecord(config);
            const replyTemplate = serializeReplyDocumentToTemplate({
              document,
              references,
            });

            nextConfig.replyDocument = document;
            nextConfig.replyReferences = references;

            if (replyTemplate) {
              nextConfig.replyTemplate = replyTemplate;
            } else {
              delete nextConfig.replyTemplate;
            }

            onChange(nextConfig);
          }}
        />
        <small className="section-copy">
          输入 `/` 或点击右上角“变量”，都会在当前光标位置打开同一个变量浮窗并插入内联 token。
        </small>
      </div>

      <label className="binding-field">
        <span className="binding-label">回复字段名</span>
        <input
          className="trace-text-input"
          value={typeof config.responseKey === "string" ? config.responseKey : ""}
          onChange={(event) => updateField("responseKey", event.target.value.trim() || undefined)}
          placeholder="默认是 answer，也可以改成 reply / message"
        />
      </label>
    </div>
  );
}
