"use client";

import { useRouter } from "next/navigation";

type WorkspaceLogoutButtonProps = {
  className?: string;
};

export function WorkspaceLogoutButton({
  className = "workspace-ghost-button compact"
}: WorkspaceLogoutButtonProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/session/logout", {
      method: "POST"
    }).catch(() => null);
    router.replace("/login");
    router.refresh();
  };

  return (
    <button className={className} onClick={handleLogout} type="button">
      退出登录
    </button>
  );
}
