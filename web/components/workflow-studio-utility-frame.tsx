import React from "react";
import type { ReactNode } from "react";
import { Button, Card, Empty, Tag } from "antd";

export type WorkflowStudioUtilityMetric = {
  key: string;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  wide?: boolean;
};

export type WorkflowStudioUtilityAction = {
  key: string;
  href: string;
  label: string;
  variant?: "primary" | "default";
};

export type WorkflowStudioUtilityTag = {
  key: string;
  label: ReactNode;
  color?: string;
};

type WorkflowStudioUtilityFrameProps = {
  surface: string;
  eyebrow: string;
  title: string;
  description: ReactNode;
  metrics?: WorkflowStudioUtilityMetric[];
  actions?: WorkflowStudioUtilityAction[];
  tags?: WorkflowStudioUtilityTag[];
  notice?: ReactNode;
  className?: string;
  dataComponent?: string;
  children?: ReactNode;
};

type WorkflowStudioUtilityEmptyCardProps = {
  description: ReactNode;
  dataComponent?: string;
};

type WorkflowStudioUtilityEmptyStateProps = {
  surface: string;
  eyebrow: string;
  title: string;
  description: ReactNode;
  emptyDescription?: ReactNode;
  actions?: WorkflowStudioUtilityAction[];
  tags?: WorkflowStudioUtilityTag[];
  notice?: ReactNode;
  className?: string;
  dataComponent?: string;
};

function buildUtilityActionClassName(variant?: "primary" | "default") {
  return [
    "workflow-studio-utility-action",
    variant === "primary"
      ? "workflow-studio-utility-action-primary"
      : "workflow-studio-utility-action-default",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildUtilityTagClassName(color?: string) {
  return [
    "event-chip",
    "workflow-studio-utility-tag",
    `workflow-studio-utility-tag-${color ?? "default"}`,
  ]
    .filter(Boolean)
    .join(" ");
}

export function WorkflowStudioUtilityFrame({
  surface,
  eyebrow,
  title,
  description,
  metrics = [],
  actions = [],
  tags = [],
  notice = null,
  className = "",
  dataComponent = "workflow-studio-utility-frame",
  children = null,
}: WorkflowStudioUtilityFrameProps) {
  return (
    <div
      className={["workflow-studio-utility-frame", className].filter(Boolean).join(" ")}
      data-component={dataComponent}
      data-surface={surface}
    >
      <Card className="workflow-studio-utility-overview-card">
        <div className="workflow-studio-utility-overview-header">
          <div className="workflow-studio-utility-overview-copy">
            <span className="workflow-studio-utility-eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
            <p className="workflow-studio-utility-inline-copy">{description}</p>
          </div>

          {actions.length ? (
            <div
              className="workflow-studio-utility-action-row"
              data-component="workflow-studio-utility-actions"
            >
              {actions.map((action) => (
                <Button
                  className={buildUtilityActionClassName(action.variant)}
                  href={action.href}
                  key={action.key}
                  type={action.variant === "primary" ? "primary" : "default"}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        {tags.length ? (
          <div className="workflow-studio-utility-tag-row" data-component="workflow-studio-utility-tags">
            {tags.map((tag) => (
              <Tag
                className={buildUtilityTagClassName(tag.color)}
                color={tag.color && tag.color !== "default" ? tag.color : undefined}
                key={tag.key}
              >
                {tag.label}
              </Tag>
            ))}
          </div>
        ) : null}

        {notice ? <div className="workflow-studio-utility-notice">{notice}</div> : null}

        {metrics.length ? (
          <div className="workflow-studio-utility-stat-grid" data-component="workflow-studio-utility-metrics">
            {metrics.map((metric) => (
              <Card
                className={[
                  "workflow-studio-utility-stat-card",
                  metric.wide ? "workflow-studio-utility-stat-card-wide" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={metric.key}
                size="small"
              >
                <span className="workflow-studio-utility-metric-label">{metric.label}</span>
                <p className="workflow-studio-utility-metric-value">{metric.value}</p>
                {metric.detail ? (
                  <p className="workflow-studio-utility-metric-copy">{metric.detail}</p>
                ) : null}
              </Card>
            ))}
          </div>
        ) : null}
      </Card>

      {children}
    </div>
  );
}

export function WorkflowStudioUtilityEmptyCard({
  description,
  dataComponent = "workflow-studio-utility-empty-card",
}: WorkflowStudioUtilityEmptyCardProps) {
  return (
    <Card className="workflow-studio-utility-empty-card" data-component={dataComponent}>
      <Empty
        className="workflow-studio-utility-empty"
        description={<span className="workflow-studio-utility-empty-copy">{description}</span>}
      />
    </Card>
  );
}

export function WorkflowStudioUtilityEmptyState({
  surface,
  eyebrow,
  title,
  description,
  emptyDescription,
  actions = [],
  tags = [],
  notice = null,
  className = "",
  dataComponent = "workflow-studio-utility-empty-state",
}: WorkflowStudioUtilityEmptyStateProps) {
  return (
    <WorkflowStudioUtilityFrame
      actions={actions}
      className={className}
      dataComponent={dataComponent}
      description={description}
      eyebrow={eyebrow}
      notice={notice}
      surface={surface}
      tags={tags}
      title={title}
    >
      <WorkflowStudioUtilityEmptyCard
        dataComponent={`${dataComponent}-body`}
        description={emptyDescription ?? description}
      />
    </WorkflowStudioUtilityFrame>
  );
}
