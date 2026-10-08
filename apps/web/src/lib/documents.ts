// Shared UI contract for owner-scoped uploads and learning.
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_FILES = 3;
export type StudyDocument = {
  id: string;
  name: string;
  kind: "pdf" | "text";
  size: number;
  createdAt: string;
  headings: string[];
  ingestionStatus?: "pending" | "ready" | "failed" | "unsupported";
};
export type DocumentStudyProgress = {
  covered: string[];
  mastered: string[];
  updatedAt: string | null;
};
export const SAMPLE_DOCUMENT = {
  name: "nhap-mon-ai.md",
  content: `# Nhập môn Trí tuệ nhân tạo

Tài liệu minh họa cho HaUI Compass, không phải học liệu chính thức.

## Học có giám sát
Học có giám sát sử dụng dữ liệu có nhãn để học ánh xạ từ đầu vào đến đầu ra. Ví dụ: dự đoán giá nhà từ diện tích và vị trí.

## Đánh giá mô hình
Chia dữ liệu thành tập huấn luyện, tập xác thực và tập kiểm tra. Không dùng tập kiểm tra để chọn siêu tham số.

## Overfitting và regularization
Overfitting xảy ra khi mô hình phù hợp quá mức với dữ liệu huấn luyện. Regularization và early stopping có thể giúp mô hình tổng quát tốt hơn.
`,
};

export function fileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
