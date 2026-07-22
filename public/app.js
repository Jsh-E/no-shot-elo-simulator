"use strict";

// Field schema mirrors the /simulateseason slash-command options 1:1.
const FIELD_GROUPS = [
  {
    title: "Simulation setup",
    fields: [
      {
        key: "appearanceMode",
        label: "Appearance mode",
        type: "select",
        default: "equal",
        desc: "How simulated player appearances are assigned",
        options: [
          { value: "equal", label: "Equal appearances" },
          { value: "historical", label: "Historical appearances" },
        ],
      },
      {
        key: "teamAssignment",
        label: "Team assignment",
        type: "select",
        default: "balanced",
        desc: "How the 8 selected players are split into teams",
        options: [
          { value: "balanced", label: "Balanced (minimal ELO diff)" },
          { value: "snake", label: "Snake draft (1,4,5,8 vs 2,3,6,7)" },
          { value: "optimal", label: "Optimal (best of all 35 splits)" },
        ],
      },
      {
        key: "startingMode",
        label: "Starting mode",
        type: "select",
        default: "official",
        desc: "Which ladder to start the simulation from",
        options: [
          { value: "official", label: "Official stored ELO" },
          { value: "hypothetical", label: "Rebuilt hypothetical ELO" },
          { value: "fresh", label: "Fresh start (everyone 1000)" },
        ],
      },
      { key: "simulatedMatches", label: "Simulated matches", type: "int", default: 500, min: 10, max: 5000, desc: "Future matches per simulation" },
      { key: "simulations", label: "Simulations", type: "int", default: 100, min: 1, max: 500, desc: "How many simulations to run" },
      { key: "minMatches", label: "Min matches", type: "int", default: 10, min: 1, max: 100, desc: "Min real matches to include a player" },
      { key: "randomness", label: "Randomness", type: "num", default: 1, min: 0, max: 5, step: 0.1, desc: "Performance/result randomness" },
      { key: "drawThreshold", label: "Draw threshold", type: "num", default: 2, min: 0, max: 25, step: 0.5, desc: "Strength gap counted as a draw (0 = off)" },
      { key: "selectionEloGap", label: "Selection ELO gap", type: "num", default: 300, min: 50, max: 1000, desc: "Max ELO gap among the selected 8" },
      { key: "eloFloor", label: "ELO floor", type: "int", default: 0, min: 0, max: 1000, desc: "Minimum ELO players can drop to" },
      { key: "fakePlayerCount", label: "Fake players", type: "int", default: 0, min: 0, max: 500, desc: "Clones of real players to stress test counts" },
      { key: "seed", label: "Seed", type: "text", default: "", desc: "Fixes the RNG so a run reproduces exactly (blank = random)" },
    ],
  },
  {
    title: "ELO model",
    fields: [
      { key: "goalWeight", label: "Goal weight", type: "num", default: 1.5, min: 0, max: 10, step: 0.05, desc: "Credit per goal" },
      { key: "assistWeight", label: "Assist weight", type: "num", default: 0.75, min: 0, max: 10, step: 0.05, desc: "Bonus credit per assist" },
      { key: "saveWeight", label: "Save weight", type: "num", default: 0.6, min: 0, max: 10, step: 0.05, desc: "Credit per save" },
      { key: "guaranteedPercent", label: "Guaranteed %", type: "num", default: 75, min: 0, max: 100, desc: "% of ELO guaranteed before weighting" },
      { key: "kFactor", label: "K factor", type: "num", default: 20, min: 1, max: 60, desc: "Max delta per player; even teams pay K/2" },
      { key: "expectedScale", label: "Expected scale", type: "num", default: 30, min: 5, max: 400, desc: "ELO gap scale for win expectation" },
      { key: "performanceScale", label: "Performance scale", type: "num", default: "", min: 20, max: 1000, desc: "Credit-share scale (blank = expected × 4)" },
      {
        key: "payoutMode",
        label: "Payout mode",
        type: "select",
        default: "expected",
        desc: "Which match payout formula to use",
        options: [
          { value: "expected", label: "Expected score (proposed)" },
          { value: "legacy", label: "Min-clamped (current system)" },
        ],
      },
      { key: "legacyMinDelta", label: "Legacy min delta", type: "num", default: 9, min: 0, max: 60, step: 0.5, desc: "Legacy mode only: least a win can pay" },
      { key: "legacyMaxDelta", label: "Legacy max delta", type: "num", default: 11, min: 0, max: 60, step: 0.5, desc: "Legacy mode only: most a win can pay" },
    ],
  },
];

