/**
 * Reasoning R4 — Inequality (SPEC 8.2 R4, 7.6).
 *
 * Subtypes: direct chain, combined statements, coded symbols, missing symbol / expression, either–or focus.
 * Answers come from the closure engine (src/content/generators/solver/inequality); the independent verifier
 * brute-forces integer assignments.
 *
 * Conventions (kept deliberately safe so every key is uncontroversial):
 *  - a conclusion is true only when it is DEFINITELY true;
 *  - we never ask a conclusion that is weaker than the known relation (e.g. "A ≥ B" when A > B or A = B is
 *    known), because coaching conventions disagree on those;
 *  - either–or only for two conclusions on the same pair that are individually undetermined, jointly exhaustive
 *    and mutually exclusive;
 *  - missing-symbol questions only require strict (>, <) or equality conclusions.
 */
import { defineGenerator } from '../types';
import { makeQuestion, single } from '../shared/question';
import { fixedChoices, shuffleChoices } from '../shared/options';
import { targetSeconds } from '../../targets';
import type { Rng } from '../../../lib/rng';
import type { Difficulty, VisualSpec } from '../../types';
import {
  Closure,
  OUT_ALL,
  OUT_EQ,
  OUT_GT,
  OUT_LT,
  REL_MASK,
  RELS,
  chainLinks,
  chainText,
  flipRel,
  isStrict,
  linksOf,
  pairVerdict,
  pathChain,
  relDir,
  samePair,
  type Chain,
  type Conclusion,
  type Link,
  type Rel,
} from '../solver/inequality';

export type IneqRel = Rel;

export interface IneqStatementFact {
  vars: string[];
  /** Relation signs (> ≥ = ≤ <), or code symbols when `codes` is set; '?' marks a blank. */
  ops: string[];
}

export interface IneqConclusionFact {
  a: string;
  /** Relation sign, or code symbol when `codes` is set. */
  op: string;
  b: string;
}

export interface InequalityFacts {
  /**
   * conclusions      — statements + conclusions I and II, fixed five options.
   * missing-symbol   — one expression with '?' blanks; `fills` are the options (one sign per blank).
   * which-expression — `candidates` are the five option expressions; all `conclusions` must be definitely true.
   */
  form: 'conclusions' | 'missing-symbol' | 'which-expression';
  /** Coded questions: meaning of each symbol. */
  codes?: { symbol: string; rel: IneqRel }[];
  statements: IneqStatementFact[];
  /** Conclusions I, II (form 'conclusions') or the expressions that must be definitely true (other forms). */
  conclusions: IneqConclusionFact[];
  /** missing-symbol: options in display order, each a list of signs for the blanks (left → right). */
  fills?: string[][];
  /** which-expression: option expressions in display order. */
  candidates?: IneqStatementFact[];
}

const META = { name: 'reasoning.inequality', version: 1, subject: 'reasoning', chapter: 'inequality' } as const;

// Weights follow research/archetypes.md R4: direct and combined dominate recent prelims; coded inequality has
// not appeared in prelims since 2024 (kept as a low-weight practice subtype).
const SUBTYPES = [
  { id: 'direct', label: 'Direct chain', weight: 4 },
  { id: 'combined', label: 'Combined statements', weight: 4 },
  { id: 'coded', label: 'Coded symbols', weight: 0.5 },
  { id: 'missing-symbol', label: 'Missing symbol / expression', weight: 1 },
  { id: 'either-or', label: 'Either–or cases', weight: 1.5 },
] as const;

export const PAIR_OPTIONS = [
  'If only conclusion I is true',
  'If only conclusion II is true',
  'If either conclusion I or II is true',
  'If neither conclusion I nor II is true',
  'If both conclusions I and II are true',
] as const;

const CATEGORY_WORD = ['only I is true', 'only II is true', 'either I or II is true', 'neither I nor II is true', 'both I and II are true'];

/** No I / O / V / X: they clash with the roman numerals of the conclusions or look like digits. */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUWYZ'.split('');

const INTRO = 'Assuming the given statements to be true, decide which of the conclusions I and II is/are definitely true.';

/* ------------------------------------------------------------------ */
/* Structures                                                          */
/* ------------------------------------------------------------------ */

function pickVars(rng: Rng, n: number, avoid: readonly string[] = []): string[] {
  const pool = LETTERS.filter((l) => !avoid.includes(l));
  if (rng.chance(0.45)) {
    // a run of neighbouring letters, as many papers do (P, Q, R, S, T …), in shuffled order
    const start = rng.int(0, pool.length - n);
    return rng.shuffle(pool.slice(start, start + n));
  }
  return rng.sample(pool, n);
}

function relOfDir(rng: Rng, dir: number, d: Difficulty): Rel {
  const pEq = d === 'easy' ? 0.14 : 0.2;
  const pStrict = d === 'easy' ? 0.5 : d === 'medium' ? 0.44 : 0.4;
  const x = rng.next();
  if (x < pEq) return '=';
  if (x < pEq + pStrict) return dir > 0 ? '>' : '<';
  return dir > 0 ? '≥' : '≤';
}

/** Random relation signs with a given number of direction changes. */
function randomRels(rng: Rng, count: number, d: Difficulty, turns: number): Rel[] {
  const positions = Array.from({ length: Math.max(0, count - 1) }, (_, i) => i + 1);
  const turnAt = new Set(rng.sample(positions, Math.min(turns, positions.length)));
  let dir = rng.pick([1, -1]);
  const rels: Rel[] = [];
  for (let i = 0; i < count; i++) {
    if (turnAt.has(i)) dir = -dir;
    rels.push(relOfDir(rng, dir, d));
  }
  return rels;
}

