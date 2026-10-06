import type { Metadata } from "next";
import { CompassOnboarding } from "@/components/compass/onboarding";
import { safeReturnPath } from "@/lib/auth-navigation";

export const metadata: Metadata = { title: "Bắt đầu · HaUI Compass" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return (
    <CompassOnboarding nextPath={safeReturnPath((await searchParams).next)} />
  );
}
