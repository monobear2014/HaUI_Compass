import { redirect } from "next/navigation";
import { safeReturnPath } from "@/lib/auth-navigation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeReturnPath((await searchParams).next);
  redirect(`/documents/upload?next=${encodeURIComponent(next)}`);
}
