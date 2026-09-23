/**
 * Row / queue / rank-list problems: position from both ends, total persons (incl. the "order not given →
 * two totals" trap), and interchanging positions. Built backward from a concrete row.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, Rich, VisualSpec } from '../../../types';
import type { QuestionDraft } from '../../shared/question';
import { fixedChoices, numericChoices, type Choices, type Mistake } from '../../shared/options';
import { ordinal } from '../../../../lib/format';
import { targetSeconds } from '../../../targets';

export type End = 'left' | 'right';
export type RowStmt =
  | { t: 'pos'; who: string; from: End; k: number }
  | { t: 'total'; n: number }
  /** exactly k persons between a and b */
  | { t: 'between'; a: string; b: string; k: number }
  /** a is somewhere to the left of b */
  | { t: 'order'; a: string; b: string }
  /** after a and b interchange places, `who` is k-th from `from` */
  | { t: 'swap-pos'; a: string; b: string; who: string; from: End; k: number }
  /** c is exactly in the middle of a and b */
  | { t: 'middle'; c: string; a: string; b: string };

export type RowAsk =
  | { t: 'total' }
  | { t: 'pos'; who: string; from: End; afterSwap?: [string, string] }
  | { t: 'between'; a: string; b: string };

export interface RowFacts {
  kind: 'row';
  subtype: 'position-both-ends' | 'total-persons' | 'interchange';
  /** Frame words (left/right, front/back, top/bottom) — display only. */
  frame: Frame;
  stmts: RowStmt[];
  ask: RowAsk;
  /** Rank-list variant: people outside the ranking (failed / absent) added to the class size. */
  extra?: number;
  /** Options carry "Cannot be determined" at E. */
  cbdOption: boolean;
}

export interface Frame {
  place: string;
  left: string;
  right: string;
}
const FRAMES: Frame[] = [
  { place: 'a row of students facing north', left: 'left', right: 'right' },
  { place: 'a row of people facing north', left: 'left', right: 'right' },
  { place: 'a queue at a bank counter', left: 'front', right: 'end' },
  { place: 'a queue at a railway ticket window', left: 'front', right: 'end' },
];
const endWord = (f: Frame, e: End) => (e === 'left' ? f.left : f.right);

const MEN = ['Ravi', 'Arjun', 'Karthik', 'Imran', 'Suresh', 'Manoj', 'Vikram', 'Rahul', 'Deepak', 'Farhan', 'Joseph', 'Nikhil', 'Rohit', 'Aditya', 'Vivek', 'Kunal'];
const WOMEN = ['Priya', 'Anjali', 'Meera', 'Kavya', 'Sneha', 'Fatima', 'Lakshmi', 'Pooja', 'Neha', 'Divya', 'Ritu', 'Swati', 'Anita', 'Rekha', 'Nandini', 'Zoya'];

export const CBD = 'Cannot be determined';

function names(rng: Rng, k: number): string[] {
  return rng.sample([...MEN, ...WOMEN], k);
}

type Draft = Omit<QuestionDraft, 'subtype' | 'difficulty'>;

function rowVisual(n: number, marks: [string, number][], f: Frame): VisualSpec {
  const sorted = marks.slice().sort((a, b) => a[1] - b[1]);
  const items: string[] = [];
  let last = 0;
  for (const [nm, p] of sorted) {
    if (p - last - 1 > 0) items.push(`${p - last - 1} ${p - last - 1 === 1 ? 'person' : 'persons'}`);
    items.push(`${nm} (${ordinal(p)} from ${f.left}, ${ordinal(n - p + 1)} from ${f.right})`);
    last = p;
  }
  if (n - last > 0) items.push(`${n - last} ${n - last === 1 ? 'person' : 'persons'}`);
  return { type: 'order', items, label: `${f.left[0].toUpperCase() + f.left.slice(1)} → ${f.right}`, caption: `Total ${n}` };
}

