import React from "react";
import Link from "next/link";
import {
  resolveWorkbenchEntryLink,
  resolveWorkbenchEntryLinks,
  type WorkbenchEntryLinkKey,
  type WorkbenchEntryLinkOverride,
  type WorkbenchEntryLinkOverrides
} from "@/lib/workbench-entry-links";

export {
  resolveWorkbenchEntryLink,
  resolveWorkbenchEntryLinks
} from "@/lib/workbench-entry-links";

export type {
  WorkbenchEntryLinkDefinition,
  WorkbenchEntryLinkKey,
  WorkbenchEntryLinkOverride,
  WorkbenchEntryLinkOverrides,
  WorkbenchEntryLinksConfig
} from "@/lib/workbench-entry-links";

type WorkbenchEntryLinksProps = {
  keys: WorkbenchEntryLinkKey[];
  overrides?: WorkbenchEntryLinkOverrides;
  variant?: "hero" | "inline";
  primaryKey?: WorkbenchEntryLinkKey;
  currentHref?: string | null;
};

type WorkbenchEntryLinkProps = {
  linkKey: WorkbenchEntryLinkKey;
  override?: WorkbenchEntryLinkOverride;
  className?: string;
  children?: React.ReactNode;
  currentHref?: string | null;
};

function normalizeRelativeHref(href?: string | null) {
  const normalized = href?.trim();
  if (!normalized) {
    return null;
  }

  const url = new URL(normalized, "https://sevenflows.local");
  const sortedParams = [...url.searchParams.entries()].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) {
        return leftValue.localeCompare(rightValue);
      }

      return leftKey.localeCompare(rightKey);
    }
  );
  const params = new URLSearchParams();

  for (const [key, value] of sortedParams) {
    params.append(key, value);
  }

  const query = params.toString();

  return query ? `${url.pathname}?${query}` : url.pathname;
}

function isCurrentWorkbenchHref(href?: string | null, currentHref?: string | null) {
  const normalizedHref = normalizeRelativeHref(href);
  const normalizedCurrentHref = normalizeRelativeHref(currentHref);

  return Boolean(normalizedHref && normalizedCurrentHref && normalizedHref === normalizedCurrentHref);
}

export function WorkbenchEntryLink({
  linkKey,
  override,
  className = "inline-link",
  children,
  currentHref = null
}: WorkbenchEntryLinkProps) {
  const link = resolveWorkbenchEntryLink(linkKey, override);

  if (isCurrentWorkbenchHref(link.href, currentHref)) {
    return (
      <span aria-current="page" className={className}>
        {children ?? link.label}
      </span>
    );
  }

  return (
    <Link className={className} href={link.href}>
      {children ?? link.label}
    </Link>
  );
}

export function WorkbenchEntryLinks({
  keys,
  overrides,
  variant = "hero",
  primaryKey,
  currentHref = null
}: WorkbenchEntryLinksProps) {
  const links = resolveWorkbenchEntryLinks(keys, overrides);

  return (
    <div className={variant === "hero" ? "hero-actions" : "section-actions"}>
      {links.map((link, index) => {
        const className =
          variant === "hero"
            ? "ghost-button"
            : link.key === primaryKey || (!primaryKey && index === 0)
              ? "inline-link"
              : "inline-link secondary";

        return isCurrentWorkbenchHref(link.href, currentHref) ? (
          <span
            aria-current="page"
            className={className}
            key={`${variant}-${link.key}-${link.href}`}
          >
            {link.label}
          </span>
        ) : (
          <Link className={className} href={link.href} key={`${variant}-${link.key}-${link.href}`}>
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
