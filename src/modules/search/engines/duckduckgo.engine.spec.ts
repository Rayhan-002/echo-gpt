import { normalizeQuery } from '../search.service';
import { DuckDuckGoSearchEngine } from './duckduckgo.engine';

describe('DuckDuckGoSearchEngine', () => {
  const engine = new DuckDuckGoSearchEngine(1000);

  afterEach(() => jest.restoreAllMocks());

  const mockResponse = (body: unknown) =>
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(body)));

  it('maps the abstract and flattens nested related topics, deduplicating URLs', async () => {
    mockResponse({
      Heading: 'NestJS',
      AbstractText: 'A Node.js framework.',
      AbstractURL: 'https://en.wikipedia.org/wiki/NestJS',
      AbstractSource: 'Wikipedia',
      RelatedTopics: [
        { FirstURL: 'https://ddg.gg/Node.js', Text: 'Node.js - A JavaScript runtime' },
        {
          Name: 'See also',
          Topics: [
            { FirstURL: 'https://ddg.gg/Express', Text: 'Express - Web framework' },
            { FirstURL: 'https://ddg.gg/Node.js', Text: 'Node.js - duplicate' },
          ],
        },
        { Text: 'entry without a URL is skipped' },
      ],
    });

    const results = await engine.search('nestjs', 10);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      title: 'NestJS',
      url: 'https://en.wikipedia.org/wiki/NestJS',
      snippet: 'A Node.js framework.',
      source: 'Wikipedia',
    });
    expect(results[1]).toMatchObject({ title: 'Node.js', url: 'https://ddg.gg/Node.js' });
    expect(results[2]).toMatchObject({ title: 'Express', url: 'https://ddg.gg/Express' });
  });

  it('respects the result limit', async () => {
    mockResponse({
      RelatedTopics: Array.from({ length: 8 }, (_, i) => ({
        FirstURL: `https://ddg.gg/${i}`,
        Text: `Topic ${i}`,
      })),
    });
    expect(await engine.search('topics', 3)).toHaveLength(3);
  });

  it('parses autocomplete suggestions', async () => {
    mockResponse(['nes', ['nestjs', 'nestjs prisma', 'nest thermostat']]);
    expect(await engine.suggest('nes', 2)).toEqual(['nestjs', 'nestjs prisma']);
  });
});

describe('normalizeQuery', () => {
  it('trims, collapses whitespace and lower-cases', () => {
    expect(normalizeQuery('  What   IS\tNestJS?\n')).toBe('what is nestjs?');
  });
});
