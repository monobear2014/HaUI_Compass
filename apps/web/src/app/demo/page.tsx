import type { Metadata } from "next";
import { CompassDemoStart } from "@/components/compass/entry";
export const metadata: Metadata = {
  title: "Khám phá không gian học tập · HaUI Compass",
};
export default function Page() {
  return (
    <>
      <CompassDemoStart />
      <p style={{ textAlign: "center", padding: 20 }}>
        <a href="/login?next=%2Flecturer">Giảng viên · Lecturer dashboard</a>
      </p>
    </>
  );
}
