import { CatalogError, type SourceId } from "./types";

export interface RequestOptions {
  source: SourceId;
  timeoutMs?: number;
  retries?: number;
  init?: RequestInit;
}

/**
 * Per-source politeness limits. CDS (SIMBAD/VizieR) asks for no more than a few
 * requests per second; Horizons and ATNF are slower services, so we stay gentle.
 */
const LIMITS: Record<SourceId, { concurrency: number; minIntervalMs: number }> = {
  simbad: { concurrency: 2, minIntervalMs: 200 },
  vsx: { concurrency: 2, minIntervalMs: 200 },
  gaia: { concurrency: 2, minIntervalMs: 250 },
  atnf: { concurrency: 1, minIntervalMs: 500 },
  jpl: { concurrency: 1, minIntervalMs: 300 },
  wikidata: { concurrency: 2, minIntervalMs: 100 },
};

class Limiter {
  private active = 0;
  private lastStart = 0;
  private queue: (() => void)[] = [];

  constructor(
    private concurrency: number,
    private minIntervalMs: number,
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }

  private async acquire() {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    const wait = this.lastStart + this.minIntervalMs - Date.now();
    this.lastStart = Math.max(Date.now(), this.lastStart + this.minIntervalMs);
    if (wait > 0) await sleep(wait);
  }
}

const limiters = new Map<SourceId, Limiter>();
function limiterFor(source: SourceId) {
  let limiter = limiters.get(source);
  if (!limiter) {
    const { concurrency, minIntervalMs } = LIMITS[source];
    limiter = new Limiter(concurrency, minIntervalMs);
    limiters.set(source, limiter);
  }
  return limiter;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wikimedia and CDS ask API clients to identify themselves with a way to reach the operator.
 * CATALOG_CONTACT can be a URL or email; otherwise the public site URL is used.
 */
const USER_AGENT = `skysound/0.1 (+${process.env.CATALOG_CONTACT ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://github.com/skysound"})`;

/** Retry-After in ms (seconds or HTTP date), capped so a request never stalls the UI for long. */
function retryAfterMs(res: Response) {
  const h = res.headers.get("retry-after");
  if (!h) return 0;
  const secs = Number(h);
  const ms = Number.isFinite(secs) ? secs * 1000 : new Date(h).getTime() - Date.now();
  return Math.min(Math.max(ms, 0), 5000);
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

/** Fetch with timeout, exponential backoff on transient failures, and per-source rate limiting. */
export async function request(url: string, opts: RequestOptions): Promise<Response> {
  const { source, timeoutMs = 15_000, retries = 2, init } = opts;
  let lastError: CatalogError | undefined;
  let serverWait = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.max(serverWait, 400 * 2 ** (attempt - 1) + Math.random() * 200));
    try {
      const res = await limiterFor(source).run(() =>
        fetch(url, {
          ...init,
          signal: AbortSignal.timeout(timeoutMs),
          headers: { "User-Agent": USER_AGENT, ...init?.headers },
        }),
      );
      if (res.ok) return res;
      serverWait = retryAfterMs(res);
      lastError = new CatalogError(`${source} responded ${res.status}`, source, isRetryableStatus(res.status));
      if (!lastError.retryable) throw lastError;
    } catch (err) {
      if (err instanceof CatalogError && !err.retryable) throw err;
      lastError =
        err instanceof CatalogError
          ? err
          : new CatalogError(`${source} request failed: ${(err as Error).message}`, source, true);
    }
  }
  throw lastError!;
}

export async function requestText(url: string, opts: RequestOptions) {
  return (await request(url, opts)).text();
}

export async function requestJson(url: string, opts: RequestOptions): Promise<unknown> {
  const res = await request(url, opts);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new CatalogError(`${opts.source} returned non-JSON: ${text.slice(0, 120)}`, opts.source, false);
  }
}
