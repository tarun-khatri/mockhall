/**
 * Word-based single questions: letters rearranged alphabetically (how many stay in place / which letter lands
 * where) and letter pairs with as many letters between them in the word as in the English alphabet.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, Rich } from '../../../types';
import type { QuestionDraft } from '../../shared/question';
import { ordinal } from '../../../../lib/format';
import { targetSeconds } from '../../../targets';
import { COUNT_OPTIONS, countCategory, countChoices, pickDistractors, shuffledOptions } from './common';
import { HOSTS } from './lexicon';

/* ------------------------------------------------------------------ */
/* Rearrangement                                                        */
/* ------------------------------------------------------------------ */

export type RearrangeVariant =
  | { v: 'same'; order: 'alpha' | 'reverse' | 'halves' }
  | { v: 'position'; order: 'alpha' | 'reverse'; from: 'left' | 'right'; m: number; k?: number; dir?: 'left' | 'right' };

export interface WordRearrangeFacts {
  kind: 'word-rearrange';
  word: string;
  variant: RearrangeVariant;
}

export function rearranged(word: string, order: 'alpha' | 'reverse' | 'halves'): string[] {
  const a = word.split('');
  if (order === 'alpha') return a.slice().sort();
  if (order === 'reverse') return a.slice().sort().reverse();
  const h = a.length / 2;
  return [...a.slice(0, h).sort(), ...a.slice(h).sort().reverse()];
}

function sameCount(word: string, order: 'alpha' | 'reverse' | 'halves'): number[] {
  const r = rearranged(word, order);
  const out: number[] = [];
  for (let i = 0; i < word.length; i++) if (r[i] === word[i]) out.push(i);
  return out;
}

const LEN_RANGE: Record<Difficulty, [number, number]> = { easy: [6, 8], medium: [8, 10], hard: [9, 11], extreme: [10, 14] };

function poolByLength(d: Difficulty, widen = 0, filter: (w: string) => boolean = () => true): string[] {
  const [lo, hi] = LEN_RANGE[d];
  return HOSTS.filter((w) => w.length >= lo - widen && w.length <= hi + widen && filter(w));
}

const ORDER_TEXT = {
  alpha: 'alphabetical order',
  reverse: 'reverse alphabetical order',
} as const;

function sameQuestion(rng: Rng, d: Difficulty): { facts: WordRearrangeFacts; draft: Omit<QuestionDraft, 'subtype' | 'difficulty'> } {
  const orders: ('alpha' | 'reverse' | 'halves')[] =
    d === 'easy' ? ['alpha'] : d === 'medium' ? ['alpha', 'alpha', 'reverse'] : d === 'hard' ? ['alpha', 'reverse', 'halves'] : ['reverse', 'halves'];
  const order = rng.pick(orders);
  const target = rng.int(0, 4);
  let word = '';
  for (let widen = 0; widen <= 4 && !word; widen++) {
    const pool = poolByLength(d, widen, (w) => (order !== 'halves' || w.length % 2 === 0) && countCategory(sameCount(w, order).length) === target);
    if (pool.length) word = rng.pick(pool);
  }
  if (!word) throw new Error('word-rearrange: empty pool');
  const r = rearranged(word, order);
  const same = sameCount(word, order);
  const choices = countChoices(same.length);
  const h = word.length / 2;
  const how =
    order === 'halves'
      ? `the first ${h} letters of the word '${word}' are arranged in alphabetical order and the last ${h} letters in reverse alphabetical order (from left to right)`
      : `all the letters of the word '${word}' are arranged in ${ORDER_TEXT[order]} from left to right`;
  const prompt = `If ${how}, how many letters will remain at the same position as in the original word?`;
  const steps: Rich[] = [
    `Original:  ${word.split('').join(' ')}`,
    `New order: ${r.join(' ')}`,
    same.length
      ? `Same position: ${same.map((i) => `${word[i]} (${ordinal(i + 1)})`).join(', ')}.`
      : 'No letter is at its old position.',
    `Count = ${same.length} → **${COUNT_OPTIONS[choices.answerIndex]}**.`,
  ];
  // trap: a letter that is only one place away
  let trap: Rich | undefined;
  for (let i = 0; i < word.length && !trap; i++) {
    if (r[i] === word[i]) continue;
    if (r[i + 1] === word[i] || r[i - 1] === word[i]) trap = `${word[i]} moves only one place (${ordinal(i + 1)} → ${ordinal(r.indexOf(word[i]) + 1)}) — it does not count.`;
  }
  return {
    facts: { kind: 'word-rearrange', word, variant: { v: 'same', order } },
    draft: {
      prompt,
      ...choices,
      solution: {
        steps,
        shortcut: 'Write the new order directly under the word and compare column by column.',
        ...(trap ? { trap } : {}),
      },
      tags: ['series:letter-rearrangement', `series:${order === 'halves' ? 'halves-order' : order === 'alpha' ? 'alphabetical-order' : 'reverse-alphabetical'}`],
      targetSeconds: targetSeconds('short-reasoning', d),
    },
  };
}

