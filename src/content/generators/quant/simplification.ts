/**
 * Q1 Simplification & approximation — the biggest scoring block in clerk prelims (10–15 questions).
 *
 * Every question is an equation tree (see ./simplification/expr.ts). Exact questions are built backward so the
 * answer is an integer or a neat fraction; approximation questions start from a clean rounded equation and nudge
 * each printed number. Distractors come from documented slips (sign errors, BODMAS order, misremembered squares,
 * wrong-sign transposition, carrying slips).
 */
import { defineGenerator } from '../types';
import { makeQuestion, single } from '../shared/question';
import { fixedChoices, numericChoices, type Mistake } from '../shared/options';
import { targetSeconds } from '../../targets';
import { plain } from '../../../lib/format';
import type { Rng } from '../../../lib/rng';
import type { Difficulty } from '../../types';
import { Q, q } from './simplification/frac';
import {
  evalQ,
  hasUnk,
  isolate,
  pctFraction,
  qTex,
  reduce,
  reduceKnown,
  tex,
  topTerms,
  type Equation,
  type Node,
  type StepCtx,
} from './simplification/expr';
import { EXACT_BUILDERS, Retry, type AnswerStyle, type Draft, type MistakeQ } from './simplification/templates';
import { exponents, type ExpDraft } from './simplification/exponents';
import { buildApprox, exactShownValue, type ApproxBuilt } from './simplification/approx';

export interface SimplificationFacts {
  mode: 'exact' | 'approx';
  /** The equation exactly as printed; "?" is { t: 'unk' }. */
  lhs: Node;
  rhs: Node;
  /** Approximation only: the rounded equation the key is computed from. */
  rounded?: { lhs: Node; rhs: Node };
  answerStyle: AnswerStyle;
}

const META = { name: 'quant.simplification', version: 1, subject: 'quant', chapter: 'simplification' } as const;

/**
 * Weights follow research/archetypes.md (2024–26 papers): plain chains ~35%, "?" inside ~20%, powers/roots and
 * power unknowns ~15%, percentage sums ~15%, fraction chains ~10%. Approximation was absent in 2024–26 papers,
 * so it is kept at ~9% as a legacy / PO-style chip.
 */
export const SIMPLIFICATION_SUBTYPES = [
  { id: 'bodmas', label: 'BODMAS chains', weight: 3.5 },
  { id: 'missing-inside', label: 'Missing value inside', weight: 3 },
  { id: 'percent-of', label: 'Percentage of', weight: 2.5 },
  { id: 'powers-roots', label: 'Squares, cubes & roots', weight: 2 },
  { id: 'fractions', label: 'Fractions', weight: 2 },
  { id: 'exponents', label: 'Powers & exponents', weight: 1.5 },
  { id: 'decimals', label: 'Decimals', weight: 1 },
  { id: 'approximation', label: 'Approximation', weight: 1.5 },
] as const;

export const PROMPT_EXACT = 'What value should come in place of the question mark (?) in the following question?';
export const PROMPT_APPROX =
  'What approximate value should come in place of the question mark (?) in the following question? (Note: You are not expected to calculate the exact value.)';

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/**
 * Rational reconstruction of an option value. All option values here have denominators ≤ 144, but filler values
 * come back from numericChoices rounded to 6 decimals, so accept the first continued-fraction convergent within
 * 5e-7 (a denominator ≤ 144 is then the unique match).
 */
function toQ(v: number): Q {
  let h0 = 0,
    h1 = 1,
    k0 = 1,
    k1 = 0;
  let x = v;
  for (let i = 0; i < 20; i++) {
    const a = Math.floor(x);
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (Math.abs(h1 / k1 - v) < 5e-7) {
      if (k1 > 144) break;
      return q(h1, k1);
    }
    const frac = x - a;
    if (frac < 1e-12) break;
    x = 1 / frac;
  }
  throw new Error(`simplification: ${v} is not a simple fraction`);
}

