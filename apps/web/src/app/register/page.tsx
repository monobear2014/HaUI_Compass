import type { Metadata } from "next";
import { CompassAuth } from "@/components/compass/auth";
import { safeReturnPath } from "@/lib/auth-navigation";
export const metadata: Metadata = { title: "Đăng ký · HaUI Compass" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <CompassAuth
      mode="register"
      nextPath={safeReturnPath((await searchParams).next)}
    />
  );
}
