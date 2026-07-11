import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { DB_PATH } from "./config";

// Standalone SQLite data-access layer. This mirrors the exact subset of Prisma
// queries the ported collector, simulation, and player-identity code rely on,
// against the same schema the Scrim Bot uses (Player / Match / MatchPlayer /
// PlayerMerge / CollectionMeta). Using better-sqlite3 directly keeps the app to
// a single dependency with no code generation or migration step.

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

// The copied dev.db already carries the bot's schema. If someone points the app
// at an empty file, create the tables so a fresh refresh can populate it.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS "Player" (
    "accountId" TEXT PRIMARY KEY NOT NULL,
    "username" TEXT NOT NULL,
    "elo" INTEGER,
    "lastSeenAt" DATETIME,
    "lastCollectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "PlayerMerge" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "primaryAccountId" TEXT NOT NULL,
    "mergedAccountId" TEXT NOT NULL UNIQUE,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS "Match" (
    "matchId" TEXT PRIMARY KEY NOT NULL,
    "teamAScore" INTEGER,
    "teamBScore" INTEGER,
    "result" TEXT,
    "map" TEXT,
    "region" TEXT,
    "matchType" TEXT,
    "durationSeconds" INTEGER,
    "serverId" TEXT,
    "playedAt" DATETIME,
    "detailFetchedAt" DATETIME
  );
  CREATE TABLE IF NOT EXISTS "MatchPlayer" (
    "matchId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "goals" INTEGER,
    "assists" INTEGER,
    "saves" INTEGER,
    "eloBefore" INTEGER,
    "eloAfter" INTEGER,
    "eloDelta" INTEGER,
    PRIMARY KEY ("matchId", "accountId")
  );
  CREATE TABLE IF NOT EXISTS "CollectionMeta" (
    "id" TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
    "lastRunAt" DATETIME
  );
