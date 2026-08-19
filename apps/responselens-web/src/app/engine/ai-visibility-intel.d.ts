export type DataSourceKind = 'demo' | 'connected' | 'feed';

export interface LlmMention {
  llm: string;
  mentioned: boolean;
  rank: number | null;
  sentiment: 'positivo' | 'neutro' | null;
}

export interface AiQuery {
  query: string;
  appears: boolean;
  position: number | null;
}

export interface AiVisibilityIntel {
  source: DataSourceKind;
  connected: boolean;
  disclaimer: string;
  provider: string;
  presenceScore: number;
  llmMentions: LlmMention[];
  queries: AiQuery[];
}

export function buildAiVisibilityIntel(opts: {
  competitor: { name: string };
  aiVisibilityProvider?: string;
}): AiVisibilityIntel;
