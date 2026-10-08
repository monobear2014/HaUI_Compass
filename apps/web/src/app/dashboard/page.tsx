import type { Metadata } from "next";
import { Statistics } from "@/components/statistics";

export const metadata: Metadata = { title: "Tổng quan · HaUI Compass" };
export default function Page() {
  return <Statistics />;
}
