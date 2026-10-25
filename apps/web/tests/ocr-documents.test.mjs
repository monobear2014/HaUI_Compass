import assert from "node:assert/strict";
import { test } from "node:test";
import { isImageDocument, imageContentType, MAX_IMAGE_BYTES } from "../src/lib/documents.ts";
import { readFileSync } from "node:fs";

test("raster formats are explicit and active SVG is never accepted", () => {
  for (const name of ["photo.PNG", "scan.jpg", "scan.jpeg", "scan.webp"])
    assert.ok(isImageDocument(name));
  for (const name of ["scan.svg", "scan.gif", "scan.png.exe", "scan.pdf"])
    assert.equal(isImageDocument(name), false);
  assert.equal(imageContentType("scan.jpg"), "image/jpeg");
  assert.equal(imageContentType("scan.webp"), "image/webp");
  assert.ok(MAX_IMAGE_BYTES < 4.5 * 1024 * 1024);
});

test("OCR output and originals remain owner-scoped and rich content is rendered safely", () => {
  const renderer = readFileSync(new URL("../src/components/document-markdown.tsx", import.meta.url), "utf8");
  assert.match(renderer, /skipHtml/);
  assert.match(renderer, /trust: false/);
  assert.doesNotMatch(renderer, /rehype-raw|dangerouslySetInnerHTML/);
  const store = readFileSync(new URL("../src/lib/document-extracted-text.ts", import.meta.url), "utf8");
  assert.match(store, /d.owner=\$1 AND d.id=\$2/);
  assert.match(store, /page.end - row.start_offset/);
  const route = readFileSync(new URL("../src/app/api/documents/[id]/extraction/route.ts", import.meta.url), "utf8");
  assert.match(route, /getSessionUser/);
  assert.match(route, /extractedDocumentPages\(\s*user.id/);
});
