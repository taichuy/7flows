import { afterEach, describe, expect, it, vi } from "vitest";

import { getSystemOverview } from "./get-system-overview";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

describe("getSystemOverview", () => {
  afterEach(() => {
    fetchMock.mockReset();
  });

  it("normalizes recommended action entry key aliases at ingestion", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "healthy",
        environment: "local",
        sandbox_readiness: {
          recommended_action: {
            kind: "open_run_library",
            entry_key: "runs",
            href: " /runs?focus=callback-waiting ",
            label: " Open run library "
          }
        },
        callback_waiting_automation: {
          recommended_action: {
            kind: "open_workflow_library",
            entry_key: " workflow_library ",
            href: "/workflows?execution=sandbox",
            label: "Open workflow library"
          }
        }
      })
    });

    const overview = await getSystemOverview();

    expect(overview.sandbox_readiness.recommended_action).toEqual({
      kind: "open_run_library",
      entry_key: "runLibrary",
      href: "/runs?focus=callback-waiting",
      label: "Open run library"
    });
    expect(overview.callback_waiting_automation.recommended_action).toEqual({
      kind: "open_workflow_library",
      entry_key: "workflowLibrary",
      href: "/workflows?execution=sandbox",
      label: "Open workflow library"
    });
  });

  it("drops invalid recommended actions instead of leaking unknown entry keys", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        sandbox_readiness: {
          recommended_action: {
            kind: "open_unknown",
            entry_key: "unknown_entry",
            href: "/mystery",
            label: "Mystery"
          }
        },
        callback_waiting_automation: {
          recommended_action: {
            kind: " ",
            entry_key: "runLibrary",
            href: "/runs",
            label: "Open run library"
          }
        }
      })
    });

    const overview = await getSystemOverview();

    expect(overview.sandbox_readiness.recommended_action).toBeNull();
    expect(overview.callback_waiting_automation.recommended_action).toBeNull();
  });
});