function formatter(style: AnswerStyle): (v: number) => string {
  if (style === 'frac') {
    return (v) => {
      const r = toQ(v);
      return r.isInt() ? String(r.n) : `$${qTex(r, 'mixed')}$`;
    };
  }
  return (v) => plain(v, 2);
}

function qText(v: Q, decimals: boolean): string {
  if (v.isInt()) return String(v.n);
  if (decimals && v.isDecimal(4)) return plain(v.toNumber(), 6);
  return `$${qTex(v, 'mixed')}$`;
}

/* ------------------------------------------------------------------ */
/* Mistakes                                                            */
/* ------------------------------------------------------------------ */

function solveValue(node: Node, target: Q): Q | null {
  try {
    return isolate(node, target, { steps: [], decimals: false });
  } catch {
    return null;
  }
}

/** Evaluate a top-level sum strictly left to right, ignoring × before + (the classic BODMAS slip). */
function leftToRight(node: Node): Q | null {
  const terms = topTerms(node);
  if (terms.length < 2 || !terms.slice(1).some((t) => t.x.t === 'prod' && !t.x.div && t.x.items.length === 2)) return null;
  try {
    let acc = null as Q | null;
    for (const t of terms) {
      if (t.x.t === 'prod' && !t.x.div && acc !== null) {
        const [first, ...rest] = t.x.items;
        let cur: Q = t.neg ? acc.sub(evalQ(first)) : acc.add(evalQ(first));
        for (const r of rest) cur = cur.mul(evalQ(r));
        acc = cur;
      } else {
        const v = evalQ(t.x);
        acc = acc === null ? v : t.neg ? acc.sub(v) : acc.add(v);
      }
    }
    return acc;
  } catch {
    return null;
  }
}

function genericMistakes(eq: Equation, ans: Q, decimals: boolean): MistakeQ[] {
  const out: MistakeQ[] = [];
  const inside = eq.rhs.t !== 'unk';
  if (!inside) {
    const terms = topTerms(eq.lhs);
    terms.forEach((t, i) => {
      if (i === 0) return;
      const v = evalQ(t.x);
      if (t.neg) out.push({ value: ans.add(v.mul(q(2))), why: `you add ${qText(v, decimals)} instead of subtracting it` });
      else out.push({ value: ans.sub(v.mul(q(2))), why: `you subtract ${qText(v, decimals)} instead of adding it` });
    });
    const ltr = leftToRight(eq.lhs);
    if (ltr && !ltr.eq(ans)) out.push({ value: ltr, why: 'you work strictly left to right instead of doing × and ÷ before + and −' });
  } else {
    const unkLeft = hasUnk(eq.lhs);
    const side = unkLeft ? eq.lhs : eq.rhs;
    const T = evalQ(unkLeft ? eq.rhs : eq.lhs);
    const terms = topTerms(side);
    if (terms.length > 1) {
      const idx = terms.findIndex((t) => hasUnk(t.x));
      const s = terms.reduce((acc, t, i) => (i === idx ? acc : t.neg ? acc.sub(evalQ(t.x)) : acc.add(evalQ(t.x))), q(0));
      // correct: X = T − s (X added) or X = s − T (X subtracted); slip: the known part crosses "=" with its sign unchanged
      const wrong = terms[idx].neg ? s.add(T) : T.add(s);
      const v = solveValue(terms[idx].x, wrong);
      if (v) out.push({ value: v, why: 'you move a term across the "=" sign without changing its sign' });
    }
  }
  if (ans.isInt() && ans.n >= 40) {
    out.push({ value: ans.add(q(10)), why: 'you make a carrying slip of 10 in the last step' });
    out.push({ value: ans.sub(q(10)), why: 'you make a borrowing slip of 10 in the last step' });
  }
  return out;
}

