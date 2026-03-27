import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidateOperatorFollowUpByRunIds } from "@/app/actions/operator-follow-up-revalidation";
import { fetchRunSnapshots } from "@/app/actions/run-snapshot";

const { revalidatePath } = vi.hoisted(() => ({
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath
}));

vi.mock("@/app/actions/run-snapshot", () => ({
  fetchRunSnapshots: vi.fn()
}));

describe("revalidateOperatorFollowUpByRunIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("优先复用后端 sampled runs 中已覆盖的 workflowId", async () => {
    await revalidateOperatorFollowUpByRunIds(["run-1", "run-2"], {
      sampledRuns: [
        {
          runId: "run-1",
          snapshot: {
            workflowId: "wf-1"
          }
        },
        {
          runId: "run-2",
          snapshot: {
            workflowId: "wf-2"
          }
        }
      ]
    });

    expect(fetchRunSnapshots).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/sensitive-access");
    expect(revalidatePath).toHaveBeenCalledWith("/runs/run-1");
    expect(revalidatePath).toHaveBeenCalledWith("/runs/run-2");
    expect(revalidatePath).toHaveBeenCalledWith("/workflows/wf-1");
    expect(revalidatePath).toHaveBeenCalledWith("/workflows/wf-2");
  });

  it("只为缺失 workflowId 的 run 补拉快照", async () => {
    vi.mocked(fetchRunSnapshots).mockResolvedValue([
      {
        runId: "run-2",
        snapshot: {
          workflowId: "wf-2"
        }
      },
      {
        runId: "run-3",
        snapshot: {
          workflowId: "wf-3"
        }
      }
    ]);

    await revalidateOperatorFollowUpByRunIds(["run-1", "run-2", "run-3"], {
      sampledRuns: [
        {
          runId: "run-1",
          snapshot: {
            workflowId: "wf-1"
          }
        },
        {
          runId: "run-2",
          snapshot: null
        }
      ]
    });

    expect(fetchRunSnapshots).toHaveBeenCalledWith(["run-2", "run-3"], 2);
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/sensitive-access");
    expect(revalidatePath).toHaveBeenCalledWith("/runs/run-1");
    expect(revalidatePath).toHaveBeenCalledWith("/runs/run-2");
    expect(revalidatePath).toHaveBeenCalledWith("/runs/run-3");
    expect(revalidatePath).toHaveBeenCalledWith("/workflows/wf-1");
    expect(revalidatePath).toHaveBeenCalledWith("/workflows/wf-2");
    expect(revalidatePath).toHaveBeenCalledWith("/workflows/wf-3");
  });
});
