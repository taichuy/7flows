import { MoreOutlined } from '@ant-design/icons';
import { Button, Dropdown } from 'antd';

export function NodeActionMenu({
  onLocate,
  onCopy
}: {
  onLocate: () => void;
  onCopy: () => void;
}) {
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          {
            key: 'locate',
            label: '定位节点',
            onClick: onLocate
          },
          {
            key: 'copy',
            label: '复制节点',
            onClick: onCopy
          }
        ]
      }}
    >
      <Button aria-label="更多操作" icon={<MoreOutlined />} type="text" />
    </Dropdown>
  );
}
