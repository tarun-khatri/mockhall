/**
 * Reasoning R1 — Coding–decoding (SPEC 8.2 R1; research/archetypes.md R1).
 *
 * Subtypes: letter shift (+n / −n / alternating / increasing), reverse order, opposite letters (A↔Z),
 * letter–number positions, the 4–5 question sentence ("Chinese") coding set, and letters-in-place.
 *
 * Every letter/number question is checked against a catalogue of rules: all rules that fit the example(s) must
 * give the same code for the asked word, otherwise more examples are added or the question is rebuilt.
 * Sentence sets ask only about words that decode uniquely.
 */
import { defineGenerator } from '../types';
import { makeQuestion, makeSet, single } from '../shared/question';
import { fixedChoices, numericChoices, shuffleChoices, type Mistake } from '../shared/options';
import { targetSeconds } from '../../targets';
import type { Rng } from '../../../lib/rng';
import type { Difficulty, Solution, VisualSpec } from '../../types';
import {
  applyNum,
  applyRule,
  arrange,
  describeNum,
  describeRule,
  inPlaceArrays,
  inPlaceCount,
  letterAt,
  posOf,
  positionDependent,
  possibleLetterCodes,
  possibleNumCodes,
  shiftAt,
  shiftVowelConsonant,
  signed,
  transform,
  val,
  type InPlaceMode,
  type LetterRule,
  type NumRule,
  type Transform,
} from './coding-decoding/rules';
import { CODE_SYLLABLES, CODE_WORDS, IN_PLACE_WORDS, SENTENCE_WORDS } from './coding-decoding/words';
import { buildSystem, decodeSteps, type CodeSystem } from './coding-decoding/sentence';

export type SentenceQuestionFact =
  | { type: 'code-of'; word: string }
  | { type: 'word-of'; code: string }
  | { type: 'phrase'; words: string[] }
  | { type: 'may-be'; words: string[]; newWord: string }
  | { type: 'words-of'; codes: string[] };

export interface CodingFacts {
  kind: 'letter' | 'number' | 'in-place' | 'sentence';
  /** letter / number: worked examples (word → code) and the word to encode. */
  examples?: { word: string; code: string }[];
  query?: string;
  /** in-place */
  word?: string;
  mode?: InPlaceMode;
  /** sentence set: statements (codes in the scrambled order shown) and what each question asks. */
  sentences?: { words: string[]; codes: string[] }[];
  questions?: SentenceQuestionFact[];
}

const META = { name: 'reasoning.coding-decoding', version: 1, subject: 'reasoning', chapter: 'coding-decoding' } as const;

const SUBTYPES = [
  { id: 'letter-shift', label: 'Letter shift', weight: 2 },
  { id: 'reverse', label: 'Reverse order', weight: 1 },
  { id: 'opposite-letter', label: 'Opposite letters (A↔Z)', weight: 1 },
  { id: 'positional', label: 'Letter–number positions', weight: 1 },
  { id: 'sentence-coding', label: 'Sentence coding set', weight: 3 },
  { id: 'letters-in-place', label: 'Letters in place', weight: 1 },
] as const;

type Sub = (typeof SUBTYPES)[number]['id'];

/* ------------------------------------------------------------------ */
/* Letter rules                                                        */
/* ------------------------------------------------------------------ */

function pickRule(rng: Rng, sub: Sub, d: Difficulty): LetterRule {
  const R = (t: Transform, a: LetterRule['arrange'] = 'none', order: LetterRule['order'] = 'transform-first'): LetterRule => ({ t, arrange: a, order });
  const order = (): LetterRule['order'] => (rng.chance(0.5) ? 'arrange-first' : 'transform-first');
  const pm = (...ks: number[]) => rng.pick(ks);
  if (sub === 'letter-shift') {
    if (d === 'easy') return R({ kind: 'shift', k: rng.weighted([[1, 3], [2, 2], [-1, 2], [-2, 1]] as const) });
    if (d === 'medium') return rng.chance(0.5) ? R({ kind: 'shift', k: pm(1, 2, 3, -1, -2, -3) }) : R({ kind: 'alt', ...(rng.chance(0.5) ? { k1: 1, k2: -1 } : { k1: -1, k2: 1 }) });
    if (d === 'hard') {
      const x = rng.next();
      if (x < 0.5) {
        const [k1, k2] = rng.pick([[2, -1], [-1, 2], [1, -2], [-2, 1], [2, -2], [-2, 2], [1, 2], [2, 1]] as const);
        return R({ kind: 'alt', k1, k2 });
      }
      return R({ kind: 'incr', start: x < 0.75 ? 1 : -1, step: x < 0.75 ? 1 : -1 });
    }
    return rng.chance(0.55)
      ? R({ kind: 'incr', start: pm(1, 2, -1, -2), step: pm(1, -1, 2) })
      : R({ kind: 'vc', ...rng.pick([{ kv: 1, kc: -1 }, { kv: -1, kc: 1 }, { kv: 2, kc: 1 }, { kv: 1, kc: 2 }, { kv: -1, kc: 2 }] as const) });
  }
  if (sub === 'reverse') {
    if (d === 'easy') return R({ kind: 'shift', k: 0 }, 'reverse');
    if (d === 'medium') return R({ kind: 'shift', k: pm(1, 2, -1, -2) }, 'reverse');
    if (d === 'hard') return rng.chance(0.5) ? R({ kind: 'shift', k: pm(0, 1, -1) }, 'halves') : R({ kind: 'alt', ...(rng.chance(0.5) ? { k1: 1, k2: -1 } : { k1: -1, k2: 1 }) }, 'reverse', order());
    return rng.chance(0.5) ? R({ kind: 'incr', start: pm(1, -1), step: pm(1, -1) }, 'reverse', order()) : R({ kind: 'alt', k1: pm(1, 2), k2: pm(-1, -2) }, 'halves', order());
  }
  // opposite-letter
  if (d === 'easy') return R({ kind: 'opposite' });
  if (d === 'medium') return rng.chance(0.5) ? R({ kind: 'opposite' }, 'reverse') : R({ kind: 'opp-shift', k: pm(1, -1) });
  if (d === 'hard') return rng.chance(0.5) ? R({ kind: 'opp-alt', k: pm(1, -1, 2) }) : R({ kind: 'opposite' }, 'halves');
  return rng.chance(0.5) ? R({ kind: 'opp-shift', k: pm(1, -1, 2) }, 'reverse') : R({ kind: 'opp-alt', k: pm(1, -1) }, 'reverse', order());
}

