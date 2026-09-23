/**
 * Reasoning R5 — Syllogism (SPEC 8.2 R5, 7.6).
 *
 * Subtypes: two statements, three statements, possibility, only a few, reverse (which statement(s) make the
 * conclusions follow). Keys come from the region-enumeration engine; the independent verifier uses a
 * different model (element types + monotonicity, no world enumeration).
 *
 * Conventions: every term is non-empty (All A are B ⇒ Some A are B); a possibility conclusion follows when it
 * is possible but not already certain — we never ask the "possibility of a certainty" (conventions differ);
 * either–or only for the classic complementary pairs (Some/No, All/Some-not) on the same terms.
 */
import { defineGenerator } from '../types';
import { makeQuestion, single } from '../shared/question';
import { fixedChoices, shuffleChoices } from '../shared/options';
import { targetSeconds } from '../../targets';
import type { Rng } from '../../../lib/rng';
import type { Difficulty, VennWorld, VisualSpec } from '../../types';
import {
  SyllogismEngine,
  holdsIn,
  samePropMeaning,
  worldRegions,
  type Concl,
  type Prop,
  type Quant,
} from '../solver/syllogism';
import { NOUNS, article, cap, type Noun } from './syllogism/nouns';

export type SylQuant = Quant;

export interface SylPropFact {
  q: SylQuant;
  /** Term indices into `terms`. */
  a: number;
  b: number;
  /** Conclusions only: "… is a possibility". */
  possibility?: boolean;
}

export interface SyllogismFacts {
  /**
   * conclusions       — statements + conclusions I and II (fixed five options).
   * missing-statement — `statements` are the given ones; option k's single statement goes in at `blank`.
   * statement-sets    — each option is a full set of statements; `statements` is empty.
   */
  form: 'conclusions' | 'missing-statement' | 'statement-sets';
  /** Plural nouns, by index. */
  terms: string[];
  statements: SylPropFact[];
  blank?: number;
  conclusions: SylPropFact[];
  /** Options in display order (reverse forms). */
  options?: SylPropFact[][];
}

const META = { name: 'reasoning.syllogism', version: 1, subject: 'reasoning', chapter: 'syllogism' } as const;

// Weights follow research/archetypes.md R5: 3-statement items with "only a few" and possibility conclusions
// dominate; reverse formats have not appeared in prelims (kept for H/X practice).
const SUBTYPES = [
  { id: 'two-statement', label: 'Two statements', weight: 1.5 },
  { id: 'three-statement', label: 'Three statements', weight: 3 },
  { id: 'possibility', label: 'Possibility cases', weight: 2.5 },
  { id: 'only-a-few', label: '"Only a few" cases', weight: 3 },
  { id: 'reverse', label: 'Reverse (find the statements)', weight: 0.5, difficulties: ['hard', 'extreme'] as const },
] as const;

export const SYL_OPTIONS = ['Only I follows', 'Only II follows', 'Either I or II follows', 'Neither I nor II follows', 'Both I and II follow'] as const;

const VERDICT_WORD = ['only I follows', 'only II follows', 'either I or II follows', 'neither I nor II follows', 'both I and II follow'];

const INTRO =
  'In the question below, some statements are given followed by two conclusions. Take the statements to be true even if they seem to be at variance with commonly known facts, and decide which of the conclusions logically follows.';

type Sub = 'two-statement' | 'three-statement' | 'possibility' | 'only-a-few' | 'reverse';

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

function propText(p: Concl, t: readonly Noun[]): string {
  const A = t[p.a];
  const B = t[p.b];
  if (p.possibility) {
    switch (p.q) {
      case 'all':
        return `All ${A.p} being ${B.p} is a possibility.`;
      case 'some':
        return `Some ${A.p} being ${B.p} is a possibility.`;
      case 'some-not':
        return `Some ${A.p} are not ${B.p} is a possibility.`;
      default:
        throw new Error(`no possibility wording for ${p.q}`);
    }
  }
  switch (p.q) {
    case 'all':
      return `All ${A.p} are ${B.p}.`;
    case 'some':
      return `Some ${A.p} are ${B.p}.`;
    case 'no':
      return `No ${A.s} is ${article(B.s)} ${B.s}.`;
    case 'some-not':
      return `Some ${A.p} are not ${B.p}.`;
    case 'only-a-few':
      return `Only a few ${A.p} are ${B.p}.`;
  }
}

