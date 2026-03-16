import type { WorkflowDefinitionPreflightIssue, WorkflowDetail } from "@/lib/get-workflows";

export type WorkflowVariableValidationIssue = WorkflowDefinitionPreflightIssue & {
  category: "variables";
};

export function buildWorkflowVariableValidationIssues(
  definition: WorkflowDetail["definition"]
): WorkflowVariableValidationIssue[] {
  const variables = Array.isArray(definition.variables) ? definition.variables : [];
  const issues: WorkflowVariableValidationIssue[] = [];
  const seenNames = new Map<string, number[]>();

  variables.forEach((variable, index) => {
    const rawName = typeof variable?.name === "string" ? variable.name : "";
    const normalizedName = rawName.trim();
    if (!normalizedName) {
      issues.push({
        category: "variables",
        message: `Variable ${index + 1} 的变量名不能为空。`,
        path: `variables.${index}.name`,
        field: "name"
      });
      return;
    }

    const indexes = seenNames.get(normalizedName) ?? [];
    indexes.push(index);
    seenNames.set(normalizedName, indexes);
  });

  for (const [name, indexes] of seenNames.entries()) {
    if (indexes.length <= 1) {
      continue;
    }
    indexes.forEach((index) => {
      issues.push({
        category: "variables",
        message: `变量名 ${name} 重复，保存前需要去重。`,
        path: `variables.${index}.name`,
        field: "name"
      });
    });
  }

  return issues;
}
