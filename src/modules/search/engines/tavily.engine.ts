import { upstreamFetch } from '../../../common/http/upstream-http';
import { SearchEngine, SearchResultItem } from './search-engine.interface';

const API_URL = 'https://api.tavily.com/search';

interface TavilyResponse {
  results?: { title?: string; url: string; content?: string }[];
}

/** Tavily: web search API built for LLM applications (requires TAVILY_API_KEY). */
export class TavilySearchEngine implements SearchEngine {
  readonly name = 'tavily';

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  async search(query: string, limit: number): Promise<SearchResultItem[]> {
    const response = await upstreamFetch(API_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      timeoutMs: this.timeoutMs,
      body: { query, max_results: limit, search_depth: 'basic' },
    });
    const body = (await response.json()) as TavilyResponse;
    return (body.results ?? []).map((result) => ({
      title: result.title ?? result.url,
      url: result.url,
      snippet: result.content ?? '',
      source: safeHostname(result.url),
    }));
  }

  /** Tavily has no autocomplete endpoint. */
  async suggest(): Promise<string[]> {
    return [];
  }
}

const safeHostname = (url: string): string | undefined => {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
};
