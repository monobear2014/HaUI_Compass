import "server-only";
import { DocumentError, findDocument } from "./document-store";
import { WebDocumentRetriever } from "./document-retriever";
import { resolveRetrievalQuery } from "./document-ranking.cjs";

export async function attachDocumentContext(
  owner: string,
  input: Record<string, unknown>,
  loadHistory: (id: string) => Promise<unknown>,
) {
  // Never trust snippets supplied by a browser, including when no document is selected.
  delete input.document_evidence;
  if (!input.document_id) return input;
  const id = input.document_id;
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id))
    throw new DocumentError("invalid_input", 400);
  const document = await findDocument(owner, id, false);
  if (!document) throw new DocumentError("not_found", 404);
  if (input.mode && input.mode !== "auto" && input.mode !== "tutor")
    return input;
  if (document.ingestionStatus !== "ready") {
    input.document_evidence = [];
    return input;
  }
  if (typeof input.text !== "string" || input.text.length > 500)
    throw new DocumentError("invalid_input", 400);
  const history: { role: "user" | "assistant"; content: string }[] = [];
  if (typeof input.conversation_id === "string") {
    const page = (await loadHistory(input.conversation_id)) as {
      exchanges?: {
        document_id?: string;
        question: string;
        response: { answer: string };
      }[];
    };
    for (const row of (page.exchanges || [])
      .filter((row) => row.document_id === id)
      .slice(-4)) {
      history.push(
        { role: "user", content: row.question },
        { role: "assistant", content: row.response.answer },
      );
    }
  }
  input.document_evidence = await new WebDocumentRetriever().search(
    resolveRetrievalQuery(input.text, history),
    id,
    owner,
    [id],
  );
  return input;
}
