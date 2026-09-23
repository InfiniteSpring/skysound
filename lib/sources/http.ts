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

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

/** Fetch with timeout, exponential backoff on transient failures, and per-source rate limiting. */
export async function request(url: string, opts: RequestOptions): Promise<Response> {
  const { source, timeoutMs = 15_000, retries = 2, init } = opts;
  let lastError: CatalogError | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(400 * 2 ** (attempt - 1) + Math.random() * 200);
    try {
      const res = await limiterFor(source).run(() =>
        fetch(url, {
          ...init,
          signal: AbortSignal.timeout(timeoutMs),
          headers: { "User-Agent": "skysound/0.1 (space music MVP)", ...init?.headers },
        }),
      );
      if (res.ok) return res;
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
