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
  console.log(`official corr: ${s.averageFinal.officialCorrelation == null ? "N/A" : s.averageFinal.officialCorrelation.toFixed(3)}`);
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

// Path independence: agreement of per-player final ladder between official and fresh starts.
if (official && fresh) {
  console.log(`\n### Path independence`);
  console.log(`official-vs-fresh per-player final ELO correlation: ${pearson(official.elos, fresh.elos).toFixed(3)}`);
}
