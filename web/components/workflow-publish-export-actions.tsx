"use client";

import React from "react";
import { useMemo, useState } from "react";

import { SensitiveAccessBlockedCard } from "@/components/sensitive-access-blocked-card";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import {
  buildPublishedEndpointInvocationExportUrl,
  type PublishedEndpointInvocationExportFormat,
  type PublishedEndpointInvocationListOptions
} from "@/lib/get-workflow-publish";
import { formatSandboxReadinessPreflightHint } from "@/lib/sandbox-readiness-presenters";
import {
  resolvePublishWindowRange,
  type WorkflowPublishInvocationActiveFilter
} from "@/lib/workflow-publish-governance";
import {
  parseSensitiveAccessBlockingResponse,
  type SensitiveAccessBlockingPayload
} from "@/lib/sensitive-access";

type WorkflowPublishExportActionsProps = {
  workflowId: string;
  bindingId: string;
  activeInvocationFilter: WorkflowPublishInvocationActiveFilter | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  formats?: PublishedEndpointInvocationExportFormat[];
  requesterId?: string;
  blockedTitle?: string;
  blockedSummary?: string;
};

const DEFAULT_FORMATS: PublishedEndpointInvocationExportFormat[] = ["json", "jsonl"];
const EXPORT_LIMIT = 200;

const EXPORT_LABELS: Record<PublishedEndpointInvocationExportFormat, string> = {
  json: "导出 activity JSON",
  jsonl: "导出 activity JSONL"
};

export function WorkflowPublishExportActions({
  workflowId,
  bindingId,
  activeInvocationFilter,
  sandboxReadiness,
  formats = DEFAULT_FORMATS,
  requesterId = "publish-activity-export-ui",
  blockedTitle = "Publish activity export access blocked",
  blockedSummary =
    "当前 publish activity export 已接入统一敏感访问控制；可先查看审批票据和关联 run，再决定是否继续导出。"
}: WorkflowPublishExportActionsProps) {
  const [activeFormat, setActiveFormat] =
    useState<PublishedEndpointInvocationExportFormat | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [blockedPayload, setBlockedPayload] =
    useState<SensitiveAccessBlockingPayload | null>(null);
  const sandboxPreflightHint = formatSandboxReadinessPreflightHint(sandboxReadiness);

  const exportOptions = useMemo<PublishedEndpointInvocationListOptions>(
    () => ({
      limit: EXPORT_LIMIT,
      status: activeInvocationFilter?.status ?? undefined,
      requestSource: activeInvocationFilter?.requestSource ?? undefined,
      requestSurface: activeInvocationFilter?.requestSurface ?? undefined,
      cacheStatus: activeInvocationFilter?.cacheStatus ?? undefined,
      runStatus: activeInvocationFilter?.runStatus ?? undefined,
      apiKeyId: activeInvocationFilter?.apiKeyId ?? undefined,
      reasonCode: activeInvocationFilter?.reasonCode ?? undefined,
      ...resolvePublishWindowRange(activeInvocationFilter?.timeWindow ?? "all")
    }),
    [activeInvocationFilter]
  );

  async function handleExport(format: PublishedEndpointInvocationExportFormat) {
    setActiveFormat(format);
    setSuccessMessage(null);
    setErrorMessage(null);
    setBlockedPayload(null);

    try {
      const exportUrl = new URL(
        buildPublishedEndpointInvocationExportUrl(
          workflowId,
          bindingId,
          exportOptions,
          format
        ),
        window.location.origin
      );
      exportUrl.searchParams.set("requester_id", requesterId);

      const response = await fetch(exportUrl.toString(), {
        cache: "no-store"
      });
      const blocked = await parseSensitiveAccessBlockingResponse(response);

      if (blocked) {
        setBlockedPayload(blocked.payload);
        return;
      }

      if (!response.ok) {
        setErrorMessage(await buildErrorMessage(response, format));
        return;
      }

      const blob = await response.blob();
      const filename = resolveFilename(
        response.headers.get("content-disposition"),
        bindingId,
        format
      );
      triggerDownload(blob, filename);
      setSuccessMessage(
        `${EXPORT_LABELS[format]} 已开始下载（最多 ${EXPORT_LIMIT} 条过滤后的 invocation）。`
      );
    } catch {
      setErrorMessage(`无法导出 ${format.toUpperCase()}，请确认 API 已启动。`);
    } finally {
      setActiveFormat(null);
    }
  }

  return (
    <>
      {formats.map((format) => (
        <button
          className="activity-link action-link-button"
          disabled={activeFormat !== null}
          key={format}
          onClick={() => void handleExport(format)}
          type="button"
        >
          {activeFormat === format ? `导出 ${format.toUpperCase()}...` : EXPORT_LABELS[format]}
        </button>
      ))}

      {sandboxPreflightHint ? (
        <p className="section-copy entry-copy trace-export-feedback">
          当前 activity export 只导出历史 invocation 事实；若要判断这个 binding 现在还能否继续承载
          strong-isolation 路径，仍要回到 live readiness 对照：{sandboxPreflightHint}
        </p>
      ) : null}

      {successMessage ? (
        <p className="sync-message success trace-export-feedback">{successMessage}</p>
      ) : null}

      {errorMessage ? (
        <p className="sync-message error trace-export-feedback">{errorMessage}</p>
      ) : null}

      {blockedPayload ? (
        <div className="trace-export-blocked">
          <SensitiveAccessBlockedCard
            payload={blockedPayload}
            summary={blockedSummary}
            title={blockedTitle}
          />
        </div>
      ) : null}
    </>
  );
}

async function buildErrorMessage(
  response: Response,
  format: PublishedEndpointInvocationExportFormat
) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: string }
      | null;
    if (payload?.detail) {
      return payload.detail;
    }
  }

  const text = await response.text().catch(() => "");
  if (text) {
    return text;
  }

  return `导出 ${format.toUpperCase()} 失败，API 返回 ${response.status}。`;
}

function resolveFilename(
  contentDisposition: string | null,
  bindingId: string,
  format: PublishedEndpointInvocationExportFormat
) {
  const match = contentDisposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? `${bindingId}-published-invocations.${format}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
}
