import { useEffect } from 'react';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { Result, Spin } from 'antd';

import { useAuthStore } from '../../../state/auth-store';
import { SectionPageLayout } from '../../../shared/ui/section-page-layout/SectionPageLayout';
import {
  changeMyPassword,
  fetchMyProfile,
  updateMyProfile
} from '../api/me';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { ProfileForm } from '../components/ProfileForm';
import { getMeSections, type MeSectionKey } from '../lib/me-sections';
import './me-page.css';

function getErrorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

export function MePage({
  requestedSectionKey
}: {
  requestedSectionKey?: MeSectionKey;
}) {
  const navigate = useNavigate();
  const sessionStatus = useAuthStore((state) => state.sessionStatus);
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const actor = useAuthStore((state) => state.actor);
  const me = useAuthStore((state) => state.me);
  const setMe = useAuthStore((state) => state.setMe);
  const setAnonymous = useAuthStore((state) => state.setAnonymous);
  const visibleSections = getMeSections();
  const fallbackSection = visibleSections[0];
  const activeSection = visibleSections.find((section) => section.key === requestedSectionKey);

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

  if (!fallbackSection) {
    return (
      <SectionPageLayout
        pageTitle="个人资料"
        pageDescription="该页面用于管理个人资料与安全设置。"
        navItems={[]}
        activeKey=""
        emptyState={<Result status="info" title="当前账号暂无可访问内容" />}
      >
        {null}
      </SectionPageLayout>
    );
  }

  if (!requestedSectionKey || !activeSection) {
    return <Navigate to={fallbackSection.to} replace />;
  }

  return (
    <SectionPageLayout
      pageTitle="个人资料"
      pageDescription="该页面用于管理个人资料与安全设置。"
      navItems={visibleSections}
      activeKey={activeSection.key}
    >
      {activeSection.key === 'profile' ? (
        <div className="me-page">
          <ProfileForm
            me={currentProfile}
            statusLabel={sessionStatus === 'authenticated' ? '已登录' : '未登录'}
            submitting={profileMutation.isPending}
            errorMessage={getErrorMessage(profileMutation.error)}
            onSubmit={async (input) => {
              await profileMutation.mutateAsync(input);
            }}
          />
        </div>
      ) : (
        <div className="me-page">
          <ChangePasswordForm
            className="me-security-panel"
            submitting={changePasswordMutation.isPending}
            errorMessage={getErrorMessage(changePasswordMutation.error)}
            onSubmit={(input) => changePasswordMutation.mutateAsync(input)}
          />
        </div>
      )}
    </SectionPageLayout>
  );
}