function toMistakes(list: MistakeQ[], ans: Q, style: AnswerStyle, anyMagnitude = false): Mistake[] {
  const a = ans.toNumber();
  return list
    .filter((m) => m.value.sign > 0 && !m.value.eq(ans))
    .filter((m) => (style === 'int' ? m.value.isInt() : style === 'dec' ? m.value.isDecimal(2) : m.value.d <= 72))
    .filter((m) => {
      const r = m.value.toNumber() / a;
      return anyMagnitude || (r > 0.4 && r < 2.5);
    })
    .map((m) => ({ value: m.value.toNumber(), why: m.why }));
}

/* ------------------------------------------------------------------ */
/* Solutions                                                           */
/* ------------------------------------------------------------------ */

function workedSteps(eq: Equation, decimals: boolean): { steps: string[]; value: Q } {
  const ctx: StepCtx = { steps: [], decimals };
  if (eq.rhs.t === 'unk' && !hasUnk(eq.lhs)) {
    const r = reduce(eq.lhs, ctx);
    return { steps: ctx.steps, value: evalQ(r) };
  }
  const unkLeft = hasUnk(eq.lhs);
  const known = unkLeft ? eq.rhs : eq.lhs;
  const withQ = unkLeft ? eq.lhs : eq.rhs;
  const kn = known.t === 'num' ? known : reduce(known, ctx);
  const R = evalQ(kn);
  const before = ctx.steps.length;
  const reducedQ = reduceKnown(withQ, ctx);
  const changed = known.t !== 'num' || ctx.steps.length > before;
  if (reducedQ.t !== 'unk' && changed) ctx.steps.push(`The equation becomes $${tex(reducedQ)} = ${tex(kn)}$`);
  const value = isolate(reducedQ, R, ctx);
  return { steps: ctx.steps, value };
}

function unitDigitCheck(eq: Equation, values: number[], ans: Q): string | null {
  if (eq.rhs.t !== 'unk' || !ans.isInt()) return null;
  const terms = topTerms(eq.lhs);
  if (terms.length < 2) return null;
  let vals: Q[];
  try {
    vals = terms.map((t) => evalQ(t.x));
  } catch {
    return null;
  }
  if (vals.some((v) => !v.isInt() || v.n < 0)) return null;
  const wholes = values.filter((v) => Number.isInteger(v));
  if (wholes.length !== values.length) return null;
  const mod = (a: number, m: number) => ((a % m) + m) % m;
  const U = mod(terms.reduce((acc, t, i) => acc + (t.neg ? -1 : 1) * mod(vals[i].n, 10), 0), 10);
  const digits = terms.map((t, i) => `${i === 0 ? '' : t.neg ? ' − ' : ' + '}${mod(vals[i].n, 10)}`).join('');
  const byUnit = values.filter((v) => mod(v, 10) === U);
  if (byUnit.length === 1) {
    return `Unit-digit check: the terms end in ${terms.map((_, i) => mod(vals[i].n, 10)).join(', ')}, so ? must end in ${digits} → ${U}. Only ${byUnit[0]} ends in ${U} — no need to finish the full calculation.`;
  }
  const D = mod(terms.reduce((acc, t, i) => acc + (t.neg ? -1 : 1) * mod(vals[i].n, 9), 0), 9);
  const byNine = values.filter((v) => mod(v, 9) === D);
  if (byNine.length === 1) {
    const ds = (v: number) => String(v).split('').reduce((s, c) => s + Number(c), 0);
    return `Digit-sum check (casting out nines): the terms leave remainders ${terms.map((_, i) => mod(vals[i].n, 9)).join(', ')} on division by 9, so ? leaves ${D}. Only ${byNine[0]} fits (digit sum ${ds(byNine[0])} → ${mod(byNine[0], 9)}).`;
  }
  return null;
}

