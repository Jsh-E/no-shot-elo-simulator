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
    ],
  },
];

const ALL_FIELDS = FIELD_GROUPS.flatMap((g) => g.fields);

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
function renderDbStats(stats) {
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
        `ELO Floor: ${b(setup.eloFloor)}`
    ),
    field(
      "Model",
      `Goal: ${b(m.goalWeight)}\n` +
        `Assist: ${b(m.assistWeight)}\n` +
        `Save: ${b(m.saveWeight)}\n` +
        `Guaranteed: ${b(m.guaranteedPercent + "%")}\n` +
        `K Factor: ${b(m.kFactor)}\n` +
        `Scale: ${b(m.expectedScale)}\n` +
        `Perf Scale: ${b(m.performanceScale)}`
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
  loadStats();
  resumeRefreshIfRunning();
  $("runBtn").addEventListener("click", runSimulation);
  $("resetBtn").addEventListener("click", resetForm);
  $("refreshBtn").addEventListener("click", startRefresh);
}