const ALL_FIELDS = FIELD_GROUPS.flatMap((g) => g.fields);

// Recent user-facing changes, newest first. Shown in the "What's new" popup.
const PATCH_NOTES = [
  {
    version: "1.3",
    date: "Jul 22, 2026",
    changes: [
      "New preset: Real-data replay — runs the current system on exactly the matches and players you've collected, at each player's real appearance frequency and a season the size of your actual match count.",
      "Added this What's new window.",
    ],
  },
  {
    version: "1.2",
    date: "Jul 21, 2026",
    changes: [
      "Preset dropdown — jump to the proposal's headline configurations (Proposed, Fresh reset, Current system) in one click; it fills the form so you can tweak before running.",
      "The current-system payout is now a faithful flat 9–11: winners gain between 9 and 11, losers lose the same, with no per-player stat weighting.",
    ],
  },
  {
    version: "1.1",
    date: "Jul 20, 2026",
    changes: [
      "Payout mode selector — compare the proposed expected-score system against the current clamped 9–11 formula.",
      "Skill Recovery metric in results — how well the final ladder tracks each player's underlying skill.",
      "Reproducible runs — set a Seed for identical results every time; leave it blank for a fresh random run.",
      "Match outcomes are now driven by a fixed underlying skill, so the stat/rating correlations measure a real signal instead of the model echoing itself.",
      "Draws are now counted toward player stat profiles — they carry more saves per game than decisive matches, so leaving them out understated defense.",
    ],
  },
];

// Preset configurations mirroring the headline experiments in
// scripts/proposal_numbers.ts. Selecting one resets every field to its default,
// then overlays the preset's values — the seed is deliberately left blank so
// each run is a fresh randomized draw. `values: null` is the inert placeholder.
const TUNED = {
  goalWeight: 1.1,
  assistWeight: 0.9,
  saveWeight: 2.5,
  kFactor: 20,
  expectedScale: 30,
  performanceScale: 240,
  minMatches: 10,
  simulatedMatches: 2000,
  simulations: 30,
};

const PRESETS = [
  { label: "Load a preset…", values: null },
  {
    label: "Defaults",
    note: "The app's out-of-the-box parameters.",
    values: {},
  },
  {
    label: "Proposed system — E1 (official start, optimal split)",
    note: "The proposed tuned config, started from current ratings. Converges (σ≈97) and tracks skill.",
    values: {
      ...TUNED,
      startingMode: "official",
      teamAssignment: "optimal",
      payoutMode: "expected",
      guaranteedPercent: 75,
      eloFloor: 750,
    },
  },
  {
    label: "Fresh reset — E2 (everyone 1000, optimal split)",
    note: "The proposed system from a clean reset — the recommended migration. Rebuilds the same ladder from scratch.",
    values: {
      ...TUNED,
      startingMode: "fresh",
      teamAssignment: "optimal",
      payoutMode: "expected",
      guaranteedPercent: 75,
      eloFloor: 750,
    },
  },
  {
    label: "Current system — L1 (snake + 9–11 clamp)",
    note: "The live system: snake draft, clamped payout, no per-player routing. Runs away (σ→600+). Floor is 0 here — the doc runs it with no floor at all, so the real free-fall goes further.",
    values: {
      ...TUNED,
      startingMode: "official",
      teamAssignment: "snake",
      payoutMode: "legacy",
      legacyMinDelta: 9,
      legacyMaxDelta: 11,
      guaranteedPercent: 100,
      eloFloor: 0,
    },
  },
  {
    label: "Real-data replay — current system on our matches",
    note: "Replays the live system on exactly the data we have: real stored ELO, snake matchmaking, the flat 9–11 payout, each player appearing at their real historical frequency, and a season the size of our actual 4v4 roster count. Floor is 0 (the live system has none).",
    dynamicMatches: true,
    values: {
      ...TUNED,
      startingMode: "official",
      teamAssignment: "snake",
      appearanceMode: "historical",
      payoutMode: "legacy",
      legacyMinDelta: 9,
      legacyMaxDelta: 11,
      guaranteedPercent: 100,
      eloFloor: 0,
    },
  },
];

