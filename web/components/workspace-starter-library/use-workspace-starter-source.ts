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
import {
  buildWorkspaceStarterMutationFallbackErrorMessage,
  buildWorkspaceStarterMutationNetworkErrorMessage,
  buildWorkspaceStarterMutationPendingMessage,
  buildWorkspaceStarterMutationSuccessMessage,
  type WorkspaceStarterMessageTone
} from "@/lib/workspace-starter-mutation-presenters";

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
      const nextSourceDiff = await getWorkspaceStarterSourceDiff(templateId);
      setSourceDiff(nextSourceDiff);
      return nextSourceDiff;
    } catch {
      setSourceDiff(null);
      return null;
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
      setMessage(buildWorkspaceStarterMutationPendingMessage("refresh"));
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
          setMessage(
            body && "detail" in body
              ? body.detail ?? buildWorkspaceStarterMutationFallbackErrorMessage("refresh")
              : buildWorkspaceStarterMutationFallbackErrorMessage("refresh")
          );
          setMessageTone("error");
          return;
        }

        setTemplates((current) =>
          current.map((template) => (template.id === body.id ? body : template))
        );
        setSelectedTemplateId(body.id);
        await reloadHistory(body.id);
        const nextSourceDiff = await reloadSourceDiff(body.id);
        setMessage(
          buildWorkspaceStarterMutationSuccessMessage({
            action: "refresh",
            templateName: body.name,
            sourceDiff: nextSourceDiff
          })
        );
        setMessageTone("success");
      } catch {
        setMessage(buildWorkspaceStarterMutationNetworkErrorMessage("refresh"));
        setMessageTone("error");
      }
    });
  };

  const handleRebaseFromSource = () => {
    if (!selectedTemplate?.created_from_workflow_id) {
      return;
    }

    startRebasingTransition(async () => {
      setMessage(buildWorkspaceStarterMutationPendingMessage("rebase"));
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
          setMessage(
            body && "detail" in body
              ? body.detail ?? buildWorkspaceStarterMutationFallbackErrorMessage("rebase")
              : buildWorkspaceStarterMutationFallbackErrorMessage("rebase")
          );
          setMessageTone("error");
          return;
        }

        setTemplates((current) =>
          current.map((template) => (template.id === body.id ? body : template))
        );
        setSelectedTemplateId(body.id);
        await reloadHistory(body.id);
        const nextSourceDiff = await reloadSourceDiff(body.id);
        setMessage(
          buildWorkspaceStarterMutationSuccessMessage({
            action: "rebase",
            templateName: body.name,
            sourceDiff: nextSourceDiff
          })
        );
        setMessageTone("success");
      } catch {
        setMessage(buildWorkspaceStarterMutationNetworkErrorMessage("rebase"));
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
