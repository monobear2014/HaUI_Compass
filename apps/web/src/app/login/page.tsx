import type { Metadata } from "next";
import { CompassAuth } from "@/components/compass/auth";
import { safeReturnPath } from "@/lib/auth-navigation";
export const metadata: Metadata = { title: "Đăng nhập · HaUI Compass" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <CompassAuth
      mode="login"
      nextPath={safeReturnPath((await searchParams).next)}
    />
  );
}
