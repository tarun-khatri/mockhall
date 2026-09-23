/**
 * Five three-digit numbers, three questions (SBI/IBPS Clerk "number-based series" block):
 * digit interchange / reversal / sorting within a number / adding to a digit, then ranking, digit arithmetic,
 * counting (even, divisible by …, greater than …) or the gap between the highest and the lowest.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, Rich } from '../../../types';
import type { SetQuestionDraft } from '../../shared/question';
import { numericChoices, type Mistake } from '../../shared/options';
import { COUNT_OPTIONS, countCategory, countChoices, shuffledOptions } from './common';

export type Pos = 0 | 1 | 2;
export type NumStep =
  | { t: 'swap'; i: Pos; j: Pos }
  | { t: 'reverse' }
  | { t: 'sort'; order: 'asc' | 'desc' }
  | { t: 'add'; pos: Pos; v: number; when?: 'odd' | 'even' };
export interface RankRef {
  order: 'highest' | 'lowest';
  k: number;
}
export type NumCond = { t: 'even' } | { t: 'odd' } | { t: 'div'; n: number } | { t: 'gt'; n: number } | { t: 'lt'; n: number };
export type NumQ =
  | { type: 'rank'; steps: NumStep[]; rank: RankRef }
  | { type: 'digit-arith'; steps: NumStep[]; a: { rank: RankRef; pos: Pos }; b: { rank: RankRef; pos: Pos }; op: 'product' | 'sum' | 'difference' }
  | { type: 'count'; steps: NumStep[]; cond: NumCond }
  | { type: 'range-diff'; steps: NumStep[] }
  | { type: 'digit-sum'; steps: NumStep[]; rank: RankRef };

export interface NumberSetFacts {
  kind: 'number-set';
  numbers: number[];
  questions: NumQ[];
}

interface Built {
  q: NumQ;
  draft: SetQuestionDraft;
}

const POS_WORD = ['first', 'second', 'third'];
const RANK_WORD = ['', '', 'second ', 'third ', 'fourth '];

const digits = (n: number): number[] => [Math.floor(n / 100), Math.floor(n / 10) % 10, n % 10];
const num = (d: readonly number[]): number => d[0] * 100 + d[1] * 10 + d[2];

/** Apply steps to one number; null when a digit would leave 1–9. */
export function applySteps(n: number, steps: readonly NumStep[]): number | null {
  let d = digits(n);
  for (const s of steps) {
    if (s.t === 'swap') {
      const x = d.slice();
      [x[s.i], x[s.j]] = [x[s.j], x[s.i]];
      d = x;
    } else if (s.t === 'reverse') d = d.slice().reverse();
    else if (s.t === 'sort') d = d.slice().sort((a, b) => (s.order === 'asc' ? a - b : b - a));
    else {
      const cur = num(d);
      if (s.when === 'odd' && cur % 2 === 0) continue;
      if (s.when === 'even' && cur % 2 === 1) continue;
      const x = d.slice();
      x[s.pos] += s.v;
      if (x[s.pos] < 1 || x[s.pos] > 9) return null;
      d = x;
    }
  }
  return num(d);
}

function stepText(s: NumStep): string {
  switch (s.t) {
    case 'swap':
      return `the positions of the ${POS_WORD[Math.min(s.i, s.j)]} and the ${POS_WORD[Math.max(s.i, s.j)]} digits of each number are interchanged`;
    case 'reverse':
      return 'the digits of each number are written in reverse order';
    case 'sort':
      return `the digits within each number are arranged in ${s.order === 'asc' ? 'ascending' : 'descending'} order (from left to right)`;
    case 'add': {
      const whom = s.when ? `each ${s.when} number` : 'each number';
      return s.v > 0 ? `${s.v} is added to the ${POS_WORD[s.pos]} digit of ${whom}` : `${-s.v} is subtracted from the ${POS_WORD[s.pos]} digit of ${whom}`;
    }
  }
}