function wordLengths(d: Difficulty): [number, number] {
  return { easy: [4, 5], medium: [5, 6], hard: [6, 7], extreme: [6, 8] }[d] as [number, number];
}

function pickWord(rng: Rng, d: Difficulty, avoid: readonly string[], sameLength?: number): string {
  const [lo, hi] = wordLengths(d);
  const pool = CODE_WORDS.filter((w) => !avoid.includes(w) && (sameLength ? w.length === sameLength : w.length >= lo && w.length <= hi));
  return rng.pick(pool.length ? pool : CODE_WORDS.filter((w) => !avoid.includes(w)));
}

function traceTransform(t: Transform, w: string): string {
  const out = transform(t, w);
  return [...w]
    .map((ch, i) => {
      const s = shiftAt(t, ch, i);
      const tag = s === 'opp' ? `opp.` : s === 'opp+' ? `opp. ${signed((t as { k: number }).k)}` : signed(s);
      return `${ch}→${out[i]} (${tag})`;
    })
    .join(', ');
}

function traceRule(r: LetterRule, w: string): string[] {
  const identity = r.t.kind === 'shift' && r.t.k === 0;
  if (r.arrange === 'none') return [`${traceTransform(r.t, w)} → ${applyRule(r, w)}`];
  const arrWord = (x: string) => `${r.arrange === 'reverse' ? 'Reverse' : 'Reverse each half'}: ${x} → ${arrange(r.arrange, x)}`;
  if (identity) return [arrWord(w)];
  if (r.order === 'arrange-first' || !positionDependent(r.t)) {
    const a = arrange(r.arrange, w);
    return [arrWord(w), `${traceTransform(r.t, a)} → ${transform(r.t, a)}`];
  }
  const t = transform(r.t, w);
  return [`${traceTransform(r.t, w)} → ${t}`, arrWord(t)];
}

function mutateLetter(code: string, i: number, delta: number): string {
  return code.slice(0, i) + letterAt(posOf(code[i]) + delta) + code.slice(i + 1);
}

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

function letterMistakes(rng: Rng, r: LetterRule, q: string, key: string): Mistake2[] {
  const out: Mistake2[] = [];
  const withT = (t: Transform, why: string) => out.push({ v: applyRule({ ...r, t }, q), why, sys: true });
  const t = r.t;
  switch (t.kind) {
    case 'shift':
      if (t.k !== 0) {
        withT({ kind: 'shift', k: -t.k }, 'moving the letters in the wrong direction');
        if (t.k + Math.sign(t.k) !== 0) withT({ kind: 'shift', k: t.k + Math.sign(t.k) }, 'counting one place too many');
      }
      break;
    case 'alt':
      withT({ kind: 'alt', k1: t.k2, k2: t.k1 }, 'starting the alternating pattern on the wrong letter');
      withT({ kind: 'shift', k: t.k1 }, `applying ${signed(t.k1)} to every letter`);
      break;
    case 'incr':
      withT({ kind: 'incr', start: t.start + t.step, step: t.step }, 'starting the increasing shift one step late');
      withT({ kind: 'shift', k: t.start }, `applying ${signed(t.start)} to every letter`);
      break;
    case 'opposite':
      withT({ kind: 'opp-shift', k: -1 }, 'using 26 − position instead of 27 − position');
      withT({ kind: 'opp-shift', k: 1 }, 'using 28 − position instead of 27 − position');
      break;
    case 'opp-shift':
      withT({ kind: 'opposite' }, 'forgetting the extra shift after taking the opposite letter');
      withT({ kind: 'opp-shift', k: -t.k }, 'shifting the opposite letter the wrong way');
      break;
    case 'opp-alt':
      withT({ kind: 'opp-shift', k: 0 }, 'taking the opposite of every letter');
      withT({ kind: 'opp-alt', k: -t.k }, 'shifting the even-position letters the wrong way');
      break;
    case 'vc':
      withT({ kind: 'vc', kv: t.kc, kc: t.kv }, 'swapping the vowel and consonant rules');
      break;
  }
  if (r.arrange !== 'none') {
    out.push({ v: transform(t, q), why: 'forgetting to reverse the order', sys: true });
    if (r.arrange === 'halves') out.push({ v: applyRule({ ...r, arrange: 'reverse' }, q), why: 'reversing the whole word instead of each half', sys: true });
    if (positionDependent(t)) out.push({ v: applyRule({ ...r, order: r.order === 'arrange-first' ? 'transform-first' : 'arrange-first' }, q), why: 'reversing at the wrong stage', sys: true });
  }
  // near misses (options in papers usually differ in one or two letters)
  for (let k = 0; k < 6; k++) {
    const i = rng.int(0, key.length - 1);
    out.push({ v: mutateLetter(key, i, rng.pick([1, -1])), why: `a one-place slip at the ${ORD[i]} letter`, sys: false });
  }
  for (let k = 0; k < 3; k++) {
    const i = rng.int(0, key.length - 2);
    if (key[i] === key[i + 1]) continue;
    out.push({ v: key.slice(0, i) + key[i + 1] + key[i] + key.slice(i + 2), why: `writing the ${ORD[i]} and ${ORD[i + 1]} letters in the wrong order`, sys: false });
  }
  return out;
}

