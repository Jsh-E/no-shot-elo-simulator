import { getAllMerges } from "./db";

// Ported from the Scrim Bot. Maps any merged alt account id to its primary
// account id so a player's stats/history collapse onto one identity.
export function buildMergeLookup(): Map<string, string> {
  const merges = getAllMerges();
  const lookup = new Map<string, string>();

  for (const merge of merges) {
    lookup.set(merge.primaryAccountId, merge.primaryAccountId);
    lookup.set(merge.mergedAccountId, merge.primaryAccountId);
  }

  return lookup;
}
