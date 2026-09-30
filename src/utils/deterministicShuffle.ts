/**
 * Deterministic, seeded shuffling — same seed always produces the same
 * order, different seeds produce different orders. Used to give each
 * attempt its own fixed (not re-randomized on every request) question order
 * and per-question option order, keyed off the attempt's own sk so a
 * refresh/resume shows exactly the same shuffle, but two different
 * students' attempts differ from each other.
 */

/** djb2 string hash -> 32-bit unsigned int, used to turn a string seed into a PRNG seed. */
function hashSeed(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33) ^ seed.charCodeAt(i);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, good-enough (not cryptographic) seeded PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates using a seeded PRNG — returns a new array, original is untouched. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const rng = mulberry32(hashSeed(seed));
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** A permutation of [0..count-1] for a given seed — displayedIndex -> canonicalIndex. */
export function seededPermutation(count: number, seed: string): number[] {
  return seededShuffle(
    Array.from({ length: count }, (_, i) => i),
    seed
  );
}
