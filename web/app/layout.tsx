import type { ReactNode } from "react";
import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { AppLayout } from "@/components/app-layout";

export const metadata: Metadata = {
  title: "7Flows Studio",
  description: "Multi-agent workflow orchestration workbench."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
