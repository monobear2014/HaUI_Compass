import type { ChatMessage, ChatSession } from "./compass-chat-types";
import type { DocumentStudyProgress, StudyDocument } from "./documents";

export type StoredStudyDocument = StudyDocument & { content: Buffer };

// PostgreSQL is asynchronous while node:sqlite is synchronous. These contracts
// deliberately expose Promises so runtime selection never leaks driver behavior
// into routes or Server Components.
export interface DocumentPersistence {
  listDocuments(owner: string): Promise<StudyDocument[]>;
  findDocument(
    owner: string,
    id: string,
    includeContent?: boolean,
  ): Promise<StoredStudyDocument | null>;
  saveDocuments(owner: string, files: File[]): Promise<StudyDocument[]>;
  deleteDocument(owner: string, id: string): Promise<boolean>;
  getStudyProgress(
    owner: string,
    documentId: string,
  ): Promise<DocumentStudyProgress | null>;
  saveStudyProgress(
    owner: string,
    documentId: string,
    progress: Pick<DocumentStudyProgress, "covered" | "mastered">,
  ): Promise<DocumentStudyProgress | null>;
}

export interface ChatPersistence {
  authorizeSession(owner: string, id: string): Promise<ChatSession>;
  listSessions(owner: string, studySetId: string): Promise<ChatSession[]>;
  createSession(owner: string, studySetId: string): Promise<ChatSession>;
  getMessages(owner: string, sessionId: string): Promise<ChatMessage[]>;
}
