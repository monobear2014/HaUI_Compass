export type CoursewareId =
  "db" | "ml" | "se" | "ai" | "la" | "stats" | "automation";
export const COURSEWARE_IDS: CoursewareId[] = [
  "db",
  "ml",
  "se",
  "ai",
  "la",
  "stats",
  "automation",
];

export function validCoursewareId(value: string | null): CoursewareId | null {
  return COURSEWARE_IDS.includes(value as CoursewareId)
    ? (value as CoursewareId)
    : null;
}

// Explicit course-name aliases only: unknown courses must not silently open DB.
export function coursewareHref(courseName: string): string {
  const name = courseName.normalize("NFC").trim().toLocaleLowerCase();
  const aliases: Record<string, CoursewareId> = {
    databases: "db",
    database: "db",
    "cơ sở dữ liệu": "db",
    "machine learning": "ml",
    "học máy": "ml",
    "software engineering": "se",
    "công nghệ phần mềm": "se",
    "artificial intelligence": "ai",
    "trí tuệ nhân tạo": "ai",
    "linear algebra": "la",
    "đại số tuyến tính": "la",
    "probability and statistics": "stats",
    "xác suất thống kê": "stats",
    "automatic control": "automation",
    "tự động hoá": "automation",
  };
  const course = aliases[name];
  return course ? `/learn?assistant=1&course=${course}` : "/learn?assistant=1";
}
