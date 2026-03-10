"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { UpdateWorkflowToolBindingState } from "@/app/actions";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";

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

  return (
    <form action={formAction} className="binding-form">
      <input type="hidden" name="workflowId" value={workflowId} />
      <input type="hidden" name="nodeId" value={nodeId} />

      <label className="binding-field">
        <span className="binding-label">
          {nodeName} <code>{nodeId}</code>
        </span>
        <select className="binding-select" name="toolId" defaultValue={currentToolId}>
          <option value="">未绑定 compat 工具</option>
          {tools.map((tool) => (
            <option key={tool.id} value={tool.id}>
              {tool.name} · {tool.ecosystem}
            </option>
          ))}
        </select>
      </label>

      <div className="binding-actions">
        <SubmitButton />
        {state.message ? (
          <p className={`sync-message ${state.status}`}>{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}