function stepsText(steps: readonly NumStep[]): string {
  if (steps.length === 1) return stepText(steps[0]);
  return steps.map(stepText).join(', and then ');
}

function rankText(r: RankRef): string {
  return `${RANK_WORD[r.k]}${r.order}`;
}

function condText(c: NumCond): string {
  switch (c.t) {
    case 'even':
      return 'even';
    case 'odd':
      return 'odd';
    case 'div':
      return `divisible by ${c.n}`;
    case 'gt':
      return `greater than ${c.n}`;
    case 'lt':
      return `less than ${c.n}`;
  }
}

function condHolds(n: number, c: NumCond): boolean {
  switch (c.t) {
    case 'even':
      return n % 2 === 0;
    case 'odd':
      return n % 2 === 1;
    case 'div':
      return n % c.n === 0;
    case 'gt':
      return n > c.n;
    case 'lt':
      return n < c.n;
  }
}

function transformAll(nums: readonly number[], steps: readonly NumStep[]): number[] | null {
  const out: number[] = [];
  for (const n of nums) {
    const v = applySteps(n, steps);
    if (v === null) return null;
    out.push(v);
  }
  return new Set(out).size === out.length ? out : null;
}

function byRank(vals: readonly number[], r: RankRef): number {
  const sorted = vals.slice().sort((a, b) => (r.order === 'highest' ? b - a : a - b));
  return sorted[r.k - 1];
}

function transformLines(nums: readonly number[], steps: readonly NumStep[]): Rich[] {
  if (!steps.length) return [];
  const out: Rich[] = [];
  let cur = nums.slice();
  for (const s of steps) {
    const nxt = cur.map((n) => applySteps(n, [s])!);
    out.push(`${s.t === 'add' && s.when ? 'Apply to ' + s.when + ' numbers only' : 'Apply the change'}: ${cur.map((n, i) => (n === nxt[i] ? `${n}` : `${n} → ${nxt[i]}`)).join(', ')}`);
    cur = nxt;
  }
  return out;
}

function orderLine(vals: readonly number[]): Rich {
  return `In descending order: ${vals.slice().sort((a, b) => b - a).join(' > ')}`;
}

/* ------------------------------------------------------------------ */
/* Step menus by difficulty                                             */
/* ------------------------------------------------------------------ */

function singleSteps(): NumStep[][] {
  const out: NumStep[][] = [
    [{ t: 'swap', i: 0, j: 1 }],
    [{ t: 'swap', i: 1, j: 2 }],
    [{ t: 'reverse' }],
    [{ t: 'sort', order: 'asc' }],
    [{ t: 'sort', order: 'desc' }],
  ];
  for (const pos of [0, 1, 2] as Pos[]) for (const v of [1, 2, -1, -2]) out.push([{ t: 'add', pos, v }]);
  return out;
}

function stepMenu(rng: Rng, d: Difficulty): NumStep[][] {
  const singles = singleSteps();
  if (d === 'easy') return [[{ t: 'reverse' }], [{ t: 'swap', i: 0, j: 1 }], [{ t: 'add', pos: 0, v: 1 }], [{ t: 'add', pos: 2, v: -1 }]];
  if (d === 'medium') return singles;
  const pairs: NumStep[][] = [];
  const perm = singles.filter((s) => s[0].t !== 'add');
  const adds = singles.filter((s) => s[0].t === 'add');
  for (const p of perm) for (const a of adds) pairs.push(rng.chance(0.5) ? [p[0], a[0]] : [a[0], p[0]]);
  if (d === 'hard') return pairs;
  // extreme: conditional additions combined with a permutation
  const cond: NumStep[][] = [];
  for (const p of perm)
    for (const pos of [0, 1, 2] as Pos[])
      for (const v of [1, 2, -1, -2])
        for (const when of ['odd', 'even'] as const) cond.push(rng.chance(0.5) ? [p[0], { t: 'add', pos, v, when }] : [{ t: 'add', pos, v, when }, p[0]]);
  return cond;
}

