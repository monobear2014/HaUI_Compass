import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DocumentReader } from "@/components/compass/document-journey";
import { getSessionUser, SESSION_COOKIE } from "@/lib/demo-auth";
import { findDocument } from "@/lib/document-store";

export const metadata: Metadata = { title: "Đọc tài liệu · HaUI Compass" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = getSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect("/login");
  const document = findDocument(user.id, id);
  if (!document) notFound();
  const { content, ...metadata } = document;
  return (
    <DocumentReader
      document={metadata}
      text={document.kind === "text" ? content.toString("utf8") : null}
    />
  );
}
