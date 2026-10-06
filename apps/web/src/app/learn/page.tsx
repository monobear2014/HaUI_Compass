import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LearningHome } from "@/components/compass/learning-home";
import { getSessionUser, SESSION_COOKIE } from "@/lib/demo-auth";
import { listDocuments, getDocumentStudyProgress } from "@/lib/document-store";

export const metadata: Metadata = { title: "Không gian học · HaUI Compass" };

export default async function Page() {
  const user = getSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect("/login?next=%2Flearn");
  const documents = listDocuments(user.id).map((document) => ({
    ...document,
    progress: getDocumentStudyProgress(user.id, document.id)!,
  }));
  return <LearningHome name={user.name} documents={documents} />;
}