// ---- helpers ----
const $ = (id) => document.getElementById(id);
const round = (x) => Math.round(x).toString();
const f1 = (x) => Number(x).toFixed(1);
const f2 = (x) => Number(x).toFixed(2);

function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
}

// ---- form rendering ----
function buildForm() {
  const form = $("paramForm");
  form.innerHTML = "";

  for (const group of FIELD_GROUPS) {
    form.appendChild(el("div", "field-group-title", group.title));

    for (const field of group.fields) {
      const wrap = el("div", "field" + (field.type === "select" ? " select-field" : ""));
      const labelWrap = el("div");
      const label = el("label");
      label.setAttribute("for", "f_" + field.key);
      label.innerHTML = field.label + `<span class="desc">${field.desc}</span>`;
      labelWrap.appendChild(label);
      wrap.appendChild(labelWrap);

      if (field.type === "select") {
        const select = el("select");
        select.id = "f_" + field.key;
        select.name = field.key;
        for (const opt of field.options) {
          const o = el("option");
          o.value = opt.value;
          o.textContent = opt.label;
          if (opt.value === field.default) o.selected = true;
          select.appendChild(o);
        }
        wrap.appendChild(select);
      } else if (field.type === "text") {
        // Seeds are free-form: a number is used directly, anything else is
        // hashed server-side, and blank means "unseeded".
        const input = el("input");
        input.id = "f_" + field.key;
        input.name = field.key;
        input.type = "text";
        input.value = field.default;
        input.placeholder = "random";
        wrap.appendChild(input);
      } else {
        const input = el("input");
        input.id = "f_" + field.key;
        input.name = field.key;
        input.type = "number";
        if (field.min != null) input.min = field.min;
        if (field.max != null) input.max = field.max;
        input.step = field.step != null ? field.step : field.type === "int" ? 1 : "any";
        input.value = field.default;
        input.placeholder = field.default === "" ? "auto" : field.default;
        wrap.appendChild(input);
      }
      form.appendChild(wrap);
    }
  }
}

function resetForm() {
  for (const field of ALL_FIELDS) {
    const node = $("f_" + field.key);
    if (node) node.value = field.default;
  }
}

// ---- patch notes ----
function buildPatchNotes() {
  const body = $("patchBody");
  if (!body) return;
  body.innerHTML = "";
  for (const entry of PATCH_NOTES) {
    const section = el("div", "patch-entry");
    const head = el(
      "div",
      "patch-entry-head",
      `<span class="patch-version">v${entry.version}</span><span class="patch-date">${entry.date}</span>`
    );
    section.appendChild(head);
    const list = el("ul", "patch-list");
    for (const change of entry.changes) {
      const li = el("li");
      li.textContent = change;
      list.appendChild(li);
    }
    section.appendChild(list);
    body.appendChild(section);
  }
}

function openPatchNotes() {
  $("patchModal")?.classList.remove("hidden");
}

function closePatchNotes() {
  $("patchModal")?.classList.add("hidden");
}

// ---- presets ----
function buildPresetSelect() {
  const select = $("presetSelect");
  if (!select) return;
  select.innerHTML = "";
  PRESETS.forEach((preset, index) => {
    const option = el("option");
    option.value = String(index);
    option.textContent = preset.label;
    select.appendChild(option);
  });
  select.addEventListener("change", () => {
    applyPreset(PRESETS[Number(select.value)]);
  });
}