interface Mistake2 {
  v: string;
  why: string;
  sys: boolean;
}

function pickDistractors(rng: Rng, key: string, ms: Mistake2[]): Mistake2[] {
  const seen = new Set([key]);
  const ok = ms.filter((m) => m.v.length === key.length && !seen.has(m.v));
  const sys = rng.shuffle(ok.filter((m) => m.sys));
  const near = rng.shuffle(ok.filter((m) => !m.sys));
  const chosen: Mistake2[] = [];
  const takeFrom = (list: Mistake2[], n: number) => {
    for (const m of list) {
      if (chosen.length >= 4 || n <= 0) break;
      if (seen.has(m.v)) continue;
      seen.add(m.v);
      chosen.push(m);
      n--;
    }
  };
  takeFrom(sys, 2);
  takeFrom(near, 4 - chosen.length);
  takeFrom(sys, 4 - chosen.length);
  return chosen;
}

const LETTER_SHORTCUT: Record<string, string> = {
  shift: 'Keep the EJOTY anchors in mind (E = 5, J = 10, O = 15, T = 20, Y = 25): compare the first two letters of the word and its code to read the shift, then confirm with one more letter.',
  opposite: 'Opposite letters add up to 27: A–Z, B–Y, C–X, D–W, E–V, F–U, G–T, H–S, I–R, J–Q, K–P, L–O, M–N.',
  reverse: 'Check whether the code runs backwards first (its last letter comes from the word\'s first letter), then read the shift.',
};

function buildLetterQuestion(rng: Rng, sub: Sub, d: Difficulty) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const rule = pickRule(rng, sub, d);
    const w1 = pickWord(rng, d, []);
    const examples = [{ word: w1, code: applyRule(rule, w1) }];
    if (examples[0].code === w1) continue;
    const query = pickWord(rng, d, [w1]);
    let options = possibleLetterCodes(examples, query);
    if (options.size !== 1 || d === 'extreme') {
      const w2 = pickWord(rng, d, [w1, query]);
      examples.push({ word: w2, code: applyRule(rule, w2) });
      options = possibleLetterCodes(examples, query);
    }
    const key = applyRule(rule, query);
    if (options.size !== 1 || !options.has(key)) continue;
    if (key === query) continue;
    const distract = pickDistractors(rng, key, letterMistakes(rng, rule, query, key));
    if (distract.length < 4) continue;
    const choices = shuffleChoices(
      rng,
      key,
      distract.map((m) => m.v),
    );
    const exText = examples.map((e) => `'${e.word}' is written as '${e.code}'`).join(' and ');
    const prompt = `In a certain code language, ${exText}. How will '${query}' be written in that code language?`;
    const steps: string[] = [];
    steps.push(`From the example: ${traceRule(rule, examples[0].word).join('; ')}.`);
    if (examples.length > 1) steps.push(`The second example confirms it: '${examples[1].word}' → '${examples[1].code}'.`);
    steps.push(`Rule: ${describeRule(rule)}.`);
    traceRule(rule, query).forEach((line) => steps.push(`For '${query}': ${line}.`));
    steps.push(`So '${query}' is written as '${key}'.`);
    const tempting = distract.find((m) => m.sys) ?? distract[0];
    const family = rule.arrange !== 'none' ? 'reverse' : rule.t.kind.startsWith('opp') ? 'opposite' : 'shift';
    const solution: Solution = {
      steps,
      shortcut: LETTER_SHORTCUT[family],
      trap: `'${tempting.v}' comes from ${tempting.why}.`,
    };
    const tags = [`coding:${sub}`, `coding-rule:${rule.t.kind}`];
    if (rule.arrange !== 'none') tags.push(`coding-rule:${rule.arrange}`);
    return { prompt, choices, solution, tags, facts: { kind: 'letter', examples, query } as CodingFacts };
  }
  throw new Error(`coding: could not build ${sub}/${d}`);
}

