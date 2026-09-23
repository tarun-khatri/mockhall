/**
 * Alphanumeric-symbol arrangement set (5 questions on one printed arrangement), SBI/IBPS Clerk style.
 * Two arrangement styles: letters + digits + symbols, and digits + symbols only (seen in recent shifts).
 *
 * Question types: neighbour counts ("preceded by … and followed by …"), sum of such digits, positions from an
 * end / relative to an element / after a rule-based removal / after reversing a block, "exactly in the middle",
 * odd one out of position-based triplets, and the next term of a triplet series.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, Rich } from '../../../types';
import type { SetQuestionDraft } from '../../shared/question';
import { ordinal } from '../../../../lib/format';
import { numericChoices, type Mistake } from '../../shared/options';
import { countCategory, countStyleChoices, countStyleOptions, esc, pickDistractors, shuffledOptions, type CountStyle } from './common';

export type ElClass = 'letter' | 'consonant' | 'vowel' | 'number' | 'even' | 'odd' | 'square' | 'symbol';
export type Side = 'left' | 'right';
export interface Cond {
  cls: ElClass;
  neg?: boolean;
}
/** Remove every element of `cls` (optionally only those immediately followed / preceded by `by`, judged on the arrangement before removal). */
export interface Removal {
  cls: ElClass;
  rel?: 'followed' | 'preceded';
  by?: ElClass;
}
/** The first (`end: 'left'`) or last (`end: 'right'`) `count` elements written in reverse order. */
export interface Segment {
  end: Side;
  count: number;
}
export interface EndRef {
  from: Side;
  m: number;
}

export type AlnumQ =
  | { type: 'count'; target: ElClass; prev?: Cond; next?: Cond; removal?: Removal; style?: CountStyle }
  | { type: 'sum'; target: ElClass; prev?: Cond; next?: Cond }
  | { type: 'position'; from: Side; m: number; k: number; dir: Side; removal?: Removal; reverse?: Segment }
  | { type: 'anchor'; anchor: string; steps: { k: number; dir: Side }[] }
  | { type: 'middle'; a: EndRef; b: EndRef }
  | { type: 'odd-one-out'; options: string[][] }
  | { type: 'series-next'; terms: string[][] };

export interface AlnumSetFacts {
  kind: 'alphanumeric-set';
  elements: string[];
  questions: AlnumQ[];
}

interface Built {
  q: AlnumQ;
  draft: SetQuestionDraft;
}

type Style = 'alnum' | 'digits';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const VOWELS = 'AEIOU';
const CONSONANTS = LETTERS.filter((l) => !VOWELS.includes(l));
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const SYMBOLS = ['@', '#', '$', '%', '&', '*', '©', '£', '★', '↑', '€', '='];
const UNIVERSE = [...LETTERS, ...DIGITS, ...SYMBOLS];

export function isClass(el: string, c: ElClass): boolean {
  const letter = el.length === 1 && el >= 'A' && el <= 'Z';
  const digit = el.length === 1 && el >= '1' && el <= '9';
  switch (c) {
    case 'letter':
      return letter;
    case 'vowel':
      return letter && VOWELS.includes(el);
    case 'consonant':
      return letter && !VOWELS.includes(el);
    case 'number':
      return digit;
    case 'even':
      return digit && Number(el) % 2 === 0;
    case 'odd':
      return digit && Number(el) % 2 === 1;
    case 'square':
      return el === '1' || el === '4' || el === '9';
    case 'symbol':
      return !letter && !digit;
  }
}

const SINGULAR: Record<ElClass, string> = {
  letter: 'a letter',
  consonant: 'a consonant',
  vowel: 'a vowel',
  number: 'a number',
  even: 'an even number',
  odd: 'an odd number',
  square: 'a perfect square',
  symbol: 'a symbol',
};
const PLURAL: Record<ElClass, string> = {
  letter: 'letters',
  consonant: 'consonants',
  vowel: 'vowels',
  number: 'numbers',
  even: 'even numbers',
  odd: 'odd numbers',
  square: 'perfect squares',
  symbol: 'symbols',
};
const BARE: Record<ElClass, string> = {
  letter: 'letter',
  consonant: 'consonant',
  vowel: 'vowel',
  number: 'number',
  even: 'even number',
  odd: 'odd number',
  square: 'perfect square',
  symbol: 'symbol',
};

/** Classes that share at least one possible element. */
function overlaps(a: ElClass, b: ElClass): boolean {
  return UNIVERSE.some((e) => isClass(e, a) && isClass(e, b));
}

export function show(arr: readonly string[]): Rich {
  return arr.map(esc).join(' ');
}

function classesFor(style: Style, d: Difficulty): ElClass[] {
  if (style === 'digits') return d === 'hard' || d === 'extreme' ? ['number', 'even', 'odd', 'square', 'symbol'] : ['number', 'even', 'odd', 'symbol'];
  if (d === 'easy') return ['letter', 'number', 'symbol'];
  if (d === 'medium') return ['letter', 'consonant', 'vowel', 'number', 'symbol'];
  return ['letter', 'consonant', 'vowel', 'number', 'even', 'odd', 'symbol'];
}

/* ------------------------------------------------------------------ */
/* Arrangement                                                          */
/* ------------------------------------------------------------------ */

const LENGTH: Record<Difficulty, [number, number]> = { easy: [20, 24], medium: [24, 28], hard: [28, 34], extreme: [35, 40] };

