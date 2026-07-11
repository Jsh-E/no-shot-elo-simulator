import { getAllPlayers, getMatchesWithPlayersAsc } from "./db";
import { buildMergeLookup } from "./playerIdentity";

// Ported from the Scrim Bot (src/commands/simulateseason.ts). All the Monte
// Carlo logic is preserved verbatim; only the Discord command wrapper is
// replaced by runSimulation(), which returns the same export JSON the Python
// grapher consumes plus a structured summary mirroring the original embed.

export type StartingMode = "official" | "hypothetical" | "fresh";
export type TeamAssignment = "balanced" | "snake" | "optimal";
export type AppearanceMode = "equal" | "historical";

const PROGRESSION_CHECKPOINTS = [
  50, 100, 150, 200, 250, 500, 750, 1000, 1500, 2000, 3500, 5000,
];

type MatchPlayerRow = {
  accountId: string;
  username: string;
  team: string;
  goals: number | null;
  assists: number | null;
  saves: number | null;
  eloDelta: number | null;
};

type SimPlayer = {
  key: string;
  username: string;
  elo: number;
  matches: number;
  statMatches: number;
  avgGoals: number;
  avgAssists: number;
  avgSaves: number;
  historicalMatches: number;
};

type ProgressionPoint = {
  matches: number;
  stdDev: number;
  spread: number;
  maxElo: number;
  minElo: number;
};

type SimResult = {
  progression: ProgressionPoint[];

  minAppearances: number;
  maxAppearances: number;
  avgAppearances: number;
  appearanceSpread: number;

  finalStdDev: number;
  p90p10Spread: number;
  maxElo: number;
  minElo: number;

  playersAbove1300: number;
  players1200thru1300: number;
  players700thru800: number;
  playersBelow700: number;

  finalElos: number[];
  finalAvgGoals: number[];
  finalAvgAssists: number[];
  finalAvgSaves: number[];

  teamAWins: number;
  teamBWins: number;
  draws: number;
  upsets: number;
  totalMatches: number;

  avgTeamEloDiff: number;
  medianTeamEloDiff: number;
  maxTeamEloDiff: number;
  avgSignedTeamEloDiff: number;
  teamAFavoredRate: number;
  avgGain: number;
  avgLoss: number;
  maxGain: number;
  maxLoss: number;

  floorAbsorbedElo: number;
  playersAtFloor: number;

  totalGoals: number;
  totalAssists: number;
  totalSaves: number;

  top10AverageElo: number;
  bottom10AverageElo: number;
  topBottomGap: number;
};

function getPlacementMultiplier(
  startingMode: StartingMode,
  playerMatchesBeforeThisMatch: number
) {
  if (startingMode === "official") return 1;
  return playerMatchesBeforeThisMatch < 20 ? 2 : 1;
}

function topBottomGap(values: number[]) {
  if (values.length === 0) {
    return { top10AverageElo: 0, bottom10AverageElo: 0, topBottomGap: 0 };
  }

  const sorted = [...values].sort((a, b) => b - a);
  const count = Math.max(1, Math.ceil(sorted.length * 0.1));

  const top = sorted.slice(0, count);
  const bottom = sorted.slice(-count);

  const top10AverageElo = average(top);
  const bottom10AverageElo = average(bottom);

  return {
    top10AverageElo,
    bottom10AverageElo,
    topBottomGap: top10AverageElo - bottom10AverageElo,
  };
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length === 0) return 0;
  const avg = average(values);
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) /
    values.length;
  return Math.sqrt(variance);
}

