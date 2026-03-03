export interface GraphEntity {
  id: number;
  sessionId: string;
  name: string;
  type: string;
  properties: Record<string, unknown>;
  accessCount?: number;
  lastAccessed?: string | null;
}

export interface GraphRelationship {
  id: number;
  sessionId: string;
  fromId: number;
  toId: number;
  relationType: string;
  metadata: Record<string, unknown>;
}

export interface GraphQueryResult {
  rootEntity: GraphEntity;
  depth: number;
  entities: GraphEntity[];
  relationships: GraphRelationship[];
}

export interface SemanticSearchResult {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  timestamp: string;
  similarity: number;
}

export interface MarkdownFact {
  timestamp: string;
  category: string;
  fact: string;
}

export interface FactAccessStat {
  sessionId: string;
  factHash: string;
  factText: string;
  category: string;
  accessCount: number;
  lastAccessed: string;
  importance: number;
}

export type AttachmentType = "image" | "audio" | "video" | "document" | "other";

export interface AttachmentInput {
  type: AttachmentType;
  url?: string;
  base64Data?: string;
  extractedText?: string;
}

export interface AttachmentRecord {
  id: number;
  sessionId: string;
  type: AttachmentType;
  url: string | null;
  base64Data: string | null;
  extractedText: string | null;
  timestamp: string;
}

export interface ImageAnalysisOptions {
  analyzer?: (input: { url?: string; base64Data?: string }) => Promise<string>;
  model?: string;
}

export interface EvolutionConfig {
  duplicateSimilarityThreshold: number;
  staleDays: number;
  lowImportanceThreshold: number;
}

export interface EvolutionReport {
  sessionId: string;
  startedAt: string;
  finishedAt: string;
  totalFactsBefore: number;
  totalFactsAfter: number;
  mergedFacts: number;
  removedFacts: number;
  categoryChanges: number;
  categoriesSuggested: number;
  notes: string[];
}

export interface CategoryOrganizerInput {
  category: string;
  facts: string[];
}

export type CategoryOrganizer = (
  groups: CategoryOrganizerInput[]
) => Promise<Record<string, string>>;

export interface PruningConfig {
  contextThreshold: number;
  keepRecentExchanges: number;
  autoprune: boolean;
  minMessageCount: number;
}