function makeArrangement(rng: Rng, d: Difficulty, style: Style): string[] {
  const n = rng.int(...LENGTH[d]);
  const weights: [('L' | 'D' | 'S'), number][] =
    style === 'digits'
      ? [
          ['D', 0.6],
          ['S', 0.4],
        ]
      : [
          ['L', 0.48],
          ['D', 0.27],
          ['S', 0.25],
        ];
  const types: ('L' | 'D' | 'S')[] = [];
  for (let i = 0; i < n; i++) {
    let t: 'L' | 'D' | 'S' = weights[0][0];
    for (let tries = 0; tries < 20; tries++) {
      t = rng.weighted(weights);
      const a = types[i - 1];
      const b = types[i - 2];
      if (a === t && b === t) continue;
      if (style === 'alnum' && t !== 'L' && a === t && rng.chance(0.6)) continue;
      break;
    }
    types.push(t);
  }
  const nL = types.filter((t) => t === 'L').length;
  const nV = nL ? Math.min(5, Math.max(2, Math.round(nL * 0.22))) : 0;
  const letters = rng.shuffle([...rng.sample(VOWELS.split(''), nV), ...rng.sample(CONSONANTS, nL - nV)]);
  const symbols = rng.sample(SYMBOLS, style === 'digits' ? rng.int(7, 9) : rng.int(6, 8));
  // digits from shuffled bags so that no digit dominates
  let bag: string[] = [];
  const nextDigit = (prev: string | undefined): string => {
    if (!bag.length) bag = rng.shuffle(DIGITS);
    let i = bag.findIndex((x) => x !== prev);
    if (i < 0) i = 0;
    return bag.splice(i, 1)[0];
  };
  let symBag: string[] = [];
  const nextSymbol = (prev: string | undefined): string => {
    if (!symBag.length) symBag = rng.shuffle(symbols);
    let i = symBag.findIndex((x) => x !== prev);
    if (i < 0) i = 0;
    return symBag.splice(i, 1)[0];
  };
  const out: string[] = [];
  let li = 0;
  for (let i = 0; i < n; i++) {
    const t = types[i];
    if (t === 'L') out.push(letters[li++]);
    else if (t === 'D') out.push(nextDigit(out[i - 1]));
    else out.push(nextSymbol(out[i - 1]));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Removal / reversal                                                   */
/* ------------------------------------------------------------------ */

function removeOnce(arr: readonly string[], r: Removal): string[] {
  return arr.filter((el, i) => {
    if (!isClass(el, r.cls)) return true;
    if (!r.rel || !r.by) return false;
    const j = r.rel === 'followed' ? i + 1 : i - 1;
    const hit = j >= 0 && j < arr.length && isClass(arr[j], r.by);
    return !hit;
  });
}

/** Removal result, or null when removing one element would change whether another qualifies (ambiguous). */
function applyRemoval(arr: readonly string[], r: Removal): string[] | null {
  const once = removeOnce(arr, r);
  if (!r.rel) return once;
  let cur = once;
  for (let i = 0; i < 50; i++) {
    const nxt = removeOnce(cur, r);
    if (nxt.length === cur.length) break;
    cur = nxt;
  }
  return cur.length === once.length ? once : null;
}

function removalPhrase(r: Removal): string {
  if (!r.rel || !r.by) return `all the ${PLURAL[r.cls]}`;
  return `all the ${PLURAL[r.cls]} which are immediately ${r.rel} by ${SINGULAR[r.by]}`;
}

function applyReverse(arr: readonly string[], s: Segment): string[] {
  const a = arr.slice();
  if (s.end === 'left') return [...a.slice(0, s.count).reverse(), ...a.slice(s.count)];
  return [...a.slice(0, a.length - s.count), ...a.slice(a.length - s.count).reverse()];
}

/* ------------------------------------------------------------------ */
/* Neighbour conditions                                                 */
/* ------------------------------------------------------------------ */

type CountT = { target: ElClass; prev?: Cond; next?: Cond };

function condOk(arr: readonly string[], j: number, c: Cond, boundaryCounts: boolean): boolean {
  if (j < 0 || j >= arr.length) return c.neg ? boundaryCounts : false;
  return isClass(arr[j], c.cls) !== !!c.neg;
}

function hits(arr: readonly string[], t: CountT, boundaryCounts: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (!isClass(arr[i], t.target)) continue;
    if (t.prev && !condOk(arr, i - 1, t.prev, boundaryCounts)) continue;
    if (t.next && !condOk(arr, i + 1, t.next, boundaryCounts)) continue;
    out.push(i);
  }
  return out;
}

function templates(d: Difficulty, rng: Rng, style: Style, targets?: ElClass[]): CountT[] {
  const cls = classesFor(style, d);
  const tg = targets ?? cls;
  const out: CountT[] = [];
  if (d === 'easy') {
    for (const t of tg)
      for (const c of cls) {
        out.push({ target: t, prev: { cls: c } }, { target: t, next: { cls: c } });
        for (const c2 of cls) out.push({ target: t, prev: { cls: c }, next: { cls: c2 } });
      }
    return out;
  }
  const withNeg = (d === 'hard' || d === 'extreme') && rng.chance(0.6);
  for (const t of tg)
    for (const p of cls)
      for (const n of cls) {
        if (overlaps(t, p) && overlaps(t, n) && style === 'alnum') continue; // e.g. "letters preceded and followed by letters": dull
        if (withNeg) {
          out.push({ target: t, prev: { cls: p }, next: { cls: n, neg: true } });
          out.push({ target: t, prev: { cls: p, neg: true }, next: { cls: n } });
        } else out.push({ target: t, prev: { cls: p }, next: { cls: n } });
      }
  return out;
}

function condPhrase(t: CountT): string {
  const pos: string[] = [];
  const neg: string[] = [];
  if (t.prev) (t.prev.neg ? neg : pos).push(`immediately preceded by ${SINGULAR[t.prev.cls]}`);
  if (t.next) (t.next.neg ? neg : pos).push(`immediately followed by ${SINGULAR[t.next.cls]}`);
  let cond = pos.join(' and ');
  if (neg.length) cond += ` but not ${neg.join(' and not ')}`;
  return cond;
}

function needPhrase(t: CountT): string {
  const need: string[] = [];
  if (t.prev) need.push(`${t.prev.neg ? 'no ' + BARE[t.prev.cls] : SINGULAR[t.prev.cls]} just before it`);
  if (t.next) need.push(`${t.next.neg ? 'no ' + BARE[t.next.cls] : SINGULAR[t.next.cls]} just after it`);
  return need.join(' and ');
}

function tripleText(arr: readonly string[], i: number): Rich {
  const a = i > 0 ? esc(arr[i - 1]) : '(start)';
  const b = i + 1 < arr.length ? esc(arr[i + 1]) : '(end)';
  return `${a} **${esc(arr[i])}** ${b}`;
}

function describeCondFail(arr: readonly string[], i: number, t: CountT): string | null {
  const reasons: string[] = [];
  if (t.prev && !condOk(arr, i - 1, t.prev, false)) {
    const el = i > 0 ? esc(arr[i - 1]) : 'nothing';
    reasons.push(t.prev.neg ? `it is preceded by ${el}, which is ${SINGULAR[t.prev.cls]}` : `it is preceded by ${el}, not ${SINGULAR[t.prev.cls]}`);
  }
  if (t.next && !condOk(arr, i + 1, t.next, false)) {
    const el = i + 1 < arr.length ? esc(arr[i + 1]) : 'nothing';
    reasons.push(t.next.neg ? `it is followed by ${el}, which is ${SINGULAR[t.next.cls]}` : `it is followed by ${el}, not ${SINGULAR[t.next.cls]}`);
  }
  return reasons.length === 1 ? reasons[0] : null;
}

/** Elements of the target class (not at either end) that fail exactly one condition. */
function nearMisses(arr: readonly string[], t: CountT, hit: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < arr.length - 1; i++) if (isClass(arr[i], t.target) && !hit.includes(i) && describeCondFail(arr, i, t)) out.push(i);
  return out;
}

