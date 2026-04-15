import { Button, Drawer, List, Space, Tag, Typography } from 'antd';

import type { AgentFlowIssue } from '../../lib/validate-document';

interface IssuesDrawerProps {
  open: boolean;
  onClose: () => void;
  issues: AgentFlowIssue[];
  onSelectIssue: (issue: AgentFlowIssue) => void;
}

export function IssuesDrawer({
  open,
  onClose,
  issues,
  onSelectIssue
}: IssuesDrawerProps) {
  return (
    <Drawer open={open} placement="right" title="Issues" width={360} onClose={onClose}>
      <List
        dataSource={issues}
        locale={{ emptyText: '当前草稿没有静态问题' }}
        renderItem={(issue) => (
          <List.Item>
            <Space direction="vertical" size={4}>
              <Button type="link" onClick={() => onSelectIssue(issue)}>
                {issue.title}
              </Button>
              <Space size={8}>
                <Tag color={issue.level === 'error' ? 'red' : 'gold'}>
                  {issue.level === 'error' ? '错误' : '警告'}
                </Tag>
                {issue.sectionKey ? <Tag>{issue.sectionKey}</Tag> : null}
              </Space>
              <Typography.Text type="secondary">{issue.message}</Typography.Text>
            </Space>
          </List.Item>
        )}
      />
    </Drawer>
  );
}
