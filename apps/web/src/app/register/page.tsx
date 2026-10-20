import type { Metadata } from "next";
import { CompassAuth } from "@/components/compass/auth";
import { safeReturnPath } from "@/lib/auth-navigation";
import { googleAuthConfiguration } from "@/lib/google-auth-config";
export const metadata: Metadata = { title: "Đăng ký · HaUI Compass" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <CompassAuth
      mode="register"
      demoEnabled={
        process.env.COMPASS_DEMO_AUTH === "1" &&
        process.env.NODE_ENV !== "production"
      }
      googleEnabled={Boolean(googleAuthConfiguration())}
      nextPath={safeReturnPath((await searchParams).next)}
    />
  );
}
