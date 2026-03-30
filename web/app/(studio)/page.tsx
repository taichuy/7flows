import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/server-workspace-access";

export default async function HomePage() {
  const session = await getServerAuthSession();
  
  if (session) {
    redirect("/workspace");
  } else {
    redirect("/login");
  }
}