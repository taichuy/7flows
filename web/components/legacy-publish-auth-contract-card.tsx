import React from "react";

import {
  formatLegacyPublishAuthModes,
  resolveLegacyPublishAuthModeContract
} from "@/lib/legacy-publish-auth-contract";
import type { WorkflowPublishedEndpointLegacyAuthModeContract } from "@/lib/workflow-publish-types";

type LegacyPublishAuthContractCardProps = {
  contract?: WorkflowPublishedEndpointLegacyAuthModeContract | null;
  title?: string;
};

export function LegacyPublishAuthContractCard({
  contract = null,
  title = "Publish auth contract"
}: LegacyPublishAuthContractCardProps) {
  const surface = resolveLegacyPublishAuthModeContract(contract);

  return (
    <article className="payload-card compact-card">
      <div className="payload-card-header">
        <span className="status-meta">{title}</span>
        <span className="event-chip">
          supported {formatLegacyPublishAuthModes(surface.supported_auth_modes)}
        </span>
        <span className="event-chip">
          legacy {formatLegacyPublishAuthModes(surface.retired_legacy_auth_modes)}
        </span>
      </div>
      <p className="binding-meta">{surface.summary}</p>
      <p className="section-copy entry-copy">{surface.follow_up}</p>
    </article>
  );
}
