export type ChatSession = {
  id: string;
  study_set_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};
export type MessageCitation = {
  index: number;
  chunk_id: string;
  document_id: string;
  filename: string;
  heading: string | null;
  page_number: number | null;
  excerpt: string;
  start_offset: number;
  end_offset: number;
};
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  request_id: string;
  status: "pending" | "answered" | "abstained" | "failed";
  citations: MessageCitation[];
};
