"use client";

import { useState } from "react";

import { SensitiveAccessBlockedCard } from "@/components/sensitive-access-blocked-card";
import {
  buildRunTraceExportUrl,
  type RunTraceQuery
} from "@/lib/get-run-trace";
import {
  parseSensitiveAccessBlockingResponse,
  type SensitiveAccessBlockingPayload
} from "@/lib/sensitive-access";

type RunTraceExportFormat = "json" | "jsonl";

type RunTraceExportActionsProps = {
  runId: string;
  query: RunTraceQuery;
  formats?: RunTraceExportFormat[];
  requesterId?: string;
  blockedTitle?: string;
  blockedSummary?: string;
};

const DEFAULT_FORMATS: RunTraceExportFormat[] = ["json", "jsonl"];

const EXPORT_LABELS: Record<RunTraceExportFormat, string> = {
  json: "导出 trace JSON",
  jsonl: "导出 trace JSONL"
};

export function RunTraceExportActions({
  runId,
  query,
  formats = DEFAULT_FORMATS,
  requesterId = "run-diagnostics-export-ui",
  blockedTitle = "Trace export access blocked",
  blockedSummary =
    "当前 trace export 已接入统一敏感访问控制；可先查看审批票据和关联 run，再决定是否继续申请导出。"
}: RunTraceExportActionsProps) {
  const [activeFormat, setActiveFormat] = useState<RunTraceExportFormat | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [blockedPayload, setBlockedPayload] =
    useState<SensitiveAccessBlockingPayload | null>(null);

  async function handleExport(format: RunTraceExportFormat) {
    setActiveFormat(format);
    setSuccessMessage(null);
    setErrorMessage(null);
    setBlockedPayload(null);

    try {
      const exportUrl = new URL(buildRunTraceExportUrl(runId, query, format), window.location.origin);
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
        runId,
        format
      );
      triggerDownload(blob, filename);
      setSuccessMessage(`${EXPORT_LABELS[format]} 已开始下载。`);
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
  format: RunTraceExportFormat
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
  runId: string,
  format: RunTraceExportFormat
) {
  const match = contentDisposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? `${runId}-trace.${format}`;
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
