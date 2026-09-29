export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

/** Pluggable web search backend. */
export interface SearchEngine {
  readonly name: string;
  search(query: string, limit: number): Promise<SearchResultItem[]>;
  /** Query completions for a prefix. Engines without autocomplete return []. */
  suggest(prefix: string, limit: number): Promise<string[]>;
}

export const SEARCH_ENGINE = Symbol('SEARCH_ENGINE');
