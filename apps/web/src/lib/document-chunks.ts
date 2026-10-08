// Offsets refer to the original UTF-8 decoded text used by the reader. The pure
// implementation is shared with the offline evaluator to prevent benchmark drift.
export { chunkText, type TextChunk } from "./document-chunking.cjs";