/* ------------------------------------------------------------------ */
/* Question builders                                                    */
/* ------------------------------------------------------------------ */

function buildRank(rng: Rng, nums: readonly number[], d: Difficulty): Built | null {
  const menu = d === 'easy' ? [[] as NumStep[], ...stepMenu(rng, d)] : stepMenu(rng, d);
  for (const steps of rng.shuffle(menu).slice(0, 12)) {
    const vals = transformAll(nums, steps);
    if (!vals) continue;
    const rank: RankRef = { order: rng.pick(['highest', 'lowest'] as const), k: rng.int(d === 'easy' ? 1 : 2, 3) };
    const ans = byRank(vals, rank);
    // the tempting mistake: ranking the original numbers and transforming that one
    const origIdx = nums.indexOf(byRank(nums, rank));
    if (steps.length && vals[origIdx] === ans && d !== 'easy') continue;
    const choices = shuffledOptions(
      rng,
      String(ans),
      vals.filter((v) => v !== ans).map(String),
    );
    const prompt = steps.length
      ? `If ${stepsText(steps)}, which of the following will be the ${rankText(rank)} number thus formed?`
      : `If the numbers are arranged in ${rank.order === 'highest' ? 'descending' : 'ascending'} order from left to right, which of the following will be ${rank.k === 1 ? 'the first' : `the ${['', '', 'second', 'third'][rank.k]}`} number from the left end?`;
    const trapVal = vals[origIdx];
    return {
      q: { type: 'rank', steps, rank },
      draft: {
        prompt,
        ...choices,
        solution: {
          steps: [...transformLines(nums, steps), orderLine(vals), `The ${rankText(rank)} number = **${ans}**.`],
          shortcut: steps.length ? 'Only the first digits decide most comparisons — transform the first digit of each number first and compare those.' : 'Compare hundreds digits first; only ties need the tens digit.',
          ...(steps.length && trapVal !== ans ? { trap: `${trapVal} comes from the ${rankText(rank)} original number — rank the numbers after the change, not before.` } : {}),
        },
        tags: ['series:number-set', 'series:digit-operation'],
      },
    };
  }
  return null;
}

function arithMistakes(
  vals: readonly number[],
  orig: readonly number[],
  a: { rank: RankRef; pos: Pos },
  b: { rank: RankRef; pos: Pos },
  op: 'product' | 'sum' | 'difference',
  hasSteps: boolean,
): { value: number; mistakes: Mistake[] } {
  const f = (x: number, y: number) => (op === 'product' ? x * y : op === 'sum' ? x + y : Math.abs(x - y));
  const dig = (arr: readonly number[], r: { rank: RankRef; pos: Pos }) => digits(byRank(arr, r.rank))[r.pos];
  const value = f(dig(vals, a), dig(vals, b));
  const mistakes: Mistake[] = [];
  if (hasSteps) mistakes.push({ value: f(dig(orig, a), dig(orig, b)), why: 'used the numbers before the change' });
  const shiftRank = (r: RankRef): RankRef => ({ order: r.order, k: r.k === 1 ? 2 : r.k - 1 });
  mistakes.push({ value: f(dig(vals, { rank: shiftRank(a.rank), pos: a.pos }), dig(vals, b)), why: 'picked the wrong-ranked number' });
  mistakes.push({ value: f(digits(byRank(vals, a.rank))[2 - a.pos], dig(vals, b)), why: 'read the digit from the wrong end' });
  if (op === 'product') mistakes.push({ value: dig(vals, a) + dig(vals, b), why: 'added instead of multiplying' });
  if (op === 'sum') mistakes.push({ value: dig(vals, a) * dig(vals, b), why: 'multiplied instead of adding' });
  mistakes.push({ value: f(dig(vals, a), digits(byRank(vals, b.rank))[2 - b.pos]), why: 'read the second digit from the wrong end' });
  return { value, mistakes };
}

