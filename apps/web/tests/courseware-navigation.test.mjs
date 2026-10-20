import assert from "node:assert/strict";
import test from "node:test";
import {
  coursewareHref,
  validCoursewareId,
} from "../src/lib/courseware-navigation.ts";

test("known task course names open their own courseware; unknown names stay general", () => {
  assert.equal(coursewareHref("Machine Learning"), "/learn?assistant=1&course=ml");
  assert.equal(coursewareHref(" Databases "), "/learn?assistant=1&course=db");
  assert.equal(coursewareHref("Đại số tuyến tính"), "/learn?assistant=1&course=la");
  assert.equal(coursewareHref("Communication"), "/learn?assistant=1");
  assert.equal(coursewareHref("AI ethics unknown course"), "/learn?assistant=1");
  assert.equal(validCoursewareId("automation"), "automation");
  assert.equal(validCoursewareId("unknown"), null);
  assert.equal(validCoursewareId(null), null);
});
