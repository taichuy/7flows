type ServiceCheck = {
  name: string;
  status: string;
  detail?: string | null;
};

type SystemOverview = {
  status: string;
  environment: string;
  services: ServiceCheck[];
  capabilities: string[];
};

const fallback: SystemOverview = {
  status: "offline",
  environment: "local",
  services: [
    {
      name: "api",
      status: "down",
      detail: "后端概览接口尚未连接，请先启动 api 服务。"
    }
  ],
  capabilities: ["frontend-shell-ready"]
};

export async function getSystemOverview(): Promise<SystemOverview> {
  const baseUrl =
    process.env.SEVENFLOWS_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  try {
    const response = await fetch(`${baseUrl}/api/system/overview`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return fallback;
    }

    return (await response.json()) as SystemOverview;
  } catch {
    return fallback;
  }
}
