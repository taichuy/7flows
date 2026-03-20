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
});