function buildArith(rng: Rng, nums: readonly number[], d: Difficulty): Built | null {
  const menu = d === 'easy' ? [[] as NumStep[]] : d === 'medium' ? [[] as NumStep[], ...stepMenu(rng, d)] : stepMenu(rng, d);
  for (const steps of rng.shuffle(menu).slice(0, 12)) {
    const vals = transformAll(nums, steps);
    if (!vals) continue;
    const op = d === 'easy' ? rng.pick(['product', 'sum'] as const) : rng.pick(['product', 'sum', 'difference'] as const);
    const ra: RankRef = { order: 'highest', k: d === 'easy' || d === 'medium' ? 1 : rng.int(1, 2) };
    const rb: RankRef = { order: 'lowest', k: d === 'easy' || d === 'medium' ? 1 : rng.int(1, 2) };
    const a = { rank: ra, pos: rng.int(0, 2) as Pos };
    const b = { rank: rb, pos: rng.int(0, 2) as Pos };
    if (rng.chance(0.5)) {
      a.rank = rb;
      b.rank = ra;
    }
    const { value, mistakes } = arithMistakes(vals, nums, a, b, op, steps.length > 0);
    if (op === 'difference' && value === 0) continue;
    let choices;
    try {
      choices = numericChoices(rng, value, { format: (n) => String(n), mistakes, allowZero: op === 'difference', min: 0, step: value > 20 ? 2 : 1 });
    } catch {
      continue;
    }
    const na = byRank(vals, a.rank);
    const nb = byRank(vals, b.rank);
    const da = digits(na)[a.pos];
    const db = digits(nb)[b.pos];
    const opWord = op === 'product' ? 'product' : op === 'sum' ? 'sum' : 'difference';
    const lead = steps.length ? `If ${stepsText(steps)}, what` : 'What';
    const verb = steps.length ? 'will be' : 'is';
    const prompt = `${lead} ${verb} the ${opWord} of the ${POS_WORD[a.pos]} digit of the ${rankText(a.rank)} number and the ${POS_WORD[b.pos]} digit of the ${rankText(b.rank)} number${steps.length ? ' thus formed' : ''}?`;
    const sym = op === 'product' ? '×' : op === 'sum' ? '+' : '−';
    const [x, y] = op === 'difference' && db > da ? [db, da] : [da, db];
    return {
      q: { type: 'digit-arith', steps, a, b, op },
      draft: {
        prompt,
        ...choices,
        solution: {
          steps: [
            ...transformLines(nums, steps),
            orderLine(vals),
            `${rankText(a.rank)[0].toUpperCase() + rankText(a.rank).slice(1)} = ${na}; its ${POS_WORD[a.pos]} digit = ${da}.`,
            `${rankText(b.rank)[0].toUpperCase() + rankText(b.rank).slice(1)} = ${nb}; its ${POS_WORD[b.pos]} digit = ${db}.`,
            `${x} ${sym} ${y} = **${value}**.`,
          ],
          shortcut: 'Rank only as far as you need (highest and lowest are found by the first digits alone).',
          trap: steps.length ? `Using the numbers before the change gives ${mistakes[0].value}.` : `Mixing up "first" and "third" digit reads the number from the wrong end.`,
        },
        tags: ['series:number-set', 'series:digit-arithmetic'],
      },
    };
  }
  return null;
}

function condMenu(d: Difficulty): NumCond[] {
  const out: NumCond[] = [{ t: 'even' }, { t: 'odd' }];
  if (d !== 'easy') out.push({ t: 'div', n: 3 });
  for (const n of [300, 400, 500, 600, 700]) out.push({ t: 'gt', n }, { t: 'lt', n });
  if (d === 'hard' || d === 'extreme') out.push({ t: 'div', n: 4 }, { t: 'div', n: 6 });
  return out;
}

