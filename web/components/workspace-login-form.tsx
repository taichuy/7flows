"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function WorkspaceLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("admin@taichuy.com");
  const [password, setPassword] = useState("admin123");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"idle" | "error">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextHref = useMemo(() => {
    const candidate = searchParams?.get("next") ?? "/workspace";
    return candidate.startsWith("/") ? candidate : "/workspace";
  }, [searchParams]);

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
      <div className="login-credential-card">
        <span className="login-credential-label">本地默认管理员</span>
        <div className="login-credential-copy">
          <strong>admin@taichuy.com</strong>
          <span>admin123</span>
        </div>
      </div>
      <button className="workspace-primary-button" disabled={isSubmitting} type="submit">
        {isSubmitting ? "进入中..." : "进入工作台"}
      </button>
      <p className="workspace-muted login-helper-copy">
        默认管理员仅用于本地验证；登录后可继续创建应用和管理成员。
      </p>
      {message ? (
        <p className={`workspace-inline-message ${messageTone === "error" ? "error" : "idle"}`}>
          {message}
        </p>
      ) : null}
    </form>
  );
}