/* ------------------------------------------------------------------ */
/* Number (position) rules                                             */
/* ------------------------------------------------------------------ */

function pickNumRule(rng: Rng, d: Difficulty): NumRule {
  if (d === 'easy') return { kind: 'concat', f: 'pos' };
  if (d === 'medium') return rng.chance(0.4) ? { kind: 'concat', f: 'rev' } : { kind: 'sum', f: 'pos', m: 1, c: 0, d: 0 };
  if (d === 'hard')
    return rng.pick<NumRule>([
      { kind: 'sum', f: 'rev', m: 1, c: 0, d: 0 },
      { kind: 'sum', f: 'pos', m: 1, c: 1, d: 0 },
      { kind: 'sum', f: 'pos', m: 2, c: 0, d: 0 },
    ]);
  return rng.pick<NumRule>([
    { kind: 'sum', f: 'rev', m: 1, c: 1, d: 0 },
    { kind: 'sum', f: 'rev', m: 2, c: 0, d: 0 },
    { kind: 'sum', f: 'pos', m: 1, c: 2, d: 0 },
    { kind: 'sum', f: 'pos', m: 2, c: 1, d: 0 },
  ]);
}

function buildNumberQuestion(rng: Rng, d: Difficulty) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const rule = pickNumRule(rng, d);
    const w1 = pickWord(rng, d === 'extreme' ? 'hard' : d, []);
    const examples = [{ word: w1, code: applyNum(rule, w1) }];
    const needTwo = rule.kind === 'sum' && (rule.c !== 0 || rule.m !== 1);
    // a single example pins the rule only for a word of the same length
    const query = pickWord(rng, d === 'extreme' ? 'hard' : d, [w1], needTwo ? undefined : w1.length);
    if (needTwo) {
      const w2 = pickWord(rng, d === 'extreme' ? 'hard' : d, [w1, query]);
      if (w2.length === w1.length) continue;
      examples.push({ word: w2, code: applyNum(rule, w2) });
    }
    const key = applyNum(rule, query);
    const possible = possibleNumCodes(examples, query);
    if (possible.size !== 1 || !possible.has(key)) continue;

    let choices: { options: string[]; answerIndex: number };
    let trap: string;
    if (rule.kind === 'concat') {
      const other: NumRule = { kind: 'concat', f: rule.f === 'pos' ? 'rev' : 'pos' };
      const ms: Mistake2[] = [
        { v: applyNum(other, query), why: `using the ${rule.f === 'pos' ? 'reverse' : 'forward'} alphabet positions`, sys: true },
        { v: [...query].reverse().map((ch) => String(val(rule.f, ch))).join(''), why: 'writing the numbers in reverse order', sys: true },
      ];
      for (let k = 0; k < 6; k++) {
        const i = rng.int(0, query.length - 1);
        const parts = [...query].map((ch) => val(rule.f, ch));
        parts[i] += rng.pick([1, -1]);
        if (parts[i] < 1 || parts[i] > 26) continue;
        ms.push({ v: parts.join(''), why: `a one-off slip in the value of '${query[i]}'`, sys: false });
      }
      const ds = pickDistractors(rng, key, ms).map((m) => m.v);
      const uniq = [...new Set(ds.filter((x) => x !== key))];
      if (uniq.length < 4) continue;
      // numeric-looking codes must stay distinct as numbers
      if (new Set([key, ...uniq].map((x) => String(Number(x)))).size !== 5) continue;
      choices = shuffleChoices(rng, key, uniq.slice(0, 4));
      trap = `'${ms[0].v}' uses the ${rule.f === 'pos' ? 'reverse' : 'forward'} positions — check the first letter of the example against its number.`;
    } else {
      const k = Number(key);
      const L = query.length;
      const sumPos = [...query].reduce((a, ch) => a + val('pos', ch), 0);
      const sumRev = [...query].reduce((a, ch) => a + val('rev', ch), 0);
      const base = rule.f === 'pos' ? sumPos : sumRev;
      const mistakes: Mistake[] = [
        { value: rule.m * (rule.f === 'pos' ? sumRev : sumPos) + rule.c * L, why: 'used the other end of the alphabet' },
        { value: base + rule.c * L, why: 'forgot to double the sum' },
        { value: rule.m * base, why: 'forgot to add the number of letters' },
        { value: k - rule.m * L, why: 'counted A as 0 instead of 1' },
        { value: k - rule.m * val(rule.f, query[L - 1]), why: 'missed the last letter' },
        { value: k + rule.m, why: 'miscounted one letter by one place' },
      ].filter((m) => m.value !== k);
      const nc = numericChoices(rng, k, { format: (n) => String(n), mistakes, integer: true });
      choices = nc;
      trap = nc.used.length ? `${nc.used[0].value} comes from a solver who ${nc.used[0].why}.` : 'Check the rule against every example before applying it.';
    }
    const exText = examples.map((e) => `'${e.word}' is written as '${e.code}'`).join(' and ');
    const prompt = `In a certain code language, ${exText}. How will '${query}' be written in that code language?`;
    const detail = (w: string, f: 'pos' | 'rev') => [...w].map((ch) => `${ch} = ${val(f, ch)}`).join(', ');
    const steps: string[] = [];
    if (rule.kind === 'concat') {
      steps.push(`Example: ${detail(examples[0].word, rule.f)} → '${examples[0].code}'.`);
      steps.push(`Rule: ${describeNum(rule)}.`);
      steps.push(`For '${query}': ${detail(query, rule.f)}.`);
      steps.push(`Written side by side: '${key}'.`);
    } else {
      for (const e of examples) {
        const s = [...e.word].reduce((a, ch) => a + val(rule.f, ch), 0);
        steps.push(`'${e.word}': ${detail(e.word, rule.f)}; sum = ${s}; ${e.code} = ${explainSum(rule, s, e.word.length)}.`);
      }
      steps.push(`Rule: ${describeNum(rule)}.`);
      const s = [...query].reduce((a, ch) => a + val(rule.f, ch), 0);
      steps.push(`For '${query}': ${detail(query, rule.f)}; sum = ${s}.`);
      steps.push(`Code = ${explainSum(rule, s, query.length)} = ${key}.`);
    }
    return {
      prompt,
      choices,
      solution: {
        steps,
        shortcut: 'Know the positions by heart through EJOTY (E 5, J 10, O 15, T 20, Y 25); a reverse position is 27 minus the forward one.',
        trap,
      } as Solution,
      tags: ['coding:positional', `coding-rule:${rule.kind}-${rule.f}`],
      facts: { kind: 'number', examples, query } as CodingFacts,
    };
  }
  throw new Error(`coding: could not build positional/${d}`);
}

