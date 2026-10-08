export type TextChunk = {
  content: string;
  chunk_index: number;
  heading: string | null;
  start_offset: number;
  end_offset: number;
};
export function chunkText(text: string, markdown: boolean): TextChunk[];
export type PdfPage = { page_number: number; text: string };
export function chunkPages(
  pages: PdfPage[],
): (TextChunk & { page_number: number })[];