function directChain(rng: Rng, d: Difficulty, avoid: readonly string[] = []): Chain {
  // research/archetypes.md R4: single chains of 5–10 letters in recent prelims
  const n = { easy: 5, medium: rng.int(5, 7), hard: rng.int(7, 8), extreme: rng.int(8, 9) }[d];
  const turns = { easy: 1, medium: rng.int(1, 2), hard: 2, extreme: rng.int(2, 3) }[d];
  return { vars: pickVars(rng, n, avoid), rels: randomRels(rng, n - 1, d, turns) };
}

/** 2–3 chains sharing one variable each with an earlier chain. */
function combinedChains(rng: Rng, d: Difficulty, avoid: readonly string[] = []): Chain[] {
  // research/archetypes.md R4: mostly two chains joined by a comma that share a letter
  const lens: number[] = {
    easy: () => [3, 3],
    medium: () => rng.pick([[3, 3], [4, 3], [3, 4], [4, 4]]),
    hard: () => rng.pick([[4, 4], [5, 4], [3, 3, 3], [4, 3, 2]]),
    extreme: () => rng.pick([[5, 5], [4, 4, 3], [4, 3, 3], [5, 4, 2]]),
  }[d]();
  const total = lens.reduce((a, b) => a + b, 0) - (lens.length - 1);
  const vars = pickVars(rng, total, avoid);
  let next = 0;
  const chains: Chain[] = [];
  for (let s = 0; s < lens.length; s++) {
    const len = lens[s];
    let cv: string[];
    if (s === 0) {
      cv = vars.slice(0, len);
      next = len;
    } else {
      const used = chains.flatMap((c) => c.vars);
      // extreme: prefer joining at a middle element (harder to combine)
      const shared = d === 'extreme' && rng.chance(0.6) ? rng.pick(chains[chains.length - 1].vars.slice(1, -1).concat(used)) : rng.pick(used);
      const fresh = vars.slice(next, next + len - 1);
      next += len - 1;
      const pos = rng.int(0, len - 1);
      cv = [...fresh.slice(0, pos), shared, ...fresh.slice(pos)];
    }
    const turns = len >= 3 && rng.chance(d === 'easy' ? 0.3 : 0.5) ? 1 : 0;
    chains.push({ vars: cv, rels: randomRels(rng, len - 1, d, turns) });
  }
  return chains;
}

/* ------------------------------------------------------------------ */
/* Conclusion candidates                                               */
/* ------------------------------------------------------------------ */

type Trap = 'true' | 'strict' | 'equal' | 'break' | 'break-eq' | 'reverse' | 'contra';

interface Cand {
  c: Conclusion;
  truth: boolean;
  P: number;
  dist: number;
  w: number;
  trap: Trap;
}

function distWeight(dist: number, d: Difficulty): number {
  if (dist <= 1) return d === 'easy' ? 0.3 : 0.01;
  if (dist === 2) return 1;
  if (dist === 3) return d === 'easy' ? 0.8 : 1.3;
  return { easy: 0.4, medium: 1, hard: 1.5, extreme: 1.8 }[d];
}

function candidates(links: readonly Link[], cl: Closure, d: Difficulty): Cand[] {
  const vars = cl.vars;
  const out: Cand[] = [];
  for (let i = 0; i < vars.length; i++) {
    for (let j = i + 1; j < vars.length; j++) {
      const x = vars[i];
      const y = vars[j];
      const path = pathChain(links, x, y);
      if (!path) continue;
      const dist = path.rels.length;
      const P = cl.possible(x, y);
      for (const r of RELS) {
        const c: Conclusion = { a: x, rel: r, b: y };
        const M = REL_MASK[r];
        const truth = (P & ~M) === 0;
        if (truth && M !== P) continue; // weaker than the known relation — conventions disagree, never ask
        let trap: Trap = 'true';
        let w = 1;
        if (!truth) {
          if (P === OUT_ALL) {
            trap = r === '=' ? 'break-eq' : 'break';
            w = r === '=' ? 0.8 : 2.5;
          } else if (P === (OUT_GT | OUT_EQ) || P === (OUT_LT | OUT_EQ)) {
            const known = P === (OUT_GT | OUT_EQ) ? 1 : -1;
            if (r === '=') {
              trap = 'equal';
              w = 1.5;
            } else if (relDir(r) === known && isStrict(r)) {
              trap = 'strict';
              w = 3;
            } else {
              trap = 'reverse';
              w = isStrict(r) ? 0.3 : 0.7;
            }
          } else {
            trap = 'contra';
            w = P === OUT_EQ ? 0.5 : 0.3;
          }
        }
        out.push({ c, truth, P, dist, w: w * distWeight(dist, d), trap });
      }
    }
  }
  return out;
}

function weightedPick<T extends { w: number }>(rng: Rng, items: readonly T[]): T | undefined {
  if (!items.length) return undefined;
  return rng.weighted(items.map((x) => [x, x.w] as const));
}

/** Either–or conclusion pairs for an undetermined pair (in x, y orientation). */
function eitherPairs(P: number): [Rel, Rel][] {
  if (P === (OUT_GT | OUT_EQ)) return [['>', '=']];
  if (P === (OUT_LT | OUT_EQ)) return [['<', '=']];
  if (P === OUT_ALL) return [['≥', '<'], ['>', '≤'], ['≤', '>'], ['<', '≥']];
  return [];
}

/** Same-pair conclusions that LOOK like either–or but are not exhaustive (classic trap → neither). */
function fakeEitherPairs(P: number): [Rel, Rel][] {
  if (P === OUT_ALL) return [['>', '='], ['<', '='], ['≥', '='], ['≤', '=']];
  if (P === (OUT_GT | OUT_EQ)) return [['>', '<'], ['=', '<']];
  if (P === (OUT_LT | OUT_EQ)) return [['<', '>'], ['=', '>']];
  return [];
}

