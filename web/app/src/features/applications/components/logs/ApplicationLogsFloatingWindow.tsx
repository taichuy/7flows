import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react';

type FloatingWindowRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ApplicationLogsFloatingWindowProps = {
  active: boolean;
  children: ReactNode;
  className?: string;
  minHeight?: number;
  minWidth?: number;
  testId: string;
  title: string;
  initialRect: () => FloatingWindowRect;
  onActivate: () => void;
};

const FLOATING_WINDOW_MARGIN = 8;
const DEFAULT_MIN_WIDTH = 360;
const DEFAULT_MIN_HEIGHT = 320;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getViewportSize() {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 720 };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

function clampRect(
  rect: FloatingWindowRect,
  minWidth: number,
  minHeight: number
): FloatingWindowRect {
  const viewport = getViewportSize();
  const maxWidth = Math.max(
    minWidth,
    viewport.width - FLOATING_WINDOW_MARGIN * 2
  );
  const maxHeight = Math.max(
    minHeight,
    viewport.height - FLOATING_WINDOW_MARGIN * 2
  );
  const width = clamp(rect.width, minWidth, maxWidth);
  const height = clamp(rect.height, minHeight, maxHeight);
  const maxLeft = Math.max(
    FLOATING_WINDOW_MARGIN,
    viewport.width - width - FLOATING_WINDOW_MARGIN
  );
  const maxTop = Math.max(
    FLOATING_WINDOW_MARGIN,
    viewport.height - height - FLOATING_WINDOW_MARGIN
  );

  return {
    left: clamp(rect.left, FLOATING_WINDOW_MARGIN, maxLeft),
    top: clamp(rect.top, FLOATING_WINDOW_MARGIN, maxTop),
    width,
    height
  };
}

function isInteractiveElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      'button, a, input, textarea, select, [role="button"], [role="tab"], [data-no-window-drag="true"]'
    )
  );
}

function getDragHeader(target: EventTarget | null, container: HTMLElement) {
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  const header = target.closest<HTMLElement>(
    '.agent-flow-editor__dock-panel-header, .application-run-detail__header'
  );

  if (!header || !container.contains(header)) {
    return null;
  }

  return header;
}

export function ApplicationLogsFloatingWindow({
  active,
  children,
  className,
  minHeight = DEFAULT_MIN_HEIGHT,
  minWidth = DEFAULT_MIN_WIDTH,
  testId,
  title,
  initialRect,
  onActivate
}: ApplicationLogsFloatingWindowProps) {
  const [rect, setRect] = useState(() =>
    clampRect(initialRect(), minWidth, minHeight)
  );
  const cleanupInteractionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    function handleViewportResize() {
      setRect((current) => clampRect(current, minWidth, minHeight));
    }

    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, [minHeight, minWidth]);

  useEffect(() => {
    return () => {
      cleanupInteractionRef.current?.();
    };
  }, []);

  function startDrag(event: ReactMouseEvent<HTMLDivElement>) {
    onActivate();

    if (
      event.button !== 0 ||
      isInteractiveElement(event.target) ||
      !getDragHeader(event.target, event.currentTarget)
    ) {
      return;
    }

    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = rect;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    cleanupInteractionRef.current?.();
    document.body.style.cursor = 'move';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setRect((current) =>
        clampRect(
          {
            ...current,
            left: startRect.left + moveEvent.clientX - startX,
            top: startRect.top + moveEvent.clientY - startY
          },
          minWidth,
          minHeight
        )
      );
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      cleanupInteractionRef.current = null;
    };

    cleanupInteractionRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
  }

  function startWidthResize(
    edge: 'left' | 'right',
    event: ReactMouseEvent<HTMLDivElement>
  ) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    onActivate();

    const startX = event.clientX;
    const startLeft = rect.left;
    const startWidth = rect.width;
    const startRight = startLeft + startWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    cleanupInteractionRef.current?.();
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const nextLeft =
        edge === 'left'
          ? clamp(
              startLeft + deltaX,
              FLOATING_WINDOW_MARGIN,
              startRight - minWidth
            )
          : startLeft;

      setRect((current) =>
        clampRect(
          edge === 'left'
            ? {
                ...current,
                left: nextLeft,
                width: startRight - nextLeft
              }
            : {
                ...current,
                width: startWidth + deltaX
              },
          minWidth,
          minHeight
        )
      );
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      cleanupInteractionRef.current = null;
    };

    cleanupInteractionRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
  }

  function startHeightResize(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    onActivate();

    const startY = event.clientY;
    const startHeight = rect.height;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    cleanupInteractionRef.current?.();
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setRect((current) =>
        clampRect(
          {
            ...current,
            height: startHeight + moveEvent.clientY - startY
          },
          minWidth,
          minHeight
        )
      );
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      cleanupInteractionRef.current = null;
    };

    cleanupInteractionRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
  }

  const style: CSSProperties = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    zIndex: active ? 1051 : 1050
  };

  return (
    <div
      aria-label={title}
      aria-modal="false"
      className={['application-logs-floating-window', className]
        .filter(Boolean)
        .join(' ')}
      data-testid={testId}
      role="dialog"
      style={style}
      onMouseDownCapture={startDrag}
    >
      <div className="application-logs-floating-window__body">{children}</div>
      <div
        aria-label={`从右侧调整${title}宽度`}
        aria-orientation="vertical"
        className="application-logs-floating-window__resize application-logs-floating-window__resize--right"
        role="separator"
        onMouseDown={(event) => startWidthResize('right', event)}
      />
      <div
        aria-label={`从左侧调整${title}宽度`}
        aria-orientation="vertical"
        className="application-logs-floating-window__resize application-logs-floating-window__resize--left"
        role="separator"
        onMouseDown={(event) => startWidthResize('left', event)}
      />
      <div
        aria-label={`向下调整${title}高度`}
        aria-orientation="horizontal"
        className="application-logs-floating-window__resize application-logs-floating-window__resize--bottom"
        role="separator"
        onMouseDown={startHeightResize}
      />
    </div>
  );
}