/** Sentence without the final full stop, for embedding. */
function inline(p: Concl, t: readonly Noun[]): string {
  return propText(p, t).replace(/\.$/, '');
}

function meaning(p: Prop, t: readonly Noun[]): string {
  const A = t[p.a];
  const B = t[p.b];
  switch (p.q) {
    case 'all':
      return `${inline(p, t)} — the ${A.p} circle lies completely inside ${B.p}.`;
    case 'some':
      return `${inline(p, t)} — ${A.p} and ${B.p} overlap.`;
    case 'no':
      return `${inline(p, t)} — ${A.p} and ${B.p} do not touch.`;
    case 'some-not':
      return `${inline(p, t)} — part of ${A.p} lies outside ${B.p}.`;
    case 'only-a-few':
      return `${inline(p, t)} — some ${A.p} are ${B.p} and some ${A.p} are not ${B.p} (${A.p} is partly inside ${B.p}).`;
  }
}

/** What a world looks like when the conclusion is false (for the "does not follow" line). */
function negationText(p: Prop, t: readonly Noun[], world: number, n: number): string {
  const A = t[p.a];
  const B = t[p.b];
  switch (p.q) {
    case 'all':
      return `some ${A.p} lie outside ${B.p}`;
    case 'some':
      return `no ${A.s} is ${article(B.s)} ${B.s}`;
    case 'no':
      return `some ${A.p} are ${B.p}`;
    case 'some-not':
      return `all ${A.p} are ${B.p}`;
    case 'only-a-few':
      return holdsIn(n, world, { q: 'all', a: p.a, b: p.b }) ? `all ${A.p} are ${B.p}` : `no ${A.s} is ${article(B.s)} ${B.s}`;
  }
}

/** The certain opposite of an impossible statement. */
function oppositeText(p: Prop, t: readonly Noun[]): string {
  const A = t[p.a];
  const B = t[p.b];
  switch (p.q) {
    case 'all':
      return `some ${A.p} are definitely not ${B.p}`;
    case 'some':
      return `no ${A.s} can be ${article(B.s)} ${B.s}`;
    case 'no':
      return `some ${A.p} are definitely ${B.p}`;
    case 'some-not':
      return `all ${A.p} are definitely ${B.p}`;
    case 'only-a-few':
      return `${A.p} can never be only partly inside ${B.p}`;
  }
}

/* ------------------------------------------------------------------ */
/* Derivation hints (explanatory only — the key comes from the engine) */
/* ------------------------------------------------------------------ */

function implies(stmts: readonly Prop[], a: number, b: number, qs: Quant[], sym = false): Prop | undefined {
  return stmts.find((s) => qs.includes(s.q) && ((s.a === a && s.b === b) || (sym && s.a === b && s.b === a)));
}

function someLink(stmts: readonly Prop[], a: number, m: number): Prop | undefined {
  // "some a are m" is certain from: some (either way), only a few (either way), all a→m, all m→a
  return (
    implies(stmts, a, m, ['some', 'only-a-few'], true) ?? implies(stmts, a, m, ['all']) ?? implies(stmts, m, a, ['all'])
  );
}

