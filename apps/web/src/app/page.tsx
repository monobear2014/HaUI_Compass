import type { Metadata } from "next";
import { CompassLanding } from "@/components/compass/landing";
export const metadata: Metadata = {
  title: "HaUI Compass · Học có kế hoạch. Đi đúng hướng.",
  description:
    "Bạn đồng hành học tập thích ứng cho sinh viên: gợi ý việc tiếp theo, rủi ro deadline, kế hoạch tuần và hỏi đáp tài liệu có trích dẫn.",
};
export default function Page() {
  return <CompassLanding />;
}
