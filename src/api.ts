// Ported verbatim from the Scrim Bot (src/temporal/api.ts). Rate-limited client
// for the public iterationthree API. A single global token bucket throttles all
// callers together, staying safely under the documented 25 req/min/IP cap.

const BASE_URL = process.env.API_BASE_URL ?? "https://api.iterationthree.games";

export type MatchType = "NORMAL" | "RANKED";

const RATE_LIMIT_PER_MIN = 22;
const REFILL_INTERVAL_MS = Math.ceil(60_000 / RATE_LIMIT_PER_MIN);
const BUCKET_CAPACITY = 2;
const RATE_LIMIT_BACKOFF_MS = 60_000;
const MAX_RETRIES = 3;

let tokens = BUCKET_CAPACITY;
let lastRefill = Date.now();

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acquireToken() {
  for (;;) {
    const now = Date.now();
    const elapsed = now - lastRefill;

    if (elapsed >= REFILL_INTERVAL_MS) {
      const refill = Math.floor(elapsed / REFILL_INTERVAL_MS);
      tokens = Math.min(BUCKET_CAPACITY, tokens + refill);
      lastRefill += refill * REFILL_INTERVAL_MS;
    }

    if (tokens >= 1) {
      tokens -= 1;
      return;
    }

    await sleep(Math.max(lastRefill + REFILL_INTERVAL_MS - now, 0));
  }
}

async function apiGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  retries = MAX_RETRIES
): Promise<T> {
  await acquireToken();

  const url = new URL(`${BASE_URL}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url);

  if (res.status === 429 && retries > 0) {
    console.warn("[API] Hit 429 rate limit; backing off.");
    tokens = 0;
    await sleep(RATE_LIMIT_BACKOFF_MS);
    return apiGet(path, params, retries - 1);
  }

  if (!res.ok) {
    throw new Error(`API request failed ${res.status}: ${url.toString()}`);
  }

  return res.json() as Promise<T>;
}

export function getLeaderboard(
  page = 1,
  pageSize = 50,
  matchType: MatchType = "RANKED"
) {
  return apiGet<any>("/temporal/accounts/leaderboard", {
    page,
    pageSize,
    matchType,
  });
}

export function getPlayerMatchHistory(
  accountId: string,
  page = 1,
  pageSize = 50
) {
  return apiGet<any>("/temporal/matches/history", {
    accountId,
    page,
    pageSize,
  });
}

export function getMatch(matchId: string) {
  return apiGet<any>(`/temporal/matches/${matchId}`);
}
