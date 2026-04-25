import type { ReactNode } from 'react';

import { Typography } from 'antd';

import './settings-section-surface.css';

export function SettingsSectionSurface({
  title,
  description,
  children,
  titleLevel = 3,
  headerActions,
  toolbar,
  status
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  titleLevel?: 2 | 3 | 4 | 5;
  headerActions?: ReactNode;
  toolbar?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <section
      className="settings-section-surface"
      data-testid="settings-section-surface"
    >
      <header className="settings-section-surface__hero">
        <div className="settings-section-surface__hero-copy">
          <Typography.Title
            level={titleLevel}
            className="settings-section-surface__title"
          >
            {title}
          </Typography.Title>
          {description ? (
            <Typography.Paragraph className="settings-section-surface__description">
              {description}
            </Typography.Paragraph>
          ) : null}
        </div>

        {headerActions ? (
          <div className="settings-section-surface__hero-actions">
            {headerActions}
          </div>
        ) : null}
      </header>

      {toolbar ? (
        <div className="settings-section-surface__toolbar">{toolbar}</div>
      ) : null}

      {status ? (
        <div className="settings-section-surface__status">{status}</div>
      ) : null}

      <div className="settings-section-surface__body">{children}</div>
    </section>
  );
}
