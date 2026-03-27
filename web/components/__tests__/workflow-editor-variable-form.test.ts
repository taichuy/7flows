import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowEditorVariableForm } from "@/components/workflow-editor-variable-form";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

describe("WorkflowEditorVariableForm", () => {
  it("shows field-level remediation for focused variable issues", () => {
    const focusedValidationItem: WorkflowValidationNavigatorItem = {
      key: "variable-name",
      category: "variables",
      message: "变量名重复，会让 prompt、publish schema 和运行时上下文同时漂移。",
      target: {
        scope: "variables",
        variableIndex: 0,
        fieldPath: "name",
        label: "Variable 路 locale"
      }
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowEditorVariableForm, {
        variables: [
          {
            name: "locale",
            type: "string",
            description: "Current locale"
          }
        ],
        highlightedVariableIndex: 0,
        highlightedVariableFieldPath: "name",
        focusedValidationItem,
        onChange: () => undefined
      })
    );

    expect(html).toContain("Variable 路 locale · Variable name");
    expect(html).toContain("变量名重复");
    expect(html).toContain("validation-focus-ring");
  });

  it("promotes aggregate variable validation into shared remediation", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorVariableForm, {
        variables: [
          {
            name: "",
            type: "string",
            description: "Current locale"
          }
        ],
        onChange: () => undefined
      })
    );

    expect(html).toContain("Variable · variable_1 · Variable name");
    expect(html).toContain("Variable 1 的变量名不能为空。");
    expect(html).toContain("把变量名改成当前 workflow 内唯一、稳定的标识");
    expect(html).not.toContain("当前 workflow variables 里还有这些字段级问题：");
  });

  it("shows the shared save gate summary for variable blockers", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorVariableForm, {
        variables: [
          {
            name: "locale",
            type: "string"
          }
        ],
        persistBlockers: [
          {
            id: "variables",
            label: "Variables",
            detail: "当前 workflow definition 还有 variables 待修正问题：变量名重复。",
            nextStep: "请先修正变量名，再继续保存。"
          }
        ],
        onChange: () => undefined
      })
    );

    expect(html).toContain("Variable save gate");
    expect(html).toContain("当前保存会被 1 类问题阻断：Variables。");
    expect(html).toContain("请先修正变量名，再继续保存");
  });
});