/* ------------------------------------------------------------------ */
/* Count questions                                                      */
/* ------------------------------------------------------------------ */

function buildCount(rng: Rng, arr: readonly string[], d: Difficulty, style: Style, used: Set<string>, withRemoval: boolean): Built | null {
  const cstyle: CountStyle = rng.chance(0.35) ? 'upto4' : 'upto3';
  const targetCat = rng.int(0, 4);
  let removal: Removal | undefined;
  let work: readonly string[] = arr;
  if (withRemoval) {
    removal = { cls: rng.pick<ElClass>(style === 'digits' ? ['symbol', 'even', 'odd', 'square'] : ['symbol', 'vowel', 'number', 'even', 'odd']) };
    work = applyRemoval(arr, removal)!;
  }
  for (const t of rng.shuffle(templates(d, rng, style))) {
    if (removal) {
      const cls = [t.target, t.prev?.cls, t.next?.cls].filter((c): c is ElClass => !!c);
      if (cls.some((c) => overlaps(c, removal!.cls))) continue;
    }
    const key = JSON.stringify(t);
    if (used.has(key)) continue;
    const a = hits(work, t, true);
    const b = hits(work, t, false);
    if (a.length !== b.length || a.length > 7) continue;
    if (cstyle === 'upto4' ? a.length === 0 || Math.min(a.length - 1, 4) !== targetCat : countCategory(a.length) !== targetCat) continue;
    used.add(key);
    const q: AlnumQ = {
      type: 'count',
      target: t.target,
      ...(t.prev ? { prev: t.prev } : {}),
      ...(t.next ? { next: t.next } : {}),
      ...(removal ? { removal } : {}),
      ...(cstyle === 'upto4' ? { style: cstyle } : {}),
    };
    const choices = countStyleChoices(a.length, cstyle);
    const steps: Rich[] = [];
    if (removal) steps.push(`Remove ${removalPhrase(removal)}. New arrangement:\n${show(work)}`);
    steps.push(`Check each ${BARE[t.target]}: it needs ${needPhrase(t)}.`);
    for (const i of a) steps.push(`${tripleText(work, i)} ✓`);
    steps.push(a.length ? `Such ${PLURAL[t.target]}: ${a.length} → **${countStyleOptions(cstyle)[choices.answerIndex]}**.` : `No ${BARE[t.target]} satisfies the condition → **None**.`);
    const miss = nearMisses(work, t, a);
    const trap: Rich | undefined = miss.length
      ? `${tripleText(work, miss[0])} does not count — ${describeCondFail(work, miss[0], t)}.`
      : removal
        ? `Count on the new arrangement: after removing ${PLURAL[removal.cls]}, new neighbours appear.`
        : undefined;
    const prompt = removal
      ? `If ${removalPhrase(removal)} are removed from the above arrangement, how many such ${PLURAL[t.target]} will be there in the new arrangement, each of which is ${condPhrase(t)}?`
      : `How many such ${PLURAL[t.target]} are there in the above arrangement, each of which is ${condPhrase(t)}?`;
    return {
      q,
      draft: {
        prompt,
        ...choices,
        solution: {
          steps,
          shortcut: `Scan only the ${PLURAL[t.target]}${removal ? ' of the new arrangement' : ''} and glance at the element on each side — no need to read every element.`,
          ...(trap ? { trap } : {}),
        },
        tags: ['series:alphanumeric', 'series:neighbour-count', ...(removal ? ['series:removal'] : []), ...(t.prev?.neg || t.next?.neg ? ['trap:negative-condition'] : [])],
      },
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Sum of digits meeting a condition                                    */
/* ------------------------------------------------------------------ */

function buildSum(rng: Rng, arr: readonly string[], d: Difficulty, style: Style, used: Set<string>): Built | null {
  const numClasses: ElClass[] = style === 'digits' || d === 'hard' || d === 'extreme' ? ['number', 'even', 'odd'] : ['number'];
  for (const t of rng.shuffle(templates(d === 'easy' ? 'medium' : d, rng, style, numClasses))) {
    const key = 'sum' + JSON.stringify(t);
    if (used.has(key)) continue;
    const a = hits(arr, t, true);
    const b = hits(arr, t, false);
    if (a.length !== b.length || a.length < 2 || a.length > 5) continue;
    const val = (idx: readonly number[]) => idx.reduce((s, i) => s + Number(arr[i]), 0);
    const value = val(a);
    const miss = nearMisses(arr, t, a);
    const mistakes: Mistake[] = [];
    if (miss.length) mistakes.push({ value: value + Number(arr[miss[0]]), why: 'included an element that meets only one condition' });
    const swapped: CountT = { target: t.target, ...(t.next ? { prev: t.next } : {}), ...(t.prev ? { next: t.prev } : {}) };
    mistakes.push({ value: val(hits(arr, swapped, false)), why: 'swapped "preceded" and "followed"' });
    mistakes.push({ value: value - Math.min(...a.map((i) => Number(arr[i]))), why: 'missed one qualifying digit' });
    if (miss.length > 1) mistakes.push({ value: value + Number(arr[miss[0]]) + Number(arr[miss[1]]), why: 'included two near misses' });
    let choices;
    try {
      choices = numericChoices(rng, value, { format: (n) => String(n), mistakes, step: 1 });
    } catch {
      continue;
    }
    used.add(key);
    return {
      q: { type: 'sum', target: t.target, ...(t.prev ? { prev: t.prev } : {}), ...(t.next ? { next: t.next } : {}) },
      draft: {
        prompt: `What is the sum of all the ${PLURAL[t.target]} in the above arrangement, each of which is ${condPhrase(t)}?`,
        ...choices,
        solution: {
          steps: [
            `Check each ${BARE[t.target]}: it needs ${needPhrase(t)}.`,
            ...a.map((i) => `${tripleText(arr, i)} ✓`),
            `Sum = ${a.map((i) => arr[i]).join(' + ')} = **${value}**.`,
          ],
          shortcut: `Mark the qualifying ${PLURAL[t.target]} while scanning once, then add only those.`,
          ...(miss.length ? { trap: `${tripleText(arr, miss[0])} does not count — ${describeCondFail(arr, miss[0], t)}.` } : {}),
        },
        tags: ['series:alphanumeric', 'series:digit-sum'],
      },
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Position questions                                                   */
/* ------------------------------------------------------------------ */

function endIndex(len: number, from: Side, m: number): number {
  return from === 'left' ? m - 1 : len - m;
}
function other(s: Side): Side {
  return s === 'left' ? 'right' : 'left';
}
function fromLeft(len: number, from: Side, m: number): number {
  return from === 'left' ? m : len - m + 1;
}

function valuesAt(arr: readonly string[], idx: number[]): string[] {
  return idx.filter((i) => i >= 0 && i < arr.length).map((i) => arr[i]);
}

function positionPrompt(q: Extract<AlnumQ, { type: 'position' }>): Rich {
  const where = q.k === 0 ? `the ${ordinal(q.m)} element from the ${q.from} end` : `the ${ordinal(q.k)} element to the ${q.dir} of the ${ordinal(q.m)} element from the ${q.from} end`;
  if (q.removal) return `If ${removalPhrase(q.removal)} are removed from the above arrangement, which of the following will be ${where}?`;
  if (q.reverse) {
    const block = q.reverse.end === 'left' ? `first ${q.reverse.count} elements (from the left end)` : `last ${q.reverse.count} elements (at the right end)`;
    return `If the ${block} of the above arrangement are written in reverse order, which of the following will be ${where}?`;
  }
  return `Which of the following is ${where} in the above arrangement?`;
}

type PosMode = 'direct' | 'relative' | 'removal' | 'removal-cond' | 'reverse';

function buildPosition(rng: Rng, arr: readonly string[], mode: PosMode, style: Style, d: Difficulty): Built | null {
  let work: readonly string[] = arr;
  let removal: Removal | undefined;
  let reverse: Segment | undefined;
  const cls = classesFor(style, d === 'easy' ? 'medium' : d);
  if (mode === 'removal') {
    removal = { cls: rng.pick<ElClass>(style === 'digits' ? ['symbol', 'even', 'odd', 'square'] : ['symbol', 'number', 'vowel', 'consonant']) };
    work = applyRemoval(arr, removal)!;
  } else if (mode === 'removal-cond') {
    const rc = rng.pick(cls.filter((c) => c !== 'letter'));
    const by = rng.pick(cls.filter((c) => !overlaps(c, rc)));
    removal = { cls: rc, rel: rng.pick(['followed', 'preceded'] as const), by };
    const w = applyRemoval(arr, removal);
    if (!w || arr.length - w.length < 2) return null;
    work = w;
  } else if (mode === 'reverse') {
    reverse = { end: rng.pick(['left', 'right'] as const), count: rng.int(10, Math.floor(arr.length / 2) + 4) };
    work = applyReverse(arr, reverse);
  }
  const len = work.length;
  const k = mode === 'direct' ? 0 : rng.int(2, 9);
  let from: Side = rng.pick(['left', 'right'] as const);
  if (reverse && rng.chance(0.7)) from = reverse.end;
  const dir: Side = rng.pick(['left', 'right'] as const);
  const candidates: number[] = [];
  for (let m = 3; m <= len - 2; m++) {
    const base = endIndex(len, from, m);
    const t = base + (dir === 'right' ? k : -k);
    if (t < 0 || t >= len) continue;
    if ((reverse || removal) && arr[t] === work[t]) continue;
    candidates.push(m);
  }
  if (!candidates.length) return null;
  const m = rng.pick(candidates);
  const base = endIndex(len, from, m);
  const t = base + (dir === 'right' ? k : -k);
  const correct = work[t];
  const q: Extract<AlnumQ, { type: 'position' }> = { type: 'position', from, m, k, dir, ...(removal ? { removal } : {}), ...(reverse ? { reverse } : {}) };

  const wrongDir = base + (dir === 'right' ? -k : k);
  const wrongEnd = endIndex(len, other(from), m) + (dir === 'right' ? k : -k);
  const cand: string[] = [];
  if (removal || reverse) cand.push(...valuesAt(arr, [t]));
  cand.push(...valuesAt(work, k ? [wrongDir, t + 1, t - 1, wrongEnd] : [wrongEnd, t + 1, t - 1]));
  if (removal || reverse) cand.push(...valuesAt(arr, [t + 1, t - 1]));
  let distractors: string[];
  try {
    distractors = pickDistractors(rng, correct, cand, work);
  } catch {
    return null;
  }
  const choices = shuffledOptions(rng, correct, distractors, esc);

  const steps: Rich[] = [];
  if (removal) steps.push(`Remove ${removalPhrase(removal)}${removal.rel ? ' (judged on the original arrangement)' : ''}. New arrangement (${len} elements):\n${show(work)}`);
  if (reverse) steps.push(`Reverse the ${reverse.end === 'left' ? 'first' : 'last'} ${reverse.count} elements. New arrangement:\n${show(work)}`);
  const baseL = fromLeft(len, from, m);
  if (from === 'right') steps.push(`${ordinal(m)} from the right end = ${len} − ${m} + 1 = ${ordinal(baseL)} from the left end (**${esc(work[base])}**).`);
  else steps.push(`${ordinal(m)} from the left end = **${esc(work[base])}**.`);
  if (k) steps.push(`${ordinal(k)} to the ${dir} of it = ${ordinal(baseL)} ${dir === 'right' ? '+' : '−'} ${k} = ${ordinal(t + 1)} from the left end.`);
  steps.push(`${ordinal(t + 1)} from the left end = **${esc(correct)}**.`);
  const same = from === dir;
  const shortcut: Rich = k
    ? same
      ? `Same direction words (${from} end, to the ${dir}) → subtract: ${m} − ${k} = ${ordinal(m - k)} from the ${from} end.`
      : `Opposite direction words (${from} end, to the ${dir}) → add: ${m} + ${k} = ${ordinal(m + k)} from the ${from} end.`
    : `Count directly from the ${from} end — no need to convert.`;
  const trapIdx = k ? wrongDir : wrongEnd;
  const trapVal = trapIdx >= 0 && trapIdx < len ? work[trapIdx] : undefined;
  let trap: Rich | undefined;
  if (removal) trap = `Without removing the ${PLURAL[removal.cls]}, the same count lands on **${esc(arr[t])}** — the positions shift after removal.`;
  else if (reverse) trap = `Before the reversal the same position holds **${esc(arr[t])}** — rewrite the block first.`;
  else if (trapVal !== undefined && trapVal !== correct)
    trap = k ? `Moving ${k} to the ${other(dir)} instead gives **${esc(trapVal)}**.` : `Counting from the ${other(from)} end gives **${esc(trapVal)}**.`;
  return {
    q,
    draft: {
      prompt: positionPrompt(q),
      ...choices,
      solution: { steps, shortcut, ...(trap ? { trap } : {}) },
      tags: ['series:alphanumeric', k ? 'series:relative-position' : 'series:position-from-end', ...(removal ? ['series:removal'] : []), ...(reverse ? ['series:reverse-block'] : [])],
    },
  };
}

/* ------------------------------------------------------------------ */
/* Anchor (relative to a named element)                                 */
/* ------------------------------------------------------------------ */

function buildAnchor(rng: Rng, arr: readonly string[], hops: 1 | 2): Built | null {
  const counts = new Map<string, number>();
  for (const el of arr) counts.set(el, (counts.get(el) ?? 0) + 1);
  const uniq = arr.map((el, i) => [el, i] as const).filter(([el]) => counts.get(el) === 1);
  const letters = uniq.filter(([el]) => isClass(el, 'letter'));
  const pool = letters.length >= 4 ? letters : uniq.filter(([el]) => isClass(el, 'symbol')).length >= 2 ? uniq.filter(([el]) => isClass(el, 'symbol')) : uniq;
  if (!pool.length) return null;
  for (let tries = 0; tries < 30; tries++) {
    const [anchor, ai] = rng.pick(pool);
    const steps = Array.from({ length: hops }, () => ({ k: rng.int(2, 8), dir: rng.pick(['left', 'right'] as const) }));
    if (hops === 2 && steps[0].dir === steps[1].dir) steps[1].dir = other(steps[0].dir);
    let pos = ai;
    let ok = true;
    const trail: number[] = [];
    for (const s of steps) {
      pos += s.dir === 'right' ? s.k : -s.k;
      if (pos < 0 || pos >= arr.length) ok = false;
      trail.push(pos);
    }
    if (!ok || pos === ai) continue;
    const correct = arr[pos];
    const net = pos - ai;
    const cand = valuesAt(arr, [ai - net, pos + 1, pos - 1, ...(hops === 2 ? [trail[0]] : [])]);
    let distractors: string[];
    try {
      distractors = pickDistractors(rng, correct, cand, arr);
    } catch {
      continue;
    }
    const choices = shuffledOptions(rng, correct, distractors, esc);
    const q: AlnumQ = { type: 'anchor', anchor, steps };
    const prompt =
      hops === 1
        ? `Which of the following is the ${ordinal(steps[0].k)} element to the ${steps[0].dir} of **${esc(anchor)}** in the above arrangement?`
        : `Which of the following is the ${ordinal(steps[1].k)} element to the ${steps[1].dir} of the ${ordinal(steps[0].k)} element to the ${steps[0].dir} of **${esc(anchor)}**?`;
    const sol: Rich[] = [`**${esc(anchor)}** is ${ordinal(ai + 1)} from the left end.`];
    let p = ai;
    for (const s of steps) {
      const np = p + (s.dir === 'right' ? s.k : -s.k);
      sol.push(`${ordinal(s.k)} to the ${s.dir}: ${p + 1} ${s.dir === 'right' ? '+' : '−'} ${s.k} = ${ordinal(np + 1)} from the left (**${esc(arr[np])}**).`);
      p = np;
    }
    sol.push(`Answer: **${esc(correct)}**.`);
    const shortcut: Rich =
      hops === 2
        ? `Net movement = ${steps.map((s) => (s.dir === 'right' ? '+' : '−') + s.k).join(' ')} = ${net > 0 ? '+' : '−'}${Math.abs(net)} → ${Math.abs(net)} to the ${net > 0 ? 'right' : 'left'} of ${esc(anchor)}.`
        : `Locate ${esc(anchor)}, then count ${steps[0].k} places to the ${steps[0].dir}.`;
    const wrong = ai - net;
    return {
      q,
      draft: {
        prompt,
        ...choices,
        solution: {
          steps: sol,
          shortcut,
          ...(wrong >= 0 && wrong < arr.length && arr[wrong] !== correct ? { trap: `Moving the other way (${Math.abs(net)} to the ${net > 0 ? 'left' : 'right'}) gives **${esc(arr[wrong])}**.` } : {}),
        },
        tags: ['series:alphanumeric', 'series:relative-position'],
      },
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Middle                                                              */
/* ------------------------------------------------------------------ */

function buildMiddle(rng: Rng, arr: readonly string[]): Built | null {
  const len = arr.length;
  for (let tries = 0; tries < 30; tries++) {
    const p = rng.int(1, Math.floor(len / 2));
    const q = rng.int(p + 4, len - 2);
    if ((q - p) % 2) continue;
    const mid = (p + q) / 2;
    const a: EndRef = { from: 'left', m: p + 1 };
    const b: EndRef = rng.chance(0.7) ? { from: 'right', m: len - q } : { from: 'left', m: q + 1 };
    const correct = arr[mid];
    const cand = valuesAt(arr, [mid + 1, mid - 1, mid + 2, mid - 2]);
    let distractors: string[];
    try {
      distractors = pickDistractors(rng, correct, cand, arr);
    } catch {
      continue;
    }
    const choices = shuffledOptions(rng, correct, distractors, esc);
    return {
      q: { type: 'middle', a, b },
      draft: {
        prompt: `Which of the following is exactly in the middle of the ${ordinal(a.m)} element from the left end and the ${ordinal(b.m)} element from the ${b.from} end in the above arrangement?`,
        ...choices,
        solution: {
          steps: [
            `${ordinal(a.m)} from the left = position ${p + 1} (**${esc(arr[p])}**).`,
            b.from === 'right' ? `${ordinal(b.m)} from the right = ${len} − ${b.m} + 1 = position ${q + 1} (**${esc(arr[q])}**).` : `${ordinal(b.m)} from the left = position ${q + 1} (**${esc(arr[q])}**).`,
            `Middle position = (${p + 1} + ${q + 1}) ÷ 2 = ${mid + 1}.`,
            `${ordinal(mid + 1)} from the left = **${esc(correct)}**.`,
          ],
          shortcut: `Convert both to positions from the same end, then average them: (${p + 1} + ${q + 1}) ÷ 2.`,
          trap:
            b.from === 'right'
              ? 'Forgetting the "+ 1" when converting from the right end shifts the middle — always use n − m + 1.'
              : 'There are equal numbers of elements on both sides of the middle one — check by counting both gaps.',
        },
        tags: ['series:alphanumeric', 'series:middle-element'],
      },
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Triplet patterns (odd one out, series)                               */
/* ------------------------------------------------------------------ */

function triplet(arr: readonly string[], i: number, a: number, b: number): string[] | null {
  const idx = [i, i + a, i + b];
  if (idx.some((x) => x < 0 || x >= arr.length)) return null;
  return idx.map((x) => arr[x]);
}

function fits(arr: readonly string[], t: readonly string[], a: number, b: number): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] !== t[0]) continue;
    const x = triplet(arr, i, a, b);
    if (x && x[1] === t[1] && x[2] === t[2]) return true;
  }
  return false;
}

/** Odd indices implied by every position pattern in range that fits exactly four options (null if any fits all five). */
function oddCandidates(arr: readonly string[], opts: readonly string[][]): Set<number> | null {
  const odd = new Set<number>();
  for (let a = -5; a <= 5; a++)
    for (let b = -5; b <= 5; b++) {
      if (a === 0 || b === 0 || a === b) continue;
      const f = opts.map((t) => fits(arr, t, a, b));
      const n = f.filter(Boolean).length;
      if (n === 5) return null;
      if (n === 4) odd.add(f.indexOf(false));
    }
  return odd;
}

const tripletText = (t: readonly string[]) => t.map(esc).join('');
const kindOf = (el: string) => (isClass(el, 'letter') ? 'L' : isClass(el, 'number') ? 'D' : 'S');
const describeOff = (off: number) => (off > 0 ? `${ordinal(off)} to the right` : `${ordinal(-off)} to the left`);

function buildOddOneOut(rng: Rng, arr: readonly string[]): Built | null {
  for (let tries = 0; tries < 40; tries++) {
    const a = rng.pick([1, 2, -1, -2, 3]);
    let b = rng.pick([1, 2, 3, -1, -2, -3]);
    if (b === a) b = a + 1 === 0 ? 2 : a + 1;
    const anchors: number[] = [];
    for (let i = 0; i < arr.length; i++) if (triplet(arr, i, a, b)) anchors.push(i);
    if (anchors.length < 8) continue;
    const chosen = rng.sample(anchors, 5).sort((x, y) => x - y);
    if (chosen.some((x, j) => j > 0 && x - chosen[j - 1] < 2)) continue;
    const opts = chosen.map((i) => triplet(arr, i, a, b)!);
    const oddPos = rng.int(0, 4);
    // break one triplet: move one of its elements by one place, to an element of the same kind if possible
    const offs = [0, a, b];
    const own = offs.map((o) => chosen[oddPos] + o);
    const moves: { which: number; bi: number; sameKind: boolean }[] = [];
    for (let which = 0; which < 3; which++)
      for (const shift of [1, -1]) {
        const bi = own[which] + shift;
        if (bi < 0 || bi >= arr.length || own.includes(bi)) continue;
        moves.push({ which, bi, sameKind: kindOf(arr[bi]) === kindOf(arr[own[which]]) });
      }
    if (!moves.length) continue;
    const sameKind = moves.filter((m) => m.sameKind);
    const mv = rng.pick(sameKind.length ? sameKind : moves);
    const broken = opts[oddPos].slice();
    broken[mv.which] = arr[mv.bi];
    if (broken.join('') === opts[oddPos].join('') || new Set(broken).size < 3) continue;
    opts[oddPos] = broken;
    const texts = opts.map(tripletText);
    if (new Set(texts).size !== 5) continue;
    const odd = oddCandidates(arr, opts);
    if (!odd || odd.size !== 1 || !odd.has(oddPos)) continue;
    const firstGood = oddPos === 0 ? 1 : 0;
    return {
      q: { type: 'odd-one-out', options: opts.map((t) => t.slice()) },
      draft: {
        prompt: 'Four of the following five are alike in a certain way based on their positions in the above arrangement and so form a group. Which is the one that does not belong to that group?',
        options: texts,
        answerIndex: oddPos,
        solution: {
          steps: [
            `Pattern (from ${texts[firstGood]}): take an element, then the element ${describeOff(a)} of it, then the element ${describeOff(b)} of it.`,
            ...opts.map((t, j) => (j === oddPos ? `${tripletText(t)} — does not follow this pattern ✗` : `${tripletText(t)} — first element at position ${chosen[j] + 1}, follows it ✓`)),
            `Odd one: **${texts[oddPos]}**.`,
          ],
          shortcut: 'Find the first element of one option in the arrangement, read off the offsets of the other two, and test the rest with the same offsets.',
          trap: `${texts[oddPos]} looks right at a glance — one of its elements is one place away from where the pattern needs it.`,
        },
        tags: ['series:alphanumeric', 'series:odd-one-out'],
      },
    };
  }
  return null;
}

function nextTerm(arr: readonly string[], s: number, d: number, a: number, b: number, j: number): string[] | null {
  return triplet(arr, s + j * d, a, b);
}

/** All (s, d, a, b) interpretations of three given terms; returns the distinct 4th terms ('' = out of range). */
function seriesAnswers(arr: readonly string[], terms: readonly string[][]): Set<string> {
  const out = new Set<string>();
  for (let s = 0; s < arr.length; s++) {
    if (arr[s] !== terms[0][0]) continue;
    for (let a = -5; a <= 5; a++)
      for (let b = -5; b <= 5; b++) {
        if (a === 0 || b === 0 || a === b) continue;
        const t0 = triplet(arr, s, a, b);
        if (!t0 || t0.join('\u0001') !== terms[0].join('\u0001')) continue;
        for (let d = -10; d <= 10; d++) {
          if (d === 0) continue;
          let ok = true;
          for (let j = 1; j < 3 && ok; j++) {
            const t = nextTerm(arr, s, d, a, b, j);
            ok = !!t && t.join('\u0001') === terms[j].join('\u0001');
          }
          if (!ok) continue;
          const n4 = nextTerm(arr, s, d, a, b, 3);
          out.add(n4 ? n4.join('\u0001') : '');
        }
      }
  }
  return out;
}

function buildSeries(rng: Rng, arr: readonly string[]): Built | null {
  for (let tries = 0; tries < 40; tries++) {
    const a = rng.pick([1, 1, 2, -1]);
    const b = rng.pick([2, 3, 1, -2]);
    if (a === b) continue;
    const d = rng.pick([3, 4, 5, 6, -3, -4, -5]);
    const span = Math.abs(d) * 3;
    const lo = Math.max(0, -Math.min(0, a, b)) + (d < 0 ? span : 0);
    const hi = arr.length - 1 - Math.max(0, a, b) - (d > 0 ? span : 0);
    if (hi < lo) continue;
    const s = rng.int(lo, hi);
    const terms = [0, 1, 2].map((j) => nextTerm(arr, s, d, a, b, j));
    const ans = nextTerm(arr, s, d, a, b, 3);
    if (terms.some((t) => !t) || !ans) continue;
    const given = terms as string[][];
    const answers = seriesAnswers(arr, given);
    if (answers.size !== 1 || !answers.has(ans.join('\u0001'))) continue;
    const correct = tripletText(ans);
    const cand: string[] = [];
    for (const dd of [d + 1, d - 1]) {
      if (dd === 0) continue;
      const t = nextTerm(arr, s, dd, a, b, 3);
      if (t) cand.push(tripletText(t));
    }
    cand.push(tripletText([...ans].reverse()));
    const t5 = nextTerm(arr, s, d, a, b, 4);
    if (t5) cand.push(tripletText(t5));
    const sh = triplet(arr, s + 3 * d + 1, a, b);
    if (sh) cand.push(tripletText(sh));
    const fill: string[] = [];
    for (let i = 0; i < arr.length; i++) {
      const t = triplet(arr, i, a, b);
      if (t) fill.push(tripletText(t));
    }
    let distractors: string[];
    try {
      distractors = pickDistractors(rng, correct, cand, fill);
    } catch {
      continue;
    }
    const choices = shuffledOptions(rng, correct, distractors);
    const pos = [0, 1, 2, 3].map((j) => s + j * d);
    const rev = tripletText([...ans].reverse());
    return {
      q: { type: 'series-next', terms: given.map((t) => t.slice()) },
      draft: {
        prompt: `What should come in place of the question mark (?) in the following series based on the above arrangement?\n\n${given.map(tripletText).join('   ')}   ?`,
        ...choices,
        solution: {
          steps: [
            `Each term: an element, then the element ${describeOff(a)} of it, then the element ${describeOff(b)} of it.`,
            `The first elements are at positions ${pos.slice(0, 3).map((x) => x + 1).join(', ')} from the left — moving ${Math.abs(d)} places to the ${d > 0 ? 'right' : 'left'} each time.`,
            `Next first element: position ${pos[3] + 1} (**${esc(arr[pos[3]])}**).`,
            `Next term = **${correct}**.`,
          ],
          shortcut: 'Locate the first element of each given term — the gap between them is the step; keep the same internal pattern.',
          ...(rev !== correct ? { trap: `${rev} has the right elements in the wrong order.` } : {}),
        },
        tags: ['series:alphanumeric', 'series:triplet-series'],
      },
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The set                                                             */
/* ------------------------------------------------------------------ */

type Slot = 'count' | 'count-removal' | 'sum' | PosMode | 'anchor1' | 'anchor2' | 'middle' | 'odd' | 'series';

function plan(rng: Rng, d: Difficulty, style: Style): Slot[] {
  if (style === 'digits') {
    return d === 'extreme'
      ? ['count-removal', 'count', 'removal-cond', 'reverse', rng.pick<Slot>(['sum', 'odd', 'series'])]
      : ['count', 'count', d === 'medium' ? 'removal' : 'removal-cond', 'sum', rng.pick<Slot>(['middle', 'series', 'relative'])];
  }
  switch (d) {
    case 'easy':
      return ['count', 'count', 'direct', 'relative', rng.pick<Slot>(['middle', 'anchor1'])];
    case 'medium':
      return ['count', 'count', 'relative', 'removal', rng.pick<Slot>(['middle', 'anchor1', 'series', 'sum'])];
    case 'hard':
      return ['count', 'count', 'removal-cond', rng.pick<Slot>(['odd', 'series']), rng.pick<Slot>(['anchor2', 'middle', 'relative', 'sum'])];
    case 'extreme':
      return ['count-removal', 'count', 'removal-cond', 'reverse', rng.pick<Slot>(['odd', 'series'])];
  }
}

export interface AlnumBuilt {
  facts: AlnumSetFacts;
  stimulus: Rich;
  questions: SetQuestionDraft[];
}

export function buildAlnumSet(rng: Rng, d: Difficulty): AlnumBuilt {
  const style: Style = d !== 'easy' && rng.chance(0.3) ? 'digits' : 'alnum';
  const slots = plan(rng, d, style);
  for (let attempt = 0; attempt < 80; attempt++) {
    const arr = makeArrangement(rng, d, style);
    const used = new Set<string>();
    const built: Built[] = [];
    for (const slot of slots) {
      let b: Built | null = null;
      for (let t = 0; t < 4 && !b; t++) {
        switch (slot) {
          case 'count':
            b = buildCount(rng, arr, d, style, used, false);
            break;
          case 'count-removal':
            b = buildCount(rng, arr, d, style, used, true);
            break;
          case 'sum':
            b = buildSum(rng, arr, d, style, used);
            break;
          case 'anchor1':
            b = buildAnchor(rng, arr, 1);
            break;
          case 'anchor2':
            b = buildAnchor(rng, arr, 2);
            break;
          case 'middle':
            b = buildMiddle(rng, arr);
            break;
          case 'odd':
            b = buildOddOneOut(rng, arr);
            break;
          case 'series':
            b = buildSeries(rng, arr);
            break;
          default:
            b = buildPosition(rng, arr, slot, style, d);
        }
      }
      if (!b) break;
      built.push(b);
    }
    if (built.length !== slots.length) continue;
    const prompts = new Set(built.map((b) => b.draft.prompt));
    if (prompts.size !== built.length) continue;
    return {
      facts: { kind: 'alphanumeric-set', elements: arr, questions: built.map((b) => b.q) },
      stimulus: `Study the following arrangement carefully and answer the questions given below.\n\n**${show(arr)}**`,
      questions: built.map((b) => b.draft),
    };
  }
  throw new Error('alphanumeric-set: could not build a set');
}
