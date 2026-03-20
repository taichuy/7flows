"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Node } from "@xyflow/react";

import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";
import { validateContractSchema } from "@/lib/workflow-contract-schema-validation";
import { WorkflowValidationRemediationCard } from "@/components/workflow-validation-remediation-card";
import { toRecord } from "@/components/workflow-node-config-form/shared";

type WorkflowNodeIoSchemaFormProps = {
  node: Node<WorkflowCanvasNodeData>;
  onInputSchemaChange: (nextSchema: Record<string, unknown> | undefined) => void;
  onOutputSchemaChange: (nextSchema: Record<string, unknown> | undefined) => void;
  highlighted?: boolean;
  highlightedFieldPath?: string | null;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

const EMPTY_OBJECT_SCHEMA = JSON.stringify(
  {
    type: "object",
    properties: {},
    required: []
  },
  null,
  2
);

export function WorkflowNodeIoSchemaForm({
  node,
  onInputSchemaChange,
  onOutputSchemaChange,
  highlighted = false,
  highlightedFieldPath = null,
  focusedValidationItem = null,
  sandboxReadiness = null
}: WorkflowNodeIoSchemaFormProps) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [inputSchemaText, setInputSchemaText] = useState(stringifySchema(node.data.inputSchema));
  const [outputSchemaText, setOutputSchemaText] = useState(stringifySchema(node.data.outputSchema));
  const [inputErrorMessage, setInputErrorMessage] = useState<string | null>(null);
  const [outputErrorMessage, setOutputErrorMessage] = useState<string | null>(null);
  const normalizedHighlightedField = normalizeSchemaFieldKey(highlightedFieldPath);

  useEffect(() => {
    setInputSchemaText(stringifySchema(node.data.inputSchema));
    setOutputSchemaText(stringifySchema(node.data.outputSchema));
    setInputErrorMessage(null);
    setOutputErrorMessage(null);
  }, [node.id, node.data.inputSchema, node.data.outputSchema]);

  useEffect(() => {
    if (!normalizedHighlightedField) {
      return;
    }

    const target = sectionRef.current?.querySelector<HTMLElement>(
      `[data-validation-field="${normalizedHighlightedField}"] textarea`
    );

    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    target?.focus();
  }, [normalizedHighlightedField]);

  const inputSchemaFieldsCount = countSchemaFields(node.data.inputSchema);
  const outputSchemaFieldsCount = countSchemaFields(node.data.outputSchema);

  return (
    <div
      className={`binding-form ${highlighted ? "validation-focus-ring" : ""}`.trim()}
      ref={sectionRef}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Node contract</p>
          <h3>Input / output schema</h3>
        </div>
      </div>

      <div className="tool-badge-row">
        <span className="event-chip">{node.data.nodeType}</span>
        <span className="event-chip">input fields {inputSchemaFieldsCount}</span>
        <span className="event-chip">output fields {outputSchemaFieldsCount}</span>
      </div>

      {focusedValidationItem && normalizedHighlightedField ? (
        <WorkflowValidationRemediationCard
          item={focusedValidationItem}
          sandboxReadiness={sandboxReadiness}
        />
      ) : null}

      <label
        className={`binding-field ${normalizedHighlightedField === "inputSchema" ? "validation-focus-ring" : ""}`.trim()}
        data-validation-field="inputSchema"
      >
        <span className="binding-label">Input schema JSON</span>
        <textarea
          className="editor-json-area"
          value={inputSchemaText}
          onChange={(event) => setInputSchemaText(event.target.value)}
          placeholder="为空表示沿用节点默认输入约束"
        />
      </label>

      <div className="tool-badge-row">
        <button
          className="sync-button"
          type="button"
          onClick={() =>
            handleApplySchema({
              value: inputSchemaText,
              errorPrefix: `Node '${node.id}' inputSchema`,
              onChange: onInputSchemaChange,
              setErrorMessage: setInputErrorMessage
            })
          }
        >
          应用 input schema
        </button>
        <button
          className="sync-button"
          type="button"
          onClick={() => {
            setInputSchemaText(EMPTY_OBJECT_SCHEMA);
            setInputErrorMessage(null);
          }}
        >
          object 模板
        </button>
        <button
          className="sync-button"
          type="button"
          onClick={() => {
            setInputSchemaText("");
            setInputErrorMessage(null);
            onInputSchemaChange(undefined);
          }}
        >
          清空 input schema
        </button>
      </div>

      <label
        className={`binding-field ${normalizedHighlightedField === "outputSchema" ? "validation-focus-ring" : ""}`.trim()}
        data-validation-field="outputSchema"
      >
        <span className="binding-label">Output schema JSON</span>
        <textarea
          className="editor-json-area"
          value={outputSchemaText}
          onChange={(event) => setOutputSchemaText(event.target.value)}
          placeholder="为空表示节点输出仍由运行时和下游 mapping 自行约束"
        />
      </label>

      <div className="tool-badge-row">
        <button
          className="sync-button"
          type="button"
          onClick={() =>
            handleApplySchema({
              value: outputSchemaText,
              errorPrefix: `Node '${node.id}' outputSchema`,
              onChange: onOutputSchemaChange,
              setErrorMessage: setOutputErrorMessage
            })
          }
        >
          应用 output schema
        </button>
        <button
          className="sync-button"
          type="button"
          onClick={() => {
            setOutputSchemaText(EMPTY_OBJECT_SCHEMA);
            setOutputErrorMessage(null);
          }}
        >
          object 模板
        </button>
        <button
          className="sync-button"
          type="button"
          onClick={() => {
            setOutputSchemaText("");
            setOutputErrorMessage(null);
            onOutputSchemaChange(undefined);
          }}
        >
          清空 output schema
        </button>
      </div>

      <p className="section-copy">
        这层先把节点契约从通用 config JSON 中分离出来，并复用与后端保存链路一致的最小
        contract 校验；后续再继续演进成更细粒度的 schema builder。
      </p>

      {inputErrorMessage ? <p className="empty-state compact">{inputErrorMessage}</p> : null}
      {outputErrorMessage ? <p className="empty-state compact">{outputErrorMessage}</p> : null}
    </div>
  );
}

function handleApplySchema(options: {
  value: string;
  errorPrefix: string;
  onChange: (nextSchema: Record<string, unknown> | undefined) => void;
  setErrorMessage: (value: string | null) => void;
}) {
  try {
    const nextSchema = parseSchemaText(options.value, options.errorPrefix);
    options.setErrorMessage(null);
    options.onChange(nextSchema);
  } catch (error) {
    options.setErrorMessage(
      error instanceof Error ? error.message : "Schema 不是合法 JSON 对象。"
    );
  }
}

function parseSchemaText(value: string, errorPrefix: string) {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = JSON.parse(normalized) as unknown;
  const record = toRecord(parsed);
  if (!record) {
    throw new Error("Schema 必须是 JSON 对象。");
  }
  validateContractSchema(record, { errorPrefix });
  return record;
}

function stringifySchema(value: Record<string, unknown> | null | undefined) {
  return value ? JSON.stringify(value, null, 2) : "";
}

function countSchemaFields(value: Record<string, unknown> | null | undefined) {
  const schema = toRecord(value);
  const properties = toRecord(schema?.properties);
  return properties ? Object.keys(properties).length : 0;
}

function normalizeSchemaFieldKey(fieldPath?: string | null) {
  const normalized = fieldPath?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized === "inputSchema" || normalized.startsWith("inputSchema.")) {
    return "inputSchema";
  }

  if (normalized === "outputSchema" || normalized.startsWith("outputSchema.")) {
    return "outputSchema";
  }

  return null;
}
