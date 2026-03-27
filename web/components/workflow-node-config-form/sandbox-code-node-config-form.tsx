"use client";

import React from "react";
import type { Node } from "@xyflow/react";

import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import { WORKFLOW_EXECUTION_DEPENDENCY_MODE_OPTIONS } from "@/lib/workflow-runtime-policy";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";
import { WorkflowValidationRemediationCard } from "@/components/workflow-validation-remediation-card";
import {
  cloneRecord,
  toRecord
} from "@/components/workflow-node-config-form/shared";

type SandboxCodeNodeConfigFormProps = {
  node: Node<WorkflowCanvasNodeData>;
  currentHref?: string | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  highlightedFieldPath?: string | null;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  onChange: (nextConfig: Record<string, unknown>) => void;
};

const DEFAULT_CODE = "result = {'ok': True}";

export function SandboxCodeNodeConfigForm({
  node,
  currentHref = null,
  sandboxReadiness = null,
  highlightedFieldPath = null,
  focusedValidationItem = null,
  onChange
}: SandboxCodeNodeConfigFormProps) {
  const sectionRef = React.useRef<HTMLDivElement | null>(null);
  const config = cloneRecord(node.data.config);
  const normalizedHighlightedField = normalizeSandboxCodeFieldKey(highlightedFieldPath);
  const languageOptions = React.useMemo(
    () => buildSandboxLanguageOptions(sandboxReadiness, config),
    [sandboxReadiness, config]
  );
  const currentLanguage =
    typeof config.language === "string" && config.language.trim()
      ? config.language.trim().toLowerCase()
      : "python";
  const currentDependencyMode =
    typeof config.dependencyMode === "string" && config.dependencyMode.trim()
      ? config.dependencyMode.trim().toLowerCase()
      : "";

  React.useEffect(() => {
    if (!normalizedHighlightedField) {
      return;
    }

    const target = sectionRef.current?.querySelector<HTMLElement>(
      `[data-validation-field="${normalizedHighlightedField}"] input, ` +
        `[data-validation-field="${normalizedHighlightedField}"] select, ` +
        `[data-validation-field="${normalizedHighlightedField}"] textarea`
    );

    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    target?.focus();
  }, [normalizedHighlightedField]);

  const updateConfigField = (field: string, value: unknown) => {
    const nextConfig = cloneRecord(config);
    if (value === undefined || value === "") {
      delete nextConfig[field];
    } else {
      nextConfig[field] = value;
    }
    onChange(nextConfig);
  };

  const handleDependencyModeChange = (value: string) => {
    const nextConfig = cloneRecord(config);
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      delete nextConfig.dependencyMode;
      delete nextConfig.builtinPackageSet;
      delete nextConfig.dependencyRef;
      onChange(nextConfig);
      return;
    }

    nextConfig.dependencyMode = normalized;
    if (normalized !== "builtin") {
      delete nextConfig.builtinPackageSet;
    }
    if (normalized !== "dependency_ref") {
      delete nextConfig.dependencyRef;
    }
    onChange(nextConfig);
  };

  return (
    <div className="binding-form compact-stack" ref={sectionRef}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Structured config</p>
          <h3>Sandbox code</h3>
        </div>
      </div>

      {focusedValidationItem &&
      focusedValidationItem.target.scope === "node" &&
      focusedValidationItem.target.section === "config" ? (
        <WorkflowValidationRemediationCard
          currentHref={currentHref}
          item={focusedValidationItem}
          sandboxReadiness={sandboxReadiness}
        />
      ) : null}

      <label
        className={`binding-field ${normalizedHighlightedField === "language" ? "validation-focus-ring" : ""}`.trim()}
        data-validation-field="language"
      >
        <span className="binding-label">Language</span>
        <select
          className="binding-select"
          value={currentLanguage}
          onChange={(event) => updateConfigField("language", event.target.value)}
        >
          {languageOptions.map((language) => (
            <option key={`${node.id}-sandbox-language-${language}`} value={language}>
              {language}
            </option>
          ))}
        </select>
        <small className="section-copy">
          默认仍会走 `sandbox` execution class；如果当前只想沿 host-controlled MVP 路径验证，请到
          Runtime policy 把 execution class 显式改成 `subprocess`。
        </small>
      </label>

      <label
        className={`binding-field ${normalizedHighlightedField === "code" ? "validation-focus-ring" : ""}`.trim()}
        data-validation-field="code"
      >
        <span className="binding-label">Code</span>
        <textarea
          className="editor-json-area"
          value={typeof config.code === "string" ? config.code : DEFAULT_CODE}
          onChange={(event) => updateConfigField("code", event.target.value)}
          placeholder="至少显式写出 result = {...}，让 output 节点能消费结构化结果"
          rows={10}
        />
      </label>

      <label
        className={`binding-field ${normalizedHighlightedField === "dependencyMode" ? "validation-focus-ring" : ""}`.trim()}
        data-validation-field="dependencyMode"
      >
        <span className="binding-label">Dependency mode</span>
        <select
          className="binding-select"
          value={currentDependencyMode}
          onChange={(event) => handleDependencyModeChange(event.target.value)}
        >
          <option value="">inherit runtime policy / none</option>
          {WORKFLOW_EXECUTION_DEPENDENCY_MODE_OPTIONS.map((option) => (
            <option key={`${node.id}-sandbox-dependency-${option}`} value={option}>
              {option}
            </option>
          ))}
        </select>
        <small className="section-copy">
          这里声明节点自己的依赖契约；若 Runtime policy.execution 已声明 dependency fields，会覆盖这里。
        </small>
      </label>

      {currentDependencyMode === "builtin" ? (
        <label
          className={`binding-field ${normalizedHighlightedField === "builtinPackageSet" ? "validation-focus-ring" : ""}`.trim()}
          data-validation-field="builtinPackageSet"
        >
          <span className="binding-label">Builtin package set</span>
          <input
            className="trace-text-input"
            value={typeof config.builtinPackageSet === "string" ? config.builtinPackageSet : ""}
            onChange={(event) =>
              updateConfigField("builtinPackageSet", event.target.value.trim() || undefined)
            }
            placeholder="例如 py-data-basic"
          />
        </label>
      ) : null}

      {currentDependencyMode === "dependency_ref" ? (
        <label
          className={`binding-field ${normalizedHighlightedField === "dependencyRef" ? "validation-focus-ring" : ""}`.trim()}
          data-validation-field="dependencyRef"
        >
          <span className="binding-label">Dependency ref</span>
          <input
            className="trace-text-input"
            value={typeof config.dependencyRef === "string" ? config.dependencyRef : ""}
            onChange={(event) =>
              updateConfigField("dependencyRef", event.target.value.trim() || undefined)
            }
            placeholder="例如 bundle:analytics-safe-v1"
          />
        </label>
      ) : null}

      <div className="binding-field">
        <span className="binding-label">Authoring note</span>
        <small className="section-copy">
          `network / filesystem / profile / backendExtensions` 这类 execution override 继续放在 Runtime
          policy 区域维护，避免 config 与 execution capability 混在一起。
        </small>
      </div>
    </div>
  );
}

function normalizeSandboxCodeFieldKey(fieldPath?: string | null) {
  if (!fieldPath) {
    return null;
  }

  const normalized = fieldPath.replace(/^nodes\.\d+\./, "");
  if (!normalized.startsWith("config.")) {
    return null;
  }

  const fieldKey = normalized.replace(/^config\./, "");
  if (
    fieldKey === "language" ||
    fieldKey === "code" ||
    fieldKey === "dependencyMode" ||
    fieldKey === "builtinPackageSet" ||
    fieldKey === "dependencyRef"
  ) {
    return fieldKey;
  }

  return null;
}

function buildSandboxLanguageOptions(
  sandboxReadiness: SandboxReadinessCheck | null,
  config: Record<string, unknown>
) {
  const options = new Set<string>(["python"]);
  sandboxReadiness?.supported_languages.forEach((language) => {
    if (typeof language === "string" && language.trim()) {
      options.add(language.trim().toLowerCase());
    }
  });
  const currentLanguage = typeof config.language === "string" ? config.language.trim() : "";
  if (currentLanguage) {
    options.add(currentLanguage.toLowerCase());
  }
  return [...options].sort((left, right) => left.localeCompare(right));
}
