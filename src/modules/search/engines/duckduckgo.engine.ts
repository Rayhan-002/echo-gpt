import { upstreamFetch } from '../../../common/http/upstream-http';
import { SearchEngine, SearchResultItem } from './search-engine.interface';

const API_URL = 'https://api.duckduckgo.com/';
const AUTOCOMPLETE_URL = 'https://duckduckgo.com/ac/';

interface DdgTopic {
  FirstURL?: string;
  Text?: string;
  Topics?: DdgTopic[];
}

interface DdgResponse {
  Heading?: string;
  AbstractText?: string;
  AbstractURL?: string;
  AbstractSource?: string;
  Results?: DdgTopic[];
  RelatedTopics?: DdgTopic[];
}

/**
 * DuckDuckGo Instant Answer API: free and keyless, which suits local development
 * and demos. Results are topic-oriented rather than a full web index; use Tavily
 * (SEARCH_ENGINE=tavily) for production-grade web results.
 */
export class DuckDuckGoSearchEngine implements SearchEngine {
  readonly name = 'duckduckgo';

  constructor(private readonly timeoutMs: number) {}

  async search(query: string, limit: number): Promise<SearchResultItem[]> {
    const url = `${API_URL}?${new URLSearchParams({
      q: query,
      format: 'json',
      no_html: '1',
      skip_disambig: '1',
      t: 'echogpt',
    }).toString()}`;
    const response = await upstreamFetch(url, { headers: {}, timeoutMs: this.timeoutMs });
    // The API answers with a JavaScript content type, so parse the text manually.
    const body = JSON.parse(await response.text()) as DdgResponse;

    const results: SearchResultItem[] = [];
    if (body.AbstractURL && body.AbstractText) {
      results.push({
        title: body.Heading || query,
        url: body.AbstractURL,
        snippet: body.AbstractText,
        source: body.AbstractSource,
      });
    }

    const topics = [...(body.Results ?? []), ...(body.RelatedTopics ?? [])].flatMap((topic) =>
      topic.Topics ? topic.Topics : [topic],
    );
    for (const topic of topics) {
      if (!topic.FirstURL || !topic.Text) continue;
      results.push({
        title: topic.Text.split(' - ')[0].slice(0, 200),
        url: topic.FirstURL,
        snippet: topic.Text,
        source: 'DuckDuckGo',
      });
    }

    return dedupeByUrl(results).slice(0, limit);
  }

  async suggest(prefix: string, limit: number): Promise<string[]> {
    const url = `${AUTOCOMPLETE_URL}?${new URLSearchParams({ q: prefix, type: 'list' }).toString()}`;
    const response = await upstreamFetch(url, { headers: {}, timeoutMs: this.timeoutMs });
    const [, suggestions] = JSON.parse(await response.text()) as [string, string[]];
    return (suggestions ?? []).slice(0, limit);
  }
}

const dedupeByUrl = (items: SearchResultItem[]) => [
  ...new Map(items.map((item) => [item.url, item])).values(),
];
