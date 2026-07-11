import fs from "fs";
import { execFileSync } from "child_process";
import { GRAPH_SCRIPT } from "./config";

// Ported from the Scrim Bot. Invokes the matplotlib script that renders the
// 9-panel distribution image from the exported simulation JSON.
export function tryGenerateGraph(exportPath: string, graphPath: string): boolean {
  if (!fs.existsSync(GRAPH_SCRIPT)) {
    console.warn("[SIMULATE] Graph script not found.");
    return false;
  }

  const pythonCommands = [process.env.PYTHON_BIN, "python", "python3"].filter(
    Boolean
  ) as string[];

  for (const pythonCommand of pythonCommands) {
    try {
      execFileSync(pythonCommand, [GRAPH_SCRIPT, exportPath, graphPath], {
        stdio: "inherit",
      });

      return fs.existsSync(graphPath);
    } catch {
      continue;
    }
  }

  console.warn("[SIMULATE] Failed to generate graph.");
  return false;
}
