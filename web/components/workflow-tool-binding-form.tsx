"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import type { UpdateWorkflowToolBindingState } from "@/app/actions/workflow";
import { ToolGovernanceSummary } from "@/components/tool-governance-summary";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import { compareToolsByGovernance } from "@/lib/tool-governance";

type WorkflowToolBindingFormProps = {
  workflowId: string;
  nodeId: string;
  nodeName: string;
  currentToolId: string;
  tools: PluginToolRegistryItem[];
  action: (
    state: UpdateWorkflowToolBindingState,
    formData: FormData
  ) => Promise<UpdateWorkflowToolBindingState>;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="sync-button" type="submit" disabled={pending}>
      {pending ? "保存中..." : "保存绑定"}
    </button>
  );
}

export function WorkflowToolBindingForm({
  workflowId,
  nodeId,
  nodeName,
  currentToolId,
  tools,
  action
}: WorkflowToolBindingFormProps) {
  const initialState: UpdateWorkflowToolBindingState = {
    status: "idle",
    message: "",
    workflowId,
    nodeId,
    toolId: currentToolId
  };
  const [state, formAction] = useActionState(action, initialState);
  const sortedTools = useMemo(
    () => [...tools].sort(compareToolsByGovernance),
    [tools]
  );
  const [selectedToolId, setSelectedToolId] = useState(currentToolId);

  useEffect(() => {
    setSelectedToolId(state.toolId);
  }, [state.toolId]);

  const selectedTool = sortedTools.find((tool) => tool.id === selectedToolId) ?? null;
  const missingSelectedTool =
    Boolean(selectedToolId) && !selectedTool && !sortedTools.some((tool) => tool.id === selectedToolId);

  return (
    <form action={formAction} className="binding-form">
      <input type="hidden" name="workflowId" value={workflowId} />
      <input type="hidden" name="nodeId" value={nodeId} />

      <label className="binding-field">
        <span className="binding-label">
          {nodeName} <code>{nodeId}</code>
        </span>
        <select
          className="binding-select"
          name="toolId"
          value={selectedToolId}
          onChange={(event) => setSelectedToolId(event.target.value)}
        >
          <option value="">未绑定 compat 工具</option>
          {sortedTools.map((tool) => (
            <option key={tool.id} value={tool.id}>
              {tool.name} · {tool.ecosystem}
            </option>
          ))}
        </select>
      </label>
      <p className="binding-meta">
        目录项已按治理优先级排序，默认先展示更高敏感级别、默认更强隔离的工具。
      </p>

      {selectedTool ? (
        <ToolGovernanceSummary
          tool={selectedTool}
          title="Selected tool governance"
          subtitle="保存前先确认默认 execution class 与 supported execution classes。"
          trailingChip={selectedTool.id}
        />
      ) : null}
      {missingSelectedTool ? (
        <p className="sync-message error">
          当前选择的工具已不在目录里。请先重新同步工具目录，或改绑到仍可用的 catalog tool。
        </p>
      ) : null}

      <div className="binding-actions">
        <SubmitButton />
        {state.message ? (
          <p className={`sync-message ${state.status}`}>{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}