function positionQuestion(rng: Rng, d: Difficulty): { facts: WordRearrangeFacts; draft: Omit<QuestionDraft, 'subtype' | 'difficulty'> } {
  const order: 'alpha' | 'reverse' = d === 'easy' || rng.chance(0.6) ? 'alpha' : 'reverse';
  const relative = d === 'hard' || d === 'extreme';
  for (let tries = 0; tries < 50; tries++) {
    const pool = poolByLength(d, 0, (w) => new Set(w).size === w.length || d !== 'easy');
    const word = rng.pick(pool);
    const r = rearranged(word, order);
    const n = word.length;
    const from = rng.pick(['left', 'right'] as const);
    const m = rng.int(2, n - 2);
    const base = from === 'left' ? m - 1 : n - m;
    let t = base;
    let k: number | undefined;
    let dir: 'left' | 'right' | undefined;
    if (relative) {
      k = rng.int(2, 5);
      dir = rng.pick(['left', 'right'] as const);
      t = base + (dir === 'right' ? k : -k);
      if (t < 0 || t >= n) continue;
    }
    const correct = r[t];
    const wrongEnd = (from === 'left' ? n - m : m - 1) + (relative ? (dir === 'right' ? k! : -k!) : 0);
    const cand: string[] = [];
    if (word[t] !== correct) cand.push(word[t]);
    for (const i of [wrongEnd, t + 1, t - 1, relative ? base + (dir === 'right' ? -k! : k!) : -1]) if (i >= 0 && i < n) cand.push(r[i]);
    let distractors: string[];
    try {
      distractors = pickDistractors(rng, correct, cand, r);
    } catch {
      continue;
    }
    const choices = shuffledOptions(rng, correct, distractors);
    const where = relative ? `the ${ordinal(k!)} letter to the ${dir} of the ${ordinal(m)} letter from the ${from} end` : `the ${ordinal(m)} letter from the ${from} end`;
    const steps: Rich[] = [`New order (${ORDER_TEXT[order]}): ${r.join(' ')}`];
    const baseL = from === 'left' ? m : n - m + 1;
    if (from === 'right') steps.push(`${ordinal(m)} from the right = ${n} − ${m} + 1 = ${ordinal(baseL)} from the left (${r[base]}).`);
    else steps.push(`${ordinal(m)} from the left = ${r[base]}.`);
    if (relative) steps.push(`${ordinal(k!)} to the ${dir}: ${baseL} ${dir === 'right' ? '+' : '−'} ${k} = ${ordinal(t + 1)} from the left.`);
    steps.push(`Answer: **${correct}**.`);
    return {
      facts: { kind: 'word-rearrange', word, variant: { v: 'position', order, from, m, ...(relative ? { k, dir } : {}) } },
      draft: {
        prompt: `If all the letters of the word '${word}' are arranged in ${ORDER_TEXT[order]} from left to right, which of the following will be ${where}?`,
        ...choices,
        solution: {
          steps,
          shortcut: 'Write the letters in the new order once; then count on that line only.',
          ...(word[t] !== correct ? { trap: `${word[t]} is at that position in the original word — rearrange first.` } : {}),
        },
        tags: ['series:letter-rearrangement', 'series:position-from-end'],
        targetSeconds: targetSeconds('short-reasoning', d),
      },
    };
  }
  throw new Error('word-rearrange: position question failed');
}

