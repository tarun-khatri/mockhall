/**
 * Seeded PRNG (sfc32 seeded by cyrb128). Every generated question is a pure function of its seed.
 * Math.random is banned in content code — always take an Rng.
 */

export interface Rng {
  readonly seed: string;
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Uniform pick. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Pick by relative weight: [[value, weight], …]. */
  weighted<T>(items: readonly (readonly [T, number])[]): T;
  /** Shuffled copy (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** k distinct elements in random order. */
  sample<T>(items: readonly T[], k: number): T[];
  /** true with probability p. */
  chance(p: number): boolean;
  /** Independent child stream derived from this seed and a label (deterministic). */
  fork(label: string): Rng;
}

/** cyrb128 string hash → four 32-bit seeds. */
export function hash128(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function makeRng(seed: string): Rng {
  const [a, b, c, d] = hash128(seed);
  const raw = sfc32(a, b, c, d);
  // Warm up: the first outputs of sfc32 are weakly mixed.
  for (let i = 0; i < 12; i++) raw();

  const rng: Rng = {
    seed,
    next: raw,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new Error(`rng.int: bad range [${min}, ${max}]`);
      }
      return min + Math.floor(raw() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new Error('rng.pick: empty array');
      return items[Math.floor(raw() * items.length)];
    },
    weighted(items) {
      const total = items.reduce((s, [, w]) => s + Math.max(0, w), 0);
      if (!(total > 0)) throw new Error('rng.weighted: no positive weights');
      let r = raw() * total;
      for (const [v, w] of items) {
        r -= Math.max(0, w);
        if (r < 0) return v;
      }
      return items[items.length - 1][0];
    },
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(raw() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    sample(items, k) {
      if (k > items.length) throw new Error(`rng.sample: k=${k} > ${items.length}`);
      return rng.shuffle(items).slice(0, k);
    },
    chance(p) {
      return raw() < p;
    },
    fork(label) {
      return makeRng(`${seed}/${label}`);
    },
  };
  return rng;
}

/** A fresh random seed string for "Fresh mock" / new practice sets (UI only — never inside generators). */
export function randomSeed(): string {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return buf[0].toString(36) + buf[1].toString(36);
}