function applyPreset(preset) {
  const note = $("presetNote");
  if (!preset || preset.values == null) {
    if (note) note.textContent = "";
    return;
  }
  // Reset everything first so switching presets never leaves stale values, then
  // overlay this preset's fields. Seed stays blank (its default) intentionally.
  resetForm();
  for (const [key, value] of Object.entries(preset.values)) {
    const node = $("f_" + key);
    if (node) node.value = value;
  }
  // Size the run to the data actually collected: simulated matches = our real
  // 4v4 roster count. Falls back to the preset's static value if stats haven't
  // loaded yet.
  if (preset.dynamicMatches && latestDbStats?.fullRosterMatches > 0) {
    const node = $("f_simulatedMatches");
    if (node) node.value = latestDbStats.fullRosterMatches;
  }
  if (note) note.textContent = preset.note ?? "";
}

function collectParams() {
  const body = {};
  for (const field of ALL_FIELDS) {
    const node = $("f_" + field.key);
    if (!node) continue;
    const value = node.value;
    if (value === "" || value == null) continue; // omit → server default
    body[field.key] = value;
  }
  return body;
}

// ---- DB stats ----
// Latest snapshot of the collected database, so presets can size a run to the
// data we actually have (e.g. simulated matches = real 4v4 roster count).
let latestDbStats = null;

function renderDbStats(stats) {
  latestDbStats = stats;
  const box = $("dbStats");
  const enoughData = stats.fullRosterMatches >= 8;
  const updated = stats.lastRunAt
    ? new Date(stats.lastRunAt).toLocaleString()
    : "never";

  box.innerHTML = `
    <div class="stat"><span class="num">${stats.players}</span><span class="lbl">Players</span></div>
    <div class="stat"><span class="num">${stats.matches}</span><span class="lbl">Matches</span></div>
    <div class="stat"><span class="num">${stats.enriched}</span><span class="lbl">Enriched</span></div>
    <div class="stat ${enoughData ? "good" : "warn"}"><span class="num">${stats.fullRosterMatches}</span><span class="lbl">4v4 rosters</span></div>
  `;
  const updatedNode = el("div", "db-updated", `Updated: ${updated}`);
  box.parentElement.querySelector(".db-updated")?.remove();
  box.insertAdjacentElement("afterend", updatedNode);
}

async function loadStats() {
  try {
    const res = await fetch("/api/stats");
    const data = await res.json();
    renderDbStats(data.dbStats);
  } catch (err) {
    $("dbStats").innerHTML = `<span class="db-loading">DB unavailable</span>`;
  }
}

// ---- run simulation ----
async function runSimulation() {
  const btn = $("runBtn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>Running…`;
  $("runNote").textContent = "";
  $("resultsError").classList.add("hidden");

  try {
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectParams()),
    });
    const data = await res.json();

    if (!data.ok) {
      $("resultsEmpty").classList.add("hidden");
      $("resultsBody").classList.add("hidden");
      const errBox = $("resultsError");
      errBox.classList.remove("hidden");
      errBox.innerHTML =
        `<strong>${data.error || "Simulation failed."}</strong>` +
        (data.eligiblePlayers != null
          ? `<br /><br />Click <strong>Refresh match history</strong> to pull and enrich more matches — the simulation needs at least 8 eligible players (full 4v4 rosters).`
          : "");
      return;
    }

    renderResults(data);
    $("runNote").textContent = `Done in ${(data.elapsedMs / 1000).toFixed(1)}s`;
  } catch (err) {
    const errBox = $("resultsError");
    $("resultsEmpty").classList.add("hidden");
    errBox.classList.remove("hidden");
    errBox.textContent = "Request failed: " + err;
  } finally {
    btn.disabled = false;
    btn.textContent = "Run simulation";
  }
}

// ---- results rendering (mirrors the Discord embed) ----
function field(name, value, full) {
  return `<div class="embed-field${full ? " full" : ""}">
    <div class="fname">${name}</div>
    <div class="fval">${value}</div>
  </div>`;
}
const b = (x) => `<b>${x}</b>`;

