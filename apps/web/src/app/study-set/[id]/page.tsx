import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { StudySet } from "@/components/compass/study-set";
import { getSessionUser, SESSION_COOKIE } from "@/lib/demo-auth";
import { findDocument, getDocumentStudyProgress } from "@/lib/document-store";

export const metadata: Metadata = { title: "Bộ học tập · HaUI Compass" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; chat?: string; chunk?: string }>;
}) {
  const { id } = await params;
  const { mode, chunk } = await searchParams;
  const user = await getSessionUser(
    (await cookies()).get(SESSION_COOKIE)?.value,
  );
  if (!user) redirect(`/login?next=${encodeURIComponent(`/study-set/${id}`)}`);
  const document = await findDocument(user.id, id);
  if (!document) notFound();
  const progress = await getDocumentStudyProgress(user.id, id);
  if (!progress) notFound();
  const { content, ...metadata } = document;
  return (
    <StudySet
      key={id}
      document={metadata}
      text={document.kind === "text" ? content.toString("utf8") : null}
      initialProgress={progress}
      initialMode={mode}
      initialChunk={chunk}
    />
  );
}