function deriveHint(stmts: readonly Prop[], c: Prop, t: readonly Noun[], n: number): string | undefined {
  const S = (p: Prop) => `'${inline(p, t)}'`;
  const { a, b } = c;
  if (c.q === 'some') {
    const d = someLink(stmts, a, b);
    if (d) return `it follows directly from ${S(d)}`;
  }
  if (c.q === 'no') {
    const d = implies(stmts, a, b, ['no'], true);
    if (d) return `it is ${S(d)} read the other way round`;
  }
  if (c.q === 'some-not') {
    const d = implies(stmts, a, b, ['only-a-few', 'no']) ?? implies(stmts, b, a, ['no']);
    if (d) return `it follows directly from ${S(d)}`;
  }
  for (let m = 0; m < n; m++) {
    if (m === a || m === b) continue;
    const allAM = implies(stmts, a, m, ['all']);
    const allMB = implies(stmts, m, b, ['all']);
    const allBM = implies(stmts, b, m, ['all']);
    const noMB = implies(stmts, m, b, ['no'], true);
    const noAM = implies(stmts, a, m, ['no'], true);
    const someAM = someLink(stmts, a, m);
    if (c.q === 'all' && allAM && allMB) return `${S(allAM)} + ${S(allMB)} ⇒ All + All = All`;
    if (c.q === 'no' && allAM && noMB) return `${S(allAM)} + ${S(noMB)} ⇒ All + No = No`;
    if (c.q === 'no' && allBM && noAM) return `${S(allBM)} + ${S(noAM)} ⇒ All + No = No`;
    if (c.q === 'some' && someAM && allMB) return `${S(someAM)} + ${S(allMB)} ⇒ Some + All = Some`;
    if (c.q === 'some-not' && someAM && noMB) return `${S(someAM)} + ${S(noMB)} ⇒ Some + No = Some … not`;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Structures                                                          */
/* ------------------------------------------------------------------ */

function pickTerms(rng: Rng, n: number): Noun[] {
  return rng.sample(NOUNS, n);
}

function linkShape(rng: Rng, n: number): [number, number][] {
  if (n === 3) return [[0, 1], [1, 2]];
  const x = rng.next();
  if (x < 0.7) return [[0, 1], [1, 2], [2, 3]];
  if (x < 0.85) return [[0, 1], [1, 2], [1, 3]];
  return [[0, 1], [0, 2], [2, 3]];
}

function quantWeights(sub: Sub, d: Difficulty): [Quant, number][] {
  const w: [Quant, number][] = [
    ['all', 3],
    ['some', 3],
    ['no', 2],
  ];
  if (d !== 'easy') w.push(['some-not', d === 'medium' ? 0.3 : 0.6]);
  // research/archetypes.md R5: "only a few" appears in most recent prelims items
  if (sub === 'only-a-few') w.push(['only-a-few', 2.5]);
  else w.push(['only-a-few', { easy: 0.4, medium: 1.3, hard: 1.5, extreme: 2 }[d]]);
  if (sub === 'possibility') {
    w[0][1] = 3.5;
    w[2][1] = 3;
  }
  return w;
}

function randomStatements(rng: Rng, n: number, sub: Sub, d: Difficulty): Prop[] {
  const shape = linkShape(rng, n);
  const weights = quantWeights(sub, d);
  const stmts = shape.map(([x, y]) => {
    const q = rng.weighted(weights);
    return rng.chance(0.5) ? { q, a: x, b: y } : { q, a: y, b: x };
  });
  if (sub === 'only-a-few' && !stmts.some((s) => s.q === 'only-a-few')) {
    const k = rng.int(0, stmts.length - 1);
    stmts[k] = { ...stmts[k], q: 'only-a-few' };
  }
  return stmts;
}

interface Cand {
  c: Concl;
  f: boolean;
  w: number;
}

function linkedPairs(stmts: readonly Prop[]): Set<string> {
  const s = new Set<string>();
  for (const p of stmts) {
    s.add(`${p.a}-${p.b}`);
    s.add(`${p.b}-${p.a}`);
  }
  return s;
}

function conclusionCandidates(eng: SyllogismEngine, stmts: readonly Prop[], sub: Sub, d: Difficulty): Cand[] {
  const n = eng.n;
  const linked = linkedPairs(stmts);
  const definiteQs: Quant[] = ['all', 'some', 'no'];
  if (d !== 'easy') definiteQs.push('some-not');
  if (sub === 'only-a-few' || d === 'extreme') definiteQs.push('only-a-few');
  const allowPoss = sub === 'possibility' || d === 'hard' || d === 'extreme' || (sub === 'only-a-few' && d !== 'easy');
  const possQs: Quant[] = allowPoss ? ['all', 'some', 'some-not'] : [];
  const out: Cand[] = [];
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const isLinked = linked.has(`${a}-${b}`);
      const forms: Concl[] = [
        ...definiteQs.map((q) => ({ q, a, b })),
        ...possQs.map((q) => ({ q, a, b, possibility: true })),
      ];
      for (const c of forms) {
        if (!c.possibility && stmts.some((s) => samePropMeaning(s, c))) continue;
        const f = eng.follows(c);
        if (f === null) continue;
        let w = 1;
        if (!isLinked) w *= d === 'easy' ? 1.2 : 2;
        else w *= d === 'easy' ? 1 : 0.5;
        if (c.possibility) w *= sub === 'possibility' ? 3 : 1;
        if (c.q === 'some-not') w *= 0.6;
        if (c.q === 'only-a-few') w *= sub === 'only-a-few' ? 1.2 : 0.5;
        if (!c.possibility && !f && eng.possible(c)) w *= 1.6; // possible but not certain: the classic trap
        out.push({ c, f, w });
      }
    }
  }
  return out;
}

