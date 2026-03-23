import type { RunCallbackTicketItem } from "@/lib/get-run-views";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import type { OperatorRecommendedActionLike } from "@/lib/operator-follow-up-presenters";

export type CallbackWaitingSummaryProps = {
  currentHref?: string | null;
  inboxHref?: string | null;
  callbackTickets?: RunCallbackTicketItem[];
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sensitiveAccessEntries?: SensitiveAccessTimelineEntry[];
  suppressSensitiveAccessContextRows?: boolean;
  showSensitiveAccessInlineActions?: boolean;
  recommendedAction?: OperatorRecommendedActionLike | null;
  operatorFollowUp?: string | null;
  preferCanonicalRecommendedNextStep?: boolean;
};
