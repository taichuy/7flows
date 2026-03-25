import type { RunCallbackTicketItem } from "@/lib/get-run-views";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import type { CallbackWaitingSensitiveAccessSummaryLike } from "@/lib/callback-waiting-presenters";
import type { LegacyPublishAuthWorkflowHandoff } from "@/lib/legacy-publish-auth-governance-presenters";
import type { OperatorRecommendedActionLike } from "@/lib/operator-follow-up-presenters";

export type CallbackWaitingSummaryProps = {
  currentHref?: string | null;
  inboxHref?: string | null;
  callbackTickets?: RunCallbackTicketItem[];
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sensitiveAccessEntries?: SensitiveAccessTimelineEntry[];
  sensitiveAccessSummary?: CallbackWaitingSensitiveAccessSummaryLike | null;
  suppressSensitiveAccessContextRows?: boolean;
  showSensitiveAccessInlineActions?: boolean;
  recommendedAction?: OperatorRecommendedActionLike | null;
  operatorFollowUp?: string | null;
  preferCanonicalRecommendedNextStep?: boolean;
  workflowCatalogGapSummary?: string | null;
  workflowCatalogGapDetail?: string | null;
  workflowGovernanceHref?: string | null;
  legacyAuthHandoff?: LegacyPublishAuthWorkflowHandoff | null;
};
