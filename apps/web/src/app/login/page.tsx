import type { Metadata } from "next";
import { CompassAuth } from "@/components/compass/auth";
import { safeReturnPath } from "@/lib/auth-navigation";
import { googleAuthConfiguration } from "@/lib/google-auth-config";
export const metadata: Metadata = { title: "Đăng nhập · HaUI Compass" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const query = await searchParams;
  return (
    <CompassAuth
      mode="login"
      demoEnabled={
        process.env.COMPASS_DEMO_AUTH === "1" &&
        process.env.NODE_ENV !== "production"
      }
      nextPath={safeReturnPath(query.next)}
      googleEnabled={Boolean(googleAuthConfiguration())}
      initialError={
        query.error === "google_failed" || query.error === "google_unavailable"
          ? query.error
          : ""
      }
    />
  );
}
