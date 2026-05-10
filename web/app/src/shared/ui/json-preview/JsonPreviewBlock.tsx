import {
  CheckOutlined,
  CopyOutlined,
  DownOutlined,
  FullscreenOutlined
} from '@ant-design/icons';
import { App, Button, Modal, Tooltip } from 'antd';
import type { ReactNode } from 'react';
import { Suspense, lazy, useMemo, useState } from 'react';

import { useClipboardCopy } from '../clipboard/use-clipboard-copy';
import './json-preview-block.css';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

const EDITOR_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  lineNumbersMinChars: 2,
  fontSize: 12,
  lineHeight: 18,
  folding: true,
  renderLineHighlight: 'none' as const,
  overviewRulerBorder: false,
  automaticLayout: true,
  padding: {
    top: 8,
    bottom: 8
  },
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8
  }
};

function formatJsonPreview(value: unknown) {
  const formatted = JSON.stringify(value, null, 2);

  return typeof formatted === 'string' ? formatted : String(formatted);
}

function JsonEditorFallback({ minHeight }: { minHeight: string }) {
  return (
    <div className="json-preview-block__loading" style={{ minHeight }}>
      正在加载 JSON 查看器
    </div>
  );
}

function JsonEditor({ height, value }: { height: string; value: string }) {
  return (
    <Suspense fallback={<JsonEditorFallback minHeight={height} />}>
      <MonacoEditor
        defaultLanguage="json"
        height={height}
        options={EDITOR_OPTIONS}
        theme="vs"
        value={value}
      />
    </Suspense>
  );
}

export function JsonPreviewBlock({
  title,
  value,
  actions,
  className,
  collapsible = true,
  copyAriaLabel,
  copyFailureMessage = '复制失败',
  copySuccessMessage = '已复制',
  defaultCollapsed = false,
  displayTitle = title,
  fullscreenAriaLabel,
  height = '220px'
}: {
  title: string;
  value: unknown;
  actions?: ReactNode;
  className?: string;
  collapsible?: boolean;
  copyAriaLabel?: string;
  copyFailureMessage?: string;
  copySuccessMessage?: string;
  defaultCollapsed?: boolean;
  displayTitle?: string;
  fullscreenAriaLabel?: string;
  height?: string;
}) {
  const { message } = App.useApp();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [expanded, setExpanded] = useState(false);
  const { copied, copy } = useClipboardCopy();
  const formattedValue = useMemo(() => formatJsonPreview(value), [value]);
  const isCollapsed = collapsible ? collapsed : false;

  const handleCopy = async () => {
    try {
      await copy(formattedValue);
      message.success(copySuccessMessage);
    } catch {
      message.error(copyFailureMessage);
    }
  };

  return (
    <section
      className={['json-preview-block', className].filter(Boolean).join(' ')}
    >
      <pre aria-label={`${title} JSON`} className="json-preview-block__a11y">
        {formattedValue}
      </pre>
      <div className="json-preview-block__header">
        <button
          aria-label={title}
          aria-expanded={collapsible ? !isCollapsed : undefined}
          className="json-preview-block__toggle"
          onClick={
            collapsible ? () => setCollapsed((current) => !current) : undefined
          }
          type="button"
        >
          {collapsible ? (
            <DownOutlined className="json-preview-block__toggle-icon" />
          ) : null}
          {displayTitle ? (
            <span className="json-preview-block__title">{displayTitle}</span>
          ) : null}
        </button>
        <div className="json-preview-block__actions">
          {actions}
          <Tooltip title="复制 JSON">
            <Button
              aria-label={copyAriaLabel ?? `复制${title} JSON`}
              icon={copied ? <CheckOutlined /> : <CopyOutlined />}
              onClick={handleCopy}
              size="small"
              type="text"
            />
          </Tooltip>
          <Tooltip title="放大查看">
            <Button
              aria-label={fullscreenAriaLabel ?? `放大查看${title} JSON`}
              disabled={isCollapsed}
              icon={<FullscreenOutlined />}
              onClick={() => setExpanded(true)}
              size="small"
              type="text"
            />
          </Tooltip>
        </div>
      </div>
      {!isCollapsed ? (
        <div className="json-preview-block__editor">
          <JsonEditor height={height} value={formattedValue} />
        </div>
      ) : null}
      <Modal
        centered
        className="json-preview-block-modal"
        footer={null}
        onCancel={() => setExpanded(false)}
        open={expanded}
        title={`${title} JSON`}
        width="min(960px, calc(100vw - 48px))"
      >
        <div className="json-preview-block-modal__editor">
          <JsonEditor height="70vh" value={formattedValue} />
        </div>
      </Modal>
    </section>
  );
}
