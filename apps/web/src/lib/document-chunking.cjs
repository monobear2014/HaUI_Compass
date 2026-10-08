"use strict";

function chunkText(text, markdown) {
  if (!text.trim()) throw new Error("empty_document");
  const headings = [];
  let fence = null;
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
  const chunks = [];
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
    start = end - 180;
    if (/[\uDC00-\uDFFF]/.test(text[start])) start++;
  }
  return chunks;
}

function chunkPages(pages) {
  const chunks = [];
  for (const page of pages) {
    if (!page.text.trim()) continue;
    for (const chunk of chunkText(page.text, false)) {
      chunks.push({
        ...chunk,
        chunk_index: chunks.length,
        page_number: page.page_number,
      });
    }
  }
  return chunks;
}

module.exports = { chunkText, chunkPages };
