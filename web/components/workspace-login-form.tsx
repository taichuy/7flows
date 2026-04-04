"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { PublicAuthOptionsResponse } from "@/lib/workspace-access";
import {
  LEGACY_WORKSPACE_TEAM_SETTINGS_HREF,
  WORKSPACE_TEAM_SETTINGS_HREF
} from "@/lib/workspace-console";

type WorkspaceLoginMethod = "zitadel_password" | "oidc_redirect" | "unavailable";

type WorkspaceLoginFormProps = {
  authOptions: PublicAuthOptionsResponse;
};

export function WorkspaceLoginForm({ authOptions }: WorkspaceLoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"idle" | "error">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextHref = useMemo(() => {
    const candidate = searchParams?.get("next") ?? "/workspace";
    return candidate.startsWith("/") ? candidate : "/workspace";
  }, [searchParams]);
  const nextLabel = useMemo(() => getLoginNextLabel(nextHref), [nextHref]);
  const queryErrorMessage = useMemo(
    () => getWorkspaceLoginErrorMessage(searchParams?.get("error") ?? null),
    [searchParams]
  );
  const primaryMethod = useMemo(
    () => resolvePrimaryLoginMethod(authOptions),
    [authOptions]
  );
  const methodMetadata = useMemo(
    () => getLoginMethodMetadata(primaryMethod),
    [primaryMethod]
  );
  const oidcStartHref = useMemo(
    () => `/api/auth/oidc/start?next=${encodeURIComponent(nextHref)}`,
    [nextHref]
  );
  const capabilityMessages = useMemo(
    () => buildCapabilityMessages(authOptions, primaryMethod),
    [authOptions, primaryMethod]
  );
  const resolvedMessage = message ?? queryErrorMessage;
  const resolvedMessageTone = message ? messageTone : queryErrorMessage ? "error" : "idle";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (primaryMethod !== "zitadel_password") {
      return;
    }

    setIsSubmitting(true);
    setMessage(methodMetadata.pendingMessage);
    setMessageTone("idle");

    try {
      const response = await fetch(methodMetadata.submitPath, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          login_name: identifier,
          password
        })
      });
      const body = (await response.json().catch(() => null)) as
        | { detail?: string; message?: string; code?: string }
        | null;

      if (!response.ok) {
        setMessage(body?.detail ?? body?.message ?? "登录失败。");
        setMessageTone("error");
        return;
      }

      router.replace(nextHref);
      router.refresh();
    } catch {
      setMessage("无法连接认证服务，请确认 web 与 api 都已启动。");
      setMessageTone("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-form" data-component={methodMetadata.componentName}>
      <div className="login-copy">
        <p className="workspace-eyebrow">{methodMetadata.eyebrow}</p>
        <h2>{methodMetadata.title}</h2>
        <p className="workspace-muted">{methodMetadata.description}</p>
      </div>

      {primaryMethod === "oidc_redirect" ? (
        <div className="login-form">
          <a className="workspace-primary-button" href={oidcStartHref}>
            {`跳转到${nextLabel}登录`}
          </a>
          <p className="login-helper-copy">认证完成后将自动返回{nextLabel}。</p>
        </div>
      ) : null}

      {primaryMethod === "zitadel_password" ? (
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form-field">
            <label htmlFor="workspace-login-identifier">{methodMetadata.identifierLabel}</label>
            <input
              id="workspace-login-identifier"
              autoComplete="username"
              className="workspace-input"
              name={methodMetadata.identifierFieldName}
              onChange={(event) => setIdentifier(event.target.value)}
              required
              value={identifier}
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
              required
              type="password"
              value={password}
            />
          </div>
          <button className="workspace-primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "登录中..." : `进入${nextLabel}`}
          </button>
          <p className="login-helper-copy">{methodMetadata.helperCopy}</p>
        </form>
      ) : null}

      {primaryMethod === "unavailable" ? (
        <p className="workspace-inline-message error">
          当前登录能力都不可用，请先补齐认证配置后再重试。
        </p>
      ) : null}

      {capabilityMessages.map((capabilityMessage) => (
        <p className="workspace-inline-message idle" key={capabilityMessage}>
          {capabilityMessage}
        </p>
      ))}

      {resolvedMessage ? (
        <p className={`workspace-inline-message ${resolvedMessageTone === "error" ? "error" : "idle"}`}>
          {resolvedMessage}
        </p>
      ) : null}
    </div>
  );
}

