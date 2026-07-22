// Core invariant + regression tests. Run: npm test
//
// Pure-helper tests need no database. The full-run tests call runSimulation,
// which reads data/dev.db; they skip themselves if the pool is too small so a
// fresh clone with an empty DB still passes the suite.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getExpectedTeamDelta,
  getLegacyTeamDelta,
  getPoolWeights,
  distributeWinningPool,
  distributeLosingPool,
  buildSnakeTeams,
  buildOptimalTeams,
  buildBalancedTeams,
  buildInitialPlayerPool,
  runSimulation,
} from "../src/simulation.ts";

// --- helpers ---------------------------------------------------------------

function player(elo: number, extra: Partial<any> = {}) {
  return {
    key: `p${elo}-${Math.random()}`,
    username: "x",
    elo,
    matches: 0,
    statMatches: 0,
    avgGoals: 0,
    avgAssists: 0,
    avgSaves: 0,
    trueSkill: 0,
    historicalMatches: 0,
    ...extra,
  } as any;
}

function row(accountId: string, goals: number, assists: number, saves: number) {
  return { accountId, username: accountId, team: "A", goals, assists, saves, eloDelta: 0 };
}

const WEIGHTS = { goalWeight: 1.1, assistWeight: 0.9, saveWeight: 2.5, performanceScale: 240 };

// A pool big enough to simulate; several tests share it. null when the DB is empty.
function poolOrSkip() {
  const pool = buildInitialPlayerPool({
    startingMode: "official",
    minMatches: 10,
    goalWeight: 1.1,
    assistWeight: 0.9,
    saveWeight: 2.5,
    guaranteedRatio: 0.75,
    kFactor: 20,
    expectedScale: 30,
    performanceScale: 240,
    eloFloor: 750,
  });
  return pool.length >= 8 ? pool : null;
}

// --- Tier 1: invariants ----------------------------------------------------

test("pool is zero-sum before flooring", () => {
  const winners = [row("a", 3, 1, 0), row("b", 1, 2, 1), row("c", 0, 0, 4), row("d", 2, 0, 0)];
  const losers = [row("e", 1, 0, 0), row("f", 0, 1, 2), row("g", 2, 1, 0), row("h", 0, 0, 1)];
  const eloByAccountId = new Map<string, number>(
    [...winners, ...losers].map((r, i) => [r.accountId, 900 + i * 30])
  );

  const pool = 40; // averageTeamDelta * team size
  const guaranteed = 0.75;

  const wWeights = getPoolWeights({ players: winners, eloByAccountId, ...WEIGHTS }).winningWeights;
  const lWeights = getPoolWeights({ players: losers, eloByAccountId, ...WEIGHTS }).losingWeights;

  const wSum = distributeWinningPool(winners, pool, guaranteed, wWeights)
    .reduce((s, r) => s + r.delta, 0);
  const lSum = distributeLosingPool(losers, pool, guaranteed, lWeights)
    .reduce((s, r) => s + r.delta, 0);

  assert.ok(Math.abs(wSum + lSum) < 1e-9, `winner pool ${wSum} + loser pool ${lSum} != 0`);
});

test("snake deals ranks 1,4,5,8 vs 2,3,6,7", () => {
  const lobby = [1000, 900, 800, 700, 600, 500, 400, 300].map(e => player(e));
  const { teamA, teamB } = buildSnakeTeams(lobby);
  const elos = (t: any[]) => t.map(p => p.elo).sort((a, b) => b - a);
  // ranks 0,3,4,7 (highest, 4th, 5th, lowest) -> 1000,700,600,300
  assert.deepEqual(elos(teamA), [1000, 700, 600, 300]);
  assert.deepEqual(elos(teamB), [900, 800, 500, 400]);
});

test("credit shares: winning and losing weights are disjoint and balance", () => {
  const players = [row("a", 5, 0, 0), row("b", 0, 0, 0), row("c", 1, 1, 1), row("d", 0, 0, 2)];
  const eloByAccountId = new Map(players.map((r, i) => [r.accountId, 1000 + i * 10]));
  const { winningWeights, losingWeights } = getPoolWeights({ players, eloByAccountId, ...WEIGHTS });

  // A player is either above or below their rating-expected share, never both.
  winningWeights.forEach((w, i) => {
    assert.ok(w === 0 || losingWeights[i] === 0, `player ${i} appears in both pools`);
  });
  // Σ(actual-expected over-performers) == Σ(expected-actual under-performers).
  const over = winningWeights.reduce((s, w) => s + w, 0);
  const under = losingWeights.reduce((s, w) => s + w, 0);
  assert.ok(Math.abs(over - under) < 1e-9, `over ${over} != under ${under}`);
});

