import type { Metadata } from "next";
import { PreferencesProvider } from "@/components/preferences";
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
    <html lang="en" suppressHydrationWarning>
      <body>
        <PreferencesProvider>
          <WorkspaceProvider>
            <Shell>{children}</Shell>
          </WorkspaceProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
