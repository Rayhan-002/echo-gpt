/** Failure talking to an upstream AI vendor. `status` is the upstream HTTP status, if any. */
export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderRequestError';
  }
}

interface ProviderFetchOptions {
  method?: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: unknown;
  /** Max time to wait for the response headers. Streams may run longer. */
  timeoutMs: number;
  signal?: AbortSignal;
}

/**
 * fetch() wrapper for vendor APIs: JSON encoding, header timeout, caller
 * cancellation and normalized error messages.
 */
export async function providerFetch(url: string, options: ProviderFetchOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), options.timeoutMs);
  const onCallerAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onCallerAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = controller.signal.reason instanceof Error && !options.signal?.aborted;
    throw new ProviderRequestError(
      timedOut
        ? `Provider did not respond within ${options.timeoutMs}ms`
        : `Could not reach provider: ${(error as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onCallerAbort);
  }

  if (!response.ok) {
    throw new ProviderRequestError(
      extractErrorMessage(await response.text()) ?? `HTTP ${response.status}`,
      response.status,
    );
  }
  return response;
}

/** Vendors nest the message differently: {error:{message}}, {error:"..."}, [{error:{message}}]. */
function extractErrorMessage(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    const root = (Array.isArray(parsed) ? parsed[0] : parsed) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const message =
      typeof root?.error === 'string' ? root.error : (root?.error?.message ?? root?.message);
    return message?.slice(0, 500);
  } catch {
    return body ? body.slice(0, 500) : undefined;
  }
}

export interface SseEvent {
  event: string;
  data: string;
}

/** Minimal Server-Sent Events parser for a fetch() response body. */
export async function* parseSse(body: ReadableStream<Uint8Array> | null): AsyncGenerator<SseEvent> {
  if (!body) return;
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  let data: string[] = [];

  const takeEvent = (): SseEvent | null => {
    const result = data.length ? { event: event || 'message', data: data.join('\n') } : null;
    event = '';
    data = [];
    return result;
  };

  /** Applies one line; returns a completed event on a blank line. */
  const processLine = (rawLine: string): SseEvent | null => {
    const line = rawLine.replace(/\r$/, '');
    if (line === '') return takeEvent();
    if (line.startsWith(':')) return null; // comment / keep-alive

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    return null;
  };

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const completed = processLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      if (completed) yield completed;
    }
  }

  // The stream may end without a trailing newline / blank line.
  if (buffer) processLine(buffer);
  const trailing = takeEvent();
  if (trailing) yield trailing;
}

export const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');