function numChoices(rng: Rng, value: number, mistakes: Mistake[], cbd: boolean, cbdCorrect: boolean): Choices {
  if (!cbd) return numericChoices(rng, value, { format: (v) => String(v), mistakes, step: 1 });
  if (cbdCorrect) {
    // four plausible numbers (the possible values among them) + CBD at E
    const vals = [...new Set(mistakes.map((m) => m.value).filter((v) => v > 0))].slice(0, 4);
    for (let d = 1; vals.length < 4; d++) if (!vals.includes(value + d)) vals.push(value + d);
    return fixedChoices([...vals.sort((a, b) => a - b).map(String), CBD], 4);
  }
  // Four ascending numbers with the answer at a uniform slot A–D, then CBD at E.
  const t = rng.int(0, 3);
  for (;;) {
    const c = numericChoices(rng, value, { format: (v) => String(v), mistakes, step: 1 });
    const r = c.answerIndex;
    let vals: number[] | null = null;
    if (r === t && r < 4) vals = c.values.filter((_, i) => i !== 4); // drop the largest
    else if (r === t + 1) vals = c.values.filter((_, i) => i !== 0); // drop the smallest
    if (vals) return fixedChoices([...vals.map(String), CBD], t);
  }
}

/* ------------------------------------------------------------------ */
/* position-both-ends                                                   */
/* ------------------------------------------------------------------ */

