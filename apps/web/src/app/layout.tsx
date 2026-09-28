import type { Metadata } from "next";
import { WorkspaceProvider } from "@/components/workspace";
import { Shell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "HaUI Compass · Know what to do next.",
  description:
    "Your academic workspace for planning, doing, reflecting, and adapting.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WorkspaceProvider>
          <Shell>{children}</Shell>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
