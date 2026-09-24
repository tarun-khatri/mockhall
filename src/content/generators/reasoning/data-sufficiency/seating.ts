/**
 * DS on small seating arrangements.
 *  - linear: n persons in a row facing north; seat 0 = extreme left (their left).
 *  - circular: n persons around a round table facing the centre; seats numbered clockwise; the first person
 *    is fixed at seat 0 (rotations are the same arrangement). Facing the centre, right = anticlockwise.
 * Worlds = every seat assignment; answers are collected over all assignments consistent with the statements.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, VisualSpec } from '../../../types';
import { ordinal } from '../../../../lib/format';
import { CAP_NUM_WORD, NUM_WORD, findPair, listAnd, listOr, perms, sizesFor, type Category, type DsDraft, type Scenario } from './common';

export type SeatLayout = 'linear' | 'circular';
export type SeatClue =
  | { t: 'rel'; a: string; b: string; k: number; side: 'left' | 'right' }
  | { t: 'adj'; a: string; b: string }
  | { t: 'nadj'; a: string; b: string }
  | { t: 'gap'; a: string; b: string; k: number }
  | { t: 'end'; a: string }
  | { t: 'nend'; a: string }
  | { t: 'opp'; a: string; b: string };
export type SeatAsk = { t: 'rel'; of: string; k: number; side: 'left' | 'right' } | { t: 'end'; side: 'left' | 'right' } | { t: 'middle' } | { t: 'opp'; of: string };

export interface DsSeatingFacts {
  kind: 'seating';
  layout: SeatLayout;
  people: string[];
  I: SeatClue[];
  II: SeatClue[];
  ask: SeatAsk;
}

/** seats[i] = person at seat i. */
function seatOf(seats: readonly string[], x: string): number {
  return seats.indexOf(x);
}

/** Seat k places to the right (+) / left (−) of seat s, from the seated person's own view; −1 if off the row. */
function step(layout: SeatLayout, n: number, s: number, k: number, side: 'left' | 'right'): number {
  if (layout === 'linear') {
    const t = side === 'right' ? s + k : s - k;
    return t >= 0 && t < n ? t : -1;
  }
  // circular, facing centre: right = anticlockwise = decreasing clockwise index
  return (((side === 'right' ? s - k : s + k) % n) + n) % n;
}

function holds(layout: SeatLayout, seats: readonly string[], c: SeatClue): boolean {
  const n = seats.length;
  const p = (x: string) => seatOf(seats, x);
  const dist = (a: string, b: string) => {
    const d = Math.abs(p(a) - p(b));
    return layout === 'linear' ? d : Math.min(d, n - d);
  };
  switch (c.t) {
    case 'rel':
      return step(layout, n, p(c.b), c.k, c.side) === p(c.a);
    case 'adj':
      return dist(c.a, c.b) === 1;
    case 'nadj':
      return dist(c.a, c.b) !== 1;
    case 'gap':
      return Math.abs(p(c.a) - p(c.b)) - 1 === c.k;
    case 'end':
      return p(c.a) === 0 || p(c.a) === n - 1;
    case 'nend':
      return p(c.a) !== 0 && p(c.a) !== n - 1;
    case 'opp':
      return dist(c.a, c.b) === n / 2;
  }
}

function answerOf(layout: SeatLayout, seats: readonly string[], ask: SeatAsk): string {
  const n = seats.length;
  switch (ask.t) {
    case 'rel': {
      const t = step(layout, n, seatOf(seats, ask.of), ask.k, ask.side);
      return t < 0 ? '(nobody)' : seats[t];
    }
    case 'end':
      return ask.side === 'left' ? seats[0] : seats[n - 1];
    case 'middle':
      return seats[(n - 1) / 2];
    case 'opp':
      return seats[(seatOf(seats, ask.of) + n / 2) % n];
  }
}

function relWord(k: number, side: 'left' | 'right'): string {
  return k === 1 ? `to the immediate ${side} of` : `${ordinal(k)} to the ${side} of`;
}

export function seatClueText(c: SeatClue, layout: SeatLayout): string {
  switch (c.t) {
    case 'rel':
      return `${c.a} sits ${relWord(c.k, c.side)} ${c.b}.`;
    case 'adj':
      return `${c.a} sits next to ${c.b}.`;
    case 'nadj':
      return `${c.a} does not sit next to ${c.b}.`;
    case 'gap':
      return c.k === 0 ? `${c.a} and ${c.b} sit together.` : `Only ${NUM_WORD[c.k]} ${c.k === 1 ? 'person sits' : 'persons sit'} between ${c.a} and ${c.b}.`;
    case 'end':
      return `${c.a} sits at one of the extreme ends of the row.`;
    case 'nend':
      return `${c.a} does not sit at any extreme end of the row.`;
    case 'opp':
      return `${c.a} sits opposite ${c.b}.`;
  }
  void layout;
}

function askText(ask: SeatAsk): string {
  switch (ask.t) {
    case 'rel':
      return `Who sits ${relWord(ask.k, ask.side)} ${ask.of}?`;
    case 'end':
      return `Who sits at the extreme ${ask.side} end of the row?`;
    case 'middle':
      return 'Who sits exactly in the middle of the row?';
    case 'opp':
      return `Who sits opposite ${ask.of}?`;
  }
}

