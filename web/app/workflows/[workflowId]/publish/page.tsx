import {
  generateWorkflowStudioMetadata,
  renderWorkflowStudioPage,
  type WorkflowStudioPageProps
} from "../workflow-studio-page";

export async function generateMetadata(props: WorkflowStudioPageProps) {
  return generateWorkflowStudioMetadata(props);
}

export default async function WorkflowPublishPage(props: WorkflowStudioPageProps) {
  return renderWorkflowStudioPage({ ...props, surface: "publish" });
}