function renderResults(data) {
  $("resultsEmpty").classList.add("hidden");
  $("resultsError").classList.add("hidden");
  $("resultsBody").classList.remove("hidden");

  const s = data.summary;
  const setup = s.setup;
  const m = s.model;

  const growth =
    s.ladderGrowth.length > 0
      ? s.ladderGrowth
          .map((p) => `${p.matches}: σ=${p.stdDev.toFixed(0)}, P90-P10=${p.spread.toFixed(0)}`)
          .join("\n")
      : "No checkpoints reached.";

  const avgAB = (s.teamBalance.avgSignedTeamEloDiff >= 0 ? "+" : "") + f1(s.teamBalance.avgSignedTeamEloDiff);

  const html = [
    `<div class="embed-title">Simulated Season Stability Test</div>`,
    `<div class="embed-desc">Starts from the selected ladder, then generates randomized future 4v4 matches using each player's historical averages.</div>`,

    field(
      "Simulation Setup",
      `Starting Mode: ${b(setup.startingMode)}\n` +
        `Team Assignment: ${b(setup.teamAssignment)}\n` +
        `Eligible Players: ${b(setup.eligiblePlayers)}\n` +
        `Fake Players: ${b(setup.fakePlayers)}\n` +
        `Avg Matches/Sim: ${b(f1(setup.avgCompletedMatches))}\n` +
        `Simulations Run: ${b(setup.simulations)}\n` +
        `Approx Matches/Player: ${b(f1(setup.equivalentMatchesPerPlayer))}\n` +
        `Randomness: ${b(setup.randomness)}\n` +
        `Selection ELO Gap: ${b(setup.selectionEloGap)}\n` +
        `Draw Threshold: ${b(setup.drawThreshold)}\n` +
        `ELO Floor: ${b(setup.eloFloor)}\n` +
        `Seed: ${b(setup.seed == null ? "random (not reproducible)" : setup.seed)}`
    ),
    field(
      "Model",
      `Goal: ${b(m.goalWeight)}\n` +
        `Assist: ${b(m.assistWeight)}\n` +
        `Save: ${b(m.saveWeight)}\n` +
        `Guaranteed: ${b(m.guaranteedPercent + "%")}\n` +
        `K Factor: ${b(m.kFactor)}\n` +
        `Scale: ${b(m.expectedScale)}\n` +
        `Perf Scale: ${b(m.performanceScale)}\n` +
        `Payout: ${b(m.payoutMode)}` +
        (m.legacyMinDelta == null
          ? ""
          : `\nLegacy Delta Band: ${b(m.legacyMinDelta + "-" + m.legacyMaxDelta)}`)
    ),

    field(
      "Starting Ladder",
      `Std Dev: ${b(round(s.startingLadder.stdDev))}\n` +
        `P90-P10 Spread: ${b(round(s.startingLadder.spread))}`,
      true
    ),
    field(
      "Average Final Results",
      `Std Dev: ${b(round(s.averageFinal.stdDev))}\n` +
        `P90-P10 Spread: ${b(round(s.averageFinal.spread))}\n` +
        `Variance Ratio: ${b(s.averageFinal.varianceRatio == null ? "N/A" : f2(s.averageFinal.varianceRatio))}\n` +
        `Official Corr: ${b(s.averageFinal.officialCorrelation == null ? "N/A" : f2(s.averageFinal.officialCorrelation))}\n` +
        `Skill Recovery: ${b(s.averageFinal.skillRecovery == null ? "N/A" : f2(s.averageFinal.skillRecovery))}\n` +
        `Avg Max ELO: ${b(round(s.averageFinal.avgMaxElo))}\n` +
        `Avg Min ELO: ${b(round(s.averageFinal.avgMinElo))}`,
      true
    ),

    field("Ladder Growth", growth),
    field(
      "Match Outcomes",
      `Team A Wins: ${b(f1(s.matchOutcomes.teamAWinRate) + "%")}\n` +
        `Team B Wins: ${b(f1(s.matchOutcomes.teamBWinRate) + "%")}\n` +
        `Draws: ${b(f1(s.matchOutcomes.drawRate) + "%")}\n` +
        `Upsets: ${b(f1(s.matchOutcomes.upsetRate) + "%")}`
    ),
    field(
      "Team Balance",
      `Avg ELO Diff: ${b(round(s.teamBalance.avgTeamEloDiff))}\n` +
        `Median ELO Diff: ${b(round(s.teamBalance.medianTeamEloDiff))}\n` +
        `Max ELO Diff: ${b(round(s.teamBalance.maxTeamEloDiff))}\n` +
        `A Favored: ${b(f1(s.teamBalance.teamAFavoredRate) + "%")}\n` +
        `Avg A-B Diff: ${b(avgAB)}`
    ),
    field(
      "ELO Movement",
      `Avg Gain: ${b("+" + f2(s.eloMovement.avgGain))}\n` +
        `Avg Loss: ${b("-" + f2(s.eloMovement.avgLoss))}\n` +
        `Max Gain: ${b("+" + f2(s.eloMovement.maxGain))}\n` +
        `Max Loss: ${b("-" + f2(s.eloMovement.maxLoss))}\n` +
        `Floor Absorbed: ${b("+" + f1(s.eloMovement.avgFloorAbsorbed))}\n` +
        `Avg At Floor: ${b(f1(s.eloMovement.avgPlayersAtFloor))}`
    ),
    field(
      "Top/Bottom Gap",
      `Top 10% Avg: ${b(round(s.topBottomGap.top10))}\n` +
        `Bottom 10% Avg: ${b(round(s.topBottomGap.bottom10))}\n` +
        `Gap: ${b(round(s.topBottomGap.gap))}`,
      true
    ),
    field(
      "Bubble Signals",
      `Avg Players ≥1300: ${b(f1(s.bubbleSignals.avgAbove1300))}\n` +
        `Avg Players 1200-1300: ${b(f1(s.bubbleSignals.avg1200thru1300))}\n` +
        `Avg Players 700-800: ${b(f1(s.bubbleSignals.avg700thru800))}\n` +
        `Avg Players ≤700: ${b(f1(s.bubbleSignals.avgBelow700))}`
    ),
    field(
      "Player Cycling",
      `Cycling Mode: ${b(s.playerCycling.appearanceMode)}\n` +
        `Avg Appearances: ${b(f1(s.playerCycling.avgPlayerAppearances))}\n` +
        `Lowest Avg Min: ${b(f1(s.playerCycling.avgMinAppearances))}\n` +
        `Highest Avg Max: ${b(f1(s.playerCycling.avgMaxAppearances))}\n` +
        `Avg Spread: ${b(f1(s.playerCycling.avgAppearanceSpread))}`
    ),
  ].join("");

  $("embed").innerHTML = html;

  const graph = $("graphWrap");
  if (data.graphUrl) {
    graph.innerHTML = `<img src="${data.graphUrl}" alt="Simulated season distribution" />`;
  } else {
    graph.innerHTML = `<div class="graph-missing">Graph could not be generated (is Python + matplotlib installed?). The stats above are still valid.</div>`;
  }

  const jsonLink = $("jsonLink");
  jsonLink.href = data.exportUrl;
  jsonLink.classList.remove("hidden");
}

