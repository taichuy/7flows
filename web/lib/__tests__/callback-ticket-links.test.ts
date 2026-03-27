import { describe, expect, it } from "vitest";

import { buildCallbackTicketInboxHref } from "@/lib/callback-ticket-links";

describe("buildCallbackTicketInboxHref", () => {
  it("prefers explicit canonical scope over ticket scope", () => {
    const href = buildCallbackTicketInboxHref(
      {
        run_id: "run-stale",
        node_run_id: "node-stale"
      },
      {
        runId: "run-current",
        nodeRunId: "node-current"
      }
    );

    expect(href).toBe("/sensitive-access?run_id=run-current&node_run_id=node-current");
  });

  it("falls back to the ticket scope when canonical scope is absent", () => {
    const href = buildCallbackTicketInboxHref({
      run_id: "run-ticket",
      node_run_id: "node-ticket"
    });

    expect(href).toBe("/sensitive-access?run_id=run-ticket&node_run_id=node-ticket");
  });
});
