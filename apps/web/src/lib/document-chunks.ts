// Offsets refer to the original UTF-8 decoded text used by the reader.
export type TextChunk = {
  content: string;
  chunk_index: number;
  heading: string | null;
  start_offset: number;
  end_offset: number;
};

export function chunkText(text: string, markdown: boolean): TextChunk[] {
  if (!text.trim()) throw new Error("empty_document");
  const headings: { offset: number; title: string }[] = [];
  let fence: string | null = null;
  if (markdown) {
    for (const line of text.matchAll(/[^\n]*(?:\n|$)/g)) {
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line[0])?.[1];
      if (marker) {
        if (!fence) fence = marker;
        else if (marker[0] === fence[0] && marker.length >= fence.length)
          fence = null;
      } else if (!fence) {
        const title = /^ {0,3}#{1,6}[\t ]+(.+)/.exec(line[0])?.[1];
        if (title)
          headings.push({
            offset: line.index,
            title: title
              .replace(/[\t ]+#+\s*$/, "")
              .trim()
              .slice(0, 3000),
          });
      }
    }
  }
  const chunks: TextChunk[] = [];
  // ~500–1000 tokens for ordinary prose, bounded for multilingual documents.
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 3000, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf("\n\n", end - 2);
      if (boundary > start + 1800) end = boundary + 2;
      else {
        const space = text.lastIndexOf(" ", end - 1);
        if (space > start + 1800) end = space + 1;
      }
    }
    if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end])) end--;
    const heading =
      headings.findLast((row) => row.offset <= start)?.title ??
      headings.find((row) => row.offset < end)?.title ??
      null;
    const content = text.slice(start, end);
    if (content.trim())
      chunks.push({
        content,
        heading,
        start_offset: start,
        end_offset: end,
        chunk_index: chunks.length,
      });
    if (end === text.length) break;
    // Small overlap; never break surrogate pairs.
    start = end - 180;
    if (/[\uDC00-\uDFFF]/.test(text[start])) start++;
  }
  return chunks;
}
