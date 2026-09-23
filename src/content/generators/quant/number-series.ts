/**
 * Q2 Number series — missing number and wrong number.
 *
 * A family builds the true series; a pattern finder (./number-series/finder.ts, ~150 concrete recurrence models plus
 * interleaved series) then guarantees uniqueness: for a missing term every model that fits the shown terms must
 * predict the same value (so the intended pattern is also the simplest), and for a wrong term exactly one of the five
 * option positions can be "repaired" by any model while the printed series itself fits none.
 */
import { defineGenerator } from '../types';
import { makeQuestion, single } from '../shared/question';
import { fixedChoices, numericChoices, type Mistake } from '../shared/options';
import { targetSeconds } from '../../targets';
import type { Difficulty } from '../../types';
import type { Rng } from '../../../lib/rng';
import { familiesFor, f, type Family, type Made } from './number-series/families';
import { allFits, sameValue } from './number-series/finder';

export interface NumberSeriesFacts {
  /** Family used to build the series (for analytics; the verifier finds the pattern itself). */
  family: string;
  /** The series exactly as printed; null marks the "?". */
  shown: (number | null)[];
}

const META = { name: 'quant.number-series', version: 1, subject: 'quant', chapter: 'number-series' } as const;

export const NUMBER_SERIES_SUBTYPES = [
  { id: 'missing-number', label: 'Missing number', weight: 1.2 },
  { id: 'wrong-number', label: 'Wrong number', weight: 1 },
] as const;

export const PROMPT_MISSING = 'What will come in place of the question mark (?) in the following number series?';
export const PROMPT_WRONG = 'Find the wrong number in the following number series.';

function lengthFor(fam: Family, d: Difficulty, wrong: boolean): number {
  if (fam.twin) return 8;
  if (wrong) return 7;
  return d === 'extreme' ? 7 : 6;
}

/** Blank position: research shows first, second, second-to-last or last most often. */
function blank(rng: Rng, n: number): number {
  const w: [number, number][] = [];
  for (let i = 0; i < n; i++) w.push([i, i === 0 ? 2 : i === 1 || i === n - 2 ? 3 : i === n - 1 ? 3 : 1]);
  return rng.weighted(w);
}

function missingMistakes(t: number[], u: number): Mistake[] {
  const out: Mistake[] = [];
  const key = t[u];
  if (u >= 2) out.push({ value: t[u - 1] + (t[u - 1] - t[u - 2]), why: 'you repeat the previous difference instead of following the pattern' });
  if (u >= 2 && t[u - 2] !== 0) out.push({ value: (t[u - 1] * t[u - 1]) / t[u - 2], why: 'you assume a constant ratio' });
  if (u + 2 < t.length) out.push({ value: t[u + 1] - (t[u + 2] - t[u + 1]), why: 'you work backwards using the next difference' });
  if (u >= 1 && u + 1 < t.length) out.push({ value: (t[u - 1] + t[u + 1]) / 2, why: 'you take the middle value of the neighbours' });
  out.push({ value: key + 1, why: 'you slip by 1 in the last step' }, { value: key - 1, why: 'you slip by 1 in the last step' });
  out.push({ value: key + 10, why: 'you make a slip of 10 while calculating' });
  return out.filter((m) => Number.isInteger(m.value * 2) && m.value > 0 && !sameValue(m.value, key));
}

interface Out {
  prompt: string;
  options: string[];
  answerIndex: number;
  steps: string[];
  shortcut: string;
  trap: string;
  shown: (number | null)[];
}

function buildMissing(rng: Rng, made: Made, n: number): Out | null {
  const t = made.terms;
  const u = blank(rng, n);
  const shown: (number | null)[] = t.map((x, i) => (i === u ? null : x));
  const fits = allFits(shown);
  if (!fits.length || fits.some((ft) => ft.value === null || !sameValue(ft.value, t[u]))) return null;
  const key = t[u];
  const mistakes = missingMistakes(t, u);
  const ch = numericChoices(rng, key, { format: (v) => f(v), mistakes, integer: Number.isInteger(key) });
  // a distractor must not be a term already printed next to the blank (too easy to eliminate or to confuse)
  const trapM = [...ch.used].sort((a, b) => mistakes.indexOf(a) - mistakes.indexOf(b))[0];
  return {
    prompt: `${PROMPT_MISSING}\n\n${shown.map((x) => (x === null ? '?' : f(x))).join(', ')}`,
    options: ch.options,
    answerIndex: ch.answerIndex,
    steps: [`Pattern: ${made.rule}`, ...made.lines, `So, ? = ${f(key)}`],
    shortcut: made.rule,
    trap: trapM ? `**${f(trapM.value)}** is what you get if ${trapM.why}.` : 'Check the pattern on every given term, not just the first two.',
    shown,
  };
}

