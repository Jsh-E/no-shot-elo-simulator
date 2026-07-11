import {
  getLeaderboard,
  getPlayerMatchHistory,
  getMatch,
  type MatchType,
} from "./api";
import {
  getPlayer,
  upsertLeaderboardPlayer,
  insertMatchFromHistory,
  upsertMatchPlayerFromHistory,
  findMatchPlayer,
  updatePlayerCollectionState,
  getPlayersForCollection,
  getPendingMatches,
  upsertFullMatch,
  upsertSeenPlayer,
  upsertFullMatchPlayer,
  stampCollectionRun,
} from "./db";

// Ported from the Scrim Bot (src/temporal/collector.ts). Rate limiting lives at
// the HTTP boundary (api.ts) so every caller shares one global token bucket;
// this module just calls the API functions directly and persists via the repo.

export type CollectionProgress = {
  stage: string;
  current: number;
  total: number;
  savedPlayers: number;
  newMatches: number;
  skippedMatches: number;
  enrichedMatches: number;
};

function getTotalPages(data: any, fallbackPageSize = 50) {
  const totalCount = data.totalCount ?? data.total ?? 0;
  const pageSize = data.pageSize ?? fallbackPageSize;

  if (!totalCount) return 1;

  return Math.ceil(totalCount / pageSize);
}

function getPlayersFromLeaderboard(data: any): any[] {
  return data.players ?? data.items ?? data.results ?? [];
}

function getMatchesFromHistory(data: any): any[] {
  return data.matches ?? data.items ?? data.results ?? [];
}

export async function catalogLeaderboardPlayers(
  matchType: MatchType = "RANKED",
  maxPages = 10
) {
  let page = 1;
  let totalPages = 1;
  let savedPlayers = 0;

  while (page <= totalPages && page <= maxPages) {
    const data = await getLeaderboard(page, 50, matchType);
    const players = getPlayersFromLeaderboard(data);

    console.log(
      `[COLLECTOR] Parsed ${players.length} players from ${matchType} leaderboard page ${page}`
    );

    for (const player of players) {
      const accountId = player.accountId ?? player.id;
      const username = player.username ?? player.displayName ?? player.name;

      if (!accountId || !username) continue;

      upsertLeaderboardPlayer({
        accountId,
        username,
        elo: player.elo ?? player.rating ?? null,
      });

      savedPlayers++;
    }

    totalPages = getTotalPages(data);
    page++;
  }

  return { savedPlayers, pagesScanned: page - 1 };
}

// History encodes team as an integer: 0 = Team A, 1 = Team B. Downstream expects
// "A"/"B", so normalize here.
function teamFromHistory(playerTeam: any): "A" | "B" {
  return playerTeam === 1 || playerTeam === "1" ? "B" : "A";
}

// Write a match + this player's row from history only (no getMatch). Stats,
// serverId and the full roster are left for enrichment; detailFetchedAt stays
// null to mark the match pending.
function saveMatchFromHistory(accountId: string, username: string, match: any) {
  const matchId = match.matchId ?? match.id;
  if (!matchId) return;

  insertMatchFromHistory({
    matchId,
    teamAScore: match.teamAScore ?? null,
    teamBScore: match.teamBScore ?? null,
    result: match.result ?? null,
    map: match.map ?? match.mapName ?? null,
    region: match.region ?? null,
    matchType: match.matchType ?? null,
    durationSeconds: match.durationSeconds ?? match.duration ?? null,
    playedAt: match.playedAt ? new Date(match.playedAt).toISOString() : null,
  });

  upsertMatchPlayerFromHistory({
    matchId,
    accountId,
    username,
    team: teamFromHistory(match.playerTeam),
    eloDelta: match.playerEloDelta ?? null,
  });
}

export type CollectHistoryOptions = {
  stopOnKnownMatch?: boolean;
};

