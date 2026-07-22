// Seedable PRNG for reproducible simulation runs.
//
// The simulator's whole purpose is letting someone re-derive the proposal's
// figures, so a run has to be repeatable. Every source of randomness in
// simulation.ts goes through `rand()`; calling setSeed() with a number (or a
// string, which is hashed) makes an entire battery deterministic. Passing null
// restores Math.random, which is the default so existing behaviour is unchanged.

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a, so a human-readable seed ("proposal-e1") maps to a stable number.
function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeSeed(seed: number | string | null | undefined) {
  if (seed == null || seed === "") return null;
  if (typeof seed === "number") return Number.isFinite(seed) ? seed >>> 0 : null;
  const asNumber = Number(seed);
  return Number.isFinite(asNumber) ? asNumber >>> 0 : hashSeed(seed);
}

let current: () => number = Math.random;

// Set once per runSimulation(). The stream then runs unbroken across every
// simulated season in the battery, so the battery as a whole is reproducible
// while each individual season still differs from the last.
export function setSeed(seed: number | null) {
  current = seed == null ? Math.random : mulberry32(seed);
}

export function rand() {
  return current();
}
