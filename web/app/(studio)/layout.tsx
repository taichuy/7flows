import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getServerAuthSession } from "@/lib/server-workspace-access";

export default async function StudioLayout({ children }: { children: ReactNode }) {
  const session = await getServerAuthSession();

  if (!session) {
    redirect("/login?next=/");
  }

  return children;
}