export function buildSeating(rng: Rng, d: Difficulty, target: Category): DsDraft<DsSeatingFacts> | null {
  const layout: SeatLayout = rng.chance(0.5) ? 'linear' : 'circular';
  const n =
    layout === 'linear'
      ? { easy: 5, medium: rng.int(5, 6), hard: 6, extreme: 7 }[d]
      : { easy: 5, medium: 6, hard: rng.int(6, 7), extreme: 8 }[d];
  const pool = rng.pick(['ABCDEFGH', 'PQRSTUVW', 'JKLMNOPQ', 'EFGHJKLM']);
  const people = pool.slice(0, n).split('');
  const truth = rng.shuffle(people);
  // circular: fix the first-listed person at seat 0 (rotation-free)
  const worlds: string[][] = [];
  if (layout === 'linear') for (const p of perms(n)) worlds.push(p.map((i) => people[i]));
  else {
    const rot = truth.indexOf(people[0]);
    const t2 = [...truth.slice(rot), ...truth.slice(0, rot)];
    truth.splice(0, n, ...t2);
    for (const p of perms(n - 1)) worlds.push([people[0], ...p.map((i) => people[i + 1])]);
  }
  const asks: SeatAsk[] = [];
  for (const of of people) for (const side of ['left', 'right'] as const) for (let k = 1; k <= (d === 'easy' ? 1 : 2); k++) {
    const ask: SeatAsk = { t: 'rel', of, k, side };
    if (answerOf(layout, truth, ask) !== '(nobody)') asks.push(ask);
  }
  if (layout === 'linear') {
    asks.push({ t: 'end', side: 'left' }, { t: 'end', side: 'right' });
    if (n % 2 === 1) asks.push({ t: 'middle' }, { t: 'middle' });
  } else if (n % 2 === 0) for (const of of people) asks.push({ t: 'opp', of });
  const ask = rng.pick(asks);

  const atoms: SeatClue[] = [];
  const p = (x: string) => truth.indexOf(x);
  for (const a of people)
    for (const b of people) {
      if (a === b) continue;
      for (const side of ['left', 'right'] as const)
        for (let k = 1; k <= 3; k++) if (step(layout, n, p(b), k, side) === p(a) && (k === 1 || rng.chance(0.6))) atoms.push({ t: 'rel', a, b, k, side });
      if (a < b) {
        const c1: SeatClue = { t: 'adj', a, b };
        if (holds(layout, truth, c1)) atoms.push(c1);
        else if (d !== 'easy' && rng.chance(0.35)) atoms.push({ t: 'nadj', a, b });
        if (layout === 'linear') {
          const k = Math.abs(p(a) - p(b)) - 1;
          if (k >= 1 && k <= 3) atoms.push({ t: 'gap', a, b, k });
        } else if (n % 2 === 0 && holds(layout, truth, { t: 'opp', a, b })) atoms.push({ t: 'opp', a, b });
      }
    }
  if (layout === 'linear')
    for (const a of people) {
      if (p(a) === 0 || p(a) === n - 1) atoms.push({ t: 'end', a });
      else if (d !== 'easy' && rng.chance(0.4)) atoms.push({ t: 'nend', a });
    }
  const sc: Scenario<SeatClue> = {
    atoms,
    key: (c) => JSON.stringify(c),
    answers(cl) {
      const out = new Set<string>();
      for (const s of worlds) if (cl.every((c) => holds(layout, s, c))) out.add(answerOf(layout, s, ask));
      return out;
    },
    ok: (ans) => !ans.has('(nobody)'),
  };
  const sizes = sizesFor(d, [1, 2], [2, 2], [2, 3], [2, 3]);
  const res = findPair(rng, sc, target, sizes, 45);
  if (!res) return null;
  const text = (cl: SeatClue[]) => rng.shuffle(cl).map((c) => seatClueText(c, layout)).join(' ');
  const say = (ans: Set<string>): string => {
    const xs = [...ans].sort();
    const what = askText(ask).replace(/^Who /, '').replace(/\?$/, '');
    return xs.length === 1 ? `only ${xs[0]} ${what}` : `${listOr(xs)} could be the one who ${what}`;
  };
  const fixed = worlds.filter((s) => [...res.I, ...res.II].every((c) => holds(layout, s, c)));
  let visual: VisualSpec | undefined;
  if (fixed.length === 1) {
    visual =
      layout === 'linear'
        ? { type: 'linear', rows: [{ seats: fixed[0].map((name) => ({ name, facing: 'north' as const })) }], caption: 'Arrangement fixed by I and II together' }
        : { type: 'circular', seats: fixed[0].map((name) => ({ name, facing: 'inside' as const })), caption: 'Arrangement fixed by I and II together' };
  }
  const context =
    layout === 'linear'
      ? `${CAP_NUM_WORD[n]} persons — ${listAnd(people)} — sit in a straight row facing north (not necessarily in the same order).`
      : `${CAP_NUM_WORD[n]} persons — ${listAnd(people)} — sit around a circular table facing the centre (not necessarily in the same order).`;
  return {
    facts: { kind: 'seating', layout, people, I: res.I, II: res.II, ask },
    context,
    question: askText(ask),
    I: text(res.I),
    II: text(res.II),
    say,
    shortcut:
      layout === 'circular'
        ? 'Facing the centre, right = anticlockwise. Fix one person, then try every seat the statement allows — one different answer is enough to reject.'
        : 'Facing north, right = your right. Draw the row and try each case a statement allows; stop as soon as two cases give different answers.',
    visual,
    tags: ['ds:seating', `seating:${layout}`],
    res,
  };
}
