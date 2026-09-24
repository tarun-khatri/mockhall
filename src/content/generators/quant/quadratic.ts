/**
 * quant.quadratic — Quadratic equations comparison (SPEC 8.1 Q13).
 *
 * Two equations, one in x and one in y; fixed options in the exam's order:
 *   x > y · x < y · x ≥ y · x ≤ y · x = y or relation cannot be established.
 * The target relation is chosen uniformly FIRST, then roots are drawn (integer → fractional) until the
 * pair produces exactly that relation. Equations are built from the roots: (q₁v − p₁)(q₂v − p₂) = 0,
 * which is always primitive, so the factorisation shown in the solution is exact.
 */
import { defineGenerator, type BuildContext, type SubtypeDef } from '../types';
import type { Difficulty } from '../../types';
import { makeQuestion, single } from '../shared/question';
import { fixedChoices } from '../shared/options';
import { targetSeconds } from '../../targets';
import type { Rng } from '../../../lib/rng';

/** Equation a·v² + b·v + c = 0 (kind 'quad'), a·v² = −c (kind 'sq'), or v = √(−c) (kind 'sqrt', a = 1, b = 0). */
export interface QuadEq {
  kind: 'quad' | 'sq' | 'sqrt';
  a: number;
  b: number;
  c: number;
  /** Display the quadratic with terms moved across (a·v² + c = −b·v). */
  rearranged?: boolean;
}

export interface QuadraticFacts {
  x: QuadEq;
  y: QuadEq;
}

export const RELATIONS = ['x > y', 'x < y', 'x ≥ y', 'x ≤ y', 'x = y or relation cannot be established'] as const;

const META = { name: 'quant.quadratic', version: 1, subject: 'quant', chapter: 'quadratic' } as const;

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'two-quadratics', label: 'Two quadratic equations', weight: 3 },
  { id: 'square-root-forms', label: 'x² = k and √ forms', weight: 1 },
];

/* ------------------------------ roots as fractions ------------------------------ */