`);

export interface PlayerRow {
  accountId: string;
  username: string;
  elo: number | null;
  lastSeenAt: string | null;
  lastCollectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatchRow {
  matchId: string;
  teamAScore: number | null;
  teamBScore: number | null;
  result: string | null;
  map: string | null;
  region: string | null;
  matchType: string | null;
  durationSeconds: number | null;
  serverId: string | null;
  playedAt: string | null;
  detailFetchedAt: string | null;
}

export interface MatchPlayerRow {
  matchId: string;
  accountId: string;
  username: string;
  team: string;
  goals: number | null;
  assists: number | null;
  saves: number | null;
  eloBefore: number | null;
  eloAfter: number | null;
  eloDelta: number | null;
}

export interface PlayerMergeRow {
  id: number;
  primaryAccountId: string;
  mergedAccountId: string;
  note: string | null;
  createdAt: string;
}

function nowIso() {
  return new Date().toISOString();
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

// ---------------------------------------------------------------------------
// Reads used by the simulation + player identity
// ---------------------------------------------------------------------------

export function getAllPlayers(): PlayerRow[] {
  return sqlite.prepare(`SELECT * FROM "Player"`).all() as PlayerRow[];
}

export function getAllMerges(): PlayerMergeRow[] {
  return sqlite.prepare(`SELECT * FROM "PlayerMerge"`).all() as PlayerMergeRow[];
}

// Matches ordered oldest-first, each carrying its MatchPlayer roster. Mirrors
// db.match.findMany({ include: { players: true }, orderBy: { playedAt: "asc" } }).
export function getMatchesWithPlayersAsc(): (MatchRow & {
  players: MatchPlayerRow[];
})[] {
  const matches = sqlite
    .prepare(`SELECT * FROM "Match" ORDER BY "playedAt" ASC`)
    .all() as MatchRow[];

  const playersByMatch = new Map<string, MatchPlayerRow[]>();
  const rows = sqlite
    .prepare(`SELECT * FROM "MatchPlayer"`)
    .all() as MatchPlayerRow[];

  for (const row of rows) {
    const list = playersByMatch.get(row.matchId) ?? [];
    list.push(row);
    playersByMatch.set(row.matchId, list);
  }

  return matches.map(match => ({
    ...match,
    players: playersByMatch.get(match.matchId) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Reads + writes used by the collector
// ---------------------------------------------------------------------------

export function getPlayer(accountId: string): PlayerRow | undefined {
  return sqlite
    .prepare(`SELECT * FROM "Player" WHERE "accountId" = ?`)
    .get(accountId) as PlayerRow | undefined;
}

export function upsertLeaderboardPlayer(params: {
  accountId: string;
  username: string;
  elo: number | null;
}) {
  const now = nowIso();
  sqlite
    .prepare(
      `INSERT INTO "Player" ("accountId","username","elo","lastSeenAt","createdAt","updatedAt")
       VALUES (@accountId,@username,@elo,@now,@now,@now)
       ON CONFLICT("accountId") DO UPDATE SET
         "username" = excluded."username",
         "elo" = excluded."elo",
         "lastSeenAt" = excluded."lastSeenAt",
         "updatedAt" = excluded."updatedAt"`
    )
    .run({ ...params, now });
}

// Match written from history only: create if new, otherwise leave untouched so
// we never clobber fields a getMatch enrichment already filled.
export function insertMatchFromHistory(match: {
  matchId: string;
  teamAScore: number | null;
  teamBScore: number | null;
  result: string | null;
  map: string | null;
  region: string | null;
  matchType: string | null;
  durationSeconds: number | null;
  playedAt: string | null;
}) {
  sqlite
    .prepare(
      `INSERT INTO "Match"
        ("matchId","teamAScore","teamBScore","result","map","region","matchType","durationSeconds","playedAt")
       VALUES
        (@matchId,@teamAScore,@teamBScore,@result,@map,@region,@matchType,@durationSeconds,@playedAt)
       ON CONFLICT("matchId") DO NOTHING`
    )
    .run(match);
}

export function upsertMatchPlayerFromHistory(row: {
  matchId: string;
  accountId: string;
  username: string;
  team: "A" | "B";
  eloDelta: number | null;
}) {
  sqlite
    .prepare(
      `INSERT INTO "MatchPlayer" ("matchId","accountId","username","team","eloDelta")
       VALUES (@matchId,@accountId,@username,@team,@eloDelta)
       ON CONFLICT("matchId","accountId") DO UPDATE SET
         "username" = excluded."username",
         "team" = excluded."team",
         "eloDelta" = excluded."eloDelta"`
    )
    .run(row);
}

export function findMatchPlayer(
  matchId: string,
  accountId: string
): MatchPlayerRow | undefined {
  return sqlite
    .prepare(
      `SELECT * FROM "MatchPlayer" WHERE "matchId" = ? AND "accountId" = ?`
    )
    .get(matchId, accountId) as MatchPlayerRow | undefined;
}

export function updatePlayerCollectionState(
  accountId: string,
  data: { lastCollectedAt?: Date; lastSeenAt?: Date }
) {
  const sets: string[] = [];
  const params: Record<string, unknown> = { accountId, now: nowIso() };

  if (data.lastCollectedAt !== undefined) {
    sets.push(`"lastCollectedAt" = @lastCollectedAt`);
    params.lastCollectedAt = toIso(data.lastCollectedAt);
  }
  if (data.lastSeenAt !== undefined) {
    sets.push(`"lastSeenAt" = @lastSeenAt`);
    params.lastSeenAt = toIso(data.lastSeenAt);
  }
  if (sets.length === 0) return;

  sets.push(`"updatedAt" = @now`);
  sqlite
    .prepare(`UPDATE "Player" SET ${sets.join(", ")} WHERE "accountId" = @accountId`)
    .run(params);
}

// Players to scan, mirroring the collector's findMany: optional recent-activity
// window, capped, newest-seen first.
export function getPlayersForCollection(params: {
  activeCutoff: Date | null;
  take: number | null;
}): { accountId: string; username: string }[] {
  const { activeCutoff, take } = params;

  let sql = `SELECT "accountId","username" FROM "Player"`;
  const args: unknown[] = [];

  if (activeCutoff) {
    sql += ` WHERE "lastSeenAt" >= ?`;
    args.push(activeCutoff.toISOString());
  }

  sql += ` ORDER BY "lastSeenAt" DESC`;

  if (take != null) {
    sql += ` LIMIT ?`;
    args.push(take);
  }

  return sqlite.prepare(sql).all(...args) as {
    accountId: string;
    username: string;
  }[];
}

// Newest pending (unenriched) matches first, up to `budget`.
export function getPendingMatches(budget: number): { matchId: string }[] {
  return sqlite
    .prepare(
      `SELECT "matchId" FROM "Match"
       WHERE "detailFetchedAt" IS NULL
       ORDER BY "playedAt" DESC
       LIMIT ?`
    )
    .all(budget) as { matchId: string }[];
}

// Canonical enriched match writer (getMatch data): fills serverId + stamps
// detailFetchedAt. On conflict only those two fields change, leaving the
// immutable metadata as first written.
export function upsertFullMatch(match: {
  matchId: string;
  teamAScore: number | null;
  teamBScore: number | null;
  result: string | null;
  map: string | null;
  region: string | null;
  matchType: string | null;
  durationSeconds: number | null;
  serverId: string | null;
  playedAt: string | null;
  detailFetchedAt: string;
}) {
  sqlite
    .prepare(
      `INSERT INTO "Match"
        ("matchId","teamAScore","teamBScore","result","map","region","matchType","durationSeconds","serverId","playedAt","detailFetchedAt")
       VALUES
        (@matchId,@teamAScore,@teamBScore,@result,@map,@region,@matchType,@durationSeconds,@serverId,@playedAt,@detailFetchedAt)
       ON CONFLICT("matchId") DO UPDATE SET
         "serverId" = excluded."serverId",
         "detailFetchedAt" = excluded."detailFetchedAt"`
    )
    .run(match);
}

export function upsertSeenPlayer(params: {
  accountId: string;
  username: string;
}) {
  const now = nowIso();
  sqlite
    .prepare(
      `INSERT INTO "Player" ("accountId","username","lastSeenAt","createdAt","updatedAt")
       VALUES (@accountId,@username,@now,@now,@now)
       ON CONFLICT("accountId") DO UPDATE SET
         "username" = excluded."username",
         "lastSeenAt" = excluded."lastSeenAt",
         "updatedAt" = excluded."updatedAt"`
    )
    .run({ ...params, now });
}

export function upsertFullMatchPlayer(row: {
  matchId: string;
  accountId: string;
  username: string;
  team: "A" | "B";
  goals: number | null;
  assists: number | null;
  saves: number | null;
  eloBefore: number | null;
  eloAfter: number | null;
  eloDelta: number | null;
}) {
  sqlite
    .prepare(
      `INSERT INTO "MatchPlayer"
        ("matchId","accountId","username","team","goals","assists","saves","eloBefore","eloAfter","eloDelta")
       VALUES
        (@matchId,@accountId,@username,@team,@goals,@assists,@saves,@eloBefore,@eloAfter,@eloDelta)
       ON CONFLICT("matchId","accountId") DO UPDATE SET
         "username" = excluded."username",
         "team" = excluded."team",
         "goals" = excluded."goals",
         "assists" = excluded."assists",
         "saves" = excluded."saves",
         "eloBefore" = excluded."eloBefore",
         "eloAfter" = excluded."eloAfter",
         "eloDelta" = excluded."eloDelta"`
    )
    .run(row);
}

export function stampCollectionRun() {
  const now = nowIso();
  sqlite
    .prepare(
      `INSERT INTO "CollectionMeta" ("id","lastRunAt") VALUES ('default',@now)
       ON CONFLICT("id") DO UPDATE SET "lastRunAt" = excluded."lastRunAt"`
    )
    .run({ now });
}

export function getCollectionMeta(): { lastRunAt: string | null } | undefined {
  return sqlite
    .prepare(`SELECT "lastRunAt" FROM "CollectionMeta" WHERE "id" = 'default'`)
    .get() as { lastRunAt: string | null } | undefined;
}

// Snapshot used by the UI to show whether the DB has enough data to simulate.
export function getDbStats() {
  const players = (
    sqlite.prepare(`SELECT COUNT(*) c FROM "Player"`).get() as { c: number }
  ).c;
  const matches = (
    sqlite.prepare(`SELECT COUNT(*) c FROM "Match"`).get() as { c: number }
  ).c;
  const enriched = (
    sqlite
      .prepare(`SELECT COUNT(*) c FROM "Match" WHERE "detailFetchedAt" IS NOT NULL`)
      .get() as { c: number }
  ).c;
  const fullRosterMatches = (
    sqlite
      .prepare(
        `SELECT COUNT(*) c FROM (
           SELECT "matchId" FROM "MatchPlayer"
           GROUP BY "matchId"
           HAVING SUM("team" = 'A') = 4 AND SUM("team" = 'B') = 4
         )`
      )
      .get() as { c: number }
  ).c;

  return {
    players,
    matches,
    enriched,
    fullRosterMatches,
    lastRunAt: getCollectionMeta()?.lastRunAt ?? null,
  };
}