function percentTable(eq: Equation): string | null {
  const found: string[] = [];
  const walk = (node: Node) => {
    switch (node.t) {
      case 'pct':
        if (node.p.t === 'num') {
          const p = q(node.p.n, node.p.d);
          const f = pctFraction(p);
          const label = `${tex(node.p)}\\%`;
          if (f && !found.some((x) => x.startsWith(`$${label} `))) found.push(`$${label} = ${f}$`);
        }
        walk(node.x);
        return;
      case 'sum':
        node.items.forEach((i) => walk(i.x));
        return;
      case 'prod':
        node.items.forEach(walk);
        if (node.div) walk(node.div);
        return;
      case 'of':
        walk(node.x);
        return;
      case 'pow':
        walk(node.b);
        return;
      case 'root':
      case 'br':
        walk(node.x);
        return;
      case 'frac':
        walk(node.a);
        walk(node.b);
        return;
      default:
        return;
    }
  };
  walk(eq.lhs);
  walk(eq.rhs);
  return found.length ? `Use the % ↔ fraction table: ${found.join(', ')} — divide instead of multiplying by the percentage.` : null;
}

const DEFAULT_SHORTCUT: Record<string, string> = {
  bodmas: 'BODMAS: brackets → of → ÷/× → +/−. Cancel common factors before multiplying.',
  fractions: 'Divide before you multiply ("of" = ×), and take the LCM of the denominators once for the whole sum.',
  decimals: 'Remove decimals by shifting the point in both numbers of a division; multiply as whole numbers and place the point at the end.',
  'percent-of': 'x% of y = y% of x — pick whichever is easier (e.g. 18% of 50 = 50% of 18 = 9).',
  'powers-roots': 'Know squares up to 50 and cubes up to 15 by heart — recall is faster than multiplying.',
  'missing-inside': 'Work backwards: simplify the known side, move known terms across the "=" (changing their signs), then undo the power or root last.',
  approximation: 'Round every number to the nearest whole (or convenient) value first — the options are far enough apart that the small errors never matter.',
  exponents: 'Bring every term to the same prime base, then add powers for ×, subtract for ÷ and compare.',
};

const DEFAULT_TRAP: Record<string, string> = {
  bodmas: 'Doing + or − before × or ÷ (plain left-to-right working) is the commonest slip in these chains.',
  fractions: 'Never add numerators and denominators separately — convert to a common denominator first.',
  decimals: 'Count the decimal places in each factor; a misplaced point makes the answer 10 times too big or small.',
  'percent-of': 'Check each percentage against its fraction (12.5% = 1/8, not 1/12).',
  'powers-roots': 'Neighbouring squares differ a lot (29² = 841, 31² = 961) — do not guess a root from the last digit alone.',
  'missing-inside': 'When a term crosses the "=" sign its sign changes; and undo a square or root only at the very end.',
  approximation: 'Do not round a number inside a square or product too aggressively — round to the nearest whole number only.',
  exponents: 'Powers add under ×; they multiply only for a power of a power.',
};

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

interface Built {
  facts: SimplificationFacts;
  prompt: string;
  answer: Q;
  style: AnswerStyle;
  steps: string[];
  mistakes: MistakeQ[];
  tags: string[];
  shortcut?: string;
  approx?: ApproxBuilt;
  eq: Equation;
  decimals: boolean;
  /** Only these mistakes may be used (e.g. neighbouring perfect squares). */
  exclusiveMistakes?: boolean;
  consecutivePos?: number;
}

function squareMistakes(ans: Q): MistakeQ[] {
  const y = Math.round(Math.sqrt(ans.toNumber()));
  return [-4, -3, -2, -1, 1, 2, 3, 4]
    .map((k) => y + k)
    .filter((z) => z > 0)
    .map((z) => ({ value: q(z * z), why: `you take the neighbouring perfect square ${z}² instead of ${y}²` }));
}

function validateExact(draft: Draft): Q {
  const eq = { lhs: draft.lhs, rhs: draft.rhs };
  if (eq.rhs.t === 'unk' && !hasUnk(eq.lhs)) return evalQ(eq.lhs);
  if (!draft.x) throw new Error('simplification: template with "?" inside must supply its value');
  const l = evalQ(eq.lhs, draft.x);
  const r = evalQ(eq.rhs, draft.x);
  if (!l.eq(r)) throw new Error(`simplification: template does not balance (${tex(eq.lhs)} = ${tex(eq.rhs)} at ${draft.x.n}/${draft.x.d})`);
  return draft.x;
}

