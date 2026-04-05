import { describe, expect, it, vi } from "vitest";

import WorkflowsPage from "@/app/workflows/page";

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  }
}));
describe("WorkflowsPage shell", () => {
  it("redirects the legacy workflows index to workspace", async () => {
    await expect(
      WorkflowsPage({
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrowError("redirect:/workspace");
  });

  it("keeps legacy search params when redirecting to workspace", async () => {
    await expect(
      WorkflowsPage({
        searchParams: Promise.resolve({
          mode: "agent",
          keyword: "Alpha"
        })
      })
    ).rejects.toThrowError("redirect:/workspace?mode=agent&keyword=Alpha");
  });
});