// ---- refresh (collection) ----
let refreshPoll = null;

async function startRefresh() {
  const btn = $("refreshBtn");
  const deep = $("deepRefresh").checked;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>Refreshing…`;
  $("refreshProgress").classList.remove("hidden");
  $("refreshStage").textContent = "Starting…";
  $("refreshBar").style.width = "0%";
  $("refreshCounts").textContent = "";

  try {
    const res = await fetch("/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deep }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Failed to start");
    pollRefresh();
  } catch (err) {
    const msg = /NetworkError|Failed to fetch|load failed/i.test(err.message)
      ? "Could not reach the local server. Is `npm start` still running in your terminal? (Check that terminal for errors, then reload this page.)"
      : err.message;
    $("refreshStage").textContent = "Error: " + msg;
    finishRefresh();
  }
}

// A refresh can run for many minutes (rate-limited API calls). Tolerate the
// occasional dropped status poll instead of aborting the whole refresh.
const MAX_POLL_FAILURES = 8;

function pollRefresh() {
  clearInterval(refreshPoll);
  let consecutiveFailures = 0;

  refreshPoll = setInterval(async () => {
    try {
      const res = await fetch("/api/refresh/status");
      const state = await res.json();
      consecutiveFailures = 0;

      if (state.dbStats) renderDbStats(state.dbStats);

      if (state.progress) {
        const p = state.progress;
        $("refreshStage").textContent = p.stage;
        const pct = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;
        $("refreshBar").style.width = pct + "%";
        $("refreshCounts").textContent =
          `players saved: ${p.savedPlayers} · new matches: ${p.newMatches} · ` +
          `skipped: ${p.skippedMatches} · enriched: ${p.enrichedMatches}`;
      }

      if (!state.running) {
        clearInterval(refreshPoll);
        if (state.error) {
          $("refreshStage").textContent = "Error: " + state.error;
        } else if (state.result) {
          const r = state.result;
          $("refreshBar").style.width = "100%";
          $("refreshStage").textContent = "Done.";
          $("refreshCounts").textContent =
            `players scanned: ${r.histories.playersScanned} · ` +
            `new matches: ${r.histories.totalNewMatches} · ` +
            `enriched: ${r.enrichment.enriched}/${r.enrichment.attempted}`;
        }
        finishRefresh();
      }
    } catch (err) {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_POLL_FAILURES) {
        clearInterval(refreshPoll);
        $("refreshStage").textContent =
          "Lost contact with the local server (the collection may still be running server-side). Reload the page to reconnect.";
        finishRefresh();
      } else {
        $("refreshStage").textContent = "Reconnecting to server…";
      }
    }
  }, 1500);
}

function finishRefresh() {
  const btn = $("refreshBtn");
  btn.disabled = false;
  btn.textContent = "Refresh match history";
}

// If a refresh is already running server-side (e.g. the page was reloaded mid
// collection), reconnect to it instead of showing an idle state.
async function resumeRefreshIfRunning() {
  try {
    const res = await fetch("/api/refresh/status");
    const state = await res.json();
    if (state.running) {
      $("refreshBtn").disabled = true;
      $("refreshBtn").innerHTML = `<span class="spinner"></span>Refreshing…`;
      $("refreshProgress").classList.remove("hidden");
      $("refreshStage").textContent = "Reconnecting to running refresh…";
      pollRefresh();
    }
  } catch (_) {
    /* server not reachable yet; ignore */
  }
}

// Guard: this page must be served by the local Node server, not opened as a
// file:// path. Opened from disk, every /api fetch fails with a NetworkError.
function checkServedOverHttp() {
  if (location.protocol === "file:") {
    document.body.innerHTML = `
      <div style="max-width:640px;margin:80px auto;padding:28px;border:1px solid #ed4245;
        border-radius:12px;background:#2b2d31;color:#dbdee1;font-family:sans-serif;line-height:1.6">
        <h2 style="color:#ed4245;margin-top:0">Open this through the local server</h2>
        <p>You opened this page directly from a file, so it has no backend to talk to.
        The simulator needs its local server running.</p>
        <ol>
          <li>Open a terminal in <code>Simulation App</code></li>
          <li>Run <code style="background:#1a1b1e;padding:2px 6px;border-radius:4px">npm start</code></li>
          <li>Go to <a href="http://localhost:4173" style="color:#5865f2">http://localhost:4173</a></li>
        </ol>
        <p style="color:#949ba4;font-size:13px">Bookmark <code>localhost:4173</code> — the
        <code>file://</code> path will never work.</p>
      </div>`;
    return false;
  }
  return true;
}

// ---- init ----
if (checkServedOverHttp()) {
  buildForm();
  buildPresetSelect();
  buildPatchNotes();
  loadStats();
  resumeRefreshIfRunning();
  $("runBtn").addEventListener("click", runSimulation);
  $("resetBtn").addEventListener("click", () => {
    resetForm();
    const select = $("presetSelect");
    if (select) select.value = "0";
    const note = $("presetNote");
    if (note) note.textContent = "";
  });
  $("refreshBtn").addEventListener("click", startRefresh);

  $("patchNotesBtn").addEventListener("click", openPatchNotes);
  $("patchClose").addEventListener("click", closePatchNotes);
  // Close on backdrop click (but not when clicking inside the panel) or Escape.
  $("patchModal").addEventListener("click", (e) => {
    if (e.target === $("patchModal")) closePatchNotes();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePatchNotes();
  });
}