function checkAnswer(ans: Q, style: AnswerStyle): void {
  if (ans.sign <= 0) throw new Retry('non-positive answer');
  if (style === 'int' && !ans.isInt()) throw new Retry('answer not an integer');
  if (style === 'dec' && !ans.isDecimal(2)) throw new Retry('answer needs more than 2 decimals');
  if (style === 'frac' && (ans.d > 72 || (!ans.isInt() && ans.n < 5))) throw new Retry('fraction answer too awkward');
  if (ans.toNumber() > 99999) throw new Retry('answer too large');
}

function buildOnce(sub: string, d: Difficulty, rng: Rng): Built {
  if (sub === 'approximation') {
    const a = buildApprox(rng, d);
    const worked = workedSteps(a.rounded, false);
    if (!worked.value.eq(a.key)) throw new Error('simplification: approximation steps disagree with the key');
    const exact = exactShownValue(a.shown);
    const steps = [
      `Round each number: ${a.roundings.join(', ')}`,
      ...worked.steps,
      `So, ? ≈ ${a.key.n} (the exact value is about ${plain(exact, 2)}, and ${a.key.n} is the nearest option)`,
    ];
    const extra: MistakeQ[] = a.squareOptions ? squareMistakes(a.key) : genericMistakes(a.rounded, a.key, false);
    return {
      facts: { mode: 'approx', lhs: a.shown.lhs, rhs: a.shown.rhs, rounded: a.rounded, answerStyle: 'int' },
      prompt: `${PROMPT_APPROX}\n\n$${tex(a.shown.lhs)} \\approx ${tex(a.shown.rhs)}$`,
      answer: a.key,
      style: 'int',
      steps,
      mistakes: extra,
      tags: a.tags,
      shortcut: a.shortcut,
      approx: a,
      eq: a.rounded,
      decimals: false,
      exclusiveMistakes: !!a.squareOptions,
    };
  }

  let draft: Draft;
  let custom: string[] | null = null;
  if (sub === 'exponents') {
    const e: ExpDraft = exponents(rng, d);
    draft = e;
    custom = e.steps;
  } else {
    const make = EXACT_BUILDERS[sub];
    if (!make) throw new Error(`simplification: no builder for ${sub}`);
    draft = make(rng, d);
  }
  const style: AnswerStyle = draft.style ?? 'int';
  const ans = validateExact(draft);
  checkAnswer(ans, style);
  const eq: Equation = { lhs: draft.lhs, rhs: draft.rhs };
  // Intermediate values print as decimals (12.5) except in fraction questions (where 25/2 is the natural form).
  const decimals = draft.decimals ?? sub !== 'fractions';
  let steps: string[];
  if (custom) steps = custom;
  else {
    const worked = workedSteps(eq, decimals);
    if (!worked.value.eq(ans)) throw new Error(`simplification: worked steps give ${worked.value.n}/${worked.value.d}, expected ${ans.n}/${ans.d}`);
    steps = [...worked.steps, `So, ? = ${qText(ans, decimals)}`];
  }
  if (steps.length > 14) throw new Retry('too many steps');
  const generic = sub === 'exponents' || draft.squareOptions ? [] : genericMistakes(eq, ans, decimals);
  return {
    facts: { mode: 'exact', lhs: draft.lhs, rhs: draft.rhs, answerStyle: style },
    prompt: `${PROMPT_EXACT}\n\n$${tex(draft.lhs)} = ${tex(draft.rhs)}$`,
    answer: ans,
    style,
    steps,
    mistakes: draft.squareOptions ? squareMistakes(ans) : [...(draft.mistakes ?? []), ...generic],
    tags: draft.tags,
    shortcut: draft.shortcut,
    eq,
    decimals,
    exclusiveMistakes: !!draft.squareOptions,
    consecutivePos: draft.consecutivePos,
  };
}

