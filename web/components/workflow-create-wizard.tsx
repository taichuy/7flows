"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, Form, Input, Alert, Space, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";

import type { WorkflowCreateWizardProps } from "@/components/workflow-create-wizard/types";
import { useWorkflowCreateShellState } from "@/components/workflow-create-wizard/use-workflow-create-shell-state";
import {
  createWorkflow,
  WorkflowDefinitionValidationError
} from "@/lib/get-workflows";
import { buildWorkflowEditorHrefFromWorkspaceStarterViewState } from "@/lib/workspace-starter-governance-query";

const { Text, Title } = Typography;

export function WorkflowCreateWizard({
  governanceQueryScope,
  workflows,
  starters,
  nodeCatalog,
  tools,
  surface = "page"
}: WorkflowCreateWizardProps) {
  const isWorkspaceSurface = surface === "workspace";
  const ShellTag = isWorkspaceSurface ? "div" : "main";
  const router = useRouter();

  const {
    isCreating,
    message,
    messageTone,
    runCreateTransition,
    selectedStarter,
    setFeedback,
    workspaceStarterGovernanceScope
  } = useWorkflowCreateShellState({
    governanceQueryScope,
    nodeCatalog,
    starters,
    tools,
    workflowsCount: workflows.length
  });

  const [form] = Form.useForm();
  const [description, setDescription] = useState("");

  const handleCreateWorkflow = useCallback(
    async (values: { name: string; description?: string }) => {
      runCreateTransition(async () => {
        if (!selectedStarter) {
          setFeedback("未找到可用的 Starter。", "error");
          return;
        }

        const normalizedName = values.name.trim() || selectedStarter.defaultWorkflowName;
        setFeedback("正在创建应用草稿...", "idle");

        try {
          if (!selectedStarter.definition) {
            setFeedback("当前 starter definition 尚未加载完成，请刷新重试。", "error");
            return;
          }

          const definition = structuredClone(selectedStarter.definition);
          // If definition has a description field, we can attach it here, but typically it's at root or not supported yet
          // definition.description = values.description || "";

          const body = await createWorkflow({
            name: normalizedName,
            definition
          });

          setFeedback(`已创建 ${normalizedName}，正在进入 Studio...`, "success");
          router.push(
            buildWorkflowEditorHrefFromWorkspaceStarterViewState(
              body.id,
              workspaceStarterGovernanceScope
            )
          );
          router.refresh();
        } catch (error) {
          setFeedback(
            error instanceof WorkflowDefinitionValidationError
              ? error.message
              : "无法连接后端创建 workflow，请确认 API 已启动。",
            "error"
          );
        }
      });
    },
    [
      router,
      runCreateTransition,
      selectedStarter,
      setFeedback,
      workspaceStarterGovernanceScope
    ]
  );

  const onCancel = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <ShellTag
      className={
        isWorkspaceSurface
          ? "workflow-create-shell-embedded"
          : "workflow-create-shell workflow-create-page-centered"
      }
      style={
        isWorkspaceSurface
          ? {}
          : {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "calc(100vh - 64px)",
              padding: "24px"
            }
      }
    >
      <Card
        style={{
          width: "100%",
          maxWidth: isWorkspaceSurface ? "none" : 520,
          boxShadow: isWorkspaceSurface ? "none" : "0 4px 12px rgba(0,0,0,0.08)"
        }}
        styles={{ body: { padding: isWorkspaceSurface ? 0 : 24 } }}
        bordered={!isWorkspaceSurface}
      >
        {!isWorkspaceSurface && (
          <div style={{ marginBottom: 24, textAlign: "center" }}>
            <Title level={4} style={{ margin: 0 }}>
              创建新应用
            </Title>
            <Text type="secondary">基于预设模板快速开始构建您的工作流</Text>
          </div>
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateWorkflow}
          initialValues={{ name: selectedStarter?.defaultWorkflowName || "" }}
        >
          <Form.Item
            label="应用名称"
            name="name"
            rules={[{ required: true, message: "请输入应用名称。" }]}
          >
            <Input
              size="large"
              placeholder="例如：My Awesome Workflow"
              disabled={isCreating}
            />
          </Form.Item>

          <Form.Item label="应用描述 (可选)" name="description">
            <Input.TextArea
              rows={3}
              placeholder="简要描述这个应用的功能和用途..."
              disabled={isCreating}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Form.Item>

          {message && (
            <Form.Item>
              <Alert
                message={message}
                type={messageTone === "error" ? "error" : "info"}
                showIcon
              />
            </Form.Item>
          )}

          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <Space style={{ display: "flex", justifyContent: "flex-end" }}>
              {!isWorkspaceSurface && (
                <Button onClick={onCancel} disabled={isCreating}>
                  返回
                </Button>
              )}
              <Button type="primary" htmlType="submit" loading={isCreating}>
                确认创建
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </ShellTag>
  );
}
