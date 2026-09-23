/**
 * Comparison ordering asked as one question (height / weight / marks): "Who is the second heaviest?",
 * "How many persons are taller than R?". Clues are drawn from a hidden true order until the asked fact is fixed;
 * "Cannot be determined" (always option E) is correct only when two orders consistent with every clue give
 * different answers (checked by enumerating all orders).
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, Rich, VisualSpec } from '../../../types';
import type { QuestionDraft } from '../../shared/question';
import { ordinal } from '../../../../lib/format';
import { targetSeconds } from '../../../targets';
import { CBD } from './row';

export type Attr = 'height' | 'weight' | 'marks';
export type CmpClue =
  | { t: 'gt'; a: string; b: string }
  | { t: 'between'; a: string; lo: string; hi: string }
  | { t: 'rank'; a: string; k: number; from: 'top' | 'bottom' }
  | { t: 'only'; a: string; b: string }
  | { t: 'not'; a: string; end: 'top' | 'bottom' };
export type CmpAsk = { t: 'who'; k: number; from: 'top' | 'bottom' } | { t: 'count'; a: string; dir: 'above' | 'below' };

export interface CompareFacts {
  kind: 'compare';
  attr: Attr;
  people: string[];
  clues: CmpClue[];
  ask: CmpAsk;
}

const WORDS: Record<Attr, { more: string; less: string; most: string; least: string }> = {
  height: { more: 'taller than', less: 'shorter than', most: 'tallest', least: 'shortest' },
  weight: { more: 'heavier than', less: 'lighter than', most: 'heaviest', least: 'lightest' },
  marks: { more: 'scored more marks than', less: 'scored fewer marks than', most: 'highest scorer', least: 'lowest scorer' },
};

/** rank index: 0 = top. */
function holds(order: readonly string[], c: CmpClue): boolean {
  const r = (x: string) => order.indexOf(x);
  const n = order.length;
  switch (c.t) {
    case 'gt':
      return r(c.a) < r(c.b);
    case 'between':
      return r(c.hi) < r(c.a) && r(c.a) < r(c.lo);
    case 'rank':
      return c.from === 'top' ? r(c.a) === c.k - 1 : r(c.a) === n - c.k;
    case 'only':
      return r(c.a) === n - 2 && r(c.b) === n - 1;
    case 'not':
      return c.end === 'top' ? r(c.a) !== 0 : r(c.a) !== n - 1;
  }
}

function perms(xs: readonly string[]): string[][] {
  if (xs.length <= 1) return [xs.slice()];
  const out: string[][] = [];
  xs.forEach((x, i) => {
    for (const p of perms([...xs.slice(0, i), ...xs.slice(i + 1)])) out.push([x, ...p]);
  });
  return out;
}

function answerOf(order: readonly string[], q: CmpAsk): string {
  if (q.t === 'who') return q.from === 'top' ? order[q.k - 1] : order[order.length - q.k];
  const i = order.indexOf(q.a);
  return String(q.dir === 'above' ? i : order.length - 1 - i);
}

function clueText(c: CmpClue, w: (typeof WORDS)[Attr], attr: Attr): string {
  switch (c.t) {
    case 'gt':
      return `${c.a} ${w.more} ${c.b}.`.replace(/^(\w+) scored/, '$1 scored');
    case 'between':
      return `${c.a} is ${attr === 'marks' ? 'placed below ' + c.hi + ' but above ' + c.lo : `${w.more} ${c.lo} but ${w.less} ${c.hi}`}.`;
    case 'rank':
      if (c.k === 1) return `${c.a} is the ${c.from === 'top' ? w.most : w.least}.`;
      return c.from === 'top'
        ? `Only ${c.k - 1} ${c.k - 1 === 1 ? 'person is' : 'persons are'} ${attr === 'marks' ? 'ahead of' : w.more} ${c.a}.`
        : `${c.a} is the ${ordinal(c.k)} ${w.least}.`;
    case 'only':
      return attr === 'marks' ? `${c.a} scored more marks than only ${c.b}.` : `${c.a} is ${w.more} only ${c.b}.`;
    case 'not':
      return `${c.a} is not the ${c.end === 'top' ? w.most : w.least}.`;
  }
}

