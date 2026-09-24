/**
 * Independent verifier for quant.quadratic.
 *
 * Method: brute-force rational root finding. For each equation a·v² + b·v + c = 0 (integer coefficients)
 * every candidate p/q with p | c and q | a (rational root theorem, both signs) is substituted exactly in
 * BigInt arithmetic; the roots found are then compared pair by pair. "v = √k" keeps only the non-negative
 * root. The generator's chosen roots are never read.
 */
import type { GenResult } from '../../generators/types';
import type { QuadraticFacts, QuadEq } from '../../generators/quant/quadratic';

const RELATIONS = ['x > y', 'x < y', 'x ≥ y', 'x ≤ y', 'x = y or relation cannot be established'];

interface Q {
  n: bigint;
  d: bigint;
}
function bgcd(a: bigint, b: bigint): bigint {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b) [a, b] = [b, a % b];
  return a;
}
function mk(n: bigint, d: bigint): Q {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = bgcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
const cmp = (a: Q, b: Q) => {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
};

function divisors(n: bigint): bigint[] {
  if (n < 0n) n = -n;
  const out: bigint[] = [];
  for (let i = 1n; i * i <= n; i++) {
    if (n % i === 0n) {
      out.push(i);
      if (i * i !== n) out.push(n / i);
    }
  }
  return out;
}

/** All distinct rational roots of a·v² + b·v + c = 0 by substituting every rational-root-theorem candidate. */
function rationalRoots(a: bigint, b: bigint, c: bigint): Q[] {
  const roots: Q[] = [];
  const addRoot = (r: Q) => {
    if (!roots.some((x) => cmp(x, r) === 0)) roots.push(r);
  };
  const isRoot = (p: bigint, q: bigint) => a * p * p + b * p * q + c * q * q === 0n;
  if (c === 0n) {
    addRoot(mk(0n, 1n));
    // remaining linear factor a·v + b
    for (const q of divisors(a)) for (const p of b === 0n ? [0n] : divisors(b)) for (const s of [1n, -1n]) if (a * s * p + b * q === 0n) addRoot(mk(s * p, q));
    return roots;
  }
  for (const q of divisors(a)) for (const p of divisors(c)) for (const s of [1n, -1n]) if (isRoot(s * p, q)) addRoot(mk(s * p, q));
  return roots;
}

function solveEq(e: QuadEq): Q[] {
  const roots = rationalRoots(BigInt(e.a), BigInt(e.b), BigInt(e.c));
  if (!roots.length) throw new Error(`no rational roots for ${JSON.stringify(e)}`);
  return e.kind === 'sqrt' ? roots.filter((r) => r.n >= 0n) : roots;
}

export function verify(res: GenResult<QuadraticFacts>): string[] {
  const xs = solveEq(res.facts.x);
  const ys = solveEq(res.facts.y);
  let allGt = true;
  let allLt = true;
  let allGe = true;
  let allLe = true;
  let allEq = true;
  for (const x of xs) {
    for (const y of ys) {
      const c = cmp(x, y);
      if (c <= 0) allGt = false;
      if (c >= 0) allLt = false;
      if (c < 0) allGe = false;
      if (c > 0) allLe = false;
      if (c !== 0) allEq = false;
    }
  }
  const rel = allEq ? 4 : allGt ? 0 : allLt ? 1 : allGe ? 2 : allLe ? 3 : 4;
  return [RELATIONS[rel]];
}
