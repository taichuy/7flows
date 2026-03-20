"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { UpdatePublishedEndpointLifecycleState } from "@/app/actions/publish";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { formatSandboxReadinessPreflightHint } from "@/lib/sandbox-readiness-presenters";

type WorkflowPublishLifecycleFormProps = {
  workflowId: string;
  bindingId: string;
  currentStatus: "draft" | "published" | "offline";
  sandboxReadiness?: SandboxReadinessCheck | null;
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
  sandboxReadiness,
  action
}: WorkflowPublishLifecycleFormProps) {
  const nextStatus = currentStatus === "published" ? "offline" : "published";
  const buttonLabel = currentStatus === "published" ? "下线 endpoint" : "发布 endpoint";
  const sandboxPreflightHint = formatSandboxReadinessPreflightHint(sandboxReadiness);
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
      {sandboxPreflightHint ? (
        <p className="section-copy entry-copy">
          当前 lifecycle action 只切换 binding 对外状态；若后续 sampled run 仍依赖 strong-isolation，
          请先核对：{sandboxPreflightHint}
        </p>
      ) : null}
      <PublishLifecycleSubmitButton label={buttonLabel} />
      {state.message ? (
        <p className={`sync-message ${state.status}`}>{state.message}</p>
      ) : null}
    </form>
  );
}
