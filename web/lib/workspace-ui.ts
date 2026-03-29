export function getWorkspaceBadgeLabel(value: string, fallback = "7") {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return fallback;
  }

  return Array.from(normalizedValue)[0]?.toUpperCase() ?? fallback;
}

export function getWorkspaceAppSurface({
  followUpCount,
  healthLabel,
  missingToolCount,
  publishCount,
  status
}: {
  followUpCount: number;
  healthLabel: string;
  missingToolCount: number;
  publishCount: number;
  status: string;
}) {
  const publishLabel = publishCount > 0 ? `${publishCount} 个发布端点` : "未发布";

  if (followUpCount > 0) {
    return {
      detailToggleLabel: "查看治理细节",
      digest: `治理优先：${followUpCount} 项待处理。`,
      publishLabel,
      showDetailPanel: true,
      signalLabel: `${followUpCount} 个治理待办`,
      statusLabel: status === "published" ? "已发布" : "草稿",
      statusTone: status === "published" ? "healthy" : "draft"
    } as const;
  }

  if (missingToolCount > 0) {
    return {
      detailToggleLabel: "查看工具缺口",
      digest: `先补齐 ${missingToolCount} 个工具缺口，再进入 Studio。`,
      publishLabel,
      showDetailPanel: true,
      signalLabel: `${missingToolCount} 个工具缺口`,
      statusLabel: status === "published" ? "已发布" : "草稿",
      statusTone: status === "published" ? "healthy" : "draft"
    } as const;
  }

  if (status === "published") {
    return {
      detailToggleLabel: null,
      digest: "已发布，可继续从 Studio 维护版本。",
      publishLabel,
      showDetailPanel: false,
      signalLabel: healthLabel,
      statusLabel: "已发布",
      statusTone: "healthy"
    } as const;
  }

  return {
    detailToggleLabel: null,
    digest: "草稿已就绪，继续进入 xyflow。",
    publishLabel,
    showDetailPanel: false,
    signalLabel: healthLabel,
    statusLabel: "草稿",
    statusTone: "draft"
  } as const;
}
