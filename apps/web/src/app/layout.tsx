import type { Metadata } from "next";
import { PreferencesProvider } from "@/components/preferences";
import { ApplicationFrame } from "@/components/application-frame";
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
          <ApplicationFrame>{children}</ApplicationFrame>
        </PreferencesProvider>
      </body>
    </html>
  );
}
