import express from "express";
import fs from "fs";
import path from "path";
import { PORT, OUTPUT_DIR, PROJECT_ROOT } from "./config";
import { runSimulation, DEFAULT_PARAMS, type SimulationParams } from "./simulation";
import { tryGenerateGraph } from "./graph";
import { getDbStats } from "./db";
import {
  runBasicCollection,
  isCollectionInProgress,
  type CollectionProgress,
} from "./collector";

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const app = express();
app.use(express.json());
app.use(express.static(path.join(PROJECT_ROOT, "public")));
app.use("/output", express.static(OUTPUT_DIR));

// --- Simulation -----------------------------------------------------------

const NUMERIC_KEYS: (keyof SimulationParams)[] = [
  "selectionEloGap",
  "simulatedMatches",
  "simulations",
  "minMatches",
  "randomness",
  "drawThreshold",
  "eloFloor",
  "fakePlayerCount",
  "goalWeight",
  "assistWeight",
  "saveWeight",
  "guaranteedPercent",
  "kFactor",
  "expectedScale",
  "performanceScale",
  "legacyMinDelta",
  "legacyMaxDelta",
];

const STRING_KEYS: (keyof SimulationParams)[] = [
  "appearanceMode",
  "startingMode",
  "teamAssignment",
  "payoutMode",
];

// Only forward keys the client actually sent (so omitted params fall back to
// their real defaults, including performanceScale = expectedScale * 4).
function parseParams(body: any): Partial<SimulationParams> {
  const params: Partial<SimulationParams> = {};

  for (const key of STRING_KEYS) {
    if (body[key] != null && body[key] !== "") {
      (params as any)[key] = String(body[key]);
    }
  }

  for (const key of NUMERIC_KEYS) {
    if (body[key] != null && body[key] !== "") {
      const value = Number(body[key]);
      if (!Number.isNaN(value)) (params as any)[key] = value;
    }
  }

  // Seed is deliberately not a NUMERIC_KEY: a human-readable seed
  // ("proposal-e1") is valid and gets hashed, and an omitted seed must stay
  // null so runs keep the unseeded Math.random behaviour by default.
  if (body.seed != null && body.seed !== "") {
    params.seed = String(body.seed);
  }

  return params;
}

app.post("/api/simulate", (req, res) => {
  try {
    const params = parseParams(req.body ?? {});
    const started = Date.now();
    const result = runSimulation(params);

    if (!result.ok) {
      res.status(400).json(result);
      return;
    }

    const stamp = Date.now();
    const exportPath = path.join(OUTPUT_DIR, `simulated-season-export.json`);
    const graphPath = path.join(OUTPUT_DIR, `simulated-season-distribution.png`);

    fs.writeFileSync(exportPath, JSON.stringify(result.exportData, null, 2));

    const graphGenerated = tryGenerateGraph(exportPath, graphPath);

    res.json({
      ok: true,
      summary: result.summary,
      graphGenerated,
      graphUrl: graphGenerated
        ? `/output/simulated-season-distribution.png?t=${stamp}`
        : null,
      exportUrl: `/output/simulated-season-export.json?t=${stamp}`,
      elapsedMs: Date.now() - started,
    });
  } catch (err) {
    console.error("[SIMULATE] Error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// --- Match-history refresh (collection) -----------------------------------

type RefreshState = {
  running: boolean;
  progress: CollectionProgress | null;
  startedAt: string | null;
  finishedAt: string | null;
  result: any | null;
  error: string | null;
};

const refreshState: RefreshState = {
  running: false,
  progress: null,
  startedAt: null,
  finishedAt: null,
  result: null,
  error: null,
};

app.post("/api/refresh", (req, res) => {
  if (isCollectionInProgress() || refreshState.running) {
    res.status(409).json({ ok: false, error: "Collection already in progress" });
    return;
  }

  const deep = Boolean(req.body?.deep);

  refreshState.running = true;
  refreshState.progress = null;
  refreshState.startedAt = new Date().toISOString();
  refreshState.finishedAt = null;
  refreshState.result = null;
  refreshState.error = null;

  // Fire-and-forget: the browser polls /api/refresh/status. This hits the live
  // iterationthree API and is rate-limited to ~22 req/min, so it can run for a
  // while on a large ladder.
  runBasicCollection(
    async progress => {
      refreshState.progress = progress;
    },
    { deep }
  )
    .then(result => {
      refreshState.result = result;
    })
    .catch(err => {
      console.error("[REFRESH] Error", err);
      refreshState.error = String(err?.message ?? err);
    })
    .finally(() => {
      refreshState.running = false;
      refreshState.finishedAt = new Date().toISOString();
    });

  res.json({ ok: true, started: true, deep });
});

app.get("/api/refresh/status", (_req, res) => {
  res.json({ ...refreshState, dbStats: getDbStats() });
});

// --- Metadata -------------------------------------------------------------

app.get("/api/stats", (_req, res) => {
  res.json({ dbStats: getDbStats(), defaults: DEFAULT_PARAMS });
});

app.listen(PORT, () => {
  console.log(`\n  Match Simulation App running:  http://localhost:${PORT}\n`);
});
