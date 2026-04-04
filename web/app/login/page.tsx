import { redirect } from "next/navigation";
import { Card } from "antd";

import { WorkspaceLoginForm } from "@/components/workspace-login-form";
import { getServerAuthSession, getServerPublicAuthOptions } from "@/lib/server-workspace-access";

export default async function LoginPage() {
  const session = await getServerAuthSession();
  if (session) {
    redirect("/workspace");
  }

  const authOptions = await getServerPublicAuthOptions();

  return (
    <main className="login-shell login-shell-dify" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5' }}>
      <Card 
        style={{ width: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
        variant="borderless"
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 600, lineHeight: 1.2 }}>
            <span style={{ color: '#1677ff' }}>7</span>Flows
          </h1>
          <p style={{ margin: "8px 0 0", color: "rgba(0, 0, 0, 0.45)" }}>Workspace Sign In</p>
        </div>
        <WorkspaceLoginForm authOptions={authOptions} />
      </Card>
    </main>
  );
}
