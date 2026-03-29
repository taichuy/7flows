"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const DEFAULT_ADMIN_EMAIL = "admin@taichuy.com";
const DEFAULT_ADMIN_PASSWORD = "admin123";

export function WorkspaceLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"idle" | "error">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextHref = useMemo(() => {
    const candidate = searchParams?.get("next") ?? "/workspace";
    return candidate.startsWith("/") ? candidate : "/workspace";
  }, [searchParams]);
  const nextLabel = useMemo(() => getLoginNextLabel(nextHref), [nextHref]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("正在进入工作台...");
    setMessageTone("idle");

    try {
      const response = await fetch("/api/session/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });
      const body = (await response.json().catch(() => null)) as
        | { detail?: string }
        | { token?: string }
        | null;

      if (!response.ok) {
        setMessage(body && "detail" in body ? body.detail ?? "登录失败。" : "登录失败。");
        setMessageTone("error");
        return;
      }

      router.replace(nextHref);
      router.refresh();
    } catch {
      setMessage("无法连接登录服务，请确认 web 与 api 都已启动。");
      setMessageTone("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <section className="login-credential-card" data-component="login-default-admin-card">
        <div>
          <p className="login-credential-label">本地默认管理员</p>
          <p className="login-hint">仅用于当前 local-first 开发环境，方便直接进入工作台。</p>
        </div>
        <div className="login-credential-copy">
          <strong>{DEFAULT_ADMIN_EMAIL}</strong>
          <span>{DEFAULT_ADMIN_PASSWORD}</span>
        </div>
      </section>
      <p className="login-helper-copy">
        登录后将前往 {nextLabel}；管理员可继续管理成员、创建应用并进入 xyflow Studio。
      </p>
      <div className="login-form-field">
        <label htmlFor="workspace-email">邮箱</label>
        <input
          id="workspace-email"
          autoComplete="email"
          className="workspace-input"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          value={email}
        />
      </div>
      <div className="login-form-field">
        <label htmlFor="workspace-password">密码</label>
        <input
          id="workspace-password"
          autoComplete="current-password"
          className="workspace-input"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </div>
      <button className="workspace-primary-button" disabled={isSubmitting} type="submit">
        {isSubmitting ? "进入中..." : "进入工作台"}
      </button>
      {message ? (
        <p className={`workspace-inline-message ${messageTone === "error" ? "error" : "idle"}`}>
          {message}
        </p>
      ) : null}
    </form>
  );
}

function getLoginNextLabel(nextHref: string) {
  if (nextHref === "/admin/members") {
    return "成员管理";
  }

  if (nextHref.startsWith("/workflows")) {
    return "应用编排";
  }

  if (nextHref.startsWith("/runs")) {
    return "运行追踪";
  }

  return "应用工作台";
}
