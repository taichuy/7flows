import { Button } from 'antd';
import type { CSSProperties, ReactNode } from 'react';

import type { DockPanelSchema } from '../contracts/overlay-shell-schema';

export function SchemaDockPanel({
  schema,
  width,
  children,
  footer,
  onClose,
  className,
  bodyClassName,
  headerExtra,
  style
}: {
  schema: DockPanelSchema;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  className?: string;
  bodyClassName?: string;
  headerExtra?: ReactNode;
  style?: CSSProperties;
}) {
  const resolvedWidth = width ?? schema.width;

  return (
    <aside
      aria-label={schema.title}
      className={className}
      style={{
        ...style,
        ...(resolvedWidth != null ? { width: `${resolvedWidth}px` } : {})
      }}
    >
      <header>
        <div>{schema.title}</div>
        {headerExtra}
        {onClose ? (
          <Button aria-label={`关闭${schema.title}`} type="text" onClick={onClose}>
            关闭
          </Button>
        ) : null}
      </header>
      <div className={bodyClassName}>{children}</div>
      {footer ? <footer>{footer}</footer> : null}
    </aside>
  );
}
