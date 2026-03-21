import { useEffect, useState, useTransition } from "react";
import type { Dispatch, SetStateAction } from "react";

import { getApiBaseUrl } from "@/lib/api-base-url";
import {
  getWorkspaceStarterHistory,
  getWorkspaceStarterSourceDiff,
  type WorkspaceStarterHistoryItem,
  type WorkspaceStarterSourceDiff,
  type WorkspaceStarterTemplateItem
} from "@/lib/get-workspace-starters";

import type { WorkspaceStarterMessageTone } from "./shared";

type UseWorkspaceStarterSourceOptions = {
  selectedTemplate: WorkspaceStarterTemplateItem | null;
  setTemplates: Dispatch<SetStateAction<WorkspaceStarterTemplateItem[]>>;
  setSelectedTemplateId: Dispatch<SetStateAction<string | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setMessageTone: Dispatch<SetStateAction<WorkspaceStarterMessageTone>>;
};

export function useWorkspaceStarterSource({
  selectedTemplate,
  setTemplates,
  setSelectedTemplateId,
  setMessage,
  setMessageTone
}: UseWorkspaceStarterSourceOptions) {
  const [historyItems, setHistoryItems] = useState<WorkspaceStarterHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [sourceDiff, setSourceDiff] = useState<WorkspaceStarterSourceDiff | null>(null);
  const [isLoadingSourceDiff, setIsLoadingSourceDiff] = useState(false);
  const [isRefreshing, startRefreshingTransition] = useTransition();
  const [isRebasing, startRebasingTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    if (!selectedTemplate) {
      setHistoryItems([]);
      setIsLoadingHistory(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingHistory(true);
    void getWorkspaceStarterHistory(selectedTemplate.id)
      .then((items) => {
        if (cancelled) {
          return;
        }

        setHistoryItems(items);
        setIsLoadingHistory(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setHistoryItems([]);
        setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTemplate]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedTemplate?.created_from_workflow_id) {
      setSourceDiff(null);
      setIsLoadingSourceDiff(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingSourceDiff(true);
    void getWorkspaceStarterSourceDiff(selectedTemplate.id)
      .then((item) => {
        if (cancelled) {
          return;
        }

        setSourceDiff(item);
        setIsLoadingSourceDiff(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setSourceDiff(null);
        setIsLoadingSourceDiff(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTemplate]);

  const reloadHistory = async (templateId: string) => {
    setIsLoadingHistory(true);

    try {
      setHistoryItems(await getWorkspaceStarterHistory(templateId));
    } catch {
      setHistoryItems([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const reloadSourceDiff = async (templateId: string) => {
    setIsLoadingSourceDiff(true);

    try {
      setSourceDiff(await getWorkspaceStarterSourceDiff(templateId));
    } catch {
      setSourceDiff(null);
    } finally {
      setIsLoadingSourceDiff(false);
    }
  };

  const clearSourceDiff = () => {
    setSourceDiff(null);
  };

  const clearSelectionArtifacts = () => {
    setHistoryItems([]);
    setSourceDiff(null);
  };

  const handleRefreshFromSource = () => {
    if (!selectedTemplate?.created_from_workflow_id) {
      return;
    }

    startRefreshingTransition(async () => {
      setMessage("正在从源 workflow 刷新 starter 快照...");
      setMessageTone("idle");

      try {
        const response = await fetch(
          `${getApiBaseUrl()}/api/workspace-starters/${encodeURIComponent(selectedTemplate.id)}/refresh`,
          {
            method: "POST"
          }
        );
        const body = (await response.json().catch(() => null)) as
          | WorkspaceStarterTemplateItem
          | { detail?: string }
          | null;

        if (!response.ok || !body || !("id" in body)) {
          setMessage(body && "detail" in body ? body.detail ?? "刷新失败。" : "刷新失败。");
          setMessageTone("error");
          return;
        }

        setTemplates((current) =>
          current.map((template) => (template.id === body.id ? body : template))
        );
        setSelectedTemplateId(body.id);
        await reloadHistory(body.id);
        await reloadSourceDiff(body.id);
        setMessage(
          `已刷新 workspace starter：${body.name}。${buildSandboxDriftSuccessSuffix(
            sourceDiff,
            "refresh"
          )}`
        );
        setMessageTone("success");
      } catch {
        setMessage("无法连接后端刷新 starter，请确认 API 已启动。");
        setMessageTone("error");
      }
    });
  };

  const handleRebaseFromSource = () => {
    if (!selectedTemplate?.created_from_workflow_id) {
      return;
    }

    startRebasingTransition(async () => {
      setMessage("正在基于 source workflow 执行 rebase...");
      setMessageTone("idle");

      try {
        const response = await fetch(
          `${getApiBaseUrl()}/api/workspace-starters/${encodeURIComponent(selectedTemplate.id)}/rebase`,
          {
            method: "POST"
          }
        );
        const body = (await response.json().catch(() => null)) as
          | WorkspaceStarterTemplateItem
          | { detail?: string }
          | null;

        if (!response.ok || !body || !("id" in body)) {
          setMessage(body && "detail" in body ? body.detail ?? "rebase 失败。" : "rebase 失败。");
          setMessageTone("error");
          return;
        }

        setTemplates((current) =>
          current.map((template) => (template.id === body.id ? body : template))
        );
        setSelectedTemplateId(body.id);
        await reloadHistory(body.id);
        await reloadSourceDiff(body.id);
        setMessage(
          `已完成 workspace starter rebase：${body.name}。${buildSandboxDriftSuccessSuffix(
            sourceDiff,
            "rebase"
          )}`
        );
        setMessageTone("success");
      } catch {
        setMessage("无法连接后端执行 starter rebase，请确认 API 已启动。");
        setMessageTone("error");
      }
    });
  };

  return {
    clearSelectionArtifacts,
    clearSourceDiff,
    handleRebaseFromSource,
    handleRefreshFromSource,
    historyItems,
    isLoadingHistory,
    isLoadingSourceDiff,
    isRebasing,
    isRefreshing,
    reloadHistory,
    reloadSourceDiff,
    sourceDiff
  };
}

function buildSandboxDriftSuccessSuffix(
  sourceDiff: WorkspaceStarterSourceDiff | null,
  action: "refresh" | "rebase"
) {
  const sandboxDriftCount = sourceDiff
    ? sourceDiff.sandbox_dependency_summary.added_count +
      sourceDiff.sandbox_dependency_summary.removed_count +
      sourceDiff.sandbox_dependency_summary.changed_count
    : 0;

  if (sandboxDriftCount <= 0) {
    return "";
  }

  return action === "refresh"
    ? ` 已同步 ${sandboxDriftCount} 个 sandbox 依赖漂移节点。`
    : ` 已接受 ${sandboxDriftCount} 个 sandbox 依赖漂移节点的来源变更。`;
}