export function buildWordRearrange(rng: Rng, d: Difficulty): { facts: WordRearrangeFacts; draft: Omit<QuestionDraft, 'subtype' | 'difficulty'> } {
  const pos = d === 'easy' ? 0.35 : d === 'medium' ? 0.3 : 0.3;
  return rng.chance(pos) ? positionQuestion(rng, d) : sameQuestion(rng, d);
}

/* ------------------------------------------------------------------ */
/* Letter pairs                                                         */
/* ------------------------------------------------------------------ */

export type PairMode = 'both' | 'forward' | 'backward';

export interface LetterPairsFacts {
  kind: 'letter-pairs';
  word: string;
  mode: PairMode;
}

const A = (c: string) => c.charCodeAt(0) - 64;

export function letterPairs(word: string, mode: PairMode): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < word.length; i++)
    for (let j = i + 1; j < word.length; j++) {
      const da = A(word[j]) - A(word[i]);
      if (Math.abs(da) !== j - i) continue;
      if (mode === 'forward' && da < 0) continue;
      if (mode === 'backward' && da > 0) continue;
      out.push([i, j]);
    }
  return out;
}

/** True when no pair that counts (in any direction) involves a repeated letter — avoids the "count once or twice" dispute. */
function pairsUnambiguous(word: string): boolean {
  const count = (c: string) => word.split('').filter((x) => x === c).length;
  return letterPairs(word, 'both').every(([i, j]) => count(word[i]) === 1 && count(word[j]) === 1);
}

const MODE_TEXT: Record<PairMode, string> = {
  both: 'both forward and backward directions',
  forward: 'forward direction only, i.e. the letter on the left comes earlier in the English alphabet',
  backward: 'backward direction only, i.e. the letter on the left comes later in the English alphabet',
};

export function buildLetterPairs(rng: Rng, d: Difficulty): { facts: LetterPairsFacts; draft: Omit<QuestionDraft, 'subtype' | 'difficulty'> } {
  const mode: PairMode = d === 'hard' ? rng.pick(['both', 'forward', 'backward'] as const) : d === 'extreme' ? rng.pick(['both', 'forward', 'backward'] as const) : 'both';
  const target = rng.int(0, 4);
  let word = '';
  for (let widen = 0; widen <= 5 && !word; widen++) {
    const pool = poolByLength(d, widen, (w) => pairsUnambiguous(w) && countCategory(letterPairs(w, mode).length) === target);
    if (pool.length) word = rng.pick(pool);
  }
  if (!word) throw new Error('letter-pairs: empty pool');
  const pairs = letterPairs(word, mode);
  const choices = countChoices(pairs.length);
  const steps: Rich[] = [`Alphabet positions: ${word.split('').map((c) => `${c}=${A(c)}`).join(', ')}`];
  for (const [i, j] of pairs) {
    const between = j - i - 1;
    steps.push(
      between === 0
        ? `${word[i]}${word[j]}: next to each other in the word and in the alphabet ✓`
        : `${word[i]}…${word[j]}: ${between} letter${between > 1 ? 's' : ''} between in the word (${word.slice(i + 1, j)}) and ${between} in the alphabet ✓`,
    );
  }
  steps.push(`Pairs = ${pairs.length} → **${COUNT_OPTIONS[choices.answerIndex]}**.`);
  const other = mode === 'both' ? [] : letterPairs(word, mode === 'forward' ? 'backward' : 'forward');
  const trap: Rich =
    mode === 'both'
      ? 'Count a pair in either order — e.g. both "PR" (forward) and "RP" (backward) qualify; letters standing side by side that are also neighbours in the alphabet count too.'
      : `${other.length ? `${other.map(([i, j]) => word[i] + word[j]).join(', ')} ${other.length > 1 ? 'are' : 'is'} in the other direction — ` : ''}count only the ${mode} direction as the question says.`;
  return {
    facts: { kind: 'letter-pairs', word, mode },
    draft: {
      prompt: `How many such pairs of letters are there in the word '${word}', each of which has as many letters between them in the word as they have between them in the English alphabetical series (${MODE_TEXT[mode]})?`,
      ...choices,
      solution: {
        steps,
        shortcut: 'Write each letter\'s alphabet number under the word; a pair counts when the difference of the numbers equals the difference of the positions. Check each letter only against the letters to its right.',
        trap,
      },
      tags: ['series:letter-pairs', `series:pairs-${mode}`],
      targetSeconds: targetSeconds('short-reasoning', d),
    },
  };
}
