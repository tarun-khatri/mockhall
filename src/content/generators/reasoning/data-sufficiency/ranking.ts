/**
 * DS on ranking / comparison: n persons with different heights (weights, marks). Worlds = every order of the
 * persons (index 0 = top). Answers are collected over all orders consistent with the statements.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty } from '../../../types';
import { ordinal } from '../../../../lib/format';
import { CAP_NUM_WORD, findPair, listAnd, listOr, perms, sizesFor, worldScenario, type Category, type DsDraft } from './common';

export type RankAttr = 'height' | 'weight' | 'marks';
export type RankClue =
  | { t: 'gt'; a: string; b: string }
  | { t: 'rank'; a: string; k: number; from: 'top' | 'bottom' }
  | { t: 'between'; a: string; lo: string; hi: string }
  | { t: 'not'; a: string; end: 'top' | 'bottom' };
export type RankAsk = { t: 'who'; k: number; from: 'top' | 'bottom' } | { t: 'count'; a: string } | { t: 'is-top'; a: string };

export interface DsRankingFacts {
  kind: 'ranking';
  attr: RankAttr;
  people: string[];
  I: RankClue[];
  II: RankClue[];
  ask: RankAsk;
}

const W: Record<RankAttr, { more: string; less: string; most: string; least: string; have: string }> = {
  height: { more: 'taller than', less: 'shorter than', most: 'tallest', least: 'shortest', have: 'has a different height' },
  weight: { more: 'heavier than', less: 'lighter than', most: 'heaviest', least: 'lightest', have: 'has a different weight' },
  marks: { more: 'scored more marks than', less: 'scored fewer marks than', most: 'highest scorer', least: 'lowest scorer', have: 'scored different marks in a test' },
};

function holds(order: readonly string[], c: RankClue): boolean {
  const r = (x: string) => order.indexOf(x);
  const n = order.length;
  switch (c.t) {
    case 'gt':
      return r(c.a) < r(c.b);
    case 'rank':
      return c.from === 'top' ? r(c.a) === c.k - 1 : r(c.a) === n - c.k;
    case 'between':
      return r(c.hi) < r(c.a) && r(c.a) < r(c.lo);
    case 'not':
      return c.end === 'top' ? r(c.a) !== 0 : r(c.a) !== n - 1;
  }
}

function answerOf(order: readonly string[], ask: RankAsk): string {
  if (ask.t === 'who') return ask.from === 'top' ? order[ask.k - 1] : order[order.length - ask.k];
  if (ask.t === 'count') return String(order.indexOf(ask.a));
  return order[0] === ask.a ? 'yes' : 'no';
}

function isVerb(attr: RankAttr): string {
  return attr === 'marks' ? '' : 'is ';
}

export function rankClueText(c: RankClue, attr: RankAttr, n: number): string {
  const w = W[attr];
  const is = isVerb(attr);
  switch (c.t) {
    case 'gt':
      return `${c.a} ${is}${w.more} ${c.b}.`;
    case 'rank': {
      if (c.k === 1) return `${c.a} is the ${c.from === 'top' ? w.most : w.least}.`;
      if (c.from === 'top') {
        const k = c.k - 1;
        return attr === 'marks'
          ? `Only ${CAP_NUM_WORD[k].toLowerCase()} ${k === 1 ? 'person' : 'persons'} scored more marks than ${c.a}.`
          : `Only ${CAP_NUM_WORD[k].toLowerCase()} ${k === 1 ? 'person is' : 'persons are'} ${w.more} ${c.a}.`;
      }
      const below = c.k - 1;
      if (below * 2 === n - 1 && n % 2 === 1) return `${c.a} is exactly in the middle when arranged by ${attr === 'marks' ? 'marks' : attr}.`;
      return `${c.a} is the ${ordinal(c.k)} ${w.least}.`;
    }
    case 'between':
      return attr === 'marks' ? `${c.a} scored more marks than ${c.lo} but fewer than ${c.hi}.` : `${c.a} is ${w.more} ${c.lo} but ${w.less} ${c.hi}.`;
    case 'not':
      return `${c.a} is not the ${c.end === 'top' ? w.most : w.least}.`;
  }
}

function askText(ask: RankAsk, attr: RankAttr, people: string[]): string {
  const w = W[attr];
  const among = `among ${listAnd(people)}`;
  if (ask.t === 'who') {
    const word = ask.from === 'top' ? w.most : w.least;
    return `Who is the ${ask.k > 1 ? ordinal(ask.k) + ' ' : ''}${word} ${among}?`;
  }
  if (ask.t === 'count') return attr === 'marks' ? `How many persons scored more marks than ${ask.a}?` : `How many persons are ${w.more} ${ask.a}?`;
  return `Is ${ask.a} the ${w.most} ${among}?`;
}

export function buildRanking(rng: Rng, d: Difficulty, target: Category): DsDraft<DsRankingFacts> | null {
  const n = d === 'easy' ? rng.int(4, 5) : d === 'medium' ? 5 : d === 'hard' ? 6 : rng.int(6, 7);
  const attr = rng.pick(['height', 'height', 'weight', 'marks'] as const);
  const w = W[attr];
  const pool = rng.pick(['PQRSTUV', 'ABCDEFG', 'JKLMNOP', 'EFGHJKL', 'LMNOPQR']);
  const people = pool.slice(0, n).split('');
  const truth = rng.shuffle(people);
  const orders = perms(n).map((p) => p.map((i) => people[i]));
  const r = rng.next();
  const ask: RankAsk =
    d === 'easy' || r < 0.55
      ? { t: 'who', k: d === 'easy' ? 1 : rng.pick([1, 1, 2, 2, 3].filter((k) => k < n)), from: rng.pick(['top', 'bottom'] as const) }
      : r < 0.8
        ? { t: 'count', a: rng.pick(people) }
        : { t: 'is-top', a: rng.chance(0.5) ? truth[0] : rng.pick(truth.slice(1)) };
  const atoms: RankClue[] = [];
  const pos = (x: string) => truth.indexOf(x);
  for (const a of people)
    for (const b of people) if (a !== b && pos(a) < pos(b) && pos(b) - pos(a) <= (d === 'easy' ? 2 : 3)) atoms.push({ t: 'gt', a, b });
  for (let i = 0; i < n; i++) {
    if (i < 3) atoms.push({ t: 'rank', a: truth[i], k: i + 1, from: 'top' });
    if (n - i <= 2) atoms.push({ t: 'rank', a: truth[i], k: n - i, from: 'bottom' });
  }
  if (d !== 'easy') {
    for (let i = 1; i < n - 1; i++) atoms.push({ t: 'between', a: truth[i], lo: truth[Math.min(n - 1, i + rng.int(1, 2))], hi: truth[Math.max(0, i - rng.int(1, 2))] });
    for (let i = 1; i < n; i++) if (rng.chance(0.4)) atoms.push({ t: 'not', a: truth[i], end: 'top' });
    for (let i = 0; i < n - 1; i++) if (rng.chance(0.3)) atoms.push({ t: 'not', a: truth[i], end: 'bottom' });
  }
  const sc = worldScenario<RankClue>(orders.length, atoms, (c) => JSON.stringify(c), (c, w) => holds(orders[w], c), (w) => answerOf(orders[w], ask));
  const sizes = sizesFor(d, [1, 2], [1, 2], [2, 3], [2, 3]);
  const res = findPair(rng, sc, target, sizes, 45);
  if (!res) return null;
  const text = (cl: RankClue[]) => rng.shuffle(cl).map((c) => rankClueText(c, attr, n)).join(' ');
  const say = (ans: Set<string>): string => {
    const xs = [...ans].sort();
    if (ask.t === 'who') {
      const word = `the ${ask.k > 1 ? ordinal(ask.k) + ' ' : ''}${ask.from === 'top' ? w.most : w.least}`;
      return xs.length === 1 ? `${xs[0]} is ${word}` : `${word} could be ${listOr(xs)}`;
    }
    if (ask.t === 'count') return xs.length === 1 ? `exactly ${xs[0]} ${xs[0] === '1' ? 'person is' : 'persons are'} above ${ask.a}` : `the number above ${ask.a} could be ${listOr(xs)}`;
    return xs.length === 1 ? `the answer is definitely “${xs[0]}”` : `${ask.a} may or may not be the ${w.most}`;
  };
  const unique = orders.filter((o) => [...res.I, ...res.II].every((c) => holds(o, c)));
  return {
    facts: { kind: 'ranking', attr, people, I: res.I, II: res.II, ask },
    context: `${CAP_NUM_WORD[n]} persons — ${listAnd(people)} — each ${w.have}.`,
    question: askText(ask, attr, people),
    I: text(res.I),
    II: text(res.II),
    say,
    shortcut: 'Write the persons in a column from the top and place each clue; only the asked position needs to be fixed, not the whole order.',
    visual: unique.length === 1 ? { type: 'order', items: unique[0], label: `${w.most[0].toUpperCase() + w.most.slice(1)} → ${w.least}`, caption: 'Order fixed by I and II together' } : undefined,
    tags: ['ds:ranking', `ranking:${attr}`],
    res,
  };
}
