import { redirect } from "next/navigation";

import {
  buildLegacyWorkflowStudioSurfaceRedirectHref,
  type WorkflowStudioPageProps
} from "./workflow-studio-page";

export default async function WorkflowDetailCompatPage(props: WorkflowStudioPageProps) {
  redirect(await buildLegacyWorkflowStudioSurfaceRedirectHref(props));
}