function explainSum(r: NumRule, s: number, L: number): string {
  if (r.kind !== 'sum') return String(s);
  let t = r.m === 1 ? `${s}` : `${r.m} × ${s}`;
  if (r.c) t += ` + ${r.c === 1 ? '' : `${r.c} × `}${L}`;
  if (r.d) t += ` ${r.d > 0 ? '+' : '−'} ${Math.abs(r.d)}`;
  return t;
}

/* ------------------------------------------------------------------ */
/* Letters in place                                                    */
/* ------------------------------------------------------------------ */

const IN_PLACE_OPTIONS = ['None', 'One', 'Two', 'Three', 'More than three'] as const;
const COUNT_WORD = ['none', 'one', 'two', 'three', 'more than three'];

function inPlaceMode(rng: Rng, d: Difficulty): InPlaceMode {
  if (d === 'easy') return 'alpha';
  if (d === 'medium') return rng.chance(0.6) ? 'alpha' : 'reverse-alpha';
  if (d === 'hard') return rng.chance(0.5) ? 'reverse-alpha' : 'shift-alpha';
  return rng.chance(0.7) ? 'shift-alpha' : 'reverse-alpha';
}

function inPlaceLengths(d: Difficulty): [number, number] {
  return { easy: [5, 6], medium: [6, 7], hard: [6, 8], extreme: [7, 9] }[d] as [number, number];
}

function validForMode(w: string, mode: InPlaceMode): boolean {
  if (mode !== 'shift-alpha') return true;
  const t = shiftVowelConsonant(w);
  return new Set(t).size === t.length;
}

function buildInPlace(rng: Rng, d: Difficulty) {
  const mode = inPlaceMode(rng, d);
  const [lo, hi] = inPlaceLengths(d);
  const buckets: string[][] = [[], [], [], [], []];
  for (const w of IN_PLACE_WORDS) {
    if (!validForMode(w, mode)) continue;
    const cat = Math.min(4, inPlaceCount(w, mode));
    const inRange = w.length >= lo && w.length <= hi;
    if (inRange) buckets[cat].push(w);
  }
  // fall back to any length for a category with no word in range
  for (let c = 0; c < 5; c++) {
    if (buckets[c].length) continue;
    for (const w of IN_PLACE_WORDS) if (validForMode(w, mode) && Math.min(4, inPlaceCount(w, mode)) === c && w.length >= 5) buckets[c].push(w);
  }
  const available = [0, 1, 2, 3, 4].filter((c) => buckets[c].length);
  const target = rng.pick(available);
  const word = rng.pick(buckets[target]);
  const count = inPlaceCount(word, mode);
  const cat = Math.min(4, count);
  const { before, after } = inPlaceArrays(word, mode);
  const orderWords = mode === 'reverse-alpha' ? 'reverse alphabetical order' : 'alphabetical order';
  const prompt =
    mode === 'shift-alpha'
      ? `In the word '${word}', each vowel is replaced by the next letter and each consonant by the previous letter of the English alphabet. If the new letters are then arranged in alphabetical order from left to right, how many letters will remain at the same position?`
      : `If the letters of the word '${word}' are arranged in ${orderWords} from left to right, how many letters will remain at the same position?`;
  const steps: string[] = [];
  if (mode === 'shift-alpha') steps.push(`Change the letters: ${[...word].map((ch, i) => `${ch}→${before[i]}`).join(', ')} → ${before.join('')}.`);
  else steps.push(`Letters with positions: ${before.map((ch, i) => `${ch}(${i + 1})`).join(' ')}.`);
  steps.push(`Arranged in ${orderWords}: ${after.join(' ')}.`);
  const same = before.map((ch, i) => (ch === after[i] ? `${ch} (${i + 1})` : '')).filter(Boolean);
  steps.push(`Compare position by position: ${before.map((ch, i) => `${ch}/${after[i]}${ch === after[i] ? ' ✓' : ''}`).join(', ')}.`);
  steps.push(same.length ? `Unchanged: ${same.join(', ')} → ${count} letter${count === 1 ? '' : 's'} (${COUNT_WORD[cat]}).` : 'No letter stays in place → none.');
  const visual: VisualSpec = {
    type: 'grid',
    columns: ['Position', ...before.map((_, i) => String(i + 1))],
    rows: [
      [mode === 'shift-alpha' ? 'After change' : 'Word', ...before],
      ['Arranged', ...after],
      ['Same?', ...before.map((ch, i) => (ch === after[i] ? '✓' : ''))],
    ],
    caption: `${count} letter${count === 1 ? '' : 's'} keep${count === 1 ? 's' : ''} its position.`,
  };
  return {
    prompt,
    choices: fixedChoices(IN_PLACE_OPTIONS, cat),
    solution: {
      steps,
      shortcut: 'Write the arranged letters directly under the word and tick matches — no need to rewrite the whole word twice.',
      trap: mode === 'reverse-alpha' ? 'Arranging A → Z instead of Z → A is the usual slip; read the direction carefully.' : mode === 'shift-alpha' ? 'Change the letters first; comparing the original word with the sorted new letters gives a wrong count.' : 'Count only letters in exactly the same position — a letter that merely moves one place does not count.',
      visual,
    } as Solution,
    tags: ['coding:letters-in-place', `coding-rule:${mode}`],
    facts: { kind: 'in-place', word, mode } as CodingFacts,
  };
}

