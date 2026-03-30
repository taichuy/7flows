import {
  generateWorkflowStudioMetadata,
  renderWorkflowStudioPage,
  type WorkflowStudioPageProps
} from "../workflow-studio-page";

export async function generateMetadata(props: WorkflowStudioPageProps) {
  return generateWorkflowStudioMetadata(props);
}

export default async function WorkflowEditorPage(props: WorkflowStudioPageProps) {
  return renderWorkflowStudioPage({ ...props, surface: "editor" });
}