function pickW(rng: Rng, xs: readonly Cand[]): Cand | undefined {
  return xs.length ? rng.weighted(xs.map((x) => [x, x.w] as const)) : undefined;
}

function distinctConcl(x: Concl, y: Concl): boolean {
  return !(x.q === y.q && !!x.possibility === !!y.possibility && (samePropMeaning(x, y) || (x.a === y.a && x.b === y.b)));
}

function choosePair(rng: Rng, eng: SyllogismEngine, cands: readonly Cand[], target: number, sub: Sub): [Concl, Concl] | null {
  const T = cands.filter((c) => c.f);
  const F = cands.filter((c) => !c.f);
  const needPoss = sub === 'possibility';
  for (let attempt = 0; attempt < 40; attempt++) {
    let pair: [Concl, Concl] | null = null;
    if (target === 0 || target === 1) {
      const t = pickW(rng, T);
      const f = pickW(
        rng,
        F.filter((x) => t && distinctConcl(x.c, t.c)),
      );
      if (!t || !f) return null;
      pair = target === 0 ? [t.c, f.c] : [f.c, t.c];
    } else if (target === 4) {
      const a = pickW(rng, T);
      const b = pickW(
        rng,
        T.filter((x) => a && distinctConcl(x.c, a.c) && !(x.c.a === a.c.a && x.c.b === a.c.b && !!x.c.possibility === !!a.c.possibility)),
      );
      if (!a || !b) return null;
      pair = [a.c, b.c];
    } else if (target === 3) {
      const a = pickW(rng, F);
      const b = pickW(
        rng,
        F.filter((x) => a && distinctConcl(x.c, a.c)),
      );
      if (!a || !b) return null;
      pair = [a.c, b.c];
    } else {
      // classic complementary pairs on the same terms
      const opts: [Concl, Concl][] = [];
      for (let a = 0; a < eng.n; a++) {
        for (let b = 0; b < eng.n; b++) {
          if (a === b) continue;
          if (a < b && !eng.definite({ q: 'some', a, b }) && !eng.definite({ q: 'no', a, b })) opts.push([{ q: 'some', a, b }, { q: 'no', a, b }]);
          if (!eng.definite({ q: 'all', a, b }) && !eng.definite({ q: 'some-not', a, b })) opts.push([{ q: 'all', a, b }, { q: 'some-not', a, b }]);
        }
      }
      if (!opts.length) return null;
      const [x, y] = rng.pick(opts);
      pair = rng.chance(0.5) ? [x, y] : [y, x];
    }
    if (!pair) continue;
    if (needPoss && target !== 2 && !pair.some((c) => c.possibility)) continue;
    if (eng.pairVerdict(pair[0], pair[1]) === target) return pair;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Diagrams                                                            */
/* ------------------------------------------------------------------ */

function vennVisual(eng: SyllogismEngine, terms: readonly Noun[], concs: readonly Concl[], labels: readonly string[]): { visual: VisualSpec; worldIndex: (number | null)[] } {
  const n = eng.n;
  const names = terms.map((t) => cap(t.p));
  const toVenn = (w: number, label: string): VennWorld => ({
    label,
    regions: worldRegions(w, n).map((r) => r.map((i) => names[i]).sort()),
  });
  const basic = eng.bestWorld()!;
  const worlds: { w: number; label: string }[] = [{ w: basic, label: 'Diagram 1 — least overlap' }];
  const worldIndex: (number | null)[] = [];
  concs.forEach((c, i) => {
    let w: number | null = null;
    let note = '';
    if (c.possibility) {
      if (eng.follows(c)) {
        w = eng.bestWorld((x) => holdsIn(n, x, c));
        note = `conclusion ${labels[i]} is possible`;
      }
    } else if (!eng.definite(c)) {
      w = eng.bestWorld((x) => !holdsIn(n, x, c));
      note = `conclusion ${labels[i]} fails`;
    }
    if (w === null) {
      worldIndex.push(null);
      return;
    }
    let k = worlds.findIndex((x) => x.w === w);
    if (k < 0) {
      worlds.push({ w, label: `Diagram ${worlds.length + 1} — ${note}` });
      k = worlds.length - 1;
    } else worlds[k].label += `; ${note}`;
    worldIndex.push(k + 1);
  });
  return {
    visual: {
      type: 'venn',
      sets: [...names].sort(),
      worlds: worlds.map((x) => toVenn(x.w, x.label)),
      caption: 'Every diagram satisfies all the statements. A definite conclusion must hold in all of them; a possibility needs only one.',
    },
    worldIndex,
  };
}

function conclusionLine(
  eng: SyllogismEngine,
  stmts: readonly Prop[],
  c: Concl,
  t: readonly Noun[],
  label: string,
  diagram: number | null,
): string {
  const n = eng.n;
  const head = `${label}. ${inline(c, t)}`;
  if (c.possibility) {
    if (eng.follows(c)) return `${head} — **follows**: nothing in the statements rules it out${diagram ? ` (see diagram ${diagram})` : ''}.`;
    return `${head} — **does not follow**: it is impossible, because ${oppositeText(c, t)}.`;
  }
  if (eng.definite(c)) {
    const hint = deriveHint(stmts, c, t, n);
    return `${head} — **follows**: it holds in every diagram${hint ? `; ${hint}` : ''}.`;
  }
  if (!eng.possible(c)) return `${head} — **does not follow**: the statements force the opposite — ${oppositeText(c, t)}.`;
  const w = eng.bestWorld((x) => !holdsIn(n, x, c))!;
  return `${head} — **does not follow**: in diagram ${diagram ?? 1} every statement holds, yet ${negationText(c, t, w, n)}.`;
}

function trapText(eng: SyllogismEngine, concs: readonly Concl[], t: readonly Noun[], verdict: number): string {
  if (verdict === 2) {
    return `Neither conclusion is certain on its own, so "neither" looks right — but '${inline(concs[0], t)}' and '${inline(concs[1], t)}' are a complementary pair about the same two terms: one of them must be true.`;
  }
  for (const c of concs) {
    if (!c.possibility && !eng.definite(c) && eng.possible(c)) {
      return `'${inline(c, t)}' can be true in some diagrams, which makes it tempting — but a definite conclusion must hold in every diagram.`;
    }
  }
  for (const c of concs) {
    if (c.possibility && eng.follows(c)) return `Don't reject '${inline(c, t)}' just because no statement says it — for a possibility, one valid diagram is enough.`;
    if (c.possibility && !eng.follows(c)) return `'${inline(c, t)}' sounds harmless, but a possibility fails when the statements already force the opposite.`;
  }
  return 'Draw the least-overlap diagram first and test each conclusion against it before looking for other diagrams.';
}

const SHORTCUT =
  'Quick rules: All + All = All; All + No = No; Some + All = Some; Some + No = Some … not; All/Some + Some gives no definite conclusion. A definite conclusion must hold in every diagram; a possibility needs just one diagram and fails only when the statements force the opposite.';

/* ------------------------------------------------------------------ */
/* Conclusion-pair questions                                           */
/* ------------------------------------------------------------------ */

function buildPairQuestion(rng: Rng, d: Difficulty, sub: Sub) {
  const target = rng.int(0, 4);
  const n = sub === 'two-statement' ? 3 : sub === 'three-statement' ? 4 : d === 'easy' || (d === 'medium' && rng.chance(0.5)) ? 3 : 4;
  for (let attempt = 0; attempt < 300; attempt++) {
    const terms = pickTerms(rng, n);
    const stmts = randomStatements(rng, n, sub, d);
    const eng = new SyllogismEngine(n, stmts);
    if (!eng.consistent) continue;
    const cands = conclusionCandidates(eng, stmts, sub, d);
    const pair = choosePair(rng, eng, cands, target, sub);
    if (!pair) continue;
    const verdict = eng.pairVerdict(pair[0], pair[1]);
    if (verdict !== target) continue;

    const labels = ['I', 'II'];
    const { visual, worldIndex } = vennVisual(eng, terms, pair, labels);
    const prompt =
      `${INTRO}\n\n**Statements:**\n${stmts.map((s) => propText(s, terms)).join('\n')}\n\n` +
      `**Conclusions:**\nI. ${propText(pair[0], terms)}\nII. ${propText(pair[1], terms)}`;
    const steps: string[] = stmts.map((s) => meaning(s, terms));
    pair.forEach((c, i) => steps.push(conclusionLine(eng, stmts, c, terms, labels[i], worldIndex[i])));
    if (verdict === 2) steps.push(`Neither is certain alone, but they form a complementary pair on the same two terms, so exactly one of them is true.`);
    steps.push(`Hence ${VERDICT_WORD[verdict]}.`);
    const tags = [`syllogism:${sub}`];
    if (pair.some((c) => c.possibility)) tags.push('syllogism:possibility');
    if (stmts.some((s) => s.q === 'only-a-few') || pair.some((c) => c.q === 'only-a-few')) tags.push('syllogism:only-a-few');
    if (verdict === 2) tags.push('trick:complementary-pair');
    const facts: SyllogismFacts = {
      form: 'conclusions',
      terms: terms.map((x) => x.p),
      statements: stmts.map((s) => ({ ...s })),
      conclusions: pair.map((c) => ({ ...c })),
    };
    return {
      prompt,
      choices: fixedChoices(SYL_OPTIONS, verdict),
      solution: { steps, shortcut: SHORTCUT, trap: trapText(eng, pair, terms, verdict), visual },
      tags,
      facts,
    };
  }
  throw new Error(`syllogism: could not build ${sub}/${d} for category ${target}`);
}

/* ------------------------------------------------------------------ */
/* Reverse questions                                                   */
/* ------------------------------------------------------------------ */

function bothFollow(n: number, stmts: readonly Prop[], concs: readonly Concl[]): boolean {
  const eng = new SyllogismEngine(n, stmts);
  return eng.consistent && concs.every((c) => eng.follows(c) === true);
}

/** Every statement form on one pair of terms (no duplicates in meaning). */
function formsOnPair(x: number, y: number): Prop[] {
  return [
    { q: 'all', a: x, b: y },
    { q: 'all', a: y, b: x },
    { q: 'some', a: x, b: y },
    { q: 'no', a: x, b: y },
    { q: 'some-not', a: x, b: y },
    { q: 'some-not', a: y, b: x },
    { q: 'only-a-few', a: x, b: y },
    { q: 'only-a-few', a: y, b: x },
  ];
}

function buildReverse(rng: Rng, d: Difficulty) {
  const setsForm = rng.chance(0.5);
  const n = d === 'hard' ? 3 : 4;
  for (let attempt = 0; attempt < 400; attempt++) {
    const terms = pickTerms(rng, n);
    const stmts = randomStatements(rng, n, 'three-statement', d === 'hard' ? 'medium' : 'hard');
    const eng = new SyllogismEngine(n, stmts);
    if (!eng.consistent) continue;
    // conclusions: two definite ones that follow and need the statements (not restatements), preferring end terms
    const linked = linkedPairs(stmts);
    const pool = conclusionCandidates(eng, stmts, 'three-statement', d === 'hard' ? 'medium' : 'hard').filter(
      (c) => c.f && !c.c.possibility && c.c.q !== 'only-a-few' && !linked.has(`${c.c.a}-${c.c.b}`),
    );
    const pool2 = conclusionCandidates(eng, stmts, 'three-statement', 'medium').filter((c) => c.f && !c.c.possibility);
    const c1 = pickW(rng, pool);
    if (!c1) continue;
    const c2 = pickW(
      rng,
      pool2.filter((c) => distinctConcl(c.c, c1.c) && !(c.c.a === c1.c.a && c.c.b === c1.c.b)),
    );
    if (!c2) continue;
    const concs: Concl[] = rng.chance(0.5) ? [c1.c, c2.c] : [c2.c, c1.c];

    if (!setsForm) {
      const blank = rng.int(0, stmts.length - 1);
      const orig = stmts[blank];
      const others = formsOnPair(orig.a, orig.b).filter((p) => !samePropMeaning(p, orig));
      const failing = others.filter((p) => {
        const s2 = [...stmts];
        s2[blank] = p;
        return new SyllogismEngine(n, s2).consistent && !bothFollow(n, s2, concs);
      });
      if (failing.length < 4) continue;
      const distract = rng.sample(failing, 4);
      const correctText = propText(orig, terms);
      const choices = shuffleChoices(rng, correctText, distract.map((p) => propText(p, terms)));
      const byText = new Map([[correctText, orig], ...distract.map((p) => [propText(p, terms), p] as const)]);
      const optionProps = choices.options.map((o) => byText.get(o)!);
      const given = stmts.filter((_, i) => i !== blank);
      const shown = stmts.map((s, i) => (i === blank ? '________' : propText(s, terms)));
      const prompt =
        `In the question below, the statements have a blank, followed by two conclusions. Which of the following statements should be placed in the blank so that both conclusions logically follow?\n\n` +
        `**Statements:**\n${shown.join('\n')}\n\n**Conclusions:**\nI. ${propText(concs[0], terms)}\nII. ${propText(concs[1], terms)}`;
      const steps: string[] = [`Put each option into the blank and test both conclusions:`];
      optionProps.forEach((p, i) => {
        const s2 = [...stmts];
        s2[blank] = p;
        const e2 = new SyllogismEngine(n, s2);
        const res = concs.map((c, k) => `${['I', 'II'][k]} ${e2.consistent && e2.follows(c) ? '✓' : '✗'}`).join(', ');
        steps.push(`(${'ABCDE'[i]}) ${inline(p, terms)} → ${res}.`);
      });
      steps.push(`Only (${'ABCDE'[choices.answerIndex]}) makes both conclusions follow.`);
      const { visual } = vennVisual(eng, terms, concs, ['I', 'II']);
      const facts: SyllogismFacts = {
        form: 'missing-statement',
        terms: terms.map((x) => x.p),
        statements: given.map((s) => ({ ...s })),
        blank,
        conclusions: concs.map((c) => ({ ...c })),
        options: optionProps.map((p) => [{ ...p }]),
      };
      return {
        prompt,
        choices,
        solution: {
          steps,
          shortcut: 'Work backwards from the conclusion that links the far terms: it tells you which quantifier the missing link needs (All + All = All, Some + All = Some, All + No = No …).',
          trap: 'A statement that makes one conclusion follow often leaves the other undecided — test both conclusions for every option.',
          visual,
        },
        tags: ['syllogism:reverse', 'syllogism:missing-statement'],
        facts,
      };
    }

    // statement-sets form: mutate one statement of the correct set per distractor
    const correctSet = stmts;
    const seen = new Set([correctSet.map((s) => propText(s, terms)).join(' ')]);
    const distractors: Prop[][] = [];
    for (let k = 0; k < 120 && distractors.length < 4; k++) {
      const i = rng.int(0, correctSet.length - 1);
      const alt = rng.pick(formsOnPair(correctSet[i].a, correctSet[i].b).filter((p) => !samePropMeaning(p, correctSet[i])));
      const s2 = [...correctSet];
      s2[i] = alt;
      const key = s2.map((s) => propText(s, terms)).join(' ');
      if (seen.has(key)) continue;
      if (bothFollow(n, s2, concs)) continue;
      if (!new SyllogismEngine(n, s2).consistent) continue;
      seen.add(key);
      distractors.push(s2);
    }
    if (distractors.length < 4) continue;
    const setText = (ss: readonly Prop[]) => ss.map((s) => propText(s, terms)).join(' ');
    const choices = shuffleChoices(rng, setText(correctSet), distractors.map(setText));
    const byText = new Map([[setText(correctSet), correctSet], ...distractors.map((s) => [setText(s), s] as const)]);
    const optionSets = choices.options.map((o) => byText.get(o)!);
    const prompt =
      `Two conclusions are given below. Which of the following sets of statements makes both conclusions logically follow?\n\n` +
      `**Conclusions:**\nI. ${propText(concs[0], terms)}\nII. ${propText(concs[1], terms)}`;
    const steps: string[] = [`Test both conclusions against each set:`];
    optionSets.forEach((ss, i) => {
      const e2 = new SyllogismEngine(n, ss);
      const res = concs.map((c, k) => `${['I', 'II'][k]} ${e2.consistent && e2.follows(c) ? '✓' : '✗'}`).join(', ');
      steps.push(`(${'ABCDE'[i]}) ${res}.`);
    });
    steps.push(`Only (${'ABCDE'[choices.answerIndex]}) makes both conclusions follow.`);
    const { visual } = vennVisual(eng, terms, concs, ['I', 'II']);
    const facts: SyllogismFacts = {
      form: 'statement-sets',
      terms: terms.map((x) => x.p),
      statements: [],
      conclusions: concs.map((c) => ({ ...c })),
      options: optionSets.map((ss) => ss.map((s) => ({ ...s }))),
    };
    return {
      prompt,
      choices,
      solution: {
        steps,
        shortcut: 'The sets differ in one statement: find that statement and ask which version links the terms of each conclusion.',
        trap: 'Two sets can look almost identical — one changed quantifier (All ↔ Some, or the direction of an All) is enough to break a conclusion.',
        visual,
      },
      tags: ['syllogism:reverse', 'syllogism:statement-sets'],
      facts,
    };
  }
  throw new Error(`syllogism: could not build a reverse/${d} question`);
}

/* ------------------------------------------------------------------ */
/* Generator                                                           */
/* ------------------------------------------------------------------ */

export const generator = defineGenerator<SyllogismFacts>(META, SUBTYPES, ({ meta, seed, difficulty, subtype, rng }) => {
  const sub = subtype.id as Sub;
  const built = sub === 'reverse' ? buildReverse(rng, difficulty) : buildPairQuestion(rng, difficulty, sub);
  const q = makeQuestion(meta, seed, {
    subtype: sub,
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
