import { NextRequest, NextResponse } from "next/server";

const API_KEY = "b3e1f1893c570b5d072bbb18e4c27c32";
const BEARER =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJiM2UxZjE4OTNjNTcwYjVkMDcyYmJiMThlNGMyN2MzMiIsIm5iZiI6MTc3OTA0Njk4NS4zNDcwMDAxLCJzdWIiOiI2YTBhMWE0OWE4YmJiZDViNzA2ZGE0NjMiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.tteACAyP_yobcSh4Z6sG4ePbP14kIzzEaRdGC8z3n8U";
const BASE = "https://api.themoviedb.org/3";

interface CacheEntry {
  data: unknown;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE = 500;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;

  const url = new URL(`${BASE}/${path.join("/")}`);
  req.nextUrl.searchParams.forEach((v, k) => {
    if (k !== "api_key") url.searchParams.set(k, v);
  });
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", url.searchParams.get("language") || "en-US");

  const cacheKey = url.toString();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.data, {
      headers: { "X-Cache": "HIT" },
    });
  }

  try {
    let data: unknown;
    let lastErr: unknown;

    // one retry on transient network/timeout failures
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(cacheKey, {
          headers: {
            Authorization: `Bearer ${BEARER}`,
            accept: "application/json",
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          return NextResponse.json(
            { error: `TMDB error: ${res.status} ${res.statusText}` },
            { status: res.status }
          );
        }

        data = await res.json();
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (lastErr) throw lastErr;

    if (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(cacheKey, { data, ts: Date.now() });

    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to reach TMDB", detail: message },
      { status: 502 }
    );
  }
}