function resolvePrimaryLoginMethod(authOptions: PublicAuthOptionsResponse): WorkspaceLoginMethod {
  const preferred = authOptions.recommended_method;
  if (preferred === "oidc_redirect" && authOptions.oidc_redirect.enabled) {
    return preferred;
  }
  if (preferred === "zitadel_password" && authOptions.zitadel_password.enabled) {
    return preferred;
  }
  if (authOptions.oidc_redirect.enabled) {
    return "oidc_redirect";
  }
  if (authOptions.zitadel_password.enabled) {
    return "zitadel_password";
  }
  return "unavailable";
}

function buildCapabilityMessages(
  authOptions: PublicAuthOptionsResponse,
  primaryMethod: WorkspaceLoginMethod
) {
  const messages: string[] = [];

  if (primaryMethod === "zitadel_password" && authOptions.oidc_redirect.reason) {
    messages.push(`OIDC 跳转登录暂不可用：${authOptions.oidc_redirect.reason}`);
  }

  if (primaryMethod === "unavailable") {
    for (const reason of [authOptions.zitadel_password.reason, authOptions.oidc_redirect.reason]) {
      if (reason) {
        messages.push(reason);
      }
    }
  }

  return messages;
}

function getLoginMethodMetadata(method: WorkspaceLoginMethod) {
  switch (method) {
    case "oidc_redirect":
      return {
        componentName: "workspace-login-oidc-redirect",
        eyebrow: "OIDC Redirect",
        title: "继续使用标准 OIDC 跳转登录",
        description:
          "当前环境已经具备完整 OIDC 配置，点击后将跳转到身份提供方完成认证，再自动回到 7Flows。",
        identifierLabel: "账号",
        identifierFieldName: "login_name",
        helperCopy: "",
        pendingMessage: "正在跳转到身份提供方...",
        submitPath: "/api/auth/oidc/start"
      };
    case "zitadel_password":
      return {
        componentName: "workspace-login-zitadel-password-form",
        eyebrow: "ZITADEL Sign In",
        title: "继续使用 ZITADEL 账号密码登录",
        description:
          "浏览器只把账号密码提交到同源登录接口，由 backend 校验 ZITADEL 会话后换成当前工作空间 session。",
        identifierLabel: "账号",
        identifierFieldName: "login_name",
        helperCopy: "登录成功后将直接回到目标页面。",
        pendingMessage: "正在验证 ZITADEL 账号...",
        submitPath: "/api/auth/zitadel/login"
      };
    default:
      return {
        componentName: "workspace-login-unavailable",
        eyebrow: "Auth Unavailable",
        title: "当前没有可用的登录入口",
        description:
          "认证服务可达，但公开配置显示当前环境既没有完整 OIDC 配置，也没有可用的 ZITADEL 账号密码登录凭据。",
        identifierLabel: "账号",
        identifierFieldName: "login_name",
        helperCopy: "",
        pendingMessage: "正在验证登录能力...",
        submitPath: ""
      };
  }
}

function getLoginNextLabel(nextHref: string) {
  if (
    nextHref === WORKSPACE_TEAM_SETTINGS_HREF ||
    nextHref === LEGACY_WORKSPACE_TEAM_SETTINGS_HREF
  ) {
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

function getWorkspaceLoginErrorMessage(errorCode: string | null) {
  switch ((errorCode ?? "").trim()) {
    case "oidc_callback_failed":
      return "上一轮 ZITADEL OIDC 登录未完成，请重新发起跳转登录。";
    default:
      return null;
  }
}