export function buildPositionBothEnds(rng: Rng, d: Difficulty): { facts: RowFacts; draft: Draft } {
  const f = rng.pick(FRAMES);
  const variant = d === 'easy' ? 'other-end' : d === 'medium' ? rng.pick(['between', 'offset'] as const) : d === 'hard' ? rng.pick(['between', 'offset', 'rank-list'] as const) : rng.pick(['rank-list', 'middle'] as const);
  const [A, B, C] = names(rng, 3);
  if (variant === 'other-end') {
    const n = rng.int(20, 60);
    const k = rng.int(5, n - 4);
    const from: End = rng.pick(['left', 'right'] as const);
    const ans = n - k + 1;
    const stmts: RowStmt[] = [{ t: 'total', n }, { t: 'pos', who: A, from, k }];
    const other: End = from === 'left' ? 'right' : 'left';
    const choices = numericChoices(rng, ans, { format: String, mistakes: [{ value: n - k, why: 'forgot to add 1' }, { value: n - k + 2, why: 'added 2' }, { value: k, why: 'repeated the given position' }, { value: n + k - 1, why: 'added instead of subtracting' }], step: 1 });
    return {
      facts: { kind: 'row', subtype: 'position-both-ends', frame: f, stmts, ask: { t: 'pos', who: A, from: other }, cbdOption: false },
      draft: {
        prompt: `In ${f.place}, there are ${n} persons. ${A} is ${ordinal(k)} from the ${endWord(f, from)}. What is ${A}'s position from the ${endWord(f, other)}?`,
        ...choices,
        solution: {
          steps: [`Position from the other end = total − given position + 1.`, `= ${n} − ${k} + 1 = **${ans}**.`],
          shortcut: `Left + right − 1 = total, so right = ${n} + 1 − ${k}.`,
          trap: `${n - k} forgets the "+ 1": ${A} is counted from both ends.`,
          visual: rowVisual(n, [[A, from === 'left' ? k : n - k + 1]], f),
        },
        tags: ['ranking:both-ends'],
        targetSeconds: targetSeconds('short-reasoning', d),
      },
    };
  }
  if (variant === 'between') {
    // n persons; A p-th from left, B q-th from right, A left of B; ask persons between
    for (;;) {
      const n = rng.int(25, 60);
      const p = rng.int(4, Math.floor(n / 2));
      const q = rng.int(4, n - p - 3);
      const between = n - p - q;
      if (between < 2) continue;
      const ans = between;
      const stmts: RowStmt[] = [{ t: 'total', n }, { t: 'pos', who: A, from: 'left', k: p }, { t: 'pos', who: B, from: 'right', k: q }];
      const choices = numericChoices(rng, ans, { format: String, mistakes: [{ value: ans + 1, why: 'counted one of the two persons' }, { value: ans + 2, why: 'counted both persons' }, { value: ans - 1, why: 'subtracted one extra' }, { value: Math.abs(p - q) - 1, why: 'subtracted the positions' }], step: 1 });
      return {
        facts: { kind: 'row', subtype: 'position-both-ends', frame: f, stmts, ask: { t: 'between', a: A, b: B }, cbdOption: false },
        draft: {
          prompt: `In ${f.place} of ${n} persons, ${A} is ${ordinal(p)} from the ${f.left} and ${B} is ${ordinal(q)} from the ${f.right}. How many persons are there between ${A} and ${B}?`,
          ...choices,
          solution: {
            steps: [`${B} from the ${f.left} = ${n} − ${q} + 1 = ${n - q + 1}.`, `Persons between = ${n - q + 1} − ${p} − 1 = **${ans}**.`],
            shortcut: `Between = total − (left position + right position) = ${n} − (${p} + ${q}) = ${ans}.`,
            trap: `${ans + 1} counts one of ${A} and ${B} themselves.`,
            visual: rowVisual(n, [[A, p], [B, n - q + 1]], f),
          },
          tags: ['ranking:both-ends', 'ranking:between'],
          targetSeconds: targetSeconds('short-reasoning', d),
        },
      };
    }
  }
  if (variant === 'offset') {
    const n = rng.int(25, 55);
    const p = rng.int(4, n - 12);
    const k = rng.int(3, Math.min(10, n - p - 2));
    const bPos = p + k;
    const ans = n - bPos + 1;
    const stmts: RowStmt[] = [{ t: 'total', n }, { t: 'pos', who: A, from: 'left', k: p }, { t: 'order', a: A, b: B }, { t: 'between', a: A, b: B, k: k - 1 }];
    const choices = numericChoices(rng, ans, { format: String, mistakes: [{ value: ans + 1, why: 'off by one' }, { value: n - p + 1, why: 'answered for the first person' }, { value: n - (p - k) + 1, why: 'moved the wrong way' }, { value: ans - 1, why: 'off by one' }], step: 1 });
    return {
      facts: { kind: 'row', subtype: 'position-both-ends', frame: f, stmts, ask: { t: 'pos', who: B, from: 'right' }, cbdOption: false },
      draft: {
        prompt: `In ${f.place} of ${n} persons, ${A} is ${ordinal(p)} from the ${f.left}. ${B} is ${k} places behind ${A} towards the ${f.right}, with ${k - 1} ${k - 1 === 1 ? 'person' : 'persons'} between them. What is ${B}'s position from the ${f.right}?`,
        ...choices,
        solution: {
          steps: [`${B} from the ${f.left} = ${p} + ${k} = ${bPos}.`, `From the ${f.right} = ${n} − ${bPos} + 1 = **${ans}**.`],
          shortcut: `${n} + 1 − (${p} + ${k}) = ${ans}.`,
          trap: `${n - p + 1} is ${A}'s position from the ${f.right}, not ${B}'s.`,
          visual: rowVisual(n, [[A, p], [B, bPos]], f),
        },
        tags: ['ranking:both-ends'],
        targetSeconds: targetSeconds('short-reasoning', d),
      },
    };
  }
  if (variant === 'middle') {
    // A p-th from left, B q-th from right (A left of B), C exactly in the middle; ask C from the right
    for (;;) {
      const n = rng.int(30, 70);
      const p = rng.int(3, 15);
      const q = rng.int(3, 15);
      const bPos = n - q + 1;
      if (bPos - p < 6 || (bPos - p) % 2) continue;
      const cPos = (p + bPos) / 2;
      const ans = n - cPos + 1;
      const stmts: RowStmt[] = [{ t: 'total', n }, { t: 'pos', who: A, from: 'left', k: p }, { t: 'pos', who: B, from: 'right', k: q }, { t: 'middle', c: C, a: A, b: B }];
      const choices = numericChoices(rng, ans, { format: String, mistakes: [{ value: ans + 1, why: 'off by one' }, { value: ans - 1, why: 'off by one' }, { value: cPos, why: 'gave the position from the other end' }, { value: Math.round((p + q) / 2), why: 'averaged the two given numbers' }], step: 1 });
      return {
        facts: { kind: 'row', subtype: 'position-both-ends', frame: f, stmts, ask: { t: 'pos', who: C, from: 'right' }, cbdOption: false },
        draft: {
          prompt: `In ${f.place} of ${n} persons, ${A} is ${ordinal(p)} from the ${f.left} and ${B} is ${ordinal(q)} from the ${f.right}. ${C} stands exactly in the middle of ${A} and ${B}. What is ${C}'s position from the ${f.right}?`,
          ...choices,
          solution: {
            steps: [`${B} from the ${f.left} = ${n} − ${q} + 1 = ${bPos}.`, `${C} = (${p} + ${bPos}) ÷ 2 = ${cPos}th from the ${f.left}.`, `From the ${f.right} = ${n} − ${cPos} + 1 = **${ans}**.`],
            shortcut: 'Convert everyone to positions from one end first; the middle is the average of the two positions.',
            trap: `${cPos} is ${C}'s position from the ${f.left}; the question asks from the ${f.right}.`,
            visual: rowVisual(n, [[A, p], [C, cPos], [B, bPos]], f),
          },
          tags: ['ranking:both-ends', 'ranking:middle'],
          targetSeconds: targetSeconds('short-reasoning', d),
        },
      };
    }
  }
  // rank-list: rank from top and bottom among those who passed, plus failed/absent
  const top = rng.int(8, 30);
  const bottom = rng.int(8, 30);
  const failed = rng.int(3, 12);
  const absent = d === 'extreme' ? rng.int(2, 6) : 0;
  const passed = top + bottom - 1;
  const ans = passed + failed + absent;
  const stmts: RowStmt[] = [{ t: 'pos', who: A, from: 'left', k: top }, { t: 'pos', who: A, from: 'right', k: bottom }];
  const choices = numericChoices(rng, ans, {
    format: String,
    mistakes: [
      { value: passed, why: 'forgot the students outside the rank list' },
      { value: ans + 1, why: 'did not subtract 1' },
      { value: passed + failed, why: 'left out the absentees' },
      { value: ans - failed, why: 'left out those who failed' },
    ],
    step: 1,
  });
  const absentText = absent ? ` and ${absent} students were absent` : '';
  return {
    facts: { kind: 'row', subtype: 'position-both-ends', frame: { place: 'a class', left: 'top', right: 'bottom' }, stmts, ask: { t: 'total' }, extra: failed + absent, cbdOption: false },
    draft: {
      prompt: `In a class, ${A} ranks ${ordinal(top)} from the top and ${ordinal(bottom)} from the bottom among the students who passed an examination. If ${failed} students failed${absentText}, how many students are there in the class?`,
      ...choices,
      solution: {
        steps: [`Students who passed = ${top} + ${bottom} − 1 = ${passed}.`, `Class = ${passed} + ${failed}${absent ? ` + ${absent}` : ''} = **${ans}**.`],
        shortcut: 'Top rank + bottom rank − 1 gives only the ranked group; add everyone outside it.',
        trap: `${passed} counts only the students who passed.`,
      },
      tags: ['ranking:both-ends', 'ranking:rank-list'],
      targetSeconds: targetSeconds('short-reasoning', d),
    },
  };
}

