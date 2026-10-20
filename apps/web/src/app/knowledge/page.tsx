import { redirect } from "next/navigation";
import { validCoursewareId } from "@/lib/courseware-navigation";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const query = await searchParams;
  const course = validCoursewareId(query.course || null);
  redirect(
    course ? `/learn?assistant=1&course=${course}` : "/learn?assistant=1",
  );
}
