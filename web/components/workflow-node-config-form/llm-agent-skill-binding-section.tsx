"use client";

import React, { useEffect, useRef, useState } from "react";

import {
  cloneRecord,
  dedupeStrings,
  parseNumericFieldValue,
  toRecord,
  toStringArray
} from "@/components/workflow-node-config-form/shared";

const SKILL_BINDING_PHASE_OPTIONS = [
  "main_plan",
  "assistant_distill",
  "main_finalize"
] as const;

type SkillBindingPhase = (typeof SKILL_BINDING_PHASE_OPTIONS)[number];

type SkillReferenceBindingDraft = {
  skillId: string;
  referenceId: string;
  phases: SkillBindingPhase[];
};

type LlmAgentSkillBindingSectionProps = {
  skillBinding: Record<string, unknown>;
  skillIds: string[];
  highlightedFieldKey?: string | null;
  onChange: (nextSkillBinding: Record<string, unknown> | undefined) => void;
};

function isSkillBindingPhase(value: string): value is SkillBindingPhase {
  return (SKILL_BINDING_PHASE_OPTIONS as readonly string[]).includes(value);
}

function readReferenceBindings(value: unknown): SkillReferenceBindingDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const binding = toRecord(item);
    if (!binding) {
      return [];
    }
    const skillId = typeof binding.skillId === "string" ? binding.skillId.trim() : "";
    const referenceId = typeof binding.referenceId === "string" ? binding.referenceId.trim() : "";
    if (!skillId || !referenceId) {
      return [];
    }
    const phases = dedupeStrings(toStringArray(binding.phases)).filter(isSkillBindingPhase);
    return [
      {
        skillId,
        referenceId,
        phases
      }
    ];
  });
}

function serializeReferenceBindings(bindings: SkillReferenceBindingDraft[]): string {
  return bindings
    .map((binding) => {
      const phaseSuffix = binding.phases.length ? ` @ ${binding.phases.join(",")}` : "";
      return `${binding.skillId}:${binding.referenceId}${phaseSuffix}`;
    })
    .join("\n");
}

