"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { UpdatePublishedEndpointLifecycleState } from "@/app/actions";

type WorkflowPublishLifecycleFormProps = {
  workflowId: string;
  bindingId: string;
  currentStatus: "draft" | "published" | "offline";
  action: (
    state: UpdatePublishedEndpointLifecycleState,
    formData: FormData
  ) => Promise<UpdatePublishedEndpointLifecycleState>;
};

function PublishLifecycleSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button className="sync-button" type="submit" disabled={pending}>
      {pending ? "提交中..." : label}
    </button>
  );
}

export function WorkflowPublishLifecycleForm({
  workflowId,
  bindingId,
  currentStatus,
  action
}: WorkflowPublishLifecycleFormProps) {
  const nextStatus = currentStatus === "published" ? "offline" : "published";
  const buttonLabel = currentStatus === "published" ? "下线 endpoint" : "发布 endpoint";
  const initialState: UpdatePublishedEndpointLifecycleState = {
    status: "idle",
    message: "",
    workflowId,
    bindingId,
    nextStatus
  };
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="binding-actions publish-lifecycle-form">
      <input type="hidden" name="workflowId" value={workflowId} />
      <input type="hidden" name="bindingId" value={bindingId} />
      <input type="hidden" name="nextStatus" value={nextStatus} />
      <PublishLifecycleSubmitButton label={buttonLabel} />
      {state.message ? (
        <p className={`sync-message ${state.status}`}>{state.message}</p>
      ) : null}
    </form>
  );
}