function choosePair(
  rng: Rng,
  links: readonly Link[],
  cands: readonly Cand[],
  target: number,
  samePairBias: number,
): [Conclusion, Conclusion] | null {
  const T = cands.filter((c) => c.truth);
  const F = cands.filter((c) => !c.truth);
  for (let attempt = 0; attempt < 40; attempt++) {
    let pair: [Conclusion, Conclusion] | null = null;
    if (target === 0 || target === 1) {
      const t = weightedPick(rng, T);
      if (!t) return null;
      const same = F.filter((f) => samePair(f.c, t.c));
      const diff = F.filter((f) => !samePair(f.c, t.c));
      const f = weightedPick(rng, same.length && rng.chance(samePairBias) ? same : diff.length ? diff : same);
      if (!f) return null;
      pair = target === 0 ? [t.c, f.c] : [f.c, t.c];
    } else if (target === 4) {
      const a = weightedPick(rng, T);
      if (!a) return null;
      const b = weightedPick(
        rng,
        T.filter((x) => !samePair(x.c, a.c)),
      );
      if (!b) return null;
      pair = [a.c, b.c];
    } else if (target === 3) {
      if (rng.chance(samePairBias)) {
        const pairs = F.filter((f) => fakeEitherPairs(f.P).length);
        const base = weightedPick(rng, pairs);
        if (base) {
          const [r1, r2] = rng.pick(fakeEitherPairs(base.P));
          const x = base.c.a;
          const y = base.c.b;
          pair = rng.chance(0.5)
            ? [{ a: x, rel: r1, b: y }, { a: x, rel: r2, b: y }]
            : [{ a: x, rel: r2, b: y }, { a: x, rel: r1, b: y }];
        }
      }
      if (!pair) {
        const a = weightedPick(rng, F);
        if (!a) return null;
        const b = weightedPick(
          rng,
          F.filter((x) => !samePair(x.c, a.c)),
        );
        if (!b) return null;
        pair = [a.c, b.c];
      }
    } else {
      const bases = F.filter((f) => eitherPairs(f.P).length && f.dist >= 2);
      const base = weightedPick(rng, bases.length ? bases : F.filter((f) => eitherPairs(f.P).length));
      if (!base) return null;
      const [r1, r2] = rng.pick(eitherPairs(base.P));
      const x = base.c.a;
      const y = base.c.b;
      pair = rng.chance(0.5)
        ? [{ a: x, rel: r1, b: y }, { a: x, rel: r2, b: y }]
        : [{ a: x, rel: r2, b: y }, { a: x, rel: r1, b: y }];
    }
    if (pair && pairVerdict(links, pair[0], pair[1]) === target) return pair;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

function concText(c: Conclusion): string {
  return `${c.a} ${c.rel} ${c.b}`;
}

function orient(rng: Rng, c: Conclusion, pFlip: number): Conclusion {
  return rng.chance(pFlip) ? { a: c.b, rel: flipRel(c.rel), b: c.a } : c;
}

const REL_WORDS: Record<Rel, string> = {
  '>': 'greater than',
  '≥': 'greater than or equal to',
  '=': 'equal to',
  '≤': 'smaller than or equal to',
  '<': 'smaller than',
};

/** Human reason for a conclusion's verdict, based on the path between its two letters. */
function reasonFor(links: readonly Link[], cl: Closure, c: Conclusion): { line: string; path: Chain | null; truth: boolean } {
  const path = pathChain(links, c.a, c.b);
  const P = cl.possible(c.a, c.b);
  const truth = cl.holds(c);
  const known = cl.known(c.a, c.b);
  const pathTxt = path ? chainText(path) : `${c.a} … ${c.b}`;
  let why: string;
  if (known === null) {
    why = `the signs change direction between ${c.a} and ${c.b}, so no relation can be established`;
  } else if (truth) {
    if (isStrict(c.rel)) why = `every sign points the same way and at least one is strict, so ${c.a} ${c.rel} ${c.b}`;
    else if (c.rel === '=') why = `every sign is '=', so ${c.a} = ${c.b}`;
    else why = `every sign is ${c.rel === '≥' ? "'≥' or '='" : "'≤' or '='"} with no strict sign, so ${c.a} ${c.rel} ${c.b}`;
  } else if (P === (OUT_GT | OUT_EQ) || P === (OUT_LT | OUT_EQ)) {
    const k = P === (OUT_GT | OUT_EQ) ? '≥' : '≤';
    if (c.rel === '=') why = `only ${c.a} ${k} ${c.b} is certain — ${c.a} may also be ${k === '≥' ? 'greater' : 'smaller'}`;
    else if (isStrict(c.rel) && relDir(c.rel) === relDir(k)) why = `there is no strict sign on the way, so only ${c.a} ${k} ${c.b} is certain`;
    else why = `we only know ${c.a} ${k} ${c.b}`;
  } else {
    why = `in fact ${c.a} ${known} ${c.b}`;
  }
  return { line: `${concText(c)}: ${pathTxt} → ${why} → **${truth ? 'true' : 'not definitely true'}**.`, path, truth };
}

/** Character ranges of relation signs i in the chain text. */
function signRanges(ch: Chain, prefixLen: number, pick: (r: Rel, i: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let pos = prefixLen + ch.vars[0].length;
  ch.rels.forEach((r, i) => {
    const start = pos + 1; // after the space
    if (pick(r, i)) out.push([start, start + r.length]);
    pos = start + r.length + 1 + ch.vars[i + 1].length;
  });
  return out;
}

function highlightFor(cl: Closure, c: Conclusion, path: Chain, prefixLen: number): [number, number][] {
  const P = cl.possible(c.a, c.b);
  if (P === OUT_ALL) {
    // first sign that points against the first directional sign
    const first = path.rels.findIndex((r) => relDir(r) !== 0);
    const dir = first >= 0 ? relDir(path.rels[first]) : 0;
    const breakAt = path.rels.findIndex((r, i) => i > first && relDir(r) === -dir);
    return signRanges(path, prefixLen, (_r, i) => i === first || i === breakAt);
  }
  if (P === OUT_GT || P === OUT_LT) return signRanges(path, prefixLen, (r) => isStrict(r));
  return signRanges(path, prefixLen, () => true);
}

function visualFor(links: readonly Link[], cl: Closure, concs: Conclusion[], labels: string[], lead: string[] = [], caption?: string): VisualSpec {
  const lines: { text: string; highlight?: [number, number][] }[] = lead.map((text) => ({ text }));
  concs.forEach((c, i) => {
    const path = pathChain(links, c.a, c.b);
    if (!path) return;
    const prefix = `${labels[i]}: `;
    lines.push({ text: prefix + chainText(path), highlight: highlightFor(cl, c, path, prefix.length) });
  });
  return { type: 'chain', lines, caption: caption ?? 'Each conclusion read along the chain between its two letters; the deciding signs are highlighted.' };
}

/* ------------------------------------------------------------------ */
/* Coded symbols                                                       */
/* ------------------------------------------------------------------ */

const SYMBOL_POOL = ['@', '#', '%', '&', '©', '★', '$', '*'];

const CODE_MEANING: Record<Rel, [string, string]> = {
  '>': ['greater than', 'neither smaller than nor equal to'],
  '≥': ['either greater than or equal to', 'not smaller than'],
  '=': ['equal to', 'neither greater than nor smaller than'],
  '≤': ['either smaller than or equal to', 'not greater than'],
  '<': ['smaller than', 'neither greater than nor equal to'],
};

/** Escape a symbol for Rich text. */
function esc(sym: string): string {
  return sym === '$' ? '\\$' : sym === '*' ? '\\*' : sym;
}

/* ------------------------------------------------------------------ */
/* Pair questions (direct / combined / coded / either-or)             */
/* ------------------------------------------------------------------ */

interface PairBuild {
  chains: Chain[];
  concs: [Conclusion, Conclusion];
}

function buildPairStructure(
  rng: Rng,
  d: Difficulty,
  target: number,
  mode: 'direct' | 'combined' | 'coded' | 'either-or',
  avoid: readonly string[],
): PairBuild {
  const samePairBias = mode === 'either-or' ? 0.75 : d === 'easy' ? 0.1 : 0.25;
  for (let attempt = 0; attempt < 200; attempt++) {
    let chains: Chain[];
    if (mode === 'direct') chains = [directChain(rng, d, avoid)];
    else if (mode === 'combined') chains = combinedChains(rng, d, avoid);
    else if (mode === 'coded') {
      if (d === 'easy' || d === 'medium' || rng.chance(0.4)) {
        const c = directChain(rng, d === 'extreme' ? 'hard' : d, avoid);
        chains = [c];
      } else chains = combinedChains(rng, d, avoid);
    } else chains = rng.chance(0.5) ? [directChain(rng, d, avoid)] : combinedChains(rng, d, avoid);
    const links = linksOf(chains);
    const cl = new Closure(links);
    if (!cl.consistent) continue;
    const cands = candidates(links, cl, d);
    const pair = choosePair(rng, links, cands, target, samePairBias);
    if (pair) return { chains, concs: pair };
  }
  throw new Error(`inequality: could not build a ${mode}/${d} question for category ${target}`);
}

function pickTarget(rng: Rng, eitherFocus: boolean): number {
  return eitherFocus ? rng.weighted([[0, 19], [1, 19], [2, 24], [3, 19], [4, 19]] as const) : rng.int(0, 4);
}

function statementsText(chains: Chain[]): string {
  return chains.map(chainText).join(', ');
}

function trapFor(cl: Closure, concs: Conclusion[], category: number): string {
  const [c1, c2] = concs;
  if (category === 2) {
    return `Marking "neither" is the usual slip: each conclusion alone is uncertain, but both speak about ${c1.a} and ${c1.b} and together they cover every possible case, so exactly one of them must hold.`;
  }
  if (category === 3 && samePair(c1, c2)) {
    const P = cl.possible(c1.a, c1.b);
    const covered = REL_MASK[c1.rel] | REL_MASK[c2.rel];
    const missing = P & ~covered;
    const rel = missing & OUT_GT ? '>' : missing & OUT_EQ ? '=' : '<';
    return `I and II look like an either–or pair, but they do not cover every case: ${c1.a} ${rel} ${c1.b} is also possible, so neither is definitely true.`;
  }
  for (const c of concs) {
    if (cl.holds(c)) continue;
    const P = cl.possible(c.a, c.b);
    if ((P === (OUT_GT | OUT_EQ) || P === (OUT_LT | OUT_EQ)) && isStrict(c.rel)) {
      const k = P === (OUT_GT | OUT_EQ) ? '≥' : '≤';
      return `${concText(c)} looks right because the signs point the same way, but there is no strict sign between them — only ${c.a} ${k} ${c.b} is certain.`;
    }
    if (P === OUT_ALL) {
      return `${concText(c)} is tempting if you read only part of the chain; the signs between ${c.a} and ${c.b} point in opposite directions, so no relation can be fixed.`;
    }
  }
  return 'Read every sign between the two letters: one sign pointing the other way breaks the chain, and a strict conclusion needs at least one strict sign.';
}

const SHORTCUT =
  'Walk from the first letter of the conclusion to the second: if every sign points the same way the relation holds (strict if any sign is > or <, otherwise ≥ / ≤); one sign in the opposite direction means no relation.';

function buildPairQuestion(ctx: { rng: Rng; difficulty: Difficulty; seed: string; subtypeId: string }, mode: 'direct' | 'combined' | 'coded' | 'either-or') {
  const { rng, difficulty: d } = ctx;
  const target = pickTarget(rng, mode === 'either-or');
  const coded = mode === 'coded';
  const avoid = coded ? ['P', 'Q'] : [];
  const { chains, concs: raw } = buildPairStructure(rng, d, target, mode, avoid);
  const links = linksOf(chains);
  const cl = new Closure(links);

  // display orientation (semantics unchanged)
  const pFlip = { easy: 0.2, medium: 0.3, hard: 0.45, extreme: 0.5 }[d];
  let concs: [Conclusion, Conclusion];
  if (samePair(raw[0], raw[1]) && !rng.chance(d === 'extreme' ? 0.35 : 0.1)) {
    const flip = rng.chance(pFlip);
    concs = [orient(rng, raw[0], flip ? 1 : 0), orient(rng, raw[1], flip ? 1 : 0)];
  } else concs = [orient(rng, raw[0], pFlip), orient(rng, raw[1], pFlip)];

  const category = pairVerdict(links, concs[0], concs[1]);
  if (category !== target) throw new Error('inequality: orientation changed the verdict');

  let prompt: string;
  let facts: InequalityFacts;
  const steps: string[] = [];
  const lead: string[] = [];

  if (coded) {
    const symbols = rng.sample(SYMBOL_POOL, 5);
    const order = rng.shuffle([...RELS]);
    const codeOf = new Map<Rel, string>();
    order.forEach((r, i) => codeOf.set(r, symbols[i]));
    const hardWords = d === 'hard' || d === 'extreme';
    const meanings = order.map((r) => {
      const words = CODE_MEANING[r][hardWords ? (rng.chance(0.75) ? 1 : 0) : rng.chance(0.2) ? 1 : 0];
      return `'P ${esc(codeOf.get(r)!)} Q' means 'P is ${words} Q'.`;
    });
    // coded statements: pairwise for hard/extreme, chain form otherwise
    const pairwise = d === 'hard' || d === 'extreme';
    let stmtFacts: IneqStatementFact[];
    let stmtText: string;
    if (pairwise) {
      let pairs = links.map((l) => ({ vars: [l.a, l.b], ops: [codeOf.get(l.rel)!] }));
      if (d === 'extreme') {
        pairs = rng.shuffle(pairs).map((p) =>
          rng.chance(0.4) ? { vars: [p.vars[1], p.vars[0]], ops: [codeOf.get(flipRel(order.find((r) => codeOf.get(r) === p.ops[0])!))!] } : p,
        );
      }
      stmtFacts = pairs;
      stmtText = pairs.map((p) => `${p.vars[0]} ${esc(p.ops[0])} ${p.vars[1]}`).join(', ');
    } else {
      stmtFacts = chains.map((c) => ({ vars: [...c.vars], ops: c.rels.map((r) => codeOf.get(r)!) }));
      stmtText = chains.map((c) => c.vars.map((v, i) => (i ? ` ${esc(codeOf.get(c.rels[i - 1])!)} ${v}` : v)).join('')).join(', ');
    }
    const concCoded = concs.map((c) => `${c.a} ${esc(codeOf.get(c.rel)!)} ${c.b}`);
    const symList = order.map((r) => esc(codeOf.get(r)!));
    prompt =
      `In the following question, the symbols ${symList.slice(0, -1).join(', ')} and ${symList[symList.length - 1]} are used with the following meanings:\n` +
      meanings.join('\n') +
      `\n\n${INTRO}\n\n**Statements:** ${stmtText}\n\n**Conclusions:**\nI. ${concCoded[0]}\nII. ${concCoded[1]}`;
    facts = {
      form: 'conclusions',
      codes: order.map((r) => ({ symbol: codeOf.get(r)!, rel: r })),
      statements: stmtFacts,
      conclusions: concs.map((c) => ({ a: c.a, op: codeOf.get(c.rel)!, b: c.b })),
    };
    steps.push(`Decode the symbols: ${order.map((r) => `${esc(codeOf.get(r)!)} means '${r}'`).join(', ')}.`);
    steps.push(`Statements decoded: ${statementsText(chains)}.`);
    steps.push(`Conclusions decoded: I. ${concText(concs[0])}, II. ${concText(concs[1])}.`);
    lead.push(`Decoded: ${statementsText(chains)}`);
  } else {
    const label = chains.length === 1 ? 'Statement' : 'Statements';
    prompt = `${INTRO}\n\n**${label}:** ${statementsText(chains)}\n\n**Conclusions:**\nI. ${concText(concs[0])}\nII. ${concText(concs[1])}`;
    facts = {
      form: 'conclusions',
      statements: chains.map((c) => ({ vars: [...c.vars], ops: [...c.rels] })),
      conclusions: concs.map((c) => ({ a: c.a, op: c.rel, b: c.b })),
    };
    if (chains.length > 1) steps.push(`Join the statements at their common letters: ${statementsText(chains)}.`);
  }

  const labels = ['I', 'II'];
  concs.forEach((c, i) => steps.push(`${labels[i]}. ${reasonFor(links, cl, c).line}`));
  if (category === 2) {
    const k = cl.known(concs[0].a, concs[0].b);
    const known = k ? `${concs[0].a} ${k} ${concs[0].b} is known` : `no relation between ${concs[0].a} and ${concs[0].b} is known`;
    steps.push(`Both are about the same pair and ${known}, so the two conclusions together cover every case and cannot both hold — exactly one must be true.`);
  } else if (category === 3 && samePair(concs[0], concs[1])) {
    steps.push(`I and II are about the same pair but do not cover every possible case, so this is not an either–or.`);
  }
  steps.push(`Hence ${CATEGORY_WORD[category]}.`);

  const choices = fixedChoices(PAIR_OPTIONS, category);
  const visual = visualFor(links, cl, concs, ['I', 'II'], lead);
  const tags = [`inequality:${ctx.subtypeId}`, category === 2 ? 'trick:either-or' : 'trick:chain-direction'];
  if (coded) tags.push('inequality:coded-symbols');
  return {
    prompt,
    choices,
    solution: { steps, shortcut: SHORTCUT, trap: trapFor(cl, concs, category), visual },
    tags,
    facts,
  };
}

/* ------------------------------------------------------------------ */
/* Missing symbol / blanks / which expression                         */
/* ------------------------------------------------------------------ */

function fillChain(vars: string[], ops: (Rel | '?')[], fill: readonly Rel[]): Chain {
  let k = 0;
  return { vars, rels: ops.map((o) => (o === '?' ? fill[k++] : o)) };
}

function exprText(vars: string[], ops: readonly string[], blank = '?'): string {
  return vars.map((v, i) => (i ? ` ${ops[i - 1] === '?' ? blank : ops[i - 1]} ${v}` : v)).join('');
}

/** Strict / equality conclusions that hold in a closure, among pairs that span position `span` (if given). */
function strongConclusions(cl: Closure, vars: string[], spanFrom?: number, spanTo?: number): Conclusion[] {
  const out: Conclusion[] = [];
  for (let i = 0; i < vars.length; i++) {
    for (let j = i + 1; j < vars.length; j++) {
      if (spanFrom !== undefined && !(i <= spanFrom && j >= (spanTo ?? spanFrom) + 1)) continue;
      if (j - i < 2 && vars.length > 3) continue;
      const k = cl.known(vars[i], vars[j]);
      if (k === '>' || k === '<' || k === '=') out.push({ a: vars[i], rel: k, b: vars[j] });
    }
  }
  return out;
}

function allHold(chain: Chain, req: readonly Conclusion[]): boolean {
  const cl = new Closure(chainLinks(chain));
  return cl.consistent && req.every((c) => cl.holds(c));
}

function reqText(req: readonly Conclusion[]): string {
  return req.length === 1 ? `the expression '${concText(req[0])}'` : `the expressions '${concText(req[0])}' as well as '${concText(req[1])}'`;
}

function describeUnder(chain: Chain, req: readonly Conclusion[]): string {
  const cl = new Closure(chainLinks(chain));
  return req
    .map((c) => {
      const k = cl.known(c.a, c.b);
      const ok = cl.holds(c);
      const got = k === null ? 'no relation' : k === '≥' || k === '≤' ? `only ${c.a} ${k} ${c.b}` : `${c.a} ${k} ${c.b}`;
      return `${concText(c)} ${ok ? '✓' : `✗ (${got})`}`;
    })
    .join('; ');
}

function buildMissingSymbol(rng: Rng, d: Difficulty) {
  const form: 'single' | 'which' | 'blanks' =
    d === 'easy' ? 'single' : d === 'medium' ? (rng.chance(0.55) ? 'single' : 'which') : d === 'hard' ? (rng.chance(0.5) ? 'which' : 'blanks') : 'blanks';
  const order = form === 'blanks' ? [buildBlanks, buildWhichExpression, buildSingleBlank] : form === 'which' ? [buildWhichExpression, buildSingleBlank] : [buildSingleBlank];
  let last: unknown;
  for (const build of order) {
    try {
      return build(rng, d === 'easy' && build !== buildSingleBlank ? 'medium' : d);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

function buildSingleBlank(rng: Rng, d: Difficulty) {
  const nReq = d === 'easy' ? 1 : 2;
  for (let attempt = 0; attempt < 300; attempt++) {
    const n = d === 'easy' ? rng.int(4, 5) : rng.int(5, 6);
    const vars = pickVars(rng, n);
    const rels = randomRels(rng, n - 1, d, rng.int(0, 1));
    const q = rng.int(0, n - 2);
    const target = rng.pick(['>', '<', '='] as const);
    const ops: (Rel | '?')[] = rels.map((r, i) => (i === q ? '?' : r));
    const closures = new Map<Rel, Closure>(RELS.map((s) => [s, new Closure(chainLinks(fillChain(vars, ops, [s])))]));
    const tcl = closures.get(target)!;
    const pool = strongConclusions(tcl, vars, q, q);
    const works = (c: Conclusion) => RELS.filter((s) => closures.get(s)!.consistent && closures.get(s)!.holds(c));
    const shuffled = rng.shuffle(pool);
    let req: Conclusion[] | null = null;
    if (nReq === 1) {
      const c = shuffled.find((x) => {
        const w = works(x);
        return w.length === 1 && w[0] === target;
      });
      if (c) req = [c];
    } else {
      outer: for (let i = 0; i < shuffled.length; i++) {
        for (let j = i + 1; j < shuffled.length; j++) {
          if (samePair(shuffled[i], shuffled[j])) continue;
          const wi = works(shuffled[i]);
          const wj = works(shuffled[j]);
          const both = wi.filter((s) => wj.includes(s));
          if (both.length === 1 && both[0] === target && (wi.length > 1 || wj.length > 1)) {
            req = [shuffled[i], shuffled[j]];
            break outer;
          }
        }
      }
    }
    if (!req) continue;
    req = req.map((c) => orient(rng, c, 0.3));
    const others = RELS.filter((s) => s !== target);
    const choices = shuffleChoices(rng, target, others);
    const fills = choices.options.map((o) => [o]);
    const prompt =
      `Which of the following symbols should replace the question mark (?) in the given expression so that ${reqText(req)} ${req.length === 1 ? 'is' : 'are'} definitely true?\n\n` +
      `**Expression:** ${exprText(vars, ops)}`;
    const steps: string[] = [`Put each symbol in place of '?' and test the required expression${req.length > 1 ? 's' : ''}:`];
    for (const s of RELS) steps.push(`'${s}': ${exprText(vars, ops.map((o) => (o === '?' ? s : o)))} → ${describeUnder(fillChain(vars, ops, [s]), req)}.`);
    steps.push(`Only '${target}' makes ${req.length === 1 ? 'it' : 'both'} definitely true.`);
    const full = fillChain(vars, ops, [target]);
    const visual: VisualSpec = {
      type: 'chain',
      lines: [{ text: chainText(full), highlight: signRanges(full, 0, (_r, i) => i === q) }],
      caption: `The '?' filled with '${target}'.`,
    };
    const facts: InequalityFacts = {
      form: 'missing-symbol',
      statements: [{ vars, ops }],
      conclusions: req.map((c) => ({ a: c.a, op: c.rel, b: c.b })),
      fills,
    };
    const trap =
      target === '='
        ? `'≥' or '≤' satisfies only one of the two required expressions; the blank must work in both directions at once, which only '=' does.`
        : `'${target === '>' ? '≥' : '≤'}' keeps the direction but gives no strict sign on the way, so only a '${target === '>' ? '≥' : '≤'}' relation follows — not the strict one asked.`;
    return {
      prompt,
      choices,
      solution: { steps, shortcut: 'For a strict conclusion, the path needs at least one strict sign and no sign against the direction; for two conclusions running in opposite directions through the blank, only "=" can serve both.', trap, visual },
      tags: ['inequality:missing-symbol', 'trick:fill-the-blank'],
      facts,
    };
  }
  throw new Error('inequality: could not build a missing-symbol question');
}

function mutateChain(rng: Rng, ch: Chain): Chain {
  const rels = [...ch.rels];
  const vars = [...ch.vars];
  const kind = rng.int(0, 3);
  const i = rng.int(0, rels.length - 1);
  if (kind === 0) rels[i] = flipRel(rels[i]) === rels[i] ? rng.pick(['>', '<'] as const) : flipRel(rels[i]);
  else if (kind === 1) rels[i] = rels[i] === '>' ? '≥' : rels[i] === '<' ? '≤' : rels[i] === '≥' ? '=' : rels[i] === '≤' ? '<' : '>';
  else if (kind === 2) {
    const j = rng.int(0, vars.length - 1);
    const k = rng.int(0, vars.length - 1);
    [vars[j], vars[k]] = [vars[k], vars[j]];
  } else rels[i] = rng.pick(RELS.filter((r) => r !== rels[i]));
  return { vars, rels };
}

function buildWhichExpression(rng: Rng, d: Difficulty) {
  const nReq = d === 'medium' ? 1 : 2;
  for (let attempt = 0; attempt < 300; attempt++) {
    const n = d === 'medium' ? rng.int(5, 6) : 6;
    const vars = pickVars(rng, n);
    const correct: Chain = { vars, rels: randomRels(rng, n - 1, d, 1) };
    const cl = new Closure(chainLinks(correct));
    const pool = rng.shuffle(strongConclusions(cl, vars).filter((c) => Math.abs(vars.indexOf(c.a) - vars.indexOf(c.b)) >= 2));
    if (pool.length < nReq) continue;
    const req = nReq === 1 ? [pool[0]] : pool.find((c) => !samePair(c, pool[0])) ? [pool[0], pool.find((c) => !samePair(c, pool[0]))!] : null;
    if (!req) continue;
    const texts = new Set([chainText(correct)]);
    const distractors: Chain[] = [];
    for (let k = 0; k < 80 && distractors.length < 4; k++) {
      let m = mutateChain(rng, correct);
      if (rng.chance(0.3)) m = mutateChain(rng, m);
      const t = chainText(m);
      if (texts.has(t)) continue;
      if (!new Closure(chainLinks(m)).consistent) continue;
      if (allHold(m, req)) continue;
      // every distractor must keep both letters of each required expression in play
      if (!req.every((c) => m.vars.includes(c.a) && m.vars.includes(c.b))) continue;
      texts.add(t);
      distractors.push(m);
    }
    if (distractors.length < 4) continue;
    const shown = req.map((c) => orient(rng, c, 0.3));
    const display = (c: Chain) => (rng.chance(0.3) ? { vars: [...c.vars].reverse(), rels: [...c.rels].reverse().map(flipRel) } : c);
    const correctShown = display(correct);
    const distShown = distractors.map(display);
    if (new Set([correctShown, ...distShown].map(chainText)).size !== 5) continue;
    const choices = shuffleChoices(rng, chainText(correctShown), distShown.map(chainText));
    const byText = new Map([[chainText(correctShown), correctShown], ...distShown.map((c) => [chainText(c), c] as const)]);
    const candidatesShown = choices.options.map((o) => byText.get(o)!);
    const prompt = `In which of the following expressions will ${reqText(shown)} be definitely true?`;
    const steps = candidatesShown.map((c, i) => `(${'ABCDE'[i]}) ${chainText(c)} → ${describeUnder(c, shown)}.`);
    steps.push(`Only option (${'ABCDE'[choices.answerIndex]}) makes ${shown.length === 1 ? 'it' : 'both'} definitely true.`);
    const pathLines = shown.map((c) => {
      const p = pathChain(chainLinks(correctShown), c.a, c.b)!;
      return { text: chainText(p), highlight: signRanges(p, 0, (r) => isStrict(r) || r === '=') };
    });
    const facts: InequalityFacts = {
      form: 'which-expression',
      statements: [],
      conclusions: shown.map((c) => ({ a: c.a, op: c.rel, b: c.b })),
      candidates: candidatesShown.map((c) => ({ vars: [...c.vars], ops: [...c.rels] })),
    };
    return {
      prompt,
      choices,
      solution: {
        steps,
        shortcut: 'Locate the two letters in each option and read only the signs between them: same direction throughout, and at least one strict sign for > / <.',
        trap: 'Options that differ by a single sign look identical at a glance — a lone ≥ where a > is needed, or one reversed sign, is enough to break the relation.',
        visual: { type: 'chain', lines: pathLines, caption: 'The required relations read along the correct expression.' } as VisualSpec,
      },
      tags: ['inequality:missing-symbol', 'inequality:which-expression'],
      facts,
    };
  }
  throw new Error('inequality: could not build a which-expression question');
}

function buildBlanks(rng: Rng, d: Difficulty) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const n = d === 'hard' ? rng.int(5, 6) : rng.int(6, 7);
    const nBlank = d === 'hard' ? rng.int(2, 3) : rng.int(3, 4);
    const vars = pickVars(rng, n);
    const rels = randomRels(rng, n - 1, d, rng.int(1, 2));
    const blankPos = rng.sample(Array.from({ length: n - 1 }, (_, i) => i), Math.min(nBlank, n - 1)).sort((a, b) => a - b);
    const ops: (Rel | '?')[] = rels.map((r, i) => (blankPos.includes(i) ? '?' : r));
    const fill = blankPos.map((i) => rels[i]);
    const full: Chain = { vars, rels };
    const cl = new Closure(chainLinks(full));
    const pool = rng.shuffle(strongConclusions(cl, vars).filter((c) => Math.abs(vars.indexOf(c.a) - vars.indexOf(c.b)) >= 2)).slice(0, 12);
    const spans = (c: Conclusion, bp: number) => {
      const ia = vars.indexOf(c.a);
      const ib = vars.indexOf(c.b);
      return Math.min(ia, ib) <= bp && bp < Math.max(ia, ib);
    };
    // A blank is "pinned" when changing it alone to any other sign breaks a required relation.
    const pinnedCount = (cand: Conclusion[]) =>
      blankPos.filter((_, bi) =>
        RELS.filter((s) => s !== fill[bi]).every((s) => {
          const f2 = [...fill];
          f2[bi] = s;
          return !allHold(fillChain(vars, ops, f2), cand);
        }),
      ).length;
    let req: Conclusion[] | null = null;
    let best = -1;
    for (let i = 0; i < pool.length && best < blankPos.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        if (samePair(pool[i], pool[j])) continue;
        const cand = [pool[i], pool[j]];
        if (!blankPos.every((bp) => cand.some((c) => spans(c, bp)))) continue;
        const score = pinnedCount(cand);
        if (score > best) {
          best = score;
          req = cand;
          if (score === blankPos.length) break;
        }
      }
    }
    if (!req || best < blankPos.length - (d === 'extreme' ? 2 : 1)) continue;
    const key = fill.join(', ');
    const seen = new Set([key]);
    const distractors: string[] = [];
    for (let k = 0; k < 120 && distractors.length < 4; k++) {
      const f2 = [...fill];
      const changes = rng.chance(0.6) ? 1 : 2;
      for (let c = 0; c < changes; c++) {
        const bi = rng.int(0, f2.length - 1);
        f2[bi] = rng.pick(RELS.filter((s) => s !== f2[bi]));
      }
      const t = f2.join(', ');
      if (seen.has(t)) continue;
      if (allHold(fillChain(vars, ops, f2), req)) continue;
      seen.add(t);
      distractors.push(t);
    }
    if (distractors.length < 4) continue;
    const shown = req.map((c) => orient(rng, c, 0.3));
    const choices = shuffleChoices(rng, key, distractors);
    const fills = choices.options.map((o) => o.split(', '));
    const prompt =
      `Which of the following should be placed in the blanks (in the same order from left to right) so that ${reqText(shown)} are definitely true?\n\n` +
      `**Expression:** ${exprText(vars, ops, '___')}`;
    const steps: string[] = [];
    steps.push(`Correct filling: ${chainText(full)}.`);
    steps.push(`Check: ${describeUnder(full, shown)}.`);
    choices.options.forEach((o, i) => {
      if (i === choices.answerIndex) return;
      steps.push(`(${'ABCDE'[i]}) ${o} → ${describeUnder(fillChain(vars, ops, o.split(', ') as Rel[]), shown)}.`);
    });
    steps.push(`Only (${'ABCDE'[choices.answerIndex]}) makes both definitely true.`);
    const facts: InequalityFacts = {
      form: 'missing-symbol',
      statements: [{ vars, ops }],
      conclusions: shown.map((c) => ({ a: c.a, op: c.rel, b: c.b })),
      fills,
    };
    return {
      prompt,
      choices,
      solution: {
        steps,
        shortcut: 'Work blank by blank from the required relations: a strict requirement needs a strict sign somewhere on its path, an "=" requirement needs "=" on every link, and no link may point the other way.',
        trap: 'An option that differs from the answer in one blank often satisfies one required relation — check both before choosing.',
        visual: { type: 'chain', lines: [{ text: chainText(full), highlight: signRanges(full, 0, (_r, i) => blankPos.includes(i)) }], caption: 'Blanks filled; the filled signs are highlighted.' } as VisualSpec,
      },
      tags: ['inequality:missing-symbol', 'inequality:blanks'],
      facts,
    };
  }
  throw new Error('inequality: could not build a blanks question');
}

/* ------------------------------------------------------------------ */
/* Generator                                                           */
/* ------------------------------------------------------------------ */

export const generator = defineGenerator<InequalityFacts>(META, SUBTYPES, ({ meta, seed, difficulty, subtype, rng }) => {
  const built =
    subtype.id === 'missing-symbol'
      ? buildMissingSymbol(rng, difficulty)
      : buildPairQuestion({ rng, difficulty, seed, subtypeId: subtype.id }, subtype.id as 'direct' | 'combined' | 'coded' | 'either-or');
  const q = makeQuestion(meta, seed, {
    subtype: subtype.id,
    difficulty,
    prompt: built.prompt,
    options: built.choices.options,
    answerIndex: built.choices.answerIndex,
    solution: built.solution,
    tags: built.tags,
    targetSeconds: targetSeconds('short-reasoning', difficulty),
  });
  return { item: single(q), facts: built.facts };
});