export async function collectPlayerHistory(
  accountId: string,
  maxPages = 3,
  options: CollectHistoryOptions = {}
) {
  const { stopOnKnownMatch = false } = options;

  const player = getPlayer(accountId);
  const username = player?.username ?? accountId;
  const watermark = player?.lastCollectedAt
    ? new Date(player.lastCollectedAt)
    : null;

  let page = 1;
  let totalPages = 1;
  let newMatches = 0;
  let skippedMatches = 0;
  let reachedKnownHistory = false;
  let newestSeen: Date | null = null;

  while (page <= totalPages && page <= maxPages && !reachedKnownHistory) {
    const data = await getPlayerMatchHistory(accountId, page, 50);
    const matches = getMatchesFromHistory(data);

    // Sort newest-first locally so the early-exit can't break on an API change.
    matches.sort((a, b) => {
      const ta = a.playedAt ? new Date(a.playedAt).getTime() : 0;
      const tb = b.playedAt ? new Date(b.playedAt).getTime() : 0;
      return tb - ta;
    });

    for (const match of matches) {
      const matchId = match.matchId ?? match.id;
      if (!matchId) continue;

      const playedAt = match.playedAt ? new Date(match.playedAt) : null;

      if (stopOnKnownMatch && watermark && playedAt && playedAt <= watermark) {
        reachedKnownHistory = true;
        break;
      }

      if (playedAt && (!newestSeen || playedAt > newestSeen)) {
        newestSeen = playedAt;
      }

      const existingRow = findMatchPlayer(matchId, accountId);

      if (existingRow) {
        skippedMatches++;
        continue;
      }

      saveMatchFromHistory(accountId, username, match);
      newMatches++;
    }

    totalPages = getTotalPages(data);
    page++;
  }

  const playerUpdate: { lastCollectedAt?: Date; lastSeenAt?: Date } = {};
  if (newestSeen && (!watermark || newestSeen > watermark)) {
    playerUpdate.lastCollectedAt = newestSeen;
  }
  if (newMatches > 0) {
    playerUpdate.lastSeenAt = new Date();
  }
  if (Object.keys(playerUpdate).length > 0) {
    updatePlayerCollectionState(accountId, playerUpdate);
  }

  return { accountId, newMatches, skippedMatches, pagesScanned: page - 1 };
}

// Per-run getMatch enrichment budgets. Fast keeps a steady-state sync short;
// deep drains a larger backlog. Both bounded so a run can't sit on the rate
// limiter indefinitely.
const ENRICH_BUDGET_FAST = 150;
const ENRICH_BUDGET_DEEP = 750;

export type EnrichResult = {
  attempted: number;
  enriched: number;
  failed: number;
};

export async function enrichMatches(
  budget: number,
  onMatch?: (current: number, total: number, enriched: number) => Promise<void>
): Promise<EnrichResult> {
  const pending = getPendingMatches(budget);

  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const { matchId } = pending[i];

    try {
      const fullMatch = await getMatch(matchId);
      saveFullMatch(fullMatch);
      enriched++;
    } catch (err) {
      console.error(`[COLLECTOR] Failed to enrich match ${matchId}`, err);
      failed++;
    }

    await onMatch?.(i + 1, pending.length, enriched);
  }

  return { attempted: pending.length, enriched, failed };
}

let collectionInProgress = false;

export function isCollectionInProgress() {
  return collectionInProgress;
}

// Single-flight guard: only one collection may run at a time so the shared API
// budget isn't split.
export type RunCollectionOptions = {
  deep?: boolean;
  activeWindowDays?: number;
};

export async function runBasicCollection(
  onProgress?: (progress: CollectionProgress) => Promise<void>,
  options: RunCollectionOptions = {}
) {
  if (collectionInProgress) {
    throw new Error("Collection already in progress");
  }

  collectionInProgress = true;

  try {
    return await runBasicCollectionInner(onProgress, options);
  } finally {
    collectionInProgress = false;
  }
}

