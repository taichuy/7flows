import { describe, expect, it } from "vitest";

import LoginPage from "@/app/login/page";
import WorkspacePage from "@/app/workspace/page";
import WorkflowsPage from "@/app/workflows/page";
import WorkflowCreatePage from "@/app/workflows/new/page";
import WorkflowDetailPage from "@/app/workflows/[workflowId]/page";

describe("author route page exports", () => {
  it.each([
    ["/login", LoginPage],
    ["/workspace", WorkspacePage],
    ["/workflows", WorkflowsPage],
    ["/workflows/new", WorkflowCreatePage],
    ["/workflows/[workflowId]", WorkflowDetailPage]
  ])("keeps %s exported as a page component", (_routePath, PageComponent) => {
    expect(PageComponent).toBeTypeOf("function");
  });
});
