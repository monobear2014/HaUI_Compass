import { expect, test } from "@playwright/test";

const courseAnswer = {
  answer:
    "Đầu ra dự kiến gồm mô hình, dữ liệu mẫu hư cấu, ghi chú kiểm thử và tự đánh giá. [c1]",
  status: "answered",
  citations: [
    {
      citation_id: "c1",
      document_id: "knowledge:courses:db:assignments.md",
      chunk_id: "chk_demo",
      title: "Database assignments",
      source_url: null,
      local_path: "knowledge/courses/db/assignments.md",
      source_type: "fictional_demo",
      source_label: "Tài liệu môn học demo",
      page: null,
      section: "Database Mini Project",
    },
  ],
  retrieval: { source_count: 1, chunk_count: 3, strategy: "lexical" },
  source: "template",
  fallback_reason: "not_configured",
};

test("Database RAG shows grounded answer and fictional badge", async ({
  page,
}) => {
  await page.route("**/compass-api/knowledge/query", (route) =>
    route.fulfill({ status: 200, json: courseAnswer }),
  );
  await page.goto("/knowledge");
  await page.getByRole("button", { name: "Ask documents" }).click();
  await expect(page.getByText("GROUNDED ANSWER")).toBeVisible();
  await expect(page.getByText("Tài liệu môn học demo")).toBeVisible();
  await page.getByText("Database assignments").click();
  await expect(page.getByText("Section: Database Mini Project")).toBeVisible();
});

test("institutional RAG keeps official provenance visible", async ({
  page,
}) => {
  await page.route("**/compass-api/knowledge/query", (route) =>
    route.fulfill({
      status: 200,
      json: {
        ...courseAnswer,
        answer: "Các cấp gồm Tiến sỹ, Thạc sỹ, Đại học và Cao đẳng. [c1]",
        citations: [
          {
            ...courseAnswer.citations[0],
            document_id: "knowledge:haui:training-model.txt",
            title: "Mô hình đào tạo",
            source_type: "official_public",
            source_label: "Nguồn công khai HaUI",
            source_url:
              "https://www.haui.edu.vn/vn/html/mo-hinh-va-chuong-trinh-dao-tao",
            local_path: "knowledge/haui/training-model.txt",
            section: null,
          },
        ],
      },
    }),
  );
  await page.goto("/knowledge");
  await page.getByRole("button", { name: "HaUI" }).click();
  await page.getByRole("button", { name: "Ask documents" }).click();
  await expect(page.getByText("Nguồn công khai HaUI")).toBeVisible();
  await page.getByText("Mô hình đào tạo").click();
  await expect(
    page.getByRole("link", { name: "Open public source" }),
  ).toBeVisible();
});

test("unsupported question displays abstention without citations", async ({
  page,
}) => {
  await page.route("**/compass-api/knowledge/query", (route) =>
    route.fulfill({
      status: 200,
      json: {
        answer:
          "Chưa tìm thấy đủ thông tin trong tài liệu hiện có để trả lời chắc chắn.",
        status: "abstained",
        citations: [],
        retrieval: { source_count: 0, chunk_count: 0, strategy: "lexical" },
        source: "template",
        fallback_reason: "insufficient_evidence",
      },
    }),
  );
  await page.goto("/knowledge");
  await page.getByLabel("Question").fill("Wi-Fi password?");
  await page.getByRole("button", { name: "Ask documents" }).click();
  await expect(page.getByText("INSUFFICIENT EVIDENCE")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sources" })).toHaveCount(0);
});