/* ------------------------------------------------------------------ */
/* Sentence coding set                                                  */
/* ------------------------------------------------------------------ */

function sentenceSpec(rng: Rng, d: Difficulty) {
  switch (d) {
    case 'easy':
      return { sentenceCount: 4, minWords: 3, maxWords: 3, vocabSize: rng.int(7, 8), needDetermined: 5, questions: 5 };
    case 'medium':
      return { sentenceCount: 4, minWords: 3, maxWords: 4, vocabSize: rng.int(8, 9), needDetermined: 5, questions: 5 };
    case 'hard':
      return { sentenceCount: 4, minWords: 4, maxWords: 4, vocabSize: rng.int(9, 10), needDetermined: 6, questions: 5 };
    default:
      return { sentenceCount: rng.int(4, 5), minWords: 4, maxWords: 5, vocabSize: rng.int(10, 12), needDetermined: 6, questions: 5 };
  }
}

const q = (s: string) => `'${s}'`;

function codeSetText(codes: readonly string[]): string {
  return codes.join(' ');
}

function sentenceVisual(sys: CodeSystem): VisualSpec {
  const words = [...sys.codeOf.keys()].sort();
  const det = new Set(sys.determined);
  return {
    type: 'grid',
    columns: ['Word', 'Code'],
    rows: words.map((w) => [w, det.has(w) ? sys.codeOf.get(w)! : 'not fixed']),
    caption: 'Decoded words. "Not fixed" words always appear together, so their codes cannot be told apart.',
  };
}

