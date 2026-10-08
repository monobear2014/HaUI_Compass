export type RankableChunk = {
  content: string;
  chunk_index: number;
  heading: string | null;
};

export type RankedChunk<T extends RankableChunk> = {
  chunk: T;
  score: number;
  coverage: number;
  anchored: boolean;
};

export function tokens(text: string): string[];
export function documentIntent(query: string): boolean;
export function rankDocumentChunks<T extends RankableChunk>(
  query: string,
  rows: T[],
  limit?: number,
): RankedChunk<T>[];
export function resolveRetrievalQuery(
  query: string,
  history: { role: "user" | "assistant"; content: string }[],
): string;
