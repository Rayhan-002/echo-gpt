import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';

export const MOCK_API_KEY = 'sk-e2e-test-key';

interface ChatBody {
  model: string;
  stream?: boolean;
  messages: { role: string; content: string }[];
}

const readJson = async (req: IncomingMessage): Promise<ChatBody> => {
  let raw = '';
  for await (const chunk of req) raw += String(chunk);
  return JSON.parse(raw) as ChatBody;
};

/**
 * Minimal OpenAI-compatible server: echoes the last user message, supports
 * streaming (SSE with usage) and rejects unknown API keys like the real API.
 */
export async function startMockOpenAi(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((req, res) => {
    void (async () => {
      if (req.headers.authorization !== `Bearer ${MOCK_API_KEY}`) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Incorrect API key provided' } }));
        return;
      }
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'gpt-5-mini' }] }));
        return;
      }

      const body = await readJson(req);
      const prompt = body.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
      const answer = `echo: ${prompt}`;
      const usage = { prompt_tokens: 5, completion_tokens: 3 };

      if (!body.stream) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            model: body.model,
            choices: [{ message: { role: 'assistant', content: answer } }],
            usage,
          }),
        );
        return;
      }

      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const piece of answer.split(/(?<= )/)) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ choices: [], usage })}\n\n`);
      res.end('data: [DONE]\n\n');
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}/v1` };
}