function buildSentenceSet(rng: Rng, d: Difficulty) {
  const spec = sentenceSpec(rng, d);
  const sys = buildSystem(rng, SENTENCE_WORDS, CODE_SYLLABLES, spec);
  const det = sys.determined;
  const allWords = [...sys.codeOf.keys()];
  const allCodes = [...sys.codeOf.values()];
  const usedCodes = new Set(allCodes);
  const visual = sentenceVisual(sys);
  const coOccurring = (w: string) => {
    const idx = sys.sentences.map((s, i) => (s.words.includes(w) ? i : -1)).filter((i) => i >= 0);
    return [...new Set(idx.flatMap((i) => sys.sentences[i].codes))];
  };
  // prefer words that need elimination (appear once) for harder levels
  const once = det.filter((w) => sys.sentences.filter((s) => s.words.includes(w)).length === 1);
  const multi = det.filter((w) => !once.includes(w));
  const ordered = d === 'hard' || d === 'extreme' ? [...rng.shuffle(once), ...rng.shuffle(multi)] : [...rng.shuffle(multi), ...rng.shuffle(once)];
  let cursor = 0;
  const nextWord = () => ordered[cursor++ % ordered.length];

  const plan: SentenceQuestionFact['type'][] =
    d === 'easy'
      ? ['code-of', 'word-of', 'code-of', 'phrase', 'word-of']
      : d === 'medium'
        ? ['code-of', 'word-of', 'phrase', 'may-be', 'code-of']
        : ['code-of', 'word-of', 'phrase', 'may-be', 'words-of'];

  const questions: { prompt: string; options: string[]; answerIndex: number; solution: Solution; tags: string[] }[] = [];
  const factsQ: SentenceQuestionFact[] = [];
  const asked = new Set<string>();

  const codeDistractors = (w: string, avoid: readonly string[]): string[] => {
    const near = rng.shuffle(coOccurring(w).filter((c) => c !== sys.codeOf.get(w) && !avoid.includes(c)));
    const far = rng.shuffle(allCodes.filter((c) => c !== sys.codeOf.get(w) && !near.includes(c) && !avoid.includes(c)));
    return [...near, ...far].slice(0, 4);
  };

  for (const type of plan) {
    if (type === 'code-of') {
      let w = nextWord();
      for (let k = 0; k < det.length && asked.has(`code-of:${w}`); k++) w = nextWord();
      asked.add(`code-of:${w}`);
      const key = sys.codeOf.get(w)!;
      const ch = shuffleChoices(rng, key, codeDistractors(w, []));
      questions.push({
        prompt: `What is the code for ${q(w)} in the given code language?`,
        options: ch.options,
        answerIndex: ch.answerIndex,
        solution: { steps: decodeSteps(sys, w), shortcut: 'Compare the statements that share the word: the code common to all of them, and absent from statements without the word, is its code.', visual },
        tags: ['coding:sentence-coding', 'coding-q:code-of'],
      });
      factsQ.push({ type: 'code-of', word: w });
    } else if (type === 'word-of') {
      let w = nextWord();
      for (let k = 0; k < det.length && (asked.has(`code-of:${w}`) || asked.has(`word-of:${w}`)); k++) w = nextWord();
      asked.add(`word-of:${w}`);
      const code = sys.codeOf.get(w)!;
      const idx = sys.sentences.map((s, i) => (s.words.includes(w) ? i : -1)).filter((i) => i >= 0);
      const nearWords = rng.shuffle([...new Set(idx.flatMap((i) => sys.sentences[i].words))].filter((x) => x !== w));
      const farWords = rng.shuffle(allWords.filter((x) => x !== w && !nearWords.includes(x)));
      const ch = shuffleChoices(rng, w, [...nearWords, ...farWords].slice(0, 4));
      questions.push({
        prompt: `In the given code language, ${q(code)} is the code for which word?`,
        options: ch.options,
        answerIndex: ch.answerIndex,
        solution: { steps: decodeSteps(sys, w), shortcut: 'Look at the statements where the code appears: the word common to all of them is the answer.', visual },
        tags: ['coding:sentence-coding', 'coding-q:word-of'],
      });
      factsQ.push({ type: 'word-of', code });
    } else if (type === 'phrase' || type === 'words-of') {
      const w1 = nextWord();
      let w2 = nextWord();
      for (let k = 0; k < det.length && w2 === w1; k++) w2 = nextWord();
      const c1 = sys.codeOf.get(w1)!;
      const c2 = sys.codeOf.get(w2)!;
      if (type === 'phrase') {
        const pool1 = codeDistractors(w1, [c2]);
        const pool2 = codeDistractors(w2, [c1]);
        const cand = new Map<string, string>();
        const setKey = (a: string, b: string) => [a, b].sort().join('|');
        const add = (a: string, b: string) => {
          if (a === b) return;
          const k = setKey(a, b);
          if (k === setKey(c1, c2) || cand.has(k)) return;
          cand.set(k, rng.chance(0.5) ? `${a} ${b}` : `${b} ${a}`);
        };
        pool1.forEach((x) => add(x, c2));
        pool2.forEach((x) => add(c1, x));
        pool1.forEach((x) => pool2.forEach((y) => add(x, y)));
        const ds = rng.shuffle([...cand.values()]).slice(0, 4);
        if (ds.length < 4) throw new Error('sentence coding: not enough phrase distractors');
        const ch = shuffleChoices(rng, rng.chance(0.5) ? `${c1} ${c2}` : `${c2} ${c1}`, ds);
        questions.push({
          prompt: `Which of the following is the code for ${q(`${w1} ${w2}`)} in the given code language?`,
          options: ch.options,
          answerIndex: ch.answerIndex,
          solution: { steps: [...decodeSteps(sys, w1), ...decodeSteps(sys, w2), `So ${q(`${w1} ${w2}`)} is coded as ${q(`${c1} ${c2}`)} (codes may appear in any order).`], shortcut: 'Decode each word separately; the order of codes in a coded phrase does not matter.', visual },
          tags: ['coding:sentence-coding', 'coding-q:phrase'],
        });
        factsQ.push({ type: 'phrase', words: [w1, w2] });
      } else {
        const others = rng.shuffle(allWords.filter((x) => x !== w1 && x !== w2));
        const cand = new Map<string, string>();
        const setKey = (a: string, b: string) => [a, b].sort().join('|');
        const add = (a: string, b: string) => {
          if (a === b) return;
          const k = setKey(a, b);
          if (k === setKey(w1, w2) || cand.has(k)) return;
          cand.set(k, `${a} ${b}`);
        };
        others.forEach((x) => {
          add(w1, x);
          add(x, w2);
        });
        const ds = rng.shuffle([...cand.values()]).slice(0, 4);
        const ch = shuffleChoices(rng, `${w1} ${w2}`, ds);
        questions.push({
          prompt: `In the given code language, ${q(`${c1} ${c2}`)} is the code for which of the following?`,
          options: ch.options,
          answerIndex: ch.answerIndex,
          solution: { steps: [...decodeSteps(sys, w1), ...decodeSteps(sys, w2), `So ${q(`${c1} ${c2}`)} stands for ${q(`${w1} ${w2}`)}.`], shortcut: 'Decode each code on its own, then pick the option containing both words.', visual },
          tags: ['coding:sentence-coding', 'coding-q:words-of'],
        });
        factsQ.push({ type: 'words-of', codes: [c1, c2] });
      }
    } else {
      // may-be: known word(s) + a word that appears in no statement
      const w = nextWord();
      const known = d === 'extreme' ? [w, nextWord()].filter((x, i, a) => a.indexOf(x) === i) : [w];
      const newWord = rng.pick(SENTENCE_WORDS.filter((x) => !sys.codeOf.has(x)));
      const fresh = rng.sample(CODE_SYLLABLES.filter((c) => !usedCodes.has(c)), 3);
      const knownCodes = known.map((x) => sys.codeOf.get(x)!);
      const correct = rng.shuffle([...knownCodes, fresh[0]]).join(' ');
      const wrongKnown = codeDistractors(known[0], knownCodes);
      const otherUsed = rng.shuffle(allCodes.filter((c) => !knownCodes.includes(c)));
      const ds = new Set<string>();
      const mk = (parts: string[]) => rng.shuffle(parts).join(' ');
      // (1) the new word given an existing code, (2) wrong code for the known word, (3) both wrong
      ds.add(mk([...knownCodes, otherUsed[0]]));
      ds.add(mk([wrongKnown[0], ...knownCodes.slice(1), fresh[1]]));
      ds.add(mk([...knownCodes, otherUsed[1] ?? otherUsed[0]]));
      ds.add(mk([wrongKnown[1] ?? wrongKnown[0], ...knownCodes.slice(1), fresh[2]]));
      ds.add(mk([wrongKnown[0], ...knownCodes.slice(1), otherUsed[2] ?? otherUsed[0]]));
      const setOf = (s: string) => s.split(' ').sort().join('|');
      const dsList = [...ds].filter((x) => setOf(x) !== setOf(correct));
      const uniq = [...new Map(dsList.map((x) => [setOf(x), x])).values()].slice(0, 4);
      if (uniq.length < 4) throw new Error('sentence coding: not enough may-be distractors');
      const ch = shuffleChoices(rng, correct, uniq);
      const phrase = rng.shuffle([...known, newWord]).join(' ');
      questions.push({
        prompt: `What may be the code for ${q(phrase)} in the given code language?`,
        options: ch.options,
        answerIndex: ch.answerIndex,
        solution: {
          steps: [
            ...known.flatMap((x) => decodeSteps(sys, x)),
            `'${newWord}' appears in no statement, so its code must be a new one — not any code already used (${[...usedCodes].sort().map(q).join(', ')}).`,
            `Only the option with ${knownCodes.map(q).join(' and ')} plus a new code fits: ${q(correct)}.`,
          ],
          shortcut: 'A new word needs a code that appears nowhere in the statements; eliminate options that reuse an existing code for it.',
          trap: 'An option that reuses a code from the statements for the new word looks natural but is impossible — every used code already belongs to some word.',
          visual,
        },
        tags: ['coding:sentence-coding', 'coding-q:may-be'],
      });
      factsQ.push({ type: 'may-be', words: known, newWord });
    }
  }

  const verb = rng.chance(0.5) ? 'is written as' : 'is coded as';
  const stimulus = `In a certain code language,\n${sys.sentences.map((s, i) => `${i + 1}. ${q(s.words.join(' '))} ${verb} ${q(codeSetText(s.codes))}`).join('\n')}`;
  const facts: CodingFacts = {
    kind: 'sentence',
    sentences: sys.sentences.map((s) => ({ words: [...s.words], codes: [...s.codes] })),
    questions: factsQ,
  };
  return { stimulus, questions, facts, count: spec.questions };
}

