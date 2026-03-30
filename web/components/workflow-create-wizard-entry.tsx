"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { AuthoringSurfaceLoadingState } from "@/components/authoring-surface-loading-state";
import { loadWorkflowCreateWizardBootstrap } from "@/components/workflow-create-wizard/bootstrap";
import type {
  WorkflowCreateWizardEntryProps,
  WorkflowCreateWizardProps
} from "@/components/workflow-create-wizard/types";

const loadWorkflowCreateWizardModule = () =>
  import("@/components/workflow-create-wizard").then((module) => module.WorkflowCreateWizard);

const LazyWorkflowCreateWizard = dynamic(loadWorkflowCreateWizardModule,
  {
    ssr: false,
    loading: () => <WorkflowCreateWizardBootstrapLoadingState />
  }
);

function WorkflowCreateWizardBootstrapLoadingState() {
  return (
    <AuthoringSurfaceLoadingState
      title="正在准备创建工作台"
      summary="创建向导会在最小作者壳层之后按需加载。"
      detail="首屏先保留空白创建和 starter 入口所需的数据边界，复杂预览与后续面板稍后补齐。"
    />
  );
}

export function WorkflowCreateWizardEntry({
  bootstrapRequest
}: WorkflowCreateWizardEntryProps) {
  const [wizardProps, setWizardProps] = useState<WorkflowCreateWizardProps | null>(null);

  useEffect(() => {
    let active = true;

    void loadWorkflowCreateWizardModule();
    void loadWorkflowCreateWizardBootstrap(bootstrapRequest).then((nextWizardProps) => {
      if (!active) {
        return;
      }

      setWizardProps(nextWizardProps);
    });

    return () => {
      active = false;
    };
  }, [bootstrapRequest]);

  if (!wizardProps) {
    return <WorkflowCreateWizardBootstrapLoadingState />;
  }

  return <LazyWorkflowCreateWizard {...wizardProps} />;
}
