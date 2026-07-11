import path from "path";
import { fileURLToPath } from "url";

// Project root is the parent of src/. All on-disk paths are resolved from here
// so the app works regardless of the current working directory.
const here = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(here, "..");

export const DB_PATH =
  process.env.DATABASE_FILE ?? path.join(PROJECT_ROOT, "data", "dev.db");

export const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");
export const GRAPH_SCRIPT = path.join(
  PROJECT_ROOT,
  "scripts",
  "generate_simulation_graphs.py"
);

export const PORT = Number(process.env.PORT ?? 4173);