test("optimal split is never worse than balanced", () => {
  for (let trial = 0; trial < 20; trial++) {
    const lobby = Array.from({ length: 8 }, () => player(700 + Math.floor(Math.random() * 600)));
    const gap = (t: { teamA: any[]; teamB: any[] }) =>
      Math.abs(
        t.teamA.reduce((s, p) => s + p.elo, 0) / t.teamA.length -
          t.teamB.reduce((s, p) => s + p.elo, 0) / t.teamB.length
      );
    const optimal = gap(buildOptimalTeams(lobby));
    const balanced = gap(buildBalancedTeams(lobby));
    assert.ok(optimal <= balanced + 1e-9, `optimal ${optimal} > balanced ${balanced}`);
  }
});

// --- Tier 2: regression guards for this session's changes -------------------

test("legacy payout clamps into [min,max]", () => {
  const k = 20, scale = 30, min = 9, max = 11;
  // Huge favorite: expected-score pool -> ~0, clamps up to min.
  assert.equal(getLegacyTeamDelta(2000, 1000, k, scale, min, max), min);
  // Huge underdog winning: pool -> ~K, clamps down to max.
  assert.equal(getLegacyTeamDelta(1000, 2000, k, scale, min, max), max);
  // Even teams: unclamped expected-score value (K/2 = 10) sits inside the band.
  const even = getLegacyTeamDelta(1000, 1000, k, scale, min, max);
  assert.equal(even, getExpectedTeamDelta(1000, 1000, k, scale));
  assert.ok(even >= min && even <= max);
});

test("seed makes a run reproduce; different seed differs", () => {
  const pool = poolOrSkip();
  if (!pool) return; // empty DB: nothing to simulate
  const cfg = { simulatedMatches: 150, simulations: 3, teamAssignment: "optimal" as const };
  const a = runSimulation({ ...cfg, seed: "inv" });
  const b = runSimulation({ ...cfg, seed: "inv" });
  const c = runSimulation({ ...cfg, seed: "other" });
  assert.ok(a.ok && b.ok && c.ok);
  assert.deepEqual(a.summary, b.summary, "same seed should reproduce");
  assert.notDeepEqual(a.summary, c.summary, "different seed should differ");
});

test("no rating ends below the floor", () => {
  const pool = poolOrSkip();
  if (!pool) return;
  const r = runSimulation({
    simulatedMatches: 300, simulations: 3, eloFloor: 750, seed: "floor",
  });
  assert.ok(r.ok);
  for (const result of r.exportData.simulationResults) {
    for (const elo of result.finalElos) {
      assert.ok(elo >= 750, `found ${elo} below floor 750`);
    }
  }
});

test("legacy payout is flat: every gain in [min,max], independent of guaranteed %", () => {
  const pool = poolOrSkip();
  if (!pool) return;
  const cfg = {
    simulatedMatches: 400, simulations: 3, teamAssignment: "snake" as const,
    payoutMode: "legacy" as const, legacyMinDelta: 9, legacyMaxDelta: 11,
    eloFloor: -1_000_000, seed: "flat",
  };
  const g75 = runSimulation({ ...cfg, guaranteedPercent: 75 });
  const g100 = runSimulation({ ...cfg, guaranteedPercent: 100 });
  assert.ok(g75.ok && g100.ok);
  // Guaranteed % must not affect legacy results — the payout ignores it.
  assert.deepEqual(g75.summary.averageFinal, g100.summary.averageFinal);
  assert.deepEqual(g75.summary.matchOutcomes, g100.summary.matchOutcomes);
  // No single win or loss ever moves more than the band's max.
  assert.ok(g75.summary.eloMovement.maxGain <= 11 + 1e-9);
  assert.ok(g75.summary.eloMovement.maxLoss <= 11 + 1e-9);
});

test("trueSkill is the fixed weighted average, and export aligns with fakes", () => {
  const pool = poolOrSkip();
  if (!pool) return;
  // trueSkill == weighted historical averages, captured at pool build.
  for (const p of pool) {
    const expected = p.avgGoals * 1.1 + p.avgAssists * 0.9 + p.avgSaves * 2.5;
    assert.ok(Math.abs(p.trueSkill - expected) < 1e-9);
  }
  // currentElos aligns with playerNames; fake slots are null.
  const r = runSimulation({ simulatedMatches: 100, simulations: 2, fakePlayerCount: 5, seed: "fake" });
  assert.ok(r.ok);
  const e = r.exportData;
  assert.equal(e.currentElos.length, e.playerNames.length);
  assert.equal(e.currentElos.filter((v: any) => v === null).length, 5);
});
