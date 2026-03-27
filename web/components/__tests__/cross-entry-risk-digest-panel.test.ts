import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CrossEntryRiskDigestPanel } from "@/components/cross-entry-risk-digest-panel";
import { buildLegacyPublishAuthWorkflowHandoff } from "@/lib/legacy-publish-auth-governance-presenters";
import type { CrossEntryRiskDigest } from "@/lib/cross-entry-risk-digest";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

function buildDigest(): CrossEntryRiskDigest {
  const digest: CrossEntryRiskDigest = {
    tone: "blocked",
    headline: "当前最需要优先收口的是 Approval & notification backlog。",
    detail: "审批 backlog 仍在拖住 waiting resume 与发布排障。",
    metrics: [
      {
        label: "Approval",
        value: "2 pending / 2 waiting"
      }
    ],
    focusAreas: [
      {
        id: "operator",
        title: "Approval & notification backlog",
        tone: "blocked",
        summary: "2 个审批待处理，影响 2 个 run / 1 个 workflow。",
        nextStep: "优先先收掉 pending approval ticket 对应的审批票据，再回到具体 run。",
        entryKey: "operatorInbox",
        entryOverride: {
          href: "/sensitive-access?status=pending",
          label: "open inbox slice"
        }
      },
      {
        id: "sandbox",
        title: "Sandbox execution chain",
        tone: "degraded",
        summary: "至少一个 sandbox backend 仍 offline。",
        nextStep: "优先回到 workflow library 评估受影响的强隔离链路。",
        entryKey: "workflowLibrary",
        entryOverride: {
          href: "/workflows?execution=sandbox",
          label: "Open workflow library"
        }
      },
      {
        id: "callback",
        title: "Callback recovery automation",
        tone: "healthy",
        summary: "scheduler 已接管 waiting resume。",
        nextStep: "继续观察 waiting resume / cleanup。",
        entryKey: "runLibrary"
      }
    ],
    operatorWorkflowGovernanceHandoff: null,
    primaryFollowUpEntry: {
      entryKey: "operatorInbox",
      entryOverride: {
        href: "/sensitive-access?status=pending",
        label: "open inbox slice"
      }
    },
    primaryEntryKey: "operatorInbox",
    entryKeys: ["operatorInbox", "workflowLibrary", "runLibrary"],
    entryOverrides: {
      operatorInbox: {
        href: "/sensitive-access?status=pending",
        label: "open inbox slice"
      },
      workflowLibrary: {
        href: "/workflows?execution=sandbox",
        label: "Open workflow library"
      }
    }
  };

  return digest;
}

describe("CrossEntryRiskDigestPanel", () => {
  it("renders operator workflow governance handoff cards when digest exposes them", () => {
    const digest = buildDigest();
    const legacyAuthGovernance = buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
      binding: {
        workflow_id: "workflow-governed",
        workflow_name: "Governed workflow"
      }
    });
    digest.operatorWorkflowGovernanceHandoff = {
      workflowId: "workflow-governed",
      workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
      workflowCatalogGapDetail: "当前 operator backlog 对应的 workflow 仍有 catalog gap。",
      workflowCatalogGapHref: "/workflows/workflow-governed?definition_issue=missing_tool",
      workflowGovernanceHref: "/workflows/workflow-governed?definition_issue=legacy_publish_auth",
      legacyAuthHandoff: buildLegacyPublishAuthWorkflowHandoff(
        legacyAuthGovernance,
        "workflow-governed"
      )
    };

    const html = renderToStaticMarkup(
      createElement(CrossEntryRiskDigestPanel, {
        digest,
        intro: "cross-entry intro"
      })
    );

    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain("Legacy publish auth handoff");
    expect(html).toContain('href="/workflows/workflow-governed?definition_issue=missing_tool"');
    expect(html).toContain(
      'href="/workflows/workflow-governed?definition_issue=legacy_publish_auth"'
    );
    expect(html).toContain("回到 workflow 编辑器处理 catalog gap");
  });
  it("projects canonical CTA links into the primary follow-up and each focus area", () => {
    const html = renderToStaticMarkup(
      createElement(CrossEntryRiskDigestPanel, {
        digest: buildDigest(),
        intro: "统一展示跨入口 blocker。"
      })
    );

    expect(html).toContain("Primary follow-up");
    expect(html).toContain("open inbox slice");
    expect(html).toContain('/sensitive-access?status=pending');
    expect(html).toContain("Open workflow library");
    expect(html).toContain('/workflows?execution=sandbox');
    expect(html).toContain("查看 run diagnostics");
    expect(html).toContain('/runs');
  });

  it("drops self CTA links when the digest already points at the current scoped entry", () => {
    const html = renderToStaticMarkup(
      createElement(CrossEntryRiskDigestPanel, {
        digest: buildDigest(),
        intro: "统一展示跨入口 blocker。",
        currentHref: "/sensitive-access?status=pending"
      })
    );

    expect(html).toContain("open inbox slice");
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('href="/sensitive-access?status=pending"');
    expect(html).toContain('href="/workflows?execution=sandbox"');
  });

  it("drops workflow governance self links when the digest already points at the current workflow handoff", () => {
    const digest = buildDigest();
    digest.operatorWorkflowGovernanceHandoff = {
      workflowId: "workflow-governed",
      workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
      workflowCatalogGapDetail: "当前 operator backlog 对应的 workflow 仍有 catalog gap。",
      workflowCatalogGapHref: "/workflows/workflow-governed?definition_issue=missing_tool",
      workflowGovernanceHref: "/workflows/workflow-governed?definition_issue=legacy_publish_auth",
      legacyAuthHandoff: null
    };

    const html = renderToStaticMarkup(
      createElement(CrossEntryRiskDigestPanel, {
        digest,
        intro: "统一展示跨入口 blocker。",
        currentHref: "/workflows/workflow-governed?definition_issue=missing_tool"
      })
    );

    expect(html).toContain("回到 workflow 编辑器处理 catalog gap");
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('href="/workflows/workflow-governed?definition_issue=missing_tool"');
  });

});
