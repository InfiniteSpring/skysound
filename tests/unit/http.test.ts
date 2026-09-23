import { afterEach, describe, expect, it, vi } from "vitest";
import { request } from "@/lib/sources/http";
import { CatalogError } from "@/lib/sources/types";

afterEach(() => vi.unstubAllGlobals());

const respond = (status: number, body = "ok") => new Response(body, { status });

describe("request", () => {
  it("retries transient failures and then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(503))
      .mockRejectedValueOnce(new TypeError("socket hang up"))
      .mockResolvedValueOnce(respond(200, "done"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await request("https://example.test/a", { source: "gaia", retries: 2 });
    expect(await res.text()).toBe("done");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry client errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(400));
    vi.stubGlobal("fetch", fetchMock);
    await expect(request("https://example.test/b", { source: "gaia" })).rejects.toBeInstanceOf(CatalogError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry budget", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(502));
    vi.stubGlobal("fetch", fetchMock);
    await expect(request("https://example.test/c", { source: "gaia", retries: 1 })).rejects.toMatchObject({
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts slow responses", async () => {
    vi.stubGlobal("fetch", (_: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    await expect(
      request("https://example.test/d", { source: "gaia", timeoutMs: 30, retries: 0 }),
    ).rejects.toThrow(/aborted/);
  });

  it("rate-limits per source", async () => {
    const starts: number[] = [];
    vi.stubGlobal("fetch", async () => {
      starts.push(Date.now());
      return respond(200);
    });
    await Promise.all([1, 2, 3].map((i) => request(`https://example.test/e${i}`, { source: "atnf" })));
    // atnf: concurrency 1, 500 ms apart
    expect(starts[2] - starts[0]).toBeGreaterThanOrEqual(950);
  });
});
