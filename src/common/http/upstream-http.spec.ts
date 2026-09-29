import { parseSse, UpstreamRequestError, upstreamFetch } from './upstream-http';

const streamOf = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });

const collect = async (body: ReadableStream<Uint8Array>) => {
  const events = [];
  for await (const event of parseSse(body)) events.push(event);
  return events;
};

describe('parseSse', () => {
  it('parses events split across arbitrary chunk boundaries', async () => {
    const events = await collect(
      streamOf('event: delta\nda', 'ta: {"a":1}\n', '\ndata: [DO', 'NE]\n\n'),
    );
    expect(events).toEqual([
      { event: 'delta', data: '{"a":1}' },
      { event: 'message', data: '[DONE]' },
    ]);
  });

  it('handles CRLF line endings, comments and multi-line data', async () => {
    const events = await collect(
      streamOf(': keep-alive\r\n', 'data: line1\r\ndata: line2\r\n\r\n'),
    );
    expect(events).toEqual([{ event: 'message', data: 'line1\nline2' }]);
  });

  it('flushes a trailing event without a final blank line', async () => {
    expect(await collect(streamOf('data: last'))).toEqual([{ event: 'message', data: 'last' }]);
  });
});

describe('upstreamFetch', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['OpenAI style', { error: { message: 'Incorrect API key' } }, 'Incorrect API key'],
    ['Gemini style', [{ error: { message: 'API key not valid' } }], 'API key not valid'],
    ['plain string', { error: 'Rate limited' }, 'Rate limited'],
  ])('extracts %s error messages', async (_, body, expected) => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 401 }));

    const error = await upstreamFetch('https://vendor.test', {
      headers: {},
      timeoutMs: 1000,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamRequestError);
    expect(error).toMatchObject({ message: expected, status: 401 });
  });

  it('wraps network failures', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      upstreamFetch('https://vendor.test', { headers: {}, timeoutMs: 1000 }),
    ).rejects.toThrow('Could not reach provider: fetch failed');
  });
});
