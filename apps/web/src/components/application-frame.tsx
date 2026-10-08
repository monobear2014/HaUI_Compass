"use client";

import { usePathname } from "next/navigation";
import { Shell } from "./shell";
import { WorkspaceProvider } from "./workspace";

const standalonePages = [
  "/",
  "/login",
  "/register",
  // Protected by proxy, but intentionally displayed without the workspace shell.
  "/onboarding",
  "/demo/select-role",
  "/demo",
  "/privacy",
  "/terms",
  "/request-access",
  "/forgot-password",
];

export function ApplicationFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (standalonePages.includes(path) || path.startsWith("/onboarding/"))
    return children;
  return (
    <WorkspaceProvider>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}