function deltaFor(rng: Rng, v: number): number {
  const pool = v < 50 ? [1, 2, 3, 4, 5] : v < 500 ? [1, 2, 3, 4, 5, 6, 8, 10] : [2, 4, 5, 6, 8, 10, 20];
  return rng.pick(pool) * rng.pick([1, -1]);
}

function buildWrong(rng: Rng, made: Made, n: number): Out | null {
  const t = made.terms;
  const w = rng.int(1, 5);
  const wrong = t[w] + deltaFor(rng, t[w]);
  if (!(wrong > 0) || t.some((x) => sameValue(x, wrong))) return null;
  const shown = t.map((x, i) => (i === w ? wrong : x));
  const opts = shown.slice(1, 6);
  // every printed term distinct, so each option names exactly one position
  if (new Set(shown.map((x) => f(x))).size !== n) return null;
  // 1. the printed series follows no pattern
  if (allFits(shown).length) return null;
  // 2. repairing position w restores a pattern that gives back the true term
  const repaired = allFits(shown.map((x, i) => (i === w ? null : x)));
  if (!repaired.length || repaired.some((ft) => ft.value === null || !sameValue(ft.value, t[w]))) return null;
  // 3. no other single position can be repaired
  for (let j = 0; j < n; j++) {
    if (j === w) continue;
    if (allFits(shown.map((x, i) => (i === j ? null : x))).length) return null;
  }
  const ch = fixedChoices(opts.map((x) => f(x)), w - 1);
  return {
    prompt: `${PROMPT_WRONG}\n\n${shown.map((x) => f(x as number)).join(', ')}`,
    options: ch.options,
    answerIndex: ch.answerIndex,
    steps: [`Pattern: ${made.rule}`, ...made.lines, `The series should have ${f(t[w])} where ${f(wrong)} is printed, so ${f(wrong)} is the wrong number.`],
    shortcut: `${made.rule} Check each step; the first step that breaks the rule points to the wrong term.`,
    trap:
      w + 1 < n
        ? `The step after ${f(wrong)} also looks broken, but ${f(t[w + 1])} follows correctly from the true value ${f(t[w])} — so only ${f(wrong)} is wrong.`
        : `Only ${f(wrong)} breaks the pattern; every other term fits.`,
    shown,
  };
}

export const generator = defineGenerator<NumberSeriesFacts>(META, NUMBER_SERIES_SUBTYPES, ({ meta, seed, difficulty, subtype, rng }) => {
  const wrong = subtype.id === 'wrong-number';
  const fams = familiesFor(difficulty);
  for (let attempt = 0; attempt < 400; attempt++) {
    const r = rng.fork(`try${attempt}`);
    const fam = r.pick(fams);
    const n = lengthFor(fam, difficulty, wrong);
    const made = fam.make(r, n, difficulty);
    if (!made || made.terms.length !== n) continue;
    let out: Out | null;
    try {
      out = wrong ? buildWrong(r, made, n) : buildMissing(r, made, n);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('numericChoices')) continue;
      throw e;
    }
    if (!out) continue;
    const q = makeQuestion(meta, seed, {
      subtype: subtype.id,
      difficulty,
      prompt: out.prompt,
      options: out.options,
      answerIndex: out.answerIndex,
      solution: { steps: out.steps, shortcut: out.shortcut, trap: out.trap },
      tags: [`series:${fam.id}`, wrong ? 'series:wrong-number' : 'series:missing-number'],
      targetSeconds: targetSeconds('number-series', difficulty),
    });
    return { item: single(q), facts: { family: fam.id, shown: out.shown } };
  }
  throw new Error(`number-series: could not build ${subtype.id}/${difficulty} for seed ${seed}`);
});