function parseReferenceBindingLines(rawValue: string): {
  bindings: SkillReferenceBindingDraft[];
  error: string | null;
} {
  const bindings: SkillReferenceBindingDraft[] = [];
  const seen = new Set<string>();

  for (const [index, rawLine] of rawValue.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const [rawPair, rawPhaseList] = line.split("@").map((item) => item.trim());
    const separatorIndex = rawPair.indexOf(":");
    if (separatorIndex <= 0 || separatorIndex === rawPair.length - 1) {
      return {
        bindings: [],
        error: `第 ${index + 1} 行格式无效。请使用 skill-id:reference-id @ phase1,phase2。`
      };
    }

    const skillId = rawPair.slice(0, separatorIndex).trim();
    const referenceId = rawPair.slice(separatorIndex + 1).trim();
    if (!skillId || !referenceId) {
      return {
        bindings: [],
        error: `第 ${index + 1} 行必须同时包含 skillId 和 referenceId。`
      };
    }

    const phases = rawPhaseList
      ? dedupeStrings(rawPhaseList.split(",").map((item) => item.trim())).filter(isSkillBindingPhase)
      : [];
    if (rawPhaseList && phases.length === 0) {
      return {
        bindings: [],
        error: `第 ${index + 1} 行 phase 无效，仅支持 ${SKILL_BINDING_PHASE_OPTIONS.join(", ")}。`
      };
    }

    const dedupeKey = `${skillId}:${referenceId}:${phases.join(",")}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    bindings.push({ skillId, referenceId, phases });
  }

  return { bindings, error: null };
}

export function LlmAgentSkillBindingSection({
  skillBinding,
  skillIds,
  highlightedFieldKey = null,
  onChange
}: LlmAgentSkillBindingSectionProps) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [referenceBindingError, setReferenceBindingError] = useState<string | null>(null);
  const enabledPhases = dedupeStrings(toStringArray(skillBinding.enabledPhases)).filter(
    isSkillBindingPhase
  );
  const promptBudgetChars =
    typeof skillBinding.promptBudgetChars === "number" ? skillBinding.promptBudgetChars : "";
  const referenceBindings = readReferenceBindings(skillBinding.references);
  const referenceBindingText = serializeReferenceBindings(referenceBindings);
  const highlightEnabledPhases = highlightedFieldKey === "skillBinding.enabledPhases";
  const highlightPromptBudget = highlightedFieldKey === "skillBinding.promptBudgetChars";
  const highlightReferences = highlightedFieldKey === "skillBinding.references";

  useEffect(() => {
    if (!highlightedFieldKey) {
      return;
    }
    const target = sectionRef.current?.querySelector<HTMLElement>(
      `[data-validation-field="${highlightedFieldKey}"] textarea, ` +
        `[data-validation-field="${highlightedFieldKey}"] input`
    );
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        target.focus();
      }
    }
  }, [highlightedFieldKey]);

  const commitSkillBinding = (patch: {
    enabledPhases?: SkillBindingPhase[];
    promptBudgetChars?: number;
    references?: SkillReferenceBindingDraft[];
  }) => {
    const nextSkillBinding = cloneRecord(skillBinding);

    const nextEnabledPhases = patch.enabledPhases ?? enabledPhases;
    if (nextEnabledPhases.length > 0) {
      nextSkillBinding.enabledPhases = nextEnabledPhases;
    } else {
      delete nextSkillBinding.enabledPhases;
    }

    const nextPromptBudgetChars = Object.prototype.hasOwnProperty.call(
      patch,
      "promptBudgetChars"
    )
      ? patch.promptBudgetChars
      : promptBudgetChars;
    if (typeof nextPromptBudgetChars === "number") {
      nextSkillBinding.promptBudgetChars = nextPromptBudgetChars;
    } else {
      delete nextSkillBinding.promptBudgetChars;
    }

    const nextReferenceBindings = patch.references ?? referenceBindings;
    if (nextReferenceBindings.length > 0) {
      nextSkillBinding.references = nextReferenceBindings.map((binding) => ({
        skillId: binding.skillId,
        referenceId: binding.referenceId,
        ...(binding.phases.length > 0 ? { phases: binding.phases } : {})
      }));
    } else {
      delete nextSkillBinding.references;
    }

    onChange(Object.keys(nextSkillBinding).length > 0 ? nextSkillBinding : undefined);
  };

  const togglePhase = (phase: SkillBindingPhase, checked: boolean) => {
    const nextEnabledPhases = checked
      ? [...enabledPhases, phase]
      : enabledPhases.filter((item) => item !== phase);
    commitSkillBinding({ enabledPhases: dedupeStrings(nextEnabledPhases).filter(isSkillBindingPhase) });
  };

  const handleReferenceBindingChange = (rawValue: string) => {
    const parsed = parseReferenceBindingLines(rawValue);
    if (parsed.error) {
      setReferenceBindingError(parsed.error);
      return;
    }
    setReferenceBindingError(null);
    commitSkillBinding({ references: parsed.bindings });
  };

  return (
    <div className="binding-field" ref={sectionRef}>
      <span className="binding-label">Skill binding strategy</span>
      <small className="section-copy">
        按 phase 决定哪些 SkillDoc 会注入主 AI，并给正文 + 选定 reference body 一个近似 prompt
        budget。默认仍沿用 `main_plan + main_finalize`。
      </small>
      {skillIds.length === 0 ? (
        <small className="section-copy">
          先绑定至少一个 `skillId`，再配置 phase-aware binding、reference body 和 prompt budget。
        </small>
      ) : (
        <>
          <div
            className={`binding-field ${highlightEnabledPhases ? "validation-focus-ring" : ""}`.trim()}
            data-validation-field="skillBinding.enabledPhases"
          >
            <span className="binding-label">Enabled phases</span>
            <div className="tool-badge-row">
              {SKILL_BINDING_PHASE_OPTIONS.map((phase) => (
                <label key={phase}>
                  <input
                    type="checkbox"
                    checked={enabledPhases.includes(phase)}
                    onChange={(event) => togglePhase(phase, event.target.checked)}
                  />{" "}
                  {phase}
                </label>
              ))}
            </div>
          </div>

          <label
            className={`binding-field ${highlightPromptBudget ? "validation-focus-ring" : ""}`.trim()}
            data-validation-field="skillBinding.promptBudgetChars"
          >
            <span className="binding-label">Prompt budget (chars)</span>
            <input
              className="trace-text-input"
              type="number"
              min={256}
              max={16000}
              value={promptBudgetChars}
              onChange={(event) =>
                commitSkillBinding({
                  promptBudgetChars: parseNumericFieldValue(event.target.value)
                })
              }
              placeholder="为空时不限制"
            />
          </label>

          <label
            className={`binding-field ${highlightReferences ? "validation-focus-ring" : ""}`.trim()}
            data-validation-field="skillBinding.references"
          >
            <span className="binding-label">Reference bodies</span>
            <textarea
              className="editor-json-area"
              rows={5}
              value={referenceBindingText}
              onChange={(event) => handleReferenceBindingChange(event.target.value)}
              placeholder={[
                "每行一个绑定：skill-id:reference-id @ main_finalize",
                "skill-id:reference-id @ main_plan,assistant_distill"
              ].join("\n")}
            />
            <small className="section-copy">
              只有写在这里的 reference body 才会进入 prompt；未选中的 reference 仍只保留摘要。
            </small>
            {referenceBindingError ? (
              <small className="run-error-message">{referenceBindingError}</small>
            ) : null}
          </label>

          <small className="section-copy">
            当前已绑定 skill：{skillIds.join(", ")}。
          </small>
        </>
      )}
    </div>
  );
}