/* ------------------------------------------------------------------ */
/* total-persons                                                        */
/* ------------------------------------------------------------------ */

export function buildTotal(rng: Rng, d: Difficulty): { facts: RowFacts; draft: Draft } {
  const f = rng.pick(FRAMES);
  const [A, B] = names(rng, 2);
  if (d === 'easy') {
    const p = rng.int(5, 30);
    const q = rng.int(5, 30);
    const ans = p + q - 1;
    const choices = numericChoices(rng, ans, { format: String, mistakes: [{ value: p + q, why: 'did not subtract 1' }, { value: p + q + 1, why: 'added 1' }, { value: ans - 1, why: 'subtracted 2' }], step: 1 });
    return {
      facts: { kind: 'row', subtype: 'total-persons', frame: f, stmts: [{ t: 'pos', who: A, from: 'left', k: p }, { t: 'pos', who: A, from: 'right', k: q }], ask: { t: 'total' }, cbdOption: false },
      draft: {
        prompt: `In ${f.place}, ${A} is ${ordinal(p)} from the ${f.left} and ${ordinal(q)} from the ${f.right}. How many persons are there?`,
        ...choices,
        solution: {
          steps: [`Total = ${p} + ${q} − 1 = **${ans}**.`],
          shortcut: 'Both positions count the same person once each — subtract 1.',
          trap: `${p + q} counts ${A} twice.`,
          visual: rowVisual(ans, [[A, p]], f),
        },
        tags: ['ranking:total'],
        targetSeconds: targetSeconds('short-reasoning', d),
      },
    };
  }
  // A p-th from left, B q-th from right, k persons between them
  const cbdOption = d === 'hard' || d === 'extreme';
  const cbdTarget = cbdOption && rng.chance(0.18);
  for (;;) {
    const p = rng.int(6, 25);
    const q = rng.int(6, 25);
    const k = rng.int(2, 12);
    const noOverlap = p + q + k; // A … B
    const overlap = p + q - k - 2; // B … A
    if (overlap <= Math.max(p, q)) continue;
    const orderGiven = !cbdTarget;
    const aLeft = d === 'medium' ? true : rng.chance(0.5);
    const ans = aLeft ? noOverlap : overlap;
    const stmts: RowStmt[] = [{ t: 'pos', who: A, from: 'left', k: p }, { t: 'pos', who: B, from: 'right', k: q }, { t: 'between', a: A, b: B, k }];
    if (orderGiven) stmts.push(aLeft ? { t: 'order', a: A, b: B } : { t: 'order', a: B, b: A });
    const [first, second] = aLeft ? [A, B] : [B, A];
    const orderText = orderGiven ? (f.left === 'front' ? ` ${first} is ahead of ${second} in the queue.` : ` ${first} is to the left of ${second}.`) : '';
    const other = aLeft ? overlap : noOverlap;
    const mistakes: Mistake[] = [
      { value: other, why: 'used the other arrangement' },
      { value: p + q + k - 1, why: 'subtracted 1 wrongly' },
      { value: ans + 1, why: 'off by one' },
      { value: ans - 1, why: 'off by one' },
    ];
    const choices = cbdTarget
      ? numChoices(rng, noOverlap, [{ value: noOverlap, why: '' }, { value: overlap, why: '' }, { value: p + q + k - 1, why: '' }, { value: p + q - k - 1, why: '' }], true, true)
      : numChoices(rng, ans, mistakes, cbdOption, false);
    const steps: Rich[] = cbdTarget
      ? [`If ${A} is to the ${f.left} of ${B}: total = ${p} + ${k} + ${q} = ${noOverlap}.`, `If ${B} is to the ${f.left} of ${A} (positions overlap): total = ${p} + ${q} − ${k} − 2 = ${overlap}.`, `The order is not given, so the total is **${CBD}**.`]
      : aLeft
        ? [`${A} … ${k} persons … ${B}: total = ${p} + ${k} + ${q} = **${noOverlap}**.`]
        : [`${B} is to the ${f.left} of ${A}, so the two counts overlap.`, `Total = ${p} + ${q} − ${k} − 2 = **${overlap}**.`];
    const bPos = aLeft ? p + k + 1 : p - k - 1;
    return {
      facts: { kind: 'row', subtype: 'total-persons', frame: f, stmts, ask: { t: 'total' }, cbdOption },
      draft: {
        prompt: `In ${f.place}, ${A} is ${ordinal(p)} from the ${f.left} and ${B} is ${ordinal(q)} from the ${f.right}. There are ${k} persons between ${A} and ${B}.${orderText} How many persons are there in the ${f.place.startsWith('a queue') ? 'queue' : 'row'}?`,
        ...choices,
        solution: {
          steps,
          shortcut: 'No overlap: left + between + right. Overlap: left + right − between − 2.',
          trap: cbdTarget ? `Both ${noOverlap} and ${overlap} are possible — without the order of ${A} and ${B} the total is not fixed.` : `${other} is the total for the opposite order of ${A} and ${B}.`,
          ...(cbdTarget ? {} : { visual: rowVisual(ans, [[A, p], [B, bPos]], f) }),
        },
        tags: ['ranking:total', ...(cbdTarget ? ['ranking:cannot-determine'] : []), ...(!aLeft && !cbdTarget ? ['ranking:overlap'] : [])],
        targetSeconds: targetSeconds('short-reasoning', d),
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/* interchange                                                          */
/* ------------------------------------------------------------------ */

export function buildInterchange(rng: Rng, d: Difficulty): { facts: RowFacts; draft: Draft } {
  const f = rng.pick(FRAMES);
  const [A, B] = names(rng, 2);
  for (;;) {
    const n = rng.int(20, 60);
    const pa = rng.int(4, n - 8); // A from left
    const pb = rng.int(pa + 3, n - 2); // B from left (B to the right of A)
    const qa = n - pa + 1;
    const qb = n - pb + 1;
    const variant = d === 'easy' ? 'total' : d === 'medium' ? rng.pick(['total', 'new-pos'] as const) : rng.pick(['new-pos', 'between', 'total2'] as const);
    let prompt: string;
    let stmts: RowStmt[];
    let ask: RowAsk;
    let ans: number;
    let steps: Rich[];
    let mistakes: Mistake[];
    if (variant === 'total') {
      // A pa-th from left, B qb-th from right; after swap A is pb-th from left
      stmts = [{ t: 'pos', who: A, from: 'left', k: pa }, { t: 'pos', who: B, from: 'right', k: qb }, { t: 'swap-pos', a: A, b: B, who: A, from: 'left', k: pb }];
      ask = { t: 'total' };
      ans = n;
      prompt = `In ${f.place}, ${A} is ${ordinal(pa)} from the ${f.left} and ${B} is ${ordinal(qb)} from the ${f.right}. When ${A} and ${B} interchange their positions, ${A} becomes ${ordinal(pb)} from the ${f.left}. How many persons are there?`;
      steps = [`After the interchange ${A} stands at ${B}'s old place: ${ordinal(pb)} from the ${f.left} and ${ordinal(qb)} from the ${f.right}.`, `Total = ${pb} + ${qb} − 1 = **${n}**.`];
      mistakes = [{ value: pa + qb - 1, why: "used A's old position" }, { value: pb + qb, why: 'did not subtract 1' }, { value: n - 1, why: 'off by one' }, { value: pa + pb + qb - 1, why: 'added all the positions' }];
    } else if (variant === 'new-pos') {
      stmts = [{ t: 'total', n }, { t: 'pos', who: A, from: 'left', k: pa }, { t: 'pos', who: B, from: 'left', k: pb }];
      ask = { t: 'pos', who: B, from: 'right', afterSwap: [A, B] };
      ans = qa;
      prompt = `In ${f.place} of ${n} persons, ${A} is ${ordinal(pa)} and ${B} is ${ordinal(pb)} from the ${f.left}. If ${A} and ${B} interchange their positions, what will be ${B}'s new position from the ${f.right}?`;
      steps = [`${B} moves to ${A}'s old place: ${ordinal(pa)} from the ${f.left}.`, `From the ${f.right} = ${n} − ${pa} + 1 = **${qa}**.`];
      mistakes = [{ value: qb, why: "B's old position from the right" }, { value: n - pa, why: 'forgot to add 1' }, { value: qa + 1, why: 'off by one' }, { value: pa, why: 'answered from the wrong end' }];
    } else if (variant === 'between') {
      stmts = [{ t: 'pos', who: A, from: 'left', k: pa }, { t: 'pos', who: B, from: 'right', k: qb }, { t: 'swap-pos', a: A, b: B, who: A, from: 'left', k: pb }];
      ask = { t: 'between', a: A, b: B };
      ans = pb - pa - 1;
      prompt = `In ${f.place}, ${A} is ${ordinal(pa)} from the ${f.left} and ${B} is ${ordinal(qb)} from the ${f.right}. When they interchange their positions, ${A} becomes ${ordinal(pb)} from the ${f.left}. How many persons are there between ${A} and ${B}?`;
      steps = [`${A}'s new place is ${B}'s old place: ${ordinal(pb)} from the ${f.left}.`, `Persons between = ${pb} − ${pa} − 1 = **${ans}**.`];
      mistakes = [{ value: pb - pa, why: 'did not subtract 1' }, { value: pb - pa + 1, why: 'counted both ends' }, { value: n - pb - pa, why: 'mixed the ends' }, { value: ans - 1, why: 'off by one' }];
    } else {
      // after swap, B becomes qa-th from right; A was pa from left; ask total
      stmts = [{ t: 'pos', who: A, from: 'left', k: pa }, { t: 'pos', who: B, from: 'left', k: pb }, { t: 'swap-pos', a: A, b: B, who: B, from: 'right', k: qa }];
      ask = { t: 'total' };
      ans = n;
      prompt = `In ${f.place}, ${A} is ${ordinal(pa)} and ${B} is ${ordinal(pb)} from the ${f.left}. After ${A} and ${B} interchange their positions, ${B} is ${ordinal(qa)} from the ${f.right}. How many persons are there?`;
      steps = [`${B} now stands at ${A}'s old place: ${ordinal(pa)} from the ${f.left} and ${ordinal(qa)} from the ${f.right}.`, `Total = ${pa} + ${qa} − 1 = **${n}**.`];
      mistakes = [{ value: pb + qa - 1, why: "used B's old position" }, { value: pa + qa, why: 'did not subtract 1' }, { value: n + 1, why: 'off by one' }, { value: n - 1, why: 'off by one' }];
    }
    if (ans < 1) continue;
    const choices = numericChoices(rng, ans, { format: String, mistakes, step: 1 });
    return {
      facts: { kind: 'row', subtype: 'interchange', frame: f, stmts, ask, cbdOption: false },
      draft: {
        prompt,
        ...choices,
        solution: {
          steps,
          shortcut: 'After an interchange each person simply takes over the other\'s old positions from both ends.',
          trap: `${mistakes[0].value} comes from ${mistakes[0].why}.`,
          visual: rowVisual(n, [[A, pa], [B, pb]], f),
        },
        tags: ['ranking:interchange'],
        targetSeconds: targetSeconds('short-reasoning', d),
      },
    };
  }
}