async function runBasicCollectionInner(
  onProgress?: (progress: CollectionProgress) => Promise<void>,
  options: RunCollectionOptions = {}
) {
  const { deep = false, activeWindowDays } = options;
  let savedPlayers = 0;
  let newMatches = 0;
  let skippedMatches = 0;
  let enrichedMatches = 0;

  await onProgress?.({
    stage: "Collecting ranked leaderboard",
    current: 0,
    total: 2,
    savedPlayers,
    newMatches,
    skippedMatches,
    enrichedMatches,
  });

  console.log("[COLLECTOR] Collecting RANKED leaderboard...");
  const rankedLeaderboard = await catalogLeaderboardPlayers("RANKED", 10);
  savedPlayers += rankedLeaderboard.savedPlayers;

  await onProgress?.({
    stage: "Collecting normal leaderboard",
    current: 1,
    total: 2,
    savedPlayers,
    newMatches,
    skippedMatches,
    enrichedMatches,
  });

  console.log("[COLLECTOR] Collecting NORMAL leaderboard...");
  const normalLeaderboard = await catalogLeaderboardPlayers("NORMAL", 10);
  savedPlayers += normalLeaderboard.savedPlayers;

  const activeCutoff =
    !deep && activeWindowDays
      ? new Date(Date.now() - activeWindowDays * 24 * 60 * 60 * 1000)
      : null;

  const players = getPlayersForCollection({
    activeCutoff,
    take: activeCutoff ? null : 500,
  });

  await onProgress?.({
    stage: "Collecting player histories",
    current: 0,
    total: players.length,
    savedPlayers,
    newMatches,
    skippedMatches,
    enrichedMatches,
  });

  let scanned = 0;

  for (const player of players) {
    console.log(`[COLLECTOR] Collecting history for ${player.username}`);

    const result = await collectPlayerHistory(player.accountId, deep ? 25 : 10, {
      stopOnKnownMatch: !deep,
    });

    scanned++;
    newMatches += result.newMatches;
    skippedMatches += result.skippedMatches;

    await onProgress?.({
      stage: `Collecting history: ${player.username}`,
      current: scanned,
      total: players.length,
      savedPlayers,
      newMatches,
      skippedMatches,
      enrichedMatches,
    });
  }

  console.log("[COLLECTOR] Enriching pending match details...");
  const enrichment = await enrichMatches(
    deep ? ENRICH_BUDGET_DEEP : ENRICH_BUDGET_FAST,
    async (current, total, enriched) => {
      enrichedMatches = enriched;
      await onProgress?.({
        stage: "Enriching match details (getMatch)",
        current,
        total,
        savedPlayers,
        newMatches,
        skippedMatches,
        enrichedMatches,
      });
    }
  );

  stampCollectionRun();

  return {
    leaderboard: {
      savedPlayers,
      pagesScanned:
        rankedLeaderboard.pagesScanned + normalLeaderboard.pagesScanned,
    },
    histories: {
      playersScanned: scanned,
      totalNewMatches: newMatches,
      totalSkippedMatches: skippedMatches,
    },
    enrichment,
  };
}

export function saveFullMatch(match: any) {
  const matchId = match.matchId ?? match.id;
  if (!matchId) return;

  const now = new Date().toISOString();

  upsertFullMatch({
    matchId,
    teamAScore: match.teamAScore ?? match.blueScore ?? null,
    teamBScore: match.teamBScore ?? match.redScore ?? null,
    result: match.result ?? null,
    map: match.map ?? match.mapName ?? null,
    region: match.region ?? null,
    matchType: match.matchType ?? null,
    durationSeconds: match.durationSeconds ?? match.duration ?? null,
    serverId: match.serverId ?? null,
    playedAt: match.playedAt ? new Date(match.playedAt).toISOString() : null,
    detailFetchedAt: now,
  });

  const teamA = match.teamA ?? match.blueTeam ?? [];
  const teamB = match.teamB ?? match.redTeam ?? [];

  for (const player of teamA) {
    saveMatchPlayer(matchId, player, "A");
  }

  for (const player of teamB) {
    saveMatchPlayer(matchId, player, "B");
  }
}

function saveMatchPlayer(matchId: string, player: any, team: "A" | "B") {
  const accountId = player.accountId ?? player.id;
  const username = player.username ?? player.displayName ?? player.name;

  if (!accountId || !username) return;

  upsertSeenPlayer({ accountId, username });

  upsertFullMatchPlayer({
    matchId,
    accountId,
    username,
    team,
    goals: player.goals ?? null,
    assists: player.assists ?? null,
    saves: player.saves ?? null,
    eloBefore: player.eloBefore ?? null,
    eloAfter: player.eloAfter ?? null,
    eloDelta: player.eloDelta ?? null,
  });
}
