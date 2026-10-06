import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { StudySet } from "@/components/compass/study-set";
import { getSessionUser, SESSION_COOKIE } from "@/lib/demo-auth";
import {
  authorizeSession,
  getChatMessages,
  listChatSessions,
} from "@/lib/compass-chat-store";
import { findDocument, getDocumentStudyProgress } from "@/lib/document-store";

export const metadata: Metadata = { title: "Bộ học tập · HaUI Compass" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; chat?: string }>;
}) {
  const { id } = await params;
  const { mode, chat } = await searchParams;
  const user = getSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/study-set/${id}`)}`);
  const document = findDocument(user.id, id);
  if (!document) notFound();
  const progress = getDocumentStudyProgress(user.id, id);
  if (!progress) notFound();
  const sessions = listChatSessions(user.id, id);
  let sessionId = sessions[0]?.id;
  if (chat) {
    try {
      const selected = authorizeSession(user.id, chat);
      if (selected.study_set_id !== id) notFound();
      sessionId = selected.id;
    } catch {
      notFound();
    }
  }
  const messages = sessionId ? getChatMessages(user.id, sessionId) : [];
  const { content, ...metadata } = document;
  return (
    <StudySet
      key={id}
      document={metadata}
      text={document.kind === "text" ? content.toString("utf8") : null}
      initialProgress={progress}
      initialMode={mode}
      initialSessions={sessions}
      initialMessages={messages}
      initialSessionId={sessionId}
    />
  );
}