/* ------------------------------------------------------------------ */
/* Generator                                                           */
/* ------------------------------------------------------------------ */

export const generator = defineGenerator<CodingFacts>(META, SUBTYPES, ({ meta, seed, difficulty, subtype, rng }) => {
  const sub = subtype.id as Sub;
  if (sub === 'sentence-coding') {
    let built: ReturnType<typeof buildSentenceSet> | null = null;
    let last: unknown;
    for (let attempt = 0; attempt < 20 && !built; attempt++) {
      try {
        built = buildSentenceSet(rng, difficulty);
      } catch (e) {
        last = e;
      }
    }
    if (!built) throw last;
    const item = makeSet(meta, seed, {
      kind: 'coding',
      subtype: sub,
      difficulty,
      title: 'Coding–decoding',
      stimulus: built.stimulus,
      targetSeconds: built.count * targetSeconds('short-reasoning', difficulty),
      questions: built.questions.map((x) => ({ ...x })),
    });
    return { item, facts: built.facts };
  }
  const built =
    sub === 'positional' ? buildNumberQuestion(rng, difficulty) : sub === 'letters-in-place' ? buildInPlace(rng, difficulty) : buildLetterQuestion(rng, sub, difficulty);
  const qn = makeQuestion(meta, seed, {
    subtype: sub,
    difficulty,
    prompt: built.prompt,
    options: built.choices.options,
    answerIndex: built.choices.answerIndex,
    solution: built.solution,
    tags: built.tags,
    targetSeconds: targetSeconds('short-reasoning', difficulty),
  });
  return { item: single(qn), facts: built.facts };
});
