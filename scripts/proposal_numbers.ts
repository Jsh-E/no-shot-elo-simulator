// Runs the proposal's experiment battery on the current (fully-enriched) data
// and prints every figure the proposal cites. Run: npx tsx scripts/proposal_numbers.ts
import { runSimulation, type SimulationParams } from "../src/simulation";

const BASE: Partial<SimulationParams> = {
  goalWeight: 1.1,
  assistWeight: 0.9,
  saveWeight: 2.5,
  guaranteedPercent: 75,
  kFactor: 20,
  expectedScale: 30,
  performanceScale: 240,
  eloFloor: 750,
  simulatedMatches: 2000,
  simulations: 30,
  minMatches: 10,
  // Fixed so the whole battery reproduces exactly. Override with SEED=... to
  // confirm a figure is not an artifact of this particular stream.
  seed: process.env.SEED ?? "no-shot-proposal-v1",
};

// The live system: snake matchmaking, and a flat payout clamped into the 9-11
// band seen in recorded matches, with no rating floor. Legacy mode applies no
// per-player performance weighting at all — every winner gains the same delta
// and every loser pays it back — so guaranteedPercent is irrelevant here; it is
// set to 100 only so the echoed config reads as "fully flat".
//
// eloFloor is pushed below any reachable rating rather than set to 0. The live
// system has no floor, and a floor at zero is still a floor: it absorbs a large
// amount of rating per season and understates the measured spread, hiding the
// very free-fall this experiment exists to show. Ratings legitimately go
// negative here (the season's bottom player finishes below zero).
//
// CONFIRM AGAINST THE LIVE FORMULA before citing these numbers.
const LEGACY: Partial<SimulationParams> = {
  teamAssignment: "snake",
  payoutMode: "legacy",
  legacyMinDelta: 9,
  legacyMaxDelta: 11,
  guaranteedPercent: 100,
  eloFloor: -1_000_000,
};

function pearson(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    cov += dx * dy; vx += dx * dx; vy += dy * dy;
  }
  return vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : 0;
}

// Average a per-player array across all sims (aligned by player index).
function avgByPlayer(exportData: any, key: string): number[] {
  const res = exportData.simulationResults;
  const n = exportData.playerNames.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const vals = res.map((r: any) => r[key][i]).filter((v: any) => v != null);
    out.push(vals.reduce((s: number, v: number) => s + v, 0) / vals.length);
  }
  return out;
}

function run(label: string, params: Partial<SimulationParams>) {
  const r = runSimulation({ ...BASE, ...params });
  if (!r.ok) {
    console.log(`\n### ${label}: ERROR ${r.error}`);
    return null;
  }
  const s = r.summary;
  const elos = avgByPlayer(r.exportData, "finalElos");
  const goals = avgByPlayer(r.exportData, "finalAvgGoals");
  const assists = avgByPlayer(r.exportData, "finalAvgAssists");
  const saves = avgByPlayer(r.exportData, "finalAvgSaves");

  console.log(`\n### ${label}`);
  console.log(`eligible players: ${s.setup.eligiblePlayers}`);
  console.log(`final sigma: ${s.averageFinal.stdDev.toFixed(1)} | starting sigma: ${s.startingLadder.stdDev.toFixed(1)} | variance ratio: ${s.averageFinal.varianceRatio == null ? "N/A" : s.averageFinal.varianceRatio.toFixed(3)}`);
  console.log(`official corr: ${s.averageFinal.officialCorrelation == null ? "N/A" : s.averageFinal.officialCorrelation.toFixed(3)} | skill recovery: ${s.averageFinal.skillRecovery == null ? "N/A" : s.averageFinal.skillRecovery.toFixed(3)}`);
  console.log(`win A/B/draw: ${s.matchOutcomes.teamAWinRate.toFixed(1)} / ${s.matchOutcomes.teamBWinRate.toFixed(1)} / ${s.matchOutcomes.drawRate.toFixed(1)} | upsets: ${s.matchOutcomes.upsetRate.toFixed(1)}`);
  console.log(`favored%: ${s.teamBalance.teamAFavoredRate.toFixed(1)} | median team gap: ${s.teamBalance.medianTeamEloDiff.toFixed(1)} | avg gap: ${s.teamBalance.avgTeamEloDiff.toFixed(1)}`);
  console.log(`top10: ${s.topBottomGap.top10.toFixed(0)} | bottom10: ${s.topBottomGap.bottom10.toFixed(0)} | tier gap: ${s.topBottomGap.gap.toFixed(0)}`);
  console.log(`max elo: ${s.averageFinal.avgMaxElo.toFixed(0)} | min elo: ${s.averageFinal.avgMinElo.toFixed(0)} | floor absorbed: ${s.eloMovement.avgFloorAbsorbed.toFixed(1)} | avg at floor: ${s.eloMovement.avgPlayersAtFloor.toFixed(1)}`);
  console.log(`corr goals/assists/saves: ${pearson(goals, elos).toFixed(2)} / ${pearson(assists, elos).toFixed(2)} / ${pearson(saves, elos).toFixed(2)}`);
  console.log(`progression: ${s.ladderGrowth.map((p: any) => `${p.matches}:σ${p.stdDev.toFixed(0)}`).join("  ")}`);
  return { elos, summary: s };
}

console.log("=".repeat(70));
console.log("PROPOSAL BATTERY — tuned config, current fully-enriched data");
console.log("K=20 scale=30 guaranteed=75% goal=1.1 assist=0.9 save=2.5 perfScale=240 floor=750");
console.log("=".repeat(70));

const official = run("E1 — Official start, OPTIMAL split", { startingMode: "official", teamAssignment: "optimal" });
const fresh = run("E2 — Fresh start (1000), OPTIMAL split", { startingMode: "fresh", teamAssignment: "optimal" });
run("E3 — Fresh start, SNAKE matchmaking kept", { startingMode: "fresh", teamAssignment: "snake" });
run("E4 — Official start, SNAKE matchmaking", { startingMode: "official", teamAssignment: "snake" });
run("E5 — 400-player stress test (official, optimal, +fakes)", { startingMode: "official", teamAssignment: "optimal", fakePlayerCount: 355 });

// --- Section 2.2: the current system, re-derived ---------------------------
// L1 is the live system. L2 and L3 isolate which layer causes the runaway by
// fixing one at a time: L2 keeps the snake but pays expected score, L3 keeps
// the min-clamped payout but balances teams optimally.
run("L1 — CURRENT: snake + 9-11 clamped payout, no floor", { ...LEGACY, startingMode: "official" });
run("L2 — snake kept, expected-score payout", { ...LEGACY, payoutMode: "expected", guaranteedPercent: 75, startingMode: "official" });
run("L3 — 9-11 clamped payout kept, optimal split", { ...LEGACY, teamAssignment: "optimal", startingMode: "official" });

// Band sensitivity. The clamp width is what governs how much rating feedback
// survives: a wider band restores Elo's self-correction, 10-10 removes it
// entirely, 0-20 is unclamped. 9-11 is the band observed live.
for (const [min, max] of [[10, 10], [9, 11], [7, 13], [5, 15], [0, 20]]) {
  run(`L4 — current system, band ${min}-${max}`, { ...LEGACY, legacyMinDelta: min, legacyMaxDelta: max, startingMode: "official" });
}

// Path independence: agreement of per-player final ladder between official and fresh starts.
if (official && fresh) {
  console.log(`\n### Path independence`);
  console.log(`official-vs-fresh per-player final ELO correlation: ${pearson(official.elos, fresh.elos).toFixed(3)}`);
}
