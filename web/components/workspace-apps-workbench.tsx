"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Form, Input, Modal, Space, Typography } from "antd";

import { WorkspaceAppListStage } from "@/components/workspace-apps-workbench/workspace-app-list-stage";
import { WorkspaceBrowseRail } from "@/components/workspace-apps-workbench/workspace-browse-rail";
import { WorkspaceCatalogHeader } from "@/components/workspace-apps-workbench/workspace-catalog-header";
import {
  getWorkspaceScopeSummary,
  type WorkspaceAppCard,
  type WorkspaceAppsWorkbenchProps
} from "@/components/workspace-apps-workbench/shared";
import { WorkflowCreateWizard } from "@/components/workflow-create-wizard";
import { updateWorkflow } from "@/lib/get-workflows";

const { Paragraph, Text, Title } = Typography;

const WORKSPACE_APP_PAGE_SIZE = 6;

export function WorkspaceAppsWorkbench({
  workspaceName,
  currentRoleLabel,
  currentUserDisplayName,
  requestedKeyword,
  activeModeLabel,
  activeModeDescription,
  visibleAppSummary,
  modeTabs,
  scopePills,
  statusFilters,
  workspaceSignals,
  focusedCreateHref,
  workspaceUtilityEntry,
  starterCount,
  workflowCreateWizardProps,
  filteredApps,
  searchState
}: WorkspaceAppsWorkbenchProps) {
  const router = useRouter();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<WorkspaceAppCard | null>(null);
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [editForm] = Form.useForm<{ name: string }>();
  const currentScopeSummary = getWorkspaceScopeSummary({
    activeModeDescription,
    activeModeLabel,
    requestedKeyword
  });
  const catalogDescription = requestedKeyword
    ? `当前按“${requestedKeyword}”筛选，命中后直接进入 Studio。`
    : activeModeLabel
      ? `当前聚焦 ${activeModeLabel}。`
      : "创建、筛选后直接进入 Studio。";
  const totalPages = Math.max(1, Math.ceil(filteredApps.length / WORKSPACE_APP_PAGE_SIZE));
  const paginatedApps = useMemo(() => {
    const startIndex = (currentPage - 1) * WORKSPACE_APP_PAGE_SIZE;

    return filteredApps.slice(startIndex, startIndex + WORKSPACE_APP_PAGE_SIZE);
  }, [currentPage, filteredApps]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const handleOpenCreateModal = useCallback(() => {
    setCreateModalOpen(true);
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setCreateModalOpen(false);
  }, []);

  const handleOpenEditModal = useCallback(
    (card: WorkspaceAppCard) => {
      setEditingApp(card);
      setEditErrorMessage(null);
      editForm.setFieldsValue({ name: card.name });
    },
    [editForm]
  );

  const handleCloseEditModal = useCallback(() => {
    setEditingApp(null);
    setEditErrorMessage(null);
    setIsSavingEdit(false);
    editForm.resetFields();
  }, [editForm]);

  const handleEditFinish = useCallback(
    async ({ name }: { name: string }) => {
      if (!editingApp) {
        return;
      }

      const normalizedName = name.trim();
      if (!normalizedName) {
        setEditErrorMessage("应用名称不能为空。");
        return;
      }

      if (normalizedName === editingApp.name) {
        handleCloseEditModal();
        return;
      }

      setIsSavingEdit(true);
      setEditErrorMessage(null);

      try {
        await updateWorkflow(editingApp.id, { name: normalizedName });
        handleCloseEditModal();
        router.refresh();
      } catch (error) {
        setIsSavingEdit(false);
        setEditErrorMessage(
          error instanceof Error ? error.message : "保存基础信息失败，请确认 API 已启动。"
        );
      }
    },
    [editingApp, handleCloseEditModal, router]
  );

  return (
    <>
      <main className="workspace-main workspace-home-main workspace-home-main-flat workspace-board-page">
        <section className="workspace-apps-dify-shell">
          <section className="workspace-apps-dify-stage">
            <section className="workspace-board-overview" data-component="workspace-board-overview">
              <WorkspaceCatalogHeader
                workspaceName={workspaceName}
                currentRoleLabel={currentRoleLabel}
                catalogDescription={catalogDescription}
                workspaceSignals={workspaceSignals}
              />

              <WorkspaceBrowseRail
                currentScopeSummary={currentScopeSummary}
                modeTabs={modeTabs}
                scopePills={scopePills}
                statusFilters={statusFilters}
                requestedKeyword={requestedKeyword}
                searchState={searchState}
                focusedCreateHref={focusedCreateHref}
                workspaceUtilityEntry={workspaceUtilityEntry}
                onOpenCreate={handleOpenCreateModal}
              />
            </section>

            <section className="workspace-catalog-stage">
              <WorkspaceAppListStage
                activeModeLabel={activeModeLabel}
                currentPage={currentPage}
                currentUserDisplayName={currentUserDisplayName}
                filteredApps={filteredApps}
                paginatedApps={paginatedApps}
                pageSize={WORKSPACE_APP_PAGE_SIZE}
                totalPages={totalPages}
                visibleAppSummary={visibleAppSummary}
                onOpenCreate={handleOpenCreateModal}
                onOpenEdit={handleOpenEditModal}
                onPageChange={setCurrentPage}
              />
            </section>
          </section>
        </section>
      </main>

      <Modal
        footer={null}
        onCancel={handleCloseCreateModal}
        open={createModalOpen}
        title="创建应用"
        width={1120}
      >
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <Paragraph type="secondary">
            继续复用当前工作台 bootstrap scope 与 starter 选择逻辑；当前可用 Starter {starterCount} 个，需要深链或分享筛选条件时，再切到全屏创建页。
          </Paragraph>
          <Button href={focusedCreateHref}>打开全屏创建页</Button>
          {createModalOpen ? <WorkflowCreateWizard {...workflowCreateWizardProps} surface="workspace" /> : null}
        </Space>
      </Modal>

      <Modal
        confirmLoading={isSavingEdit}
        okText="保存基础信息"
        onCancel={handleCloseEditModal}
        onOk={() => editForm.submit()}
        open={Boolean(editingApp)}
        title={editingApp ? `编辑 ${editingApp.name}` : "编辑基础信息"}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditFinish}>
          <Form.Item
            label="应用名称"
            name="name"
            rules={[{ required: true, message: "请输入应用名称。" }]}
          >
            <Input maxLength={80} placeholder="输入新的应用名称" />
          </Form.Item>

          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
            <Text type="secondary">只更新基础信息；节点配置、上下文授权与发布定义仍在 Studio 中维护。</Text>
            {editingApp ? (
              <Title level={5} style={{ margin: 0 }}>
                {editingApp.mode.label} · {editingApp.nodeCount} 个节点
              </Title>
            ) : null}
            {editErrorMessage ? <Alert message={editErrorMessage} type="error" /> : null}
          </Space>
        </Form>
      </Modal>
    </>
  );
}