function fillerStep(ans: Q, style: AnswerStyle, approx: boolean): number | undefined {
  const a = ans.toNumber();
  if (approx) {
    const s = a * 0.11;
    const mag = 10 ** Math.floor(Math.log10(s));
    const f = s / mag;
    const nice = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10].find((x) => x >= f) ?? 10;
    return Math.max(1, Math.round(nice * mag));
  }
  if (style === 'frac') {
    if (a > 4.5) return 1;
    if (a > 2.2) return 0.5;
    return ans.isInt() ? 0.25 : 1 / ans.d;
  }
  return undefined;
}

export const generator = defineGenerator<SimplificationFacts>(META, SIMPLIFICATION_SUBTYPES, ({ meta, seed, difficulty, subtype, rng }) => {
  let built: Built | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 80 && !built; attempt++) {
    const r = rng.fork(`try${attempt}`);
    try {
      built = buildOnce(subtype.id, difficulty, r);
    } catch (e) {
      // Retry: template constraint not met; RangeError: value left the safe range; empty rng range: same thing.
      if (e instanceof Retry || e instanceof RangeError || (e instanceof Error && e.message.startsWith('rng.int: bad range'))) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  if (!built) throw new Error(`simplification: could not build ${subtype.id}/${difficulty} for seed ${seed}: ${String(lastErr)}`);

  const b = built;
  const fmt = formatter(b.style);
  let choices: { options: string[]; answerIndex: number; values: number[]; used: Mistake[] };
  if (b.consecutivePos !== undefined) {
    const start = b.answer.n - b.consecutivePos;
    const values = [0, 1, 2, 3, 4].map((k) => start + k);
    const fixed = fixedChoices(values.map((v) => fmt(v)), b.consecutivePos);
    choices = { ...fixed, values, used: [] };
  } else {
    choices = numericChoices(rng.fork('options'), b.answer.toNumber(), {
      format: fmt,
      mistakes: toMistakes(b.mistakes, b.answer, b.style, b.exclusiveMistakes),
      integer: b.style === 'int',
      step: fillerStep(b.answer, b.style, !!b.approx),
      minGap: b.approx ? 0.08 : undefined,
    });
  }

  const checks = b.approx ? null : unitDigitCheck(b.eq, choices.values, b.answer);
  const shortcut =
    b.shortcut ??
    (checks && checks.startsWith('Unit-digit') ? checks : null) ??
    percentTable(b.eq) ??
    checks ??
    DEFAULT_SHORTCUT[subtype.id];
  const tags = [...b.tags];
  if (shortcut.startsWith('Unit-digit')) tags.push('trick:unit-digit');
  if (shortcut.startsWith('Digit-sum')) tags.push('trick:digit-sum');
  // Most tempting wrong option = the used mistake that came earliest in our list (template-specific slips first,
  // generic carrying slips last).
  const rank = (m: Mistake) => {
    const i = b.mistakes.findIndex((x) => x.why === m.why && Math.abs(x.value.toNumber() - m.value) < 1e-9);
    return i < 0 ? 1e9 : i;
  };
  const trapM = [...choices.used].sort((x, y) => rank(x) - rank(y))[0];
  const trap = trapM ? `**${fmt(trapM.value)}** is what you get if ${trapM.why}.` : DEFAULT_TRAP[subtype.id];

  const q0 = makeQuestion(meta, seed, {
    subtype: subtype.id,
    difficulty,
    prompt: b.prompt,
    options: choices.options,
    answerIndex: choices.answerIndex,
    solution: { steps: b.steps, shortcut, trap },
    tags: [...new Set(tags)],
    targetSeconds: targetSeconds('simplification', difficulty),
  });
  return { item: single(q0), facts: b.facts };
});