function buildCount(rng: Rng, nums: readonly number[], d: Difficulty): Built | null {
  const target = rng.int(0, 4);
  const menu = d === 'easy' ? [[{ t: 'reverse' }] as NumStep[], [{ t: 'swap', i: 0, j: 1 }] as NumStep[]] : stepMenu(rng, d);
  const conds = condMenu(d);
  for (let tries = 0; tries < 60; tries++) {
    const steps = rng.pick(menu);
    const cond = rng.pick(conds);
    const vals = transformAll(nums, steps);
    if (!vals) continue;
    const hitVals = vals.filter((v) => condHolds(v, cond));
    if (countCategory(hitVals.length) !== target) continue;
    const choices = countChoices(hitVals.length);
    const origHits = nums.filter((v) => condHolds(v, cond)).length;
    const divTrick = cond.t === 'div' && cond.n === 3 && steps.every((s) => s.t !== 'add');
    return {
      q: { type: 'count', steps, cond },
      draft: {
        prompt: `If ${stepsText(steps)}, how many numbers thus formed will be ${condText(cond)}?`,
        ...choices,
        solution: {
          steps: [
            ...transformLines(nums, steps),
            `${condText(cond)[0].toUpperCase() + condText(cond).slice(1)}: ${hitVals.length ? hitVals.join(', ') : 'none of them'}.`,
            `Count = ${hitVals.length} → **${COUNT_OPTIONS[choices.answerIndex]}**.`,
          ],
          shortcut: divTrick
            ? 'Rearranging digits never changes the digit sum, so divisibility by 3 can be read from the original numbers.'
            : cond.t === 'even' || cond.t === 'odd'
              ? 'Only the last digit decides odd/even — look at the new last digit of each number.'
              : cond.t === 'gt' || cond.t === 'lt'
                ? 'Only the new first digit matters (plus the next digit when it equals the boundary digit).'
                : 'Apply the change, then test divisibility on the new numbers only.',
          ...(origHits !== hitVals.length ? { trap: `Checking the original numbers instead gives ${origHits}.` } : {}),
        },
        tags: ['series:number-set', 'series:digit-operation', 'series:count'],
      },
    };
  }
  return null;
}

function buildRange(rng: Rng, nums: readonly number[], d: Difficulty): Built | null {
  for (const steps of rng.shuffle(stepMenu(rng, d)).slice(0, 12)) {
    const vals = transformAll(nums, steps);
    if (!vals) continue;
    const sorted = vals.slice().sort((a, b) => b - a);
    const value = sorted[0] - sorted[4];
    const os = nums.slice().sort((a, b) => b - a);
    const mistakes: Mistake[] = [
      { value: os[0] - os[4], why: 'used the original numbers' },
      { value: sorted[0] - sorted[3], why: 'took the second lowest' },
      { value: sorted[1] - sorted[4], why: 'took the second highest' },
      { value: sorted[0] - os[4], why: 'transformed only the highest' },
    ];
    let choices;
    try {
      choices = numericChoices(rng, value, { format: (n) => String(n), mistakes });
    } catch {
      continue;
    }
    return {
      q: { type: 'range-diff', steps },
      draft: {
        prompt: `If ${stepsText(steps)}, what will be the difference between the highest and the lowest numbers thus formed?`,
        ...choices,
        solution: {
          steps: [...transformLines(nums, steps), orderLine(vals), `${sorted[0]} − ${sorted[4]} = **${value}**.`],
          shortcut: 'You only need the new highest and the new lowest — find them from the new first digits.',
          trap: `Subtracting the original highest and lowest gives ${os[0] - os[4]}.`,
        },
        tags: ['series:number-set', 'series:digit-operation'],
      },
    };
  }
  return null;
}

