import type { Metadata } from "next";
import { CompassInfoPage } from "@/components/compass/entry";
export const metadata: Metadata = { title: "Truy cập demo · HaUI Compass" };
export default function Page() {
  return <CompassInfoPage kind="forgot" />;
}
