import type { Metadata } from "next";
import { DocumentUpload } from "@/components/compass/document-journey";
import { safeReturnPath } from "@/lib/auth-navigation";

export const metadata: Metadata = { title: "Tải tài liệu · HaUI Compass" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return (
    <DocumentUpload nextPath={safeReturnPath((await searchParams).next)} />
  );
}
