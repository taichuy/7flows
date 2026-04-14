import { useEffect, useState } from 'react';

import { KeyOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Layout, Menu, Result, Space, Spin, Typography } from 'antd';

import { useAuthStore } from '../../../state/auth-store';
import { signOut } from '../../auth/api/session';
import {
  changeMyPassword,
  fetchMyProfile,
  updateMyProfile
} from '../api/me';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { ProfileForm } from '../components/ProfileForm';

const { Sider, Content } = Layout;

function getErrorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

export function MePage() {
  const navigate = useNavigate();
  const sessionStatus = useAuthStore((state) => state.sessionStatus);
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const actor = useAuthStore((state) => state.actor);
  const me = useAuthStore((state) => state.me);
  const setMe = useAuthStore((state) => state.setMe);
  const setAnonymous = useAuthStore((state) => state.setAnonymous);

  const [selectedKey, setSelectedKey] = useState('profile');

  const profileQuery = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: fetchMyProfile,
    enabled: sessionStatus === 'authenticated' && me === null
  });

  useEffect(() => {
    if (profileQuery.data) {
      setMe(profileQuery.data);
    }
  }, [profileQuery.data, setMe]);

  const profileMutation = useMutation({
    mutationFn: async (input: Parameters<typeof updateMyProfile>[0]) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return updateMyProfile(input, csrfToken);
    },
    onSuccess: (updatedProfile) => {
      setMe(updatedProfile);
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (input: Parameters<typeof changeMyPassword>[0]) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      await changeMyPassword(input, csrfToken);
    },
    onSuccess: async () => {
      setAnonymous();
      await navigate({ to: '/sign-in' });
    }
  });

  const handleMenuClick = async ({ key }: { key: string }) => {
    if (key === 'signout') {
      try {
        if (csrfToken) {
          await signOut(csrfToken);
        }
      } finally {
        setAnonymous();
        await navigate({ to: '/sign-in' });
      }
    } else {
      setSelectedKey(key);
    }
  };

  const currentProfile = profileQuery.data ?? me;

  if (profileQuery.isLoading) {
    return <Spin tip="正在加载个人资料..." />;
  }

  if (!currentProfile || !actor) {
    return (
      <Result
        status="warning"
        title="个人资料不可用"
        subTitle="当前会话缺少必要的用户上下文，请重新登录后重试。"
      />
    );
  }

  return (
    <Layout style={{ background: 'transparent', margin: '-28px 0 -64px 0', minHeight: 'calc(100vh - 56px)' }}>
      <Sider
        width={240}
        style={{
          background: 'transparent',
          position: 'fixed',
          left: 0,
          top: 56,
          bottom: 0,
          zIndex: 10
        }}
      >
        <Typography.Title level={4} style={{ padding: '0 24px', marginBottom: 24, marginTop: 24 }}>
          我的
        </Typography.Title>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={handleMenuClick}
          style={{ borderRight: 0, background: 'transparent' }}
          items={[
            { 
              key: 'profile', 
              icon: <UserOutlined />, 
              label: '个人信息',
              style: selectedKey === 'profile' ? { background: '#e6f7f2', color: '#00d084', borderRadius: '8px', margin: '0 16px' } : { margin: '0 16px', borderRadius: '8px' }
            },
            { 
              key: 'password', 
              icon: <KeyOutlined />, 
              label: '修改密码',
              style: selectedKey === 'password' ? { background: '#e6f7f2', color: '#00d084', borderRadius: '8px', margin: '4px 16px' } : { margin: '4px 16px', borderRadius: '8px' }
            },
            { type: 'divider', style: { margin: '16px 16px', borderColor: 'transparent' } },
            { 
              key: 'signout', 
              icon: <LogoutOutlined />, 
              label: '退出登录', 
              danger: true,
              style: { margin: '0 16px', color: '#ff4d4f', borderRadius: '8px' }
            }
          ]}
        />
      </Sider>
      <Content style={{ padding: '32px 48px', background: 'transparent', marginLeft: 'calc(240px - max(0px, (100vw - min(1200px, calc(100vw - 48px))) / 2))', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 800 }}>
          {selectedKey === 'profile' && (
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <ProfileForm
                me={currentProfile}
                statusLabel={sessionStatus === 'authenticated' ? '已登录' : '未登录'}
                submitting={profileMutation.isPending}
                errorMessage={getErrorMessage(profileMutation.error)}
                onSubmit={async (input) => {
                  await profileMutation.mutateAsync(input);
                }}
              />
            </Space>
          )}

          {selectedKey === 'password' && (
            <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 600, margin: '0 auto', display: 'flex' }}>
              <div>
                <Typography.Title level={2}>修改密码</Typography.Title>
                <Typography.Paragraph>
                  定期修改密码有助于保护你的账号安全。修改密码后将需要重新登录。
                </Typography.Paragraph>
              </div>

              <ChangePasswordForm
                submitting={changePasswordMutation.isPending}
                errorMessage={getErrorMessage(changePasswordMutation.error)}
                onSubmit={(input) => changePasswordMutation.mutateAsync(input)}
              />
            </Space>
          )}
        </div>
      </Content>
    </Layout>
  );
}