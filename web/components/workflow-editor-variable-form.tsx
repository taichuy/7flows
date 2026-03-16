"use client";

import { useMemo, useState } from "react";

import { buildWorkflowVariableValidationIssues } from "@/lib/workflow-variable-validation";

type WorkflowEditorVariableFormProps = {
  variables: Array<Record<string, unknown>>;
  onChange: (
    nextVariables: Array<Record<string, unknown>>,
    options?: { successMessage?: string }
  ) => void;
  highlightedVariableIndex?: number | null;
};

type NormalizedWorkflowVariable = {
  name: string;
  type: string;
  description: string;
  defaultValue: unknown;
  hasDefault: boolean;
};

export function WorkflowEditorVariableForm({
  variables,
  onChange,
  highlightedVariableIndex = null
}: WorkflowEditorVariableFormProps) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const normalizedVariables = useMemo(
    () => variables.map((variable) => normalizeWorkflowVariable(variable)),
    [variables]
  );
  const validationIssues = useMemo(
    () => buildWorkflowVariableValidationIssues({ variables }),
    [variables]
  );

  const commit = (
    nextVariables: Array<Record<string, unknown>>,
    options?: { successMessage?: string }
  ) => {
    setFeedback(null);
    onChange(nextVariables, options);
  };

  const updateVariable = (
    index: number,
    updater: (current: Record<string, unknown>) => Record<string, unknown>
  ) => {
    commit(
      variables.map((variable, variableIndex) =>
        variableIndex === index ? updater(cloneRecord(variable)) : cloneRecord(variable)
      )
    );
  };

  const handleAddVariable = () => {
    const nextName = createUniqueVariableName(normalizedVariables.map((variable) => variable.name));
    commit([...variables.map(cloneRecord), createWorkflowVariableDraft(nextName)], {
      successMessage: `已新增 workflow variable ${nextName}。`
    });
  };

  const handleDeleteVariable = (index: number) => {
    const variable = normalizedVariables[index];
    commit(
      variables.filter((_, variableIndex) => variableIndex !== index).map(cloneRecord),
      {
        successMessage: `已移除 workflow variable ${variable?.name || index + 1}。`
      }
    );
  };

  const updateVariableField = (
    index: number,
    field: "name" | "type" | "description",
    value: string
  ) => {
    updateVariable(index, (variable) => {
      const normalized = value.trim();

      if (field === "name") {
        variable.name = value;
        return variable;
      }

      if (!normalized) {
        delete variable[field];
        return variable;
      }

      variable[field] = normalized;
      return variable;
    });
  };

  const updateVariableDefault = (index: number, nextValue: unknown) => {
    updateVariable(index, (variable) => {
      if (nextValue === undefined) {
        delete variable.default;
      } else {
        variable.default = nextValue;
      }
      return variable;
    });
  };

  const applyStructuredDefault = (index: number, rawValue: string) => {
    const variable = normalizedVariables[index];
    const rawType = variable?.type?.trim().toLowerCase() || "";
    const normalized = rawValue.trim();

    if (!normalized) {
      updateVariableDefault(index, undefined);
      return;
    }

    try {
      switch (rawType) {
        case "boolean": {
          if (normalized !== "true" && normalized !== "false") {
            throw new Error("boolean 类型默认值只能是 true 或 false。");
          }
          updateVariableDefault(index, normalized === "true");
          return;
        }
        case "number": {
          const parsedNumber = Number(normalized);
          if (!Number.isFinite(parsedNumber)) {
            throw new Error("number 类型默认值必须是合法数值。");
          }
          updateVariableDefault(index, parsedNumber);
          return;
        }
        case "integer": {
          const parsedInteger = Number(normalized);
          if (!Number.isInteger(parsedInteger)) {
            throw new Error("integer 类型默认值必须是整数。");
          }
          updateVariableDefault(index, parsedInteger);
          return;
        }
        case "string": {
          updateVariableDefault(index, rawValue);
          return;
        }
        default: {
          updateVariableDefault(index, JSON.parse(normalized));
        }
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "默认值不是合法输入。");
    }
  };

  return (
    <article className="diagnostic-panel editor-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Workflow variables</p>
          <h2>Global context inputs</h2>
        </div>
      </div>

      <p className="section-copy">
        在 workflow definition 里先显式维护全局变量，让 trigger 输入、公共约束和发布 schema
        能围绕同一组事实演进，而不是继续散落在节点局部 config 中。
      </p>

      <div className="tool-badge-row">
        <span className="event-chip">variable count {normalizedVariables.length}</span>
      </div>

      <div className="binding-actions">
        <button className="sync-button" type="button" onClick={handleAddVariable}>
          新增 workflow variable
        </button>
      </div>

      {validationIssues.length > 0 ? (
        <div className="sync-message error">
          <p>当前 workflow variables 还有待修正的问题：</p>
          <ul className="roadmap-list compact-list">
            {validationIssues.map((issue) => (
              <li key={`${issue.path ?? issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {normalizedVariables.length > 0 ? (
        <div className="binding-form compact-stack">
          {normalizedVariables.map((variable, index) => {
            const rawType = variable.type.trim().toLowerCase();
            const key = `${variable.name || "variable"}-${index}`;

            return (
              <div
                className={`diagnostic-card compact-card ${highlightedVariableIndex === index ? "validation-focus-ring" : ""}`.trim()}
                key={key}
              >
                <div className="tool-badge-row">
                  <span className="event-chip">variable {index + 1}</span>
                  {variable.type ? <span className="event-chip">{variable.type}</span> : null}
                  {variable.hasDefault ? <span className="event-chip">has default</span> : null}
                </div>

                <label className="binding-field">
                  <span className="binding-label">Variable name</span>
                  <input
                    className="trace-text-input"
                    value={variable.name}
                    onChange={(event) => updateVariableField(index, "name", event.target.value)}
                    placeholder="例如 user_input / locale / risk_level"
                  />
                </label>

                <label className="binding-field">
                  <span className="binding-label">Type</span>
                  <input
                    className="trace-text-input"
                    value={variable.type}
                    onChange={(event) => updateVariableField(index, "type", event.target.value)}
                    placeholder="string / number / boolean / object / array"
                  />
                </label>

                <label className="binding-field">
                  <span className="binding-label">Description</span>
                  <input
                    className="trace-text-input"
                    value={variable.description}
                    onChange={(event) =>
                      updateVariableField(index, "description", event.target.value)
                    }
                    placeholder="说明这个变量来自哪里、给谁用"
                  />
                </label>

                {rawType === "boolean" ? (
                  <label className="binding-field">
                    <span className="binding-label">Default value</span>
                    <select
                      className="binding-select"
                      value={
                        !variable.hasDefault
                          ? ""
                          : variable.defaultValue === true
                            ? "true"
                            : "false"
                      }
                      onChange={(event) =>
                        updateVariableDefault(
                          index,
                          event.target.value === ""
                            ? undefined
                            : event.target.value === "true"
                        )
                      }
                    >
                      <option value="">未设置</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </label>
                ) : rawType === "number" || rawType === "integer" || rawType === "string" ? (
                  <label className="binding-field">
                    <span className="binding-label">Default value</span>
                    <input
                      className="trace-text-input"
                      inputMode={rawType === "string" ? undefined : "decimal"}
                      value={
                        variable.hasDefault &&
                        (typeof variable.defaultValue === "string" ||
                          typeof variable.defaultValue === "number")
                          ? String(variable.defaultValue)
                          : ""
                      }
                      onChange={(event) =>
                        applyStructuredDefault(index, event.target.value)
                      }
                      placeholder={
                        rawType === "string"
                          ? "直接输入字符串"
                          : rawType === "integer"
                            ? "直接输入整数"
                            : "直接输入数值"
                      }
                    />
                  </label>
                ) : (
                  <label className="binding-field">
                    <span className="binding-label">Default value JSON</span>
                    <textarea
                      key={`${key}-default-json`}
                      className="editor-json-area"
                      defaultValue={formatJsonValue(variable.defaultValue)}
                      onBlur={(event) => applyStructuredDefault(index, event.target.value)}
                      placeholder='对象 / 数组 / 任意 JSON，如 {"region":"cn"}'
                    />
                  </label>
                )}

                <button
                  className="editor-danger-button"
                  type="button"
                  onClick={() => handleDeleteVariable(index)}
                >
                  删除变量
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty-state compact">
          当前 workflow definition 还没有显式全局变量；先在这里补齐基础输入，再继续细化节点映射、发布 schema 和运行时上下文。
        </p>
      )}

      {feedback ? <p className="sync-message error">{feedback}</p> : null}
    </article>
  );
}

function normalizeWorkflowVariable(value: Record<string, unknown>): NormalizedWorkflowVariable {
  return {
    name: typeof value.name === "string" ? value.name : "",
    type: typeof value.type === "string" ? value.type : "",
    description: typeof value.description === "string" ? value.description : "",
    defaultValue: value.default,
    hasDefault: Object.prototype.hasOwnProperty.call(value, "default")
  };
}

function cloneRecord(value: Record<string, unknown>) {
  return { ...value };
}

function createWorkflowVariableDraft(name: string): Record<string, unknown> {
  return {
    name,
    type: "string",
    description: "",
    default: ""
  };
}

function createUniqueVariableName(existingNames: string[]) {
  const nameSet = new Set(existingNames.map((name) => name.trim()).filter(Boolean));
  let counter = 1;
  while (nameSet.has(`variable_${counter}`)) {
    counter += 1;
  }
  return `variable_${counter}`;
}

function formatJsonValue(value: unknown) {
  if (value === undefined) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}