interface Root {
  p: number;
  q: number;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
function root(p: number, q: number): Root {
  const g = gcd(p, q) || 1;
  return q < 0 ? { p: -p / g, q: -q / g } : { p: p / g, q: q / g };
}
const val = (r: Root) => r.p / r.q;
const rootTex = (r: Root) => (r.q === 1 ? String(r.p) : `${r.p < 0 ? '-' : ''}\\frac{${Math.abs(r.p)}}{${r.q}}`);

/** Coefficients of (q₁v − p₁)(q₂v − p₂). */
function fromRoots(r1: Root, r2: Root): [number, number, number] {
  return [r1.q * r2.q, -(r1.q * r2.p + r2.q * r1.p), r1.p * r2.p];
}

function poolRoot(rng: Rng, level: Difficulty): Root {
  if (level === 'easy') return root(rng.pick([-9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9]), 1);
  if (level === 'medium') {
    if (rng.chance(0.7)) return root(rng.pick([-12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 1);
    return root(rng.int(-9, 9) * 2 + 1, 2);
  }
  if (level === 'hard') {
    const q = rng.pick([1, 2, 3, 4, 5]);
    let p = 0;
    while (p === 0) p = rng.int(-6 * q, 6 * q);
    return root(p, q);
  }
  const q = rng.pick([2, 3, 4, 5, 6, 7]);
  let p = 0;
  while (p === 0) p = rng.int(-4 * q, 4 * q);
  return root(p, q);
}

/* ------------------------------ relation ------------------------------ */

function relation(xs: number[], ys: number[]): number {
  const eps = 1e-12;
  const pairs = xs.flatMap((x) => ys.map((y) => x - y));
  if (pairs.every((d) => Math.abs(d) < eps)) return 4;
  if (pairs.every((d) => d > eps)) return 0;
  if (pairs.every((d) => d < -eps)) return 1;
  if (pairs.every((d) => d > -eps)) return 2;
  if (pairs.every((d) => d < eps)) return 3;
  return 4;
}

/* ------------------------------ display ------------------------------ */

function term(coef: number, v: string, first: boolean): string {
  if (coef === 0) return '';
  const sign = coef < 0 ? '-' : first ? '' : '+';
  const abs = Math.abs(coef);
  const body = v ? `${abs === 1 ? '' : abs}${v}` : String(abs);
  return first ? `${sign}${body}` : ` ${sign} ${body}`;
}

function eqTex(e: QuadEq, v: 'x' | 'y'): string {
  const sq = `${v}^{2}`;
  if (e.kind === 'sqrt') return `$${v} = \\sqrt{${-e.c}}$`;
  if (e.kind === 'sq') return `$${e.a === 1 ? '' : e.a}${sq} = ${-e.c}$`;
  if (e.rearranged && e.b !== 0 && e.c !== 0) {
    const left = `${term(e.a, sq, true)}${term(e.c, '', false)}`;
    return `$${left} = ${term(-e.b, v, true)}$`;
  }
  return `$${term(e.a, sq, true)}${term(e.b, v, false)}${term(e.c, '', false)} = 0$`;
}

/* ------------------------------ building ------------------------------ */

interface Side {
  eq: QuadEq;
  roots: Root[];
  how: string;
}

function quadSide(rng: Rng, level: Difficulty, v: 'x' | 'y'): Side | null {
  const r1 = poolRoot(rng, level);
  const r2 = rng.chance(level === 'easy' ? 0.08 : 0.12) ? r1 : poolRoot(rng, level);
  const [a, b, c] = fromRoots(r1, r2);
  if (a > 49 || Math.abs(b) > 160 || Math.abs(c) > 200) return null;
  const eq: QuadEq = { kind: 'quad', a, b, c, ...(level === 'extreme' && rng.chance(0.5) ? { rearranged: true } : {}) };
  const m = -r1.q * r2.p;
  const n = -r2.q * r1.p;
  const same = r1.p === r2.p && r1.q === r2.q;
  const how = `${eqTex(eq, v)}: split ${b} into ${m} and ${n} (product ${a * c} = ${a} × ${c}) → $(${r1.q === 1 ? '' : r1.q}${v} ${r1.p < 0 ? '+' : '-'} ${Math.abs(r1.p)})(${r2.q === 1 ? '' : r2.q}${v} ${r2.p < 0 ? '+' : '-'} ${Math.abs(r2.p)}) = 0$ → ${v} = ${same ? `$${rootTex(r1)}$ (equal roots)` : `$${rootTex(r1)}$, $${rootTex(r2)}$`}`;
  return { eq, roots: same ? [r1] : [r1, r2], how };
}

function squareSide(rng: Rng, level: Difficulty, v: 'x' | 'y', allowSqrt: boolean): Side {
  const q = level === 'easy' || level === 'medium' ? 1 : rng.pick([1, 2, 3, 4, 5]);
  const p = rng.int(1, level === 'easy' ? 15 : 12);
  const r = root(p, q);
  if (allowSqrt && rng.chance(0.5)) {
    const k = r.p * r.p;
    if (r.q === 1) {
      const eq: QuadEq = { kind: 'sqrt', a: 1, b: 0, c: -k };
      return { eq, roots: [r], how: `${eqTex(eq, v)} → ${v} = ${r.p} (the square-root sign means the positive root only)` };
    }
  }
  const eq: QuadEq = { kind: 'sq', a: r.q * r.q, b: 0, c: -(r.p * r.p) };
  return { eq, roots: [r, root(-r.p, r.q)], how: `${eqTex(eq, v)} → ${v} = ±$${rootTex(r)}$ (both signs)` };
}

function buildSides(rng: Rng, level: Difficulty, subtype: string): [Side, Side] | null {
  if (subtype === 'two-quadratics') {
    const x = quadSide(rng, level, 'x');
    const y = quadSide(rng, level, 'y');
    return x && y ? [x, y] : null;
  }
  const flip = rng.chance(0.5);
  const sq = squareSide(rng, level, flip ? 'y' : 'x', flip);
  const other = rng.chance(0.3) ? squareSide(rng, level, flip ? 'x' : 'y', !flip) : quadSide(rng, level, flip ? 'x' : 'y');
  if (!other) return null;
  return flip ? [other, sq] : [sq, other];
}

const TRAPS: Record<number, (xs: Root[], ys: Root[]) => string> = {
  0: () => `Every x root is larger than every y root — check the signs carefully: positive b and c give two negative roots.`,
  1: () => `Every x root is smaller than every y root; don't compare only one pair of roots.`,
  2: (xs, ys) => `"x > y" is tempting, but x = $${rootTex(xs.reduce((m, r) => (val(r) < val(m) ? r : m)))}$ equals y = $${rootTex(ys.reduce((m, r) => (val(r) > val(m) ? r : m)))}$, so only x ≥ y holds.`,
  3: (xs, ys) => `"x < y" is tempting, but x = $${rootTex(xs.reduce((m, r) => (val(r) > val(m) ? r : m)))}$ equals y = $${rootTex(ys.reduce((m, r) => (val(r) < val(m) ? r : m)))}$, so only x ≤ y holds.`,
  4: () => `Comparing just the larger roots suggests an order, but the roots interleave (or coincide), so no single relation holds for every pair.`,
};

export const generator = defineGenerator<QuadraticFacts>(META, SUBTYPES, (ctx: BuildContext) => {
  const { rng, difficulty } = ctx;
  const target = rng.int(0, 4);
  let found: [Side, Side] | null = null;
  for (let tries = 0; tries < 5000 && !found; tries++) {
    const sides = buildSides(rng, difficulty, ctx.subtype.id);
    if (!sides) continue;
    const rel = relation(sides[0].roots.map(val), sides[1].roots.map(val));
    if (rel === target) found = sides;
  }
  if (!found) throw new Error(`${META.name}: could not build relation ${RELATIONS[target]}`);
  const [xs, ys] = found;
  const choices = fixedChoices(RELATIONS, target);
  const sorted = (rs: Root[]) => rs.map((r) => `$${rootTex(r)}$`).join(', ');
  const q = makeQuestion(ctx.meta, ctx.seed, {
    subtype: ctx.subtype.id,
    difficulty,
    prompt: `In the following question, two equations numbered I and II are given. Solve both equations and mark the correct relation between x and y.\n\nI. ${eqTex(xs.eq, 'x')}\nII. ${eqTex(ys.eq, 'y')}`,
    options: choices.options,
    answerIndex: choices.answerIndex,
    solution: {
      steps: [`I. ${xs.how}`, `II. ${ys.how}`, `Compare every pair: x ∈ {${sorted(xs.roots)}}, y ∈ {${sorted(ys.roots)}}`, `Relation: ${RELATIONS[target]}`],
      shortcut: `Sign rule for $av^{2} + bv + c = 0$: b, c both positive → both roots negative; b negative, c positive → both positive; c negative → one positive, one negative. Place all four roots on a number line.`,
      trap: TRAPS[target](xs.roots, ys.roots),
    },
    tags: ['quadratic:comparison', ctx.subtype.id === 'two-quadratics' ? 'quadratic:factorisation' : 'quadratic:square-root'],
    targetSeconds: targetSeconds('quadratic', difficulty),
  });
  return { item: single(q), facts: { x: xs.eq, y: ys.eq } };
});
