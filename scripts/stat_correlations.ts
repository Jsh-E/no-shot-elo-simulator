// Section 4.4 comparison: how well do a player's per-game stats predict their
// rating, under the CURRENT official ELO vs. under the PROPOSED system.
// Run: npx tsx scripts/stat_correlations.ts
import { buildInitialPlayerPool, runSimulation, type SimulationParams } from "../src/simulation";

const TUNED: Partial<SimulationParams> & {
  goalWeight: number; assistWeight: number; saveWeight: number;
  guaranteedRatio: number; kFactor: number; expectedScale: number;
  performanceScale: number; eloFloor: number; minMatches: number;
} = {
  goalWeight: 1.1, assistWeight: 0.9, saveWeight: 2.5,
  guaranteedRatio: 0.75, kFactor: 20, expectedScale: 30,
  performanceScale: 240, eloFloor: 750, minMatches: 10,
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

// --- CURRENT official ELO vs real per-game stats (same eligible players) ---
// startingMode "official" seeds each player's elo with their current stored ELO
// and carries their true historical per-game averages.
const pool = buildInitialPlayerPool({ startingMode: "official", ...TUNED });

const officialElo = pool.map(p => p.elo);
const goals = pool.map(p => p.avgGoals);
const assists = pool.map(p => p.avgAssists);
const saves = pool.map(p => p.avgSaves);

console.log(`Eligible players: ${pool.length}`);
console.log(`\n--- CURRENT official ELO vs per-game stats ---`);
console.log(`goals:   ${pearson(goals, officialElo).toFixed(2)}`);
console.log(`assists: ${pearson(assists, officialElo).toFixed(2)}`);
console.log(`saves:   ${pearson(saves, officialElo).toFixed(2)}`);

// --- PROPOSED system: per-game stats vs simulated final ELO (E1 config) ---
const r = runSimulation({
  startingMode: "official", teamAssignment: "optimal",
  simulatedMatches: 2000, simulations: 80,
  goalWeight: 1.1, assistWeight: 0.9, saveWeight: 2.5,
  guaranteedPercent: 75, kFactor: 20, expectedScale: 30,
  performanceScale: 240, eloFloor: 750, minMatches: 10,
});

if (r.ok) {
  const res = r.exportData.simulationResults;
  const n = r.exportData.playerNames.length;
  const avgByPlayer = (key: string) =>
    Array.from({ length: n }, (_, i) => {
      const vals = res.map((x: any) => x[key][i]).filter((v: any) => v != null);
      return vals.reduce((s: number, v: number) => s + v, 0) / vals.length;
    });
  const elos = avgByPlayer("finalElos");
  const g = avgByPlayer("finalAvgGoals");
  const a = avgByPlayer("finalAvgAssists");
  const s = avgByPlayer("finalAvgSaves");
  console.log(`\n--- PROPOSED system: per-game stats vs final ELO ---`);
  console.log(`goals:   ${pearson(g, elos).toFixed(2)}`);
  console.log(`assists: ${pearson(a, elos).toFixed(2)}`);
  console.log(`saves:   ${pearson(s, elos).toFixed(2)}`);
}
