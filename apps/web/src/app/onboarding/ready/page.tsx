import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DocumentReady } from "@/components/compass/document-journey";
import { getSessionUser, SESSION_COOKIE } from "@/lib/demo-auth";
import { listDocuments } from "@/lib/document-store";
import { safeReturnPath } from "@/lib/auth-navigation";

export const metadata: Metadata = { title: "Sẵn sàng học · HaUI Compass" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; ids?: string | string[] }>;
}) {
  const query = await searchParams;
  const nextPath = safeReturnPath(query.next);
  const user = getSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const ids =
    typeof query.ids === "string" ? query.ids.split(",").slice(0, 3) : [];
  const documents = listDocuments(user.id).filter((doc) =>
    ids.includes(doc.id),
  );
  if (!documents.length)
    redirect(`/onboarding/upload?next=${encodeURIComponent(nextPath)}`);
  return <DocumentReady documents={documents} nextPath={nextPath} />;
}