function pearsonCorrelation(xs: number[], ys: number[]) {
  const count = Math.min(xs.length, ys.length);
  if (count < 2) return null;

  const meanX = average(xs.slice(0, count));
  const meanY = average(ys.slice(0, count));

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;

  for (let i = 0; i < count; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }

  if (varianceX === 0 || varianceY === 0) return null;
  return covariance / Math.sqrt(varianceX * varianceY);
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function normalizeDelta(delta: number) {
  return Math.abs(delta) > 15 ? delta / 2 : delta;
}

function isDraw(match: { teamAScore: number | null; teamBScore: number | null }) {
  return (match.teamAScore ?? 0) === (match.teamBScore ?? 0);
}

function getPlayerKey(player: MatchPlayerRow, mergeLookup: Map<string, string>) {
  return mergeLookup.get(player.accountId) ?? player.accountId;
}

function getExpectedScore(eloDifference: number, expectedScale: number) {
  return 1 / (1 + Math.pow(10, -eloDifference / expectedScale));
}

function getExpectedTeamDelta(
  winningTeamAvgElo: number,
  losingTeamAvgElo: number,
  kFactor: number,
  expectedScale: number
) {
  const expectedWin = getExpectedScore(
    winningTeamAvgElo - losingTeamAvgElo,
    expectedScale
  );
  return kFactor * (1 - expectedWin);
}

function getExpectedDrawTeamDelta(
  higherTeamAvgElo: number,
  lowerTeamAvgElo: number,
  kFactor: number,
  expectedScale: number
) {
  const expectedHigher = getExpectedScore(
    higherTeamAvgElo - lowerTeamAvgElo,
    expectedScale
  );
  return kFactor * (expectedHigher - 0.5);
}

function getPoolWeights(params: {
  players: MatchPlayerRow[];
  eloByAccountId: Map<string, number>;
  goalWeight: number;
  assistWeight: number;
  saveWeight: number;
  performanceScale: number;
}) {
  const { players, eloByAccountId } = params;

  const scores = players.map(
    player =>
      (player.goals ?? 0) * params.goalWeight +
      (player.assists ?? 0) * params.assistWeight +
      (player.saves ?? 0) * params.saveWeight
  );

  const totalScore = scores.reduce((sum, score) => sum + score, 0);

  const actualShares =
    totalScore > 0
      ? scores.map(score => score / totalScore)
      : players.map(() => 1 / players.length);

  const elos = players.map(
    player => eloByAccountId.get(player.accountId) ?? 1000
  );

  const teamAvgElo = average(elos);

  const expectedRaw = elos.map(elo =>
    getExpectedScore(elo - teamAvgElo, params.performanceScale)
  );

  const totalExpectedRaw = expectedRaw.reduce((sum, value) => sum + value, 0);
  const expectedShares = expectedRaw.map(value => value / totalExpectedRaw);

  return {
    winningWeights: actualShares.map((actual, index) =>
      Math.max(0, actual - expectedShares[index])
    ),
    losingWeights: actualShares.map((actual, index) =>
      Math.max(0, expectedShares[index] - actual)
    ),
  };
}

function distributeWinningPool(
  players: MatchPlayerRow[],
  pool: number,
  guaranteedRatio: number,
  weights: number[]
) {
  const guaranteedPerPlayer = (pool / players.length) * guaranteedRatio;
  const remainingPool = pool * (1 - guaranteedRatio);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  return players.map((player, index) => {
    const bonus =
      totalWeight > 0
        ? remainingPool * (weights[index] / totalWeight)
        : remainingPool / players.length;

    return { player, delta: guaranteedPerPlayer + bonus };
  });
}

function distributeLosingPool(
  players: MatchPlayerRow[],
  pool: number,
  guaranteedRatio: number,
  weights: number[]
) {
  const guaranteedPerPlayer = (pool / players.length) * guaranteedRatio;
  const remainingPool = pool * (1 - guaranteedRatio);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  return players.map((player, index) => {
    const extraLoss =
      totalWeight > 0
        ? remainingPool * (weights[index] / totalWeight)
        : remainingPool / players.length;

    return { player, delta: -(guaranteedPerPlayer + extraLoss) };
  });
}

function randomNormalish() {
  return Math.random() + Math.random() + Math.random() - 1.5;
}

function noisyStat(avg: number, randomness: number) {
  const value = avg + randomNormalish() * randomness;
  return Math.max(0, Math.round(value));
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function selectLobbyPlayers(players: SimPlayer[], selectionEloGap: number) {
  const maxLobbyAttempts = 25;

  for (let attempt = 0; attempt < maxLobbyAttempts; attempt++) {
    const candidate = shuffle(players).slice(0, 8);
    const elos = candidate.map(player => player.elo);
    const lobbyGap = Math.max(...elos) - Math.min(...elos);

    if (lobbyGap <= selectionEloGap) {
      return candidate;
    }
  }

  return shuffle(players).slice(0, 8);
}

function buildBalancedTeams(lobby: SimPlayer[]) {
  const teamSplitAttempts = 40;
  const acceptableTeamDiff = 50;

  let bestTeamA = lobby.slice(0, 4);
  let bestTeamB = lobby.slice(4, 8);

  let bestDiff = Math.abs(
    average(bestTeamA.map(player => player.elo)) -
      average(bestTeamB.map(player => player.elo))
  );

  for (let attempt = 0; attempt < teamSplitAttempts; attempt++) {
    const candidate = shuffle(lobby);
    const teamA = candidate.slice(0, 4);
    const teamB = candidate.slice(4, 8);

    const diff = Math.abs(
      average(teamA.map(player => player.elo)) -
        average(teamB.map(player => player.elo))
    );

    if (diff <= acceptableTeamDiff) {
      return { teamA, teamB };
    }

    if (diff < bestDiff) {
      bestTeamA = teamA;
      bestTeamB = teamB;
      bestDiff = diff;
    }
  }

  return { teamA: bestTeamA, teamB: bestTeamB };
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];

  const [first, ...rest] = items;

  const withFirst = combinations(rest, size - 1).map(combo => [first, ...combo]);
  const withoutFirst = combinations(rest, size);

  return [...withFirst, ...withoutFirst];
}

function buildOptimalTeams(lobby: SimPlayer[]) {
  const shuffled = shuffle(lobby);
  const teamSize = Math.floor(shuffled.length / 2);

  if (shuffled.length < 2 || teamSize === 0) {
    return { teamA: shuffled, teamB: [] as SimPlayer[] };
  }

  const [anchor, ...rest] = shuffled;

  let bestTeamA = shuffled.slice(0, teamSize);
  let bestTeamB = shuffled.slice(teamSize);
  let bestDiff = Infinity;

  for (const combo of combinations(rest, teamSize - 1)) {
    const teamA = [anchor, ...combo];
    const teamB = rest.filter(player => !combo.includes(player));

    const diff = Math.abs(
      average(teamA.map(player => player.elo)) -
        average(teamB.map(player => player.elo))
    );

    if (diff < bestDiff) {
      bestTeamA = teamA;
      bestTeamB = teamB;
      bestDiff = diff;
    }
  }

  return { teamA: bestTeamA, teamB: bestTeamB };
}

function buildSnakeTeams(lobby: SimPlayer[]) {
  const ranked = [...lobby].sort((a, b) => b.elo - a.elo);

  const teamA: SimPlayer[] = [];
  const teamB: SimPlayer[] = [];

  for (let i = 0; i < ranked.length; i++) {
    if (i % 4 === 0 || i % 4 === 3) {
      teamA.push(ranked[i]);
    } else {
      teamB.push(ranked[i]);
    }
  }

  return { teamA, teamB };
}

function simPlayerToMatchPlayer(
  player: SimPlayer,
  team: "A" | "B",
  randomness: number
): MatchPlayerRow {
  return {
    accountId: player.key,
    username: player.username,
    team,
    goals: noisyStat(player.avgGoals, randomness),
    assists: noisyStat(player.avgAssists, randomness),
    saves: noisyStat(player.avgSaves, randomness),
    eloDelta: 0,
  };
}

function clonePlayers(players: SimPlayer[]) {
  return players.map(player => ({ ...player }));
}

function capTeamAssists(rows: MatchPlayerRow[]) {
  const teamGoals = rows.reduce((sum, row) => sum + (row.goals ?? 0), 0);
  const teamAssists = rows.reduce((sum, row) => sum + (row.assists ?? 0), 0);

  if (teamAssists <= teamGoals) return;

  const scaled = rows.map(row => ((row.assists ?? 0) * teamGoals) / teamAssists);
  const capped = scaled.map(value => Math.floor(value));

  let remaining = teamGoals - capped.reduce((sum, value) => sum + value, 0);

  const byRemainder = scaled
    .map((value, index) => ({ index, remainder: value - capped[index] }))
    .sort((a, b) => b.remainder - a.remainder);

  for (const entry of byRemainder) {
    if (remaining <= 0) break;
    capped[entry.index] += 1;
    remaining -= 1;
  }

  rows.forEach((row, index) => {
    row.assists = capped[index];
  });
}

function jitterStat(value: number) {
  return Math.max(0, value * (1 + randomNormalish() * 0.25));
}

function generateFakePlayers(
  realPlayers: SimPlayer[],
  count: number,
  startingMode: StartingMode
) {
  const fakes: SimPlayer[] = [];

  for (let i = 0; i < count; i++) {
    const donor = realPlayers[Math.floor(Math.random() * realPlayers.length)];

    fakes.push({
      key: `fake-${i + 1}`,
      username: `Fake Player ${i + 1}`,
      elo:
        startingMode === "fresh"
          ? donor.elo
          : donor.elo + randomNormalish() * 60,
      matches: donor.matches,
      statMatches: donor.statMatches,
      historicalMatches: donor.historicalMatches,
      avgGoals: jitterStat(donor.avgGoals),
      avgAssists: jitterStat(donor.avgAssists),
      avgSaves: jitterStat(donor.avgSaves),
    });
  }

  return fakes;
}

export function buildInitialPlayerPool(params: {
  startingMode: StartingMode;
  minMatches: number;
  goalWeight: number;
  assistWeight: number;
  saveWeight: number;
  guaranteedRatio: number;
  kFactor: number;
  expectedScale: number;
  performanceScale: number;
  eloFloor: number;
}) {
  const {
    startingMode,
    minMatches,
    goalWeight,
    assistWeight,
    saveWeight,
    guaranteedRatio,
    kFactor,
    expectedScale,
    performanceScale,
    eloFloor,
  } = params;

  const mergeLookup = buildMergeLookup();

  const storedPlayers = getAllPlayers();
  const storedPlayerByAccountId = new Map(
    storedPlayers.map(player => [player.accountId, player])
  );

  const matches = getMatchesWithPlayersAsc();

  const profileMap = new Map<
    string,
    {
      key: string;
      username: string;
      elo: number;
      matches: number;
      goals: number;
      assists: number;
      saves: number;
    }
  >();

  function getOfficialStartingElo(key: string) {
    const player = storedPlayerByAccountId.get(key);
    return player?.elo ?? 1000;
  }

  function getOfficialUsername(key: string, fallback: string) {
    const player = storedPlayerByAccountId.get(key);
    return player?.username ?? fallback;
  }

  function ensureProfile(player: MatchPlayerRow) {
    const key = getPlayerKey(player, mergeLookup);

    const existing =
      profileMap.get(key) ??
      {
        key,
        username: getOfficialUsername(key, player.username),
        elo: startingMode === "official" ? getOfficialStartingElo(key) : 1000,
        matches: 0,
        goals: 0,
        assists: 0,
        saves: 0,
      };

    profileMap.set(key, existing);
    return existing;
  }

  for (const match of matches) {
    const teamA = match.players.filter(player => player.team === "A");
    const teamB = match.players.filter(player => player.team === "B");

    if (teamA.length !== 4 || teamB.length !== 4) continue;
    if (isDraw(match)) continue;

    const allPlayers = [...teamA, ...teamB];

    const averageMatchDelta =
      allPlayers.reduce((sum, player) => {
        return sum + Math.abs(normalizeDelta(player.eloDelta ?? 0));
      }, 0) / allPlayers.length;

    if (averageMatchDelta < 5) continue;

    for (const row of allPlayers) {
      const profile = ensureProfile(row);
      profile.matches += 1;
      profile.goals += row.goals ?? 0;
      profile.assists += row.assists ?? 0;
      profile.saves += row.saves ?? 0;
    }

    if (startingMode === "official" || startingMode === "fresh") {
      continue;
    }

    const teamAAvgElo = average(teamA.map(player => ensureProfile(player).elo));
    const teamBAvgElo = average(teamB.map(player => ensureProfile(player).elo));

    const teamAWon = (match.teamAScore ?? 0) > (match.teamBScore ?? 0);

    const winningTeam = teamAWon ? teamA : teamB;
    const losingTeam = teamAWon ? teamB : teamA;

    const winningAvgElo = teamAWon ? teamAAvgElo : teamBAvgElo;
    const losingAvgElo = teamAWon ? teamBAvgElo : teamAAvgElo;

    const averageTeamDelta = getExpectedTeamDelta(
      winningAvgElo,
      losingAvgElo,
      kFactor,
      expectedScale
    );

    const eloByAccountId = new Map(
      allPlayers.map(row => [row.accountId, ensureProfile(row).elo])
    );

    const winningDeltas = distributeWinningPool(
      winningTeam,
      averageTeamDelta * winningTeam.length,
      guaranteedRatio,
      getPoolWeights({
        players: winningTeam,
        eloByAccountId,
        goalWeight,
        assistWeight,
        saveWeight,
        performanceScale,
      }).winningWeights
    );

    const losingDeltas = distributeLosingPool(
      losingTeam,
      averageTeamDelta * losingTeam.length,
      guaranteedRatio,
      getPoolWeights({
        players: losingTeam,
        eloByAccountId,
        goalWeight,
        assistWeight,
        saveWeight,
        performanceScale,
      }).losingWeights
    );

    for (const result of winningDeltas) {
      ensureProfile(result.player).elo += result.delta;
    }

    for (const result of losingDeltas) {
      const profile = ensureProfile(result.player);
      profile.elo = Math.max(eloFloor, profile.elo + result.delta);
    }
  }

  return [...profileMap.values()]
    .filter(player => player.matches >= minMatches)
    .map(player => ({
      key: player.key,
      username: player.username,
      elo: player.elo,
      matches: startingMode === "fresh" ? 0 : player.matches,
      statMatches: player.matches,
      historicalMatches: player.matches,
      avgGoals: player.goals / player.matches,
      avgAssists: player.assists / player.matches,
      avgSaves: player.saves / player.matches,
    }));
}

function simulateOneFuture(params: {
  startingMode: StartingMode;
  appearanceMode: string;
  teamAssignment: TeamAssignment;
  selectionEloGap: number;
  initialPlayers: SimPlayer[];
  simulatedMatches: number;
  goalWeight: number;
  assistWeight: number;
  saveWeight: number;
  guaranteedRatio: number;
  kFactor: number;
  expectedScale: number;
  performanceScale: number;
  randomness: number;
  drawThreshold: number;
  eloFloor: number;
}): SimResult {
  const {
    startingMode,
    initialPlayers,
    simulatedMatches,
    goalWeight,
    assistWeight,
    saveWeight,
    guaranteedRatio,
    kFactor,
    expectedScale,
    performanceScale,
    randomness,
    selectionEloGap,
    appearanceMode,
    teamAssignment,
    drawThreshold,
    eloFloor,
  } = params;

  const players = clonePlayers(initialPlayers);

  let teamAWins = 0;
  let teamBWins = 0;
  let draws = 0;
  let upsets = 0;
  let totalMatches = 0;
  let floorAbsorbedElo = 0;

  const progression: ProgressionPoint[] = [];

  const appearanceCounts = new Map<string, number>();
  const targetAppearances = new Map<string, number>();

  const totalHistoricalAppearances = players.reduce(
    (sum, player) => sum + player.historicalMatches,
    0
  );

  const targetScale =
    appearanceMode === "historical" && totalHistoricalAppearances > 0
      ? (simulatedMatches * 8) / totalHistoricalAppearances
      : 1;

  for (const player of players) {
    targetAppearances.set(
      player.key,
      Math.max(1, Math.round(player.historicalMatches * targetScale))
    );
  }

  const teamEloDiffs: number[] = [];
  const signedTeamEloDiffs: number[] = [];
  let teamAFavoredCount = 0;
  const gains: number[] = [];
  const losses: number[] = [];

  let totalGoals = 0;
  let totalAssists = 0;
  let totalSaves = 0;

  for (let i = 0; i < simulatedMatches; i++) {
    const eligiblePlayersForMatch =
      appearanceMode === "historical"
        ? players.filter(player => {
            const current = appearanceCounts.get(player.key) ?? 0;
            const target = targetAppearances.get(player.key) ?? 0;
            return current < target;
          })
        : [...players]
            .sort((a, b) => {
              const aCount = appearanceCounts.get(a.key) ?? 0;
              const bCount = appearanceCounts.get(b.key) ?? 0;
              return aCount - bCount;
            })
            .slice(0, Math.max(16, Math.min(players.length, 24)));

    const lobby = selectLobbyPlayers(eligiblePlayersForMatch, selectionEloGap);

    const { teamA, teamB } =
      teamAssignment === "snake"
        ? buildSnakeTeams(lobby)
        : teamAssignment === "optimal"
          ? buildOptimalTeams(lobby)
          : buildBalancedTeams(lobby);

    for (const player of [...teamA, ...teamB]) {
      appearanceCounts.set(
        player.key,
        (appearanceCounts.get(player.key) ?? 0) + 1
      );
    }

    const teamAMatchRows = teamA.map(player =>
      simPlayerToMatchPlayer(player, "A", randomness)
    );

    const teamBMatchRows = teamB.map(player =>
      simPlayerToMatchPlayer(player, "B", randomness)
    );

    capTeamAssists(teamAMatchRows);
    capTeamAssists(teamBMatchRows);

    for (const row of [...teamAMatchRows, ...teamBMatchRows]) {
      totalGoals += row.goals ?? 0;
      totalAssists += row.assists ?? 0;
      totalSaves += row.saves ?? 0;
    }

    const teamAAvgElo = average(teamA.map(player => player.elo));
    const teamBAvgElo = average(teamB.map(player => player.elo));
    const signedTeamEloDiff = teamAAvgElo - teamBAvgElo;
    teamEloDiffs.push(Math.abs(signedTeamEloDiff));
    signedTeamEloDiffs.push(signedTeamEloDiff);
    if (signedTeamEloDiff > 0) teamAFavoredCount++;

    const teamAStatPower = teamAMatchRows.reduce((sum, player) => {
      return (
        sum +
        (player.goals ?? 0) * goalWeight +
        (player.assists ?? 0) * assistWeight +
        (player.saves ?? 0) * saveWeight
      );
    }, 0);

    const teamBStatPower = teamBMatchRows.reduce((sum, player) => {
      return (
        sum +
        (player.goals ?? 0) * goalWeight +
        (player.assists ?? 0) * assistWeight +
        (player.saves ?? 0) * saveWeight
      );
    }, 0);

    const teamAStrength =
      teamAAvgElo + teamAStatPower * 3 + randomNormalish() * randomness * 25;

    const teamBStrength =
      teamBAvgElo + teamBStatPower * 3 + randomNormalish() * randomness * 25;

    const teamAWon = teamAStrength >= teamBStrength;
    const drawnMatch = Math.abs(teamAStrength - teamBStrength) <= drawThreshold;

    if (drawnMatch) {
      draws++;
    } else if (teamAWon) {
      teamAWins++;
    } else {
      teamBWins++;
    }

    const upsetThreshold = 20;

    const teamAHigherRated = teamAAvgElo - teamBAvgElo >= upsetThreshold;
    const teamBHigherRated = teamBAvgElo - teamAAvgElo >= upsetThreshold;

    if (
      !drawnMatch &&
      ((teamAHigherRated && !teamAWon) || (teamBHigherRated && teamAWon))
    ) {
      upsets++;
    }

    totalMatches++;

    const teamAGains = drawnMatch ? teamAAvgElo <= teamBAvgElo : teamAWon;

    const winningRows = teamAGains ? teamAMatchRows : teamBMatchRows;
    const losingRows = teamAGains ? teamBMatchRows : teamAMatchRows;

    const winningAvgElo = teamAGains ? teamAAvgElo : teamBAvgElo;
    const losingAvgElo = teamAGains ? teamBAvgElo : teamAAvgElo;

    const averageTeamDelta = drawnMatch
      ? getExpectedDrawTeamDelta(losingAvgElo, winningAvgElo, kFactor, expectedScale)
      : getExpectedTeamDelta(winningAvgElo, losingAvgElo, kFactor, expectedScale);

    const eloByAccountId = new Map(
      [...teamA, ...teamB].map(player => [player.key, player.elo])
    );

    const winningDeltas = distributeWinningPool(
      winningRows,
      averageTeamDelta * winningRows.length,
      guaranteedRatio,
      getPoolWeights({
        players: winningRows,
        eloByAccountId,
        goalWeight,
        assistWeight,
        saveWeight,
        performanceScale,
      }).winningWeights
    );

    const losingDeltas = distributeLosingPool(
      losingRows,
      averageTeamDelta * losingRows.length,
      guaranteedRatio,
      getPoolWeights({
        players: losingRows,
        eloByAccountId,
        goalWeight,
        assistWeight,
        saveWeight,
        performanceScale,
      }).losingWeights
    );

    const playerByKey = new Map(players.map(player => [player.key, player]));

    for (const result of winningDeltas) {
      gains.push(result.delta);

      const player = playerByKey.get(result.player.accountId);
      if (!player) continue;

      const multiplier = getPlacementMultiplier(startingMode, player.matches);

      player.elo += result.delta * multiplier;
      player.matches += 1;
    }

    for (const result of losingDeltas) {
      losses.push(Math.abs(result.delta));

      const player = playerByKey.get(result.player.accountId);
      if (!player) continue;

      const multiplier = getPlacementMultiplier(startingMode, player.matches);

      const newElo = player.elo + result.delta * multiplier;
      const flooredElo = Math.max(eloFloor, newElo);

      floorAbsorbedElo += flooredElo - newElo;
      player.elo = flooredElo;
      player.matches += 1;
    }

    for (const [simPlayer, row] of [
      ...teamA.map((player, index) => [player, teamAMatchRows[index]] as const),
      ...teamB.map((player, index) => [player, teamBMatchRows[index]] as const),
    ]) {
      simPlayer.statMatches += 1;
      const statMatches = simPlayer.statMatches;

      simPlayer.avgGoals =
        (simPlayer.avgGoals * (statMatches - 1) + (row.goals ?? 0)) / statMatches;

      simPlayer.avgAssists =
        (simPlayer.avgAssists * (statMatches - 1) + (row.assists ?? 0)) /
        statMatches;

      simPlayer.avgSaves =
        (simPlayer.avgSaves * (statMatches - 1) + (row.saves ?? 0)) / statMatches;
    }

    const completedMatches = i + 1;

    if (PROGRESSION_CHECKPOINTS.includes(completedMatches)) {
      const currentElos = players.map(player => player.elo);

      progression.push({
        matches: completedMatches,
        stdDev: standardDeviation(currentElos),
        spread: percentile(currentElos, 0.9) - percentile(currentElos, 0.1),
        maxElo: Math.max(...currentElos),
        minElo: Math.min(...currentElos),
      });
    }
  }

  const elos = players.map(player => player.elo);
  const gap = topBottomGap(elos);

  const appearances = [...appearanceCounts.values()];

  const minAppearances = appearances.length > 0 ? Math.min(...appearances) : 0;
  const maxAppearances = appearances.length > 0 ? Math.max(...appearances) : 0;
  const avgAppearances = average(appearances);
  const appearanceSpread = maxAppearances - minAppearances;

  return {
    finalStdDev: standardDeviation(elos),
    p90p10Spread: percentile(elos, 0.9) - percentile(elos, 0.1),
    maxElo: Math.max(...elos),
    minElo: Math.min(...elos),
    progression,
    playersAbove1300: players.filter(player => player.elo >= 1300).length,
    players1200thru1300: players.filter(
      player => player.elo >= 1200 && player.elo < 1300
    ).length,
    players700thru800: players.filter(
      player => player.elo > 700 && player.elo <= 800
    ).length,
    playersBelow700: players.filter(player => player.elo <= 700).length,
    finalElos: elos,
    finalAvgGoals: players.map(player => player.avgGoals),
    finalAvgAssists: players.map(player => player.avgAssists),
    finalAvgSaves: players.map(player => player.avgSaves),

    minAppearances,
    maxAppearances,
    avgAppearances,
    appearanceSpread,

    teamAWins,
    teamBWins,
    draws,
    upsets,
    totalMatches,

    avgTeamEloDiff: average(teamEloDiffs),
    medianTeamEloDiff: percentile(teamEloDiffs, 0.5),
    maxTeamEloDiff: teamEloDiffs.reduce((max, value) => Math.max(max, value), 0),
    avgSignedTeamEloDiff: average(signedTeamEloDiffs),
    teamAFavoredRate: totalMatches > 0 ? teamAFavoredCount / totalMatches : 0,

    avgGain: average(gains),
    avgLoss: average(losses),
    maxGain: gains.reduce((max, value) => Math.max(max, value), 0),
    maxLoss: losses.reduce((max, value) => Math.max(max, value), 0),

    floorAbsorbedElo,
    playersAtFloor: players.filter(player => player.elo <= eloFloor).length,

    totalGoals,
    totalAssists,
    totalSaves,

    top10AverageElo: gap.top10AverageElo,
    bottom10AverageElo: gap.bottom10AverageElo,
    topBottomGap: gap.topBottomGap,
  };
}

export type SimulationParams = {
  appearanceMode: AppearanceMode;
  startingMode: StartingMode;
  teamAssignment: TeamAssignment;
  selectionEloGap: number;
  simulatedMatches: number;
  simulations: number;
  minMatches: number;
  randomness: number;
  drawThreshold: number;
  eloFloor: number;
  fakePlayerCount: number;
  goalWeight: number;
  assistWeight: number;
  saveWeight: number;
  guaranteedPercent: number;
  kFactor: number;
  expectedScale: number;
  performanceScale: number;
};

export const DEFAULT_PARAMS: SimulationParams = {
  appearanceMode: "equal",
  startingMode: "official",
  teamAssignment: "balanced",
  selectionEloGap: 300,
  simulatedMatches: 500,
  simulations: 100,
  minMatches: 10,
  randomness: 1,
  drawThreshold: 2,
  eloFloor: 0,
  fakePlayerCount: 0,
  goalWeight: 1.5,
  assistWeight: 0.75,
  saveWeight: 0.6,
  guaranteedPercent: 75,
  kFactor: 20,
  expectedScale: 30,
  performanceScale: 30 * 4,
};

export type SimulationResponse =
  | { ok: false; error: string; eligiblePlayers: number }
  | {
      ok: true;
      exportData: any;
      summary: any;
    };

// Entry point replacing the Discord command. Returns the export JSON (fed to
// the Python grapher) plus a structured summary mirroring the original embed.
export function runSimulation(input: Partial<SimulationParams>): SimulationResponse {
  const params: SimulationParams = { ...DEFAULT_PARAMS, ...input };

  // performanceScale defaults to expectedScale * 4 unless explicitly provided.
  const performanceScale =
    input.performanceScale ?? params.expectedScale * 4;

  const {
    appearanceMode,
    startingMode,
    teamAssignment,
    selectionEloGap,
    simulatedMatches,
    simulations,
    minMatches,
    randomness,
    drawThreshold,
    eloFloor,
    fakePlayerCount,
    goalWeight,
    assistWeight,
    saveWeight,
    guaranteedPercent,
    kFactor,
    expectedScale,
  } = params;

  const guaranteedRatio = guaranteedPercent / 100;

  const initialPlayers = buildInitialPlayerPool({
    startingMode,
    minMatches,
    goalWeight,
    assistWeight,
    saveWeight,
    guaranteedRatio,
    kFactor,
    expectedScale,
    performanceScale,
    eloFloor,
  });

  if (initialPlayers.length < 8) {
    return {
      ok: false,
      error: `Not enough eligible players. Found ${initialPlayers.length}, need at least 8.`,
      eligiblePlayers: initialPlayers.length,
    };
  }

  const currentOfficialPlayers = getAllPlayers();
  const currentOfficialEloByAccountId = new Map(
    currentOfficialPlayers.map(player => [player.accountId, player.elo ?? 1000])
  );

  const fakePlayers = generateFakePlayers(
    initialPlayers,
    fakePlayerCount,
    startingMode
  );

  const simulationPlayers = [...initialPlayers, ...fakePlayers];

  for (const player of simulationPlayers) {
    player.elo = Math.max(eloFloor, player.elo);
  }

  const currentElos = initialPlayers.map(player => {
    return currentOfficialEloByAccountId.get(player.key) ?? 1000;
  });

  const startingElos = simulationPlayers.map(player => player.elo);
  const startingStdDev = standardDeviation(startingElos);
  const startingSpread =
    percentile(startingElos, 0.9) - percentile(startingElos, 0.1);

  const results: SimResult[] = [];

  for (let i = 0; i < simulations; i++) {
    results.push(
      simulateOneFuture({
        startingMode,
        appearanceMode,
        teamAssignment,
        selectionEloGap,
        initialPlayers: simulationPlayers,
        simulatedMatches,
        goalWeight,
        assistWeight,
        saveWeight,
        guaranteedRatio,
        kFactor,
        expectedScale,
        performanceScale,
        randomness,
        drawThreshold,
        eloFloor,
      })
    );
  }

  const progressionSummary = PROGRESSION_CHECKPOINTS.filter(checkpoint =>
    results.some(result =>
      result.progression.some(point => point.matches === checkpoint)
    )
  ).map(checkpoint => {
    const points = results
      .map(result => result.progression.find(point => point.matches === checkpoint))
      .filter((point): point is ProgressionPoint => point !== undefined);

    return {
      matches: checkpoint,
      stdDev: average(points.map(point => point.stdDev)),
      spread: average(points.map(point => point.spread)),
      maxElo: average(points.map(point => point.maxElo)),
      minElo: average(points.map(point => point.minElo)),
    };
  });

  const avgFinalStdDev = average(results.map(result => result.finalStdDev));
  const avgSpread = average(results.map(result => result.p90p10Spread));
  const avgMaxElo = average(results.map(result => result.maxElo));
  const avgMinElo = average(results.map(result => result.minElo));
  const avg1200thru1300 = average(results.map(result => result.players1200thru1300));
  const avg700thru800 = average(results.map(result => result.players700thru800));
  const avgAbove1300 = average(results.map(result => result.playersAbove1300));
  const avgBelow700 = average(results.map(result => result.playersBelow700));
  const avgMinAppearances = average(results.map(result => result.minAppearances));
  const avgMaxAppearances = average(results.map(result => result.maxAppearances));
  const avgPlayerAppearances = average(results.map(result => result.avgAppearances));
  const avgAppearanceSpread = average(results.map(result => result.appearanceSpread));

  const totalSimulatedMatches = results.reduce(
    (sum, result) => sum + result.totalMatches,
    0
  );
  const totalTeamAWins = results.reduce((sum, result) => sum + result.teamAWins, 0);
  const totalTeamBWins = results.reduce((sum, result) => sum + result.teamBWins, 0);
  const totalDraws = results.reduce((sum, result) => sum + result.draws, 0);
  const totalUpsets = results.reduce((sum, result) => sum + result.upsets, 0);

  const avgTeamEloDiff = average(results.map(result => result.avgTeamEloDiff));
  const medianTeamEloDiff = average(results.map(result => result.medianTeamEloDiff));
  const avgSignedTeamEloDiff = average(
    results.map(result => result.avgSignedTeamEloDiff)
  );
  const teamAFavoredRate =
    average(results.map(result => result.teamAFavoredRate)) * 100;
  const maxTeamEloDiff = results.reduce(
    (max, result) => Math.max(max, result.maxTeamEloDiff),
    0
  );

  const avgGain = average(results.map(result => result.avgGain));
  const avgLoss = average(results.map(result => result.avgLoss));
  const maxGain = results.reduce((max, result) => Math.max(max, result.maxGain), 0);
  const maxLoss = results.reduce((max, result) => Math.max(max, result.maxLoss), 0);

  const avgFloorAbsorbed = average(results.map(result => result.floorAbsorbedElo));
  const avgPlayersAtFloor = average(results.map(result => result.playersAtFloor));

  const avgTop10Elo = average(results.map(result => result.top10AverageElo));
  const avgBottom10Elo = average(results.map(result => result.bottom10AverageElo));
  const avgTopBottomGap = average(results.map(result => result.topBottomGap));
  const avgCompletedMatches = average(results.map(result => result.totalMatches));

  const teamAWinRate =
    totalSimulatedMatches > 0 ? (totalTeamAWins / totalSimulatedMatches) * 100 : 0;
  const teamBWinRate =
    totalSimulatedMatches > 0 ? (totalTeamBWins / totalSimulatedMatches) * 100 : 0;
  const drawRate =
    totalSimulatedMatches > 0 ? (totalDraws / totalSimulatedMatches) * 100 : 0;
  const upsetRate =
    totalSimulatedMatches > 0 ? (totalUpsets / totalSimulatedMatches) * 100 : 0;

  const varianceRatio =
    startingStdDev > 0 ? avgFinalStdDev / startingStdDev : null;

  const avgSimulatedEloByPlayer = initialPlayers.map((_, index) =>
    average(results.map(result => result.finalElos[index]))
  );

  const officialCorrelation = pearsonCorrelation(
    currentElos,
    avgSimulatedEloByPlayer
  );

  const equivalentAppearances = simulatedMatches * 8;
  const equivalentMatchesPerPlayer =
    equivalentAppearances / simulationPlayers.length;

  const exportData = {
    generatedAt: new Date().toISOString(),
    setup: {
      startingMode,
      teamAssignment,
      eligiblePlayers: initialPlayers.length,
      fakePlayers: fakePlayerCount,
      totalPlayers: simulationPlayers.length,
      simulatedMatches,
      simulations,
      minMatches,
      randomness,
      drawThreshold,
      eloFloor,
    },
    model: {
      goalWeight,
      assistWeight,
      saveWeight,
      guaranteedPercent,
      kFactor,
      expectedScale,
      performanceScale,
    },
    summary: {
      progressionSummary,
      startingStdDev,
      startingSpread,
      avgFinalStdDev,
      avgSpread,
      varianceRatio,
      officialCorrelation,
      avgMaxElo,
      avgMinElo,
      avgAbove1300,
      avg700thru800,
      avgBelow700,
      avg1200thru1300,
      matchOutcomes: {
        totalSimulatedMatches,
        teamAWinRate,
        teamBWinRate,
        drawRate,
        upsetRate,
      },
      teamBalance: {
        avgTeamEloDiff,
        medianTeamEloDiff,
        maxTeamEloDiff,
        avgSignedTeamEloDiff,
        teamAFavoredRate,
      },
      eloMovement: {
        avgGain,
        avgLoss,
        maxGain,
        maxLoss,
        avgFloorAbsorbed,
        avgPlayersAtFloor,
      },
      bubbleIndicators: {
        avgTop10Elo,
        avgBottom10Elo,
        avgTopBottomGap,
      },
    },
    startingElos,
    playerNames: simulationPlayers.map(player => player.username),
    currentElos,
    simulationResults: results.map(result => ({
      finalStdDev: result.finalStdDev,
      p90p10Spread: result.p90p10Spread,
      maxElo: result.maxElo,
      minElo: result.minElo,
      progression: result.progression,
      playersAbove1300: result.playersAbove1300,
      players700thru800: result.players700thru800,
      playersBelow700: result.playersBelow700,
      playersAtFloor: result.playersAtFloor,
      floorAbsorbedElo: result.floorAbsorbedElo,
      players1200thru1300: result.players1200thru1300,
      finalElos: result.finalElos,
      finalAvgGoals: result.finalAvgGoals,
      finalAvgAssists: result.finalAvgAssists,
      finalAvgSaves: result.finalAvgSaves,
    })),
  };

  // Structured mirror of the original Discord embed for the web UI.
  const summary = {
    setup: {
      startingMode,
      teamAssignment,
      eligiblePlayers: initialPlayers.length,
      fakePlayers: fakePlayerCount,
      avgCompletedMatches,
      simulations,
      equivalentMatchesPerPlayer,
      randomness,
      selectionEloGap,
      drawThreshold,
      eloFloor,
    },
    model: {
      goalWeight,
      assistWeight,
      saveWeight,
      guaranteedPercent,
      kFactor,
      expectedScale,
      performanceScale,
    },
    startingLadder: { stdDev: startingStdDev, spread: startingSpread },
    averageFinal: {
      stdDev: avgFinalStdDev,
      spread: avgSpread,
      varianceRatio,
      officialCorrelation,
      avgMaxElo,
      avgMinElo,
    },
    ladderGrowth: progressionSummary,
    matchOutcomes: { teamAWinRate, teamBWinRate, drawRate, upsetRate },
    teamBalance: {
      avgTeamEloDiff,
      medianTeamEloDiff,
      maxTeamEloDiff,
      teamAFavoredRate,
      avgSignedTeamEloDiff,
    },
    eloMovement: {
      avgGain,
      avgLoss,
      maxGain,
      maxLoss,
      avgFloorAbsorbed,
      avgPlayersAtFloor,
    },
    topBottomGap: {
      top10: avgTop10Elo,
      bottom10: avgBottom10Elo,
      gap: avgTopBottomGap,
    },
    bubbleSignals: {
      avgAbove1300,
      avg1200thru1300,
      avg700thru800,
      avgBelow700,
    },
    playerCycling: {
      appearanceMode,
      avgPlayerAppearances,
      avgMinAppearances,
      avgMaxAppearances,
      avgAppearanceSpread,
    },
  };

  return { ok: true, exportData, summary };
}
