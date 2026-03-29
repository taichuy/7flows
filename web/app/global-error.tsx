"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body>
        <main className="workspace-feedback-shell workspace-feedback-shell-error">
          <section className="workspace-feedback-card">
            <p className="workspace-eyebrow">Workspace error</p>
            <h1>页面暂时没有加载成功</h1>
            <p className="workspace-muted workspace-copy-wide">
              当前入口在渲染时遇到异常。你可以先重试当前页面，或回到 Workspace 主链继续排查。
            </p>
            <div className="workspace-feedback-actions">
              <button className="workspace-primary-button" onClick={reset} type="button">
                重新加载
              </button>
              <Link className="workspace-ghost-button" href="/workspace">
                返回工作台
              </Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
