import { Button, Drawer, List } from 'antd';

interface VersionHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  versions: Array<{
    id: string;
    sequence: number;
    trigger: 'autosave' | 'restore';
    change_kind: 'logical';
    summary: string;
    created_at: string;
  }>;
  restoring: boolean;
  onRestore: (versionId: string) => Promise<unknown>;
}

export function VersionHistoryDrawer({
  open,
  onClose,
  versions,
  restoring,
  onRestore
}: VersionHistoryDrawerProps) {
  return (
    <Drawer
      getContainer={false}
      open={open}
      placement="right"
      title="历史版本"
      width={420}
      onClose={onClose}
    >
      <List
        dataSource={versions}
        locale={{ emptyText: '当前还没有可恢复的历史版本' }}
        renderItem={(version) => (
          <List.Item
            actions={[
              <Button
                key={version.id}
                loading={restoring}
                onClick={() => {
                  void onRestore(version.id);
                }}
              >
                恢复版本 {version.sequence}
              </Button>
            ]}
          >
            <List.Item.Meta
              title={`版本 ${version.sequence}`}
              description={`${version.summary} · ${version.created_at}`}
            />
          </List.Item>
        )}
      />
    </Drawer>
  );
}