function fixVerb(s: string, attr: Attr): string {
  // "P taller than Q." → "P is taller than Q."; marks already has a verb
  return attr === 'marks' ? s : s.replace(/^(\w+) (taller|shorter|heavier|lighter)/, '$1 is $2');
}

type Draft = Omit<QuestionDraft, 'subtype' | 'difficulty'>;

export function buildCompare(rng: Rng, d: Difficulty): { facts: CompareFacts; draft: Draft } {
  const n = d === 'easy' ? 5 : d === 'medium' ? rng.int(5, 6) : d === 'hard' ? 6 : 7;
  const attr: Attr = rng.pick(['height', 'weight', 'marks'] as const);
  const w = WORDS[attr];
  const all = perms('PQRSTUV'.slice(0, n).split(''));
  const wantCbd = rng.chance(0.18);
  for (let attempt = 0; attempt < 200; attempt++) {
    const people = rng.shuffle('ABCDEFGHJKLMPQRSTUVW'.split('')).slice(0, n).sort();
    const truth = rng.shuffle(people);
    const ask: CmpAsk =
      d === 'hard' || d === 'extreme'
        ? rng.chance(0.35)
          ? { t: 'count', a: rng.pick(truth.slice(1, -1)), dir: rng.pick(['above', 'below'] as const) }
          : { t: 'who', k: rng.int(2, Math.min(3, n - 1)), from: rng.pick(['top', 'bottom'] as const) }
        : { t: 'who', k: rng.int(1, 3), from: rng.pick(['top', 'bottom'] as const) };
    // candidate true clues
    const pool: CmpClue[] = [];
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) if (j - i <= 3) pool.push({ t: 'gt', a: truth[i], b: truth[j] });
    for (let i = 1; i < n - 1; i++) pool.push({ t: 'between', a: truth[i], lo: truth[i + rng.int(1, Math.min(2, n - 1 - i))], hi: truth[i - 1] });
    for (let i = 0; i < n; i++) if (rng.chance(0.4)) pool.push(rng.chance(0.5) ? { t: 'rank', a: truth[i], k: i + 1, from: 'top' } : { t: 'rank', a: truth[i], k: n - i, from: 'bottom' });
    pool.push({ t: 'only', a: truth[n - 2], b: truth[n - 1] });
    for (let i = 1; i < n; i++) if (rng.chance(0.25)) pool.push({ t: 'not', a: truth[i], end: 'top' });
    for (let i = 0; i < n - 1; i++) if (rng.chance(0.25)) pool.push({ t: 'not', a: truth[i], end: 'bottom' });
    const clues: CmpClue[] = [];
    let live = all.map((p) => p.map((x) => people['PQRSTUV'.indexOf(x)]));
    const answers = () => new Set(live.map((o) => answerOf(o, ask)));
    const maxClues = d === 'easy' ? 4 : d === 'medium' ? 5 : d === 'hard' ? 6 : 7;
    for (const c of rng.shuffle(pool)) {
      if (clues.length >= maxClues) break;
      const next = live.filter((o) => holds(o, c));
      if (next.length === live.length) continue; // adds nothing
      const nextAns = new Set(next.map((o) => answerOf(o, ask)));
      if (wantCbd && nextAns.size === 1) continue; // keep it undetermined
      clues.push(c);
      live = next;
      if (!wantCbd && nextAns.size === 1) break;
      if (wantCbd && nextAns.size === 2 && clues.length >= Math.min(3, maxClues - 1)) break;
    }
    // drop clues implied by the others (e.g. "G is heavier than B" beside "G is heavier than only B")
    const base = all.map((p) => p.map((x) => people['PQRSTUV'.indexOf(x)]));
    for (let i = clues.length - 1; i >= 0; i--) {
      const rest = clues.filter((_, j) => j !== i);
      if (base.filter((o) => rest.every((c) => holds(o, c))).length === live.length) clues.splice(i, 1);
    }
    const ans = answers();
    if (clues.length < (d === 'easy' ? 3 : 4)) continue;
    if (wantCbd ? ans.size !== 2 : ans.size !== 1) continue;
    const truthAns = answerOf(truth, ask);
    // options
    let options: string[];
    let answerIndex: number;
    if (ask.t === 'who') {
      const poss = [...ans];
      const near = [truth[truth.indexOf(truthAns) - 1], truth[truth.indexOf(truthAns) + 1]].filter((x): x is string => !!x);
      const pickFrom = [...poss, ...near, ...rng.shuffle(people)].filter((x, i, a) => a.indexOf(x) === i && (wantCbd || x !== truthAns));
      const four = wantCbd ? pickFrom.slice(0, 4) : pickFrom.slice(0, 3);
      if (wantCbd) {
        options = [...rng.shuffle(four), CBD];
        answerIndex = 4;
      } else {
        answerIndex = rng.int(0, 3);
        const sh = rng.shuffle(four);
        sh.splice(answerIndex, 0, truthAns);
        options = [...sh, CBD];
      }
    } else {
      const val = Number(truthAns);
      const slot = rng.int(0, 3);
      let lo = val - slot;
      if (wantCbd) lo = Math.min(...[...ans].map(Number)) - rng.int(0, 1);
      if (lo < 0) lo = 0;
      if (lo + 3 > n - 1) lo = Math.max(0, n - 4);
      const nums = [lo, lo + 1, lo + 2, lo + 3].map(String);
      if (!wantCbd && !nums.includes(truthAns)) continue;
      if (wantCbd && ![...ans].every((a) => nums.includes(a))) continue;
      options = [...nums.map((x) => (x === '0' ? 'None' : x)), CBD];
      answerIndex = wantCbd ? 4 : nums.indexOf(truthAns);
    }
    const q =
      ask.t === 'who'
        ? `Who is the ${['', '', 'second ', 'third '][ask.k]}${ask.from === 'top' ? w.most : w.least}?`
        : attr === 'marks'
          ? `How many persons scored ${ask.dir === 'above' ? 'more' : 'fewer'} marks than ${ask.a}?`
          : `How many persons are ${ask.dir === 'above' ? w.more : w.less} ${ask.a}?`;
    const topWord = attr === 'marks' ? 'highest' : w.most;
    const intro = `${people.length === 5 ? 'Five' : people.length === 6 ? 'Six' : 'Seven'} persons — ${people.join(', ')} — ${attr === 'height' ? 'have different heights' : attr === 'weight' ? 'have different weights' : 'scored different marks in a test'}.`;
    const body = rng.shuffle(clues).map((c) => fixVerb(clueText(c, w, attr), attr));
    const shownOrder = live[0];
    const steps: Rich[] = [
      ...clues.map((c) => `${fixVerb(clueText(c, w, attr), attr)}`),
      live.length === 1 ? `Only one order fits: ${live[0].join(' > ')} (${topWord} first).` : `Orders that fit every clue: ${live.slice(0, 4).map((o) => o.join(' > ')).join('; ')}${live.length > 4 ? ' …' : ''}`,
      wantCbd ? `The answer can be ${[...ans].join(' or ')} → **${CBD}**.` : `In every possible order the answer is **${options[answerIndex]}**.`,
    ];
    const visual: VisualSpec = { type: 'order', items: shownOrder, label: `${topWord[0].toUpperCase() + topWord.slice(1)} → ${w.least}`, ...(live.length > 1 ? { caption: 'One order consistent with all clues; some positions can change' } : {}) };
    return {
      facts: { kind: 'compare', attr, people, clues, ask },
      draft: {
        prompt: `${intro}\n${body.join('\n')}\n\n${q}`,
        options,
        answerIndex,
        solution: {
          steps,
          shortcut: 'Start with the clues that fix an exact rank (tallest, "only one person is …", "… than only …"), then place the "between" clues.',
          trap: wantCbd ? `Both ${[...ans].join(' and ')} fit all the clues — picking one is a guess.` : `Check every clue, not just the first ones — the ${ask.t === 'who' ? 'neighbouring' : 'nearby'} position is the usual slip.`,
          visual,
        },
        tags: ['ranking:comparison', ...(wantCbd ? ['ranking:cannot-determine'] : [])],
        targetSeconds: targetSeconds('short-reasoning', d),
      },
    };
  }
  throw new Error('comparison: could not build');
}