function buildDigitSum(rng: Rng, nums: readonly number[], d: Difficulty): Built | null {
  for (const steps of rng.shuffle(stepMenu(rng, d)).slice(0, 12)) {
    const vals = transformAll(nums, steps);
    if (!vals) continue;
    const rank: RankRef = { order: rng.pick(['highest', 'lowest'] as const), k: rng.int(2, 3) };
    const n = byRank(vals, rank);
    const ds = (x: number) => digits(x).reduce((s, v) => s + v, 0);
    const value = ds(n);
    const mistakes: Mistake[] = [
      { value: ds(byRank(nums, rank)), why: 'used the original number of that rank' },
      { value: ds(byRank(vals, { order: rank.order, k: rank.k - 1 })), why: 'off by one in the ranking' },
      { value: ds(byRank(vals, { order: rank.order, k: rank.k + 1 })), why: 'off by one in the ranking' },
      { value: digits(n).reduce((s, v) => s * v, 1), why: 'multiplied the digits' },
    ];
    let choices;
    try {
      choices = numericChoices(rng, value, { format: (x) => String(x), mistakes, step: 1 });
    } catch {
      continue;
    }
    return {
      q: { type: 'digit-sum', steps, rank },
      draft: {
        prompt: `If ${stepsText(steps)}, what will be the sum of the digits of the ${rankText(rank)} number thus formed?`,
        ...choices,
        solution: {
          steps: [...transformLines(nums, steps), orderLine(vals), `The ${rankText(rank)} number = ${n}.`, `${digits(n).join(' + ')} = **${value}**.`],
          shortcut: 'Digit swaps do not change a digit sum — only the additions/subtractions and the ranking matter.',
          trap: `The original ${rankText(rank)} number gives ${mistakes[0].value}; rank again after the change.`,
        },
        tags: ['series:number-set', 'series:digit-operation'],
      },
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */

function makeNumbers(rng: Rng): number[] {
  const out: number[] = [];
  const firsts = rng.sample([1, 2, 3, 4, 5, 6, 7, 8, 9], 5);
  for (let i = 0; i < 5; i++) {
    // Occasionally share a first digit so ranking needs the second digit.
    const f = i === 4 && rng.chance(0.3) ? out.length ? Math.floor(out[0] / 100) : firsts[i] : firsts[i];
    const rest = rng.sample([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== f), 2);
    out.push(f * 100 + rest[0] * 10 + rest[1]);
  }
  return new Set(out).size === 5 ? out : makeNumbers(rng);
}

type Kind = 'rank' | 'arith' | 'count' | 'range' | 'dsum';

function plan(rng: Rng, d: Difficulty): Kind[] {
  switch (d) {
    case 'easy':
      return ['rank', 'arith', 'count'];
    case 'medium':
      return ['rank', rng.pick<Kind>(['arith', 'range']), 'count'];
    case 'hard':
      return ['rank', rng.pick<Kind>(['range', 'dsum', 'arith']), 'count'];
    case 'extreme':
      return ['rank', rng.pick<Kind>(['arith', 'dsum']), 'count'];
  }
}

export function buildNumberSet(rng: Rng, d: Difficulty): { facts: NumberSetFacts; stimulus: Rich; questions: SetQuestionDraft[] } {
  const kinds = plan(rng, d);
  for (let attempt = 0; attempt < 60; attempt++) {
    const nums = makeNumbers(rng);
    const built: Built[] = [];
    for (const k of kinds) {
      const b =
        k === 'rank' ? buildRank(rng, nums, d) : k === 'arith' ? buildArith(rng, nums, d) : k === 'count' ? buildCount(rng, nums, d) : k === 'range' ? buildRange(rng, nums, d) : buildDigitSum(rng, nums, d);
      if (!b) break;
      built.push(b);
    }
    if (built.length !== kinds.length) continue;
    return {
      facts: { kind: 'number-set', numbers: nums, questions: built.map((b) => b.q) },
      stimulus: `Study the following information carefully and answer the questions given below.\n\nFive three-digit numbers are given below:\n\n**${nums.join('     ')}**`,
      questions: built.map((b) => b.draft),
    };
  }
  throw new Error('number-set: could not build a set');
}
