# No Shot ELO Simulator

A **standalone, fully-local** Monte Carlo simulator for the No Shot community
ladder — it stress-tests ELO and matchmaking designs against real recorded
matches. It's a web-UI port of the Scrim Bot's `/simulateseason` command: same
simulation math, same statistics, and the same 9-panel matplotlib graph, plus
an in-app **Refresh match history** button that pulls fresh data from the public
game API.

Use it to reproduce and check every figure in the ranked-system proposal
([`docs/elo-system-proposal.md`](docs/elo-system-proposal.md)) — or to test your
own rating rules.

Nothing is hosted. `npm start` runs a small local server; you use it in your
browser at `http://localhost:4173`. The only outbound network call is the
optional match-history refresh.

## Reproduce the proposal

The proposal's comparison comes from one tuned configuration — K factor **20**,
expected scale **30**, guaranteed **75%**, goal **1.1**, assist **0.9**, save
**2.5**, performance scale **240**, ELO floor **750** — with **Team assignment**
toggled between **Optimal** (proposed) and **Snake** (current), and **Starting
mode** between **Official** and **Fresh**. The full experiment battery and the
per-stat correlation analysis are scripted: `npx tsx scripts/proposal_numbers.ts`
and `npx tsx scripts/stat_correlations.ts`.

## Requirements

- **Node.js** 18+ (built and tested on 24)
- **Python** 3.9+ with **matplotlib** and **numpy** (for the graph)
  - `pip install matplotlib numpy`
- The graph is optional — if Python isn't available, the stats still render and
  you'll see a note in place of the image.

## Setup

```bash
npm install
npm start
```

Then open **http://localhost:4173**.

The app ships with an **empty** database — on first run it creates
`data/dev.db` automatically. Before you can simulate you need match data, so
click **Refresh match history** first (see below) to collect the current ladder
from the public API.

## Using it

1. **Refresh match history** (top-right). This calls the public game API
   (`api.iterationthree.games`), catalogs the ranked + normal leaderboards,
   pulls each known player's match history, and enriches matches with full
   rosters + per-player goals/assists/saves/elo. It is rate-limited to ~22
   requests/minute (the API's documented cap), so a first full run can take a
   while. Progress and live counts are shown in the header.
   - Tick **Deep** for a full backfill (scans every page for every known
     player, larger enrichment budget). Leave it off for a fast incremental
     sync.
   - The header shows **4v4 rosters** in green once you have at least 8 —
     that's the threshold to be able to simulate.
2. **Set parameters** in the left panel. Every option from the Discord command
   is here, with the same defaults.
3. **Run simulation.** The right panel shows the same field-by-field summary the
   Discord embed produced, plus the distribution graph. **Download JSON** gives
   you the raw export (the exact file the Python grapher consumes).

## Parameters

Identical to the `/simulateseason` slash-command options:

| Parameter | Default | Meaning |
|---|---|---|
| Appearance mode | equal | How simulated appearances are assigned (equal vs historical) |
| Team assignment | balanced | balanced / snake / optimal split of the 8 selected players |
| Starting mode | official | official stored ELO / rebuilt hypothetical / fresh 1000 |
| Simulated matches | 500 | Future matches per simulation |
| Simulations | 100 | How many Monte Carlo runs |
| Min matches | 10 | Min real matches for a player to be eligible |
| Randomness | 1 | Performance / result randomness |
| Draw threshold | 2 | Team-strength gap counted as a draw (0 disables draws) |
| Selection ELO gap | 300 | Max ELO gap among the selected 8 |
| ELO floor | 0 | Minimum ELO a player can drop to |
| Fake players | 0 | Clones of real players to stress-test player counts |
| Goal / Assist / Save weight | 1.5 / 0.75 / 0.6 | Credit per stat |
| Guaranteed % | 75 | % of ELO guaranteed before performance weighting |
| K factor | 20 | Max delta per player; even teams pay K/2 |
| Expected scale | 30 | ELO-gap scale for win expectation |
| Performance scale | expected × 4 | Credit-share scale; sets ladder spread (blank = auto) |

## How it maps to the bot

| Bot file | This app |
|---|---|
| `src/commands/simulateseason.ts` (logic) | `src/simulation.ts` |
| `src/temporal/api.ts` | `src/api.ts` |
| `src/temporal/collector.ts` | `src/collector.ts` |
| `src/playerIdentity.ts` | `src/playerIdentity.ts` |
| Prisma (`db.*`) | `src/db.ts` (better-sqlite3, same schema) |
| `scripts/generate_simulation_graphs.py` | same file, unchanged |
| Discord embed + attachment | `public/` web UI + `src/server.ts` |

The Monte Carlo engine and the graph script are ported line-for-line; only the
Discord and Prisma layers were replaced.

## Configuration (optional env vars)

- `PORT` — server port (default 4173)
- `DATABASE_FILE` — path to the SQLite DB (default `data/dev.db`)
- `API_BASE_URL` — game API base (default `https://api.iterationthree.games`)
- `PYTHON_BIN` — explicit Python executable for the grapher

## Project layout

```
data/dev.db                     SQLite database (copied from the bot)
scripts/generate_simulation_graphs.py   matplotlib grapher (unchanged)
src/
  config.ts       paths + port
  db.ts           better-sqlite3 data-access layer
  api.ts          rate-limited game API client
  collector.ts    match-history collection + enrichment
  playerIdentity.ts   merged-account lookup
  simulation.ts   the Monte Carlo engine + runSimulation()
  graph.ts        invokes the Python grapher
  server.ts       Express server + JSON API
public/           the web UI (index.html, styles.css, app.js)
output/           generated export JSON + distribution PNG
```
