import { ArrowUpOutlined } from '@ant-design/icons';
import { Button, Input } from 'antd';
import { useState } from 'react';

export function DebugComposer({
  value,
  disabled,
  submitting,
  onChange,
  onSubmit
}: {
  value: string;
  disabled: boolean;
  submitting: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const [isComposing, setIsComposing] = useState(false);

  return (
    <div className="agent-flow-editor__debug-composer">
      <Input.TextArea
        autoSize={{ minRows: 2, maxRows: 6 }}
        placeholder="输入调试消息..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        onKeyDown={(event) => {
          // 中文输入法组合态期间不能把 Enter 误判成发送。
          if (
            event.key !== 'Enter' ||
            event.shiftKey ||
            isComposing ||
            event.nativeEvent.isComposing
          ) {
            return;
          }

          event.preventDefault();

          if (disabled || submitting) {
            return;
          }

          onSubmit();
        }}
      />
      <Button
        aria-label="发送调试消息"
        className="agent-flow-editor__debug-composer-submit"
        disabled={disabled}
        icon={<ArrowUpOutlined />}
        loading={submitting}
        type="primary"
        onClick={onSubmit}
      />
    </div>
  );
}
