/**
 * Meaningful-word questions: how many English words can be formed from given letters (or from letters at given
 * positions of a word), and the classic "only one word → which letter; none → X; more than one → M" style.
 * Answers come only from the curated anagram families in ./lexicon (validated offline against a large word list).
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, Rich } from '../../../types';
import type { QuestionDraft } from '../../shared/question';
import { ordinal } from '../../../../lib/format';
import { targetSeconds } from '../../../targets';
import { COUNT_OPTIONS, countChoices } from './common';
import { FAMILIES, HOSTS, NONE_SETS, letterKey } from './lexicon';

export type MeaningfulForm =
  | { form: 'count-letters'; letters: string[] }
  | { form: 'positions-count'; host: string; positions: number[] }
  /** codes = [answer when no word can be formed, answer when more than one word can be formed] */
  | { form: 'positions-letter'; host: string; positions: number[]; from: 'left' | 'right'; k: number; codes: [string, string] };

/** Code-letter pairs used by recent papers for "no word" / "more than one word". */
const CODE_PAIRS: [string, string][] = [
  ['X', 'Y'],
  ['X', 'Z'],
  ['Y', 'Z'],
  ['X', 'M'],
];

export type MeaningfulFacts = { kind: 'meaningful-word'; lexicon: string[] } & MeaningfulForm;

const FAMILY_BY_KEY = new Map<string, readonly string[]>(FAMILIES.map((f) => [letterKey(f[0]), f]));

function lexiconOfLength(n: number): string[] {
  return FAMILIES.flat().filter((w) => w.length === n);
}

/** Letter-set keys (sorted) for a count category and size, avoiding the letters in `exclude`. */
function keysFor(category: number, size: number, exclude: string): string[] {
  const ok = (k: string) => k.length === size && ![...exclude].some((c) => k.includes(c));
  if (category === 0) return NONE_SETS.filter(ok);
  return FAMILIES.filter((f) => ok(letterKey(f[0])) && (category === 4 ? f.length >= 4 : f.length === category)).map((f) => letterKey(f[0]));
}

function hostsContaining(key: string): string[] {
  const need = new Map<string, number>();
  for (const c of key) need.set(c, (need.get(c) ?? 0) + 1);
  return HOSTS.filter((h) => {
    for (const [c, n] of need) if (h.split(c).length - 1 < n) return false;
    return true;
  });
}

/** Random distinct positions (1-based, ascending) in `host` holding exactly the letters of `key`. */
function placeLetters(rng: Rng, host: string, key: string): number[] | null {
  const used = new Set<number>();
  const out: number[] = [];
  for (const c of rng.shuffle(key.split(''))) {
    const spots = host.split('').map((x, i) => (x === c && !used.has(i) ? i : -1)).filter((i) => i >= 0);
    if (!spots.length) return null;
    const i = rng.pick(spots);
    used.add(i);
    out.push(i + 1);
  }
  return out.sort((a, b) => a - b);
}

function listPositions(ps: readonly number[]): string {
  const o = ps.map(ordinal);
  return o.length === 1 ? o[0] : `${o.slice(0, -1).join(', ')} and ${o[o.length - 1]}`;
}

function wordsFor(key: string): readonly string[] {
  return FAMILY_BY_KEY.get(key) ?? [];
}

function pickSetFromHost(rng: Rng, category: number, size: number, exclude: string, minHostLen: number): { key: string; host: string; positions: number[] } | null {
  const keys = rng.shuffle(keysFor(category, size, exclude));
  for (const key of keys.slice(0, 40)) {
    const hosts = hostsContaining(key).filter((h) => h.length >= minHostLen);
    if (!hosts.length) continue;
    const host = rng.pick(hosts);
    const positions = placeLetters(rng, host, key);
    if (positions) return { key, host, positions };
  }
  return null;
}

type Draft = Omit<QuestionDraft, 'subtype' | 'difficulty'>;

function solutionForCount(letters: readonly string[], found: readonly string[], lead: Rich[]): Rich[] {
  return [
    ...lead,
    `Letters: ${letters.join(', ')}.`,
    found.length ? `Meaningful words: ${found.join(', ')}.` : 'No arrangement of these letters is an English word.',
    `Count = ${found.length} → **${COUNT_OPTIONS[Math.min(found.length, 4)]}**.`,
  ];
}

function countLetters(rng: Rng, d: Difficulty, size: number): { facts: MeaningfulFacts; draft: Draft } {
  const target = rng.int(0, 4);
  const key = rng.pick(keysFor(target, size, ''));
  const found = wordsFor(key);
  let letters = rng.shuffle(key.split(''));
  for (let i = 0; i < 10 && found.includes(letters.join('')); i++) letters = rng.shuffle(key.split(''));
  const choices = countChoices(found.length);
  return {
    facts: { kind: 'meaningful-word', form: 'count-letters', letters, lexicon: lexiconOfLength(size) },
    draft: {
      prompt: `How many meaningful English words can be formed with the letters ${letters.join(', ')}, using each letter only once in each word?`,
      ...choices,
      solution: {
        steps: solutionForCount(letters, found, []),
        shortcut: 'Fix the vowel(s) first and try common consonant clusters around them — most letter sets give at most one or two everyday words.',
        trap: found.length >= 2 ? `Stopping at the first word (${found[0]}) gives "One" — keep checking other arrangements.` : found.length === 1 ? `Proper nouns and abbreviations do not count as meaningful words.` : 'A pronounceable string is not a word — it must be an actual English word.',
      },
      tags: ['series:meaningful-word', 'vocab:anagram'],
      targetSeconds: targetSeconds('short-reasoning', d),
    },
  };
}

function positionsCount(rng: Rng, d: Difficulty, size: number, minHostLen: number): { facts: MeaningfulFacts; draft: Draft } | null {
  const target = rng.int(0, 4);
  const pick = pickSetFromHost(rng, target, size, '', minHostLen);
  if (!pick) return null;
  const { key, host, positions } = pick;
  const found = wordsFor(key);
  const letters = positions.map((p) => host[p - 1]);
  const choices = countChoices(found.length);
  return {
    facts: { kind: 'meaningful-word', form: 'positions-count', host, positions, lexicon: lexiconOfLength(size) },
    draft: {
      prompt: `How many meaningful English words can be formed with the ${listPositions(positions)} letters of the word '${host}', using each letter only once in each word?`,
      ...choices,
      solution: {
        steps: solutionForCount(letters, found, [`${host}: ${positions.map((p) => `${ordinal(p)} = ${host[p - 1]}`).join(', ')}.`]),
        shortcut: 'Pick out the letters first (number the word once), then look for words starting with a consonant–vowel pair.',
        trap: found.length >= 2 ? `Finding ${found[0]} and stopping gives "One".` : 'Recount the positions — one slip changes the letter set completely.',
      },
      tags: ['series:meaningful-word', 'vocab:anagram'],
      targetSeconds: targetSeconds('short-reasoning', d),
    },
  };
}

function positionsLetter(rng: Rng, d: Difficulty, size: number, minHostLen: number): { facts: MeaningfulFacts; draft: Draft } | null {
  const target = rng.int(0, 4); // 0–2: a letter of the only word, 3: "none" code, 4: "more than one" code
  const category = target <= 2 ? 1 : target === 3 ? 0 : rng.pick([2, 3, 4]);
  const codes = rng.pick(CODE_PAIRS);
  const [noneCode, manyCode] = codes;
  const pick = pickSetFromHost(rng, category, size, noneCode + manyCode, minHostLen);
  if (!pick) return null;
  const { key, host, positions } = pick;
  const found = wordsFor(key);
  const from = rng.pick(['left', 'right'] as const);
  const k = rng.int(1, size - 1);
  const letters = positions.map((p) => host[p - 1]);
  let options: string[];
  let answerIndex: number;
  if (target <= 2) {
    const w = found[0];
    const at = (i: number) => w[from === 'left' ? i - 1 : w.length - i];
    const correct = at(k);
    const others: string[] = [];
    for (const c of [w[from === 'left' ? w.length - k : k - 1], at(k + 1), at(k - 1), ...w]) if (c && c !== correct && !others.includes(c)) others.push(c);
    if (others.length < 2) return null;
    const letterOpts = rng.shuffle(others.slice(0, 2));
    letterOpts.splice(target, 0, correct);
    options = [...letterOpts, noneCode, manyCode];
    answerIndex = target;
  } else {
    const distinct = [...new Set(key.split(''))];
    if (distinct.length < 3) return null;
    options = [...rng.sample(distinct, 3), noneCode, manyCode];
    answerIndex = target;
  }
  const askText = `${k === 1 ? 'first' : ordinal(k)} letter of that word from the ${from} end`;
  const steps: Rich[] = [`${host}: ${positions.map((p) => `${ordinal(p)} = ${host[p - 1]}`).join(', ')}.`, `Letters: ${letters.join(', ')}.`];
  if (found.length === 1) steps.push(`Only one meaningful word: **${found[0]}**.`, `${askText[0].toUpperCase() + askText.slice(1)} = **${options[answerIndex]}**.`);
  else if (found.length === 0) steps.push(`No arrangement of these letters is an English word → **${noneCode}**.`);
  else steps.push(`Words: ${found.join(', ')} — more than one → **${manyCode}**.`);
  return {
    facts: { kind: 'meaningful-word', form: 'positions-letter', host, positions, from, k, codes, lexicon: lexiconOfLength(size) },
    draft: {
      prompt: `If only one meaningful English word can be formed with the ${listPositions(positions)} letters of the word '${host}', using each letter only once, which of the following will be the ${askText}? If no such word can be formed, give '${noneCode}' as the answer, and if more than one such word can be formed, give '${manyCode}' as the answer.`,
      options,
      answerIndex,
      solution: {
        steps,
        shortcut: 'Extract the letters, then test the likely word shapes (consonant–vowel–consonant patterns). Before answering, check for a second word.',
        trap:
          found.length >= 2
            ? `${found[0]} is a word, but so is ${found[1]} — with more than one word the answer is ${manyCode}, not a letter.`
            : found.length === 1
              ? `Counting from the wrong end of ${found[0]} gives a different letter.`
              : `Do not force a near-word; if no real word exists the answer is ${noneCode}.`,
      },
      tags: ['series:meaningful-word', 'vocab:anagram'],
      targetSeconds: targetSeconds('short-reasoning', d),
    },
  };
}

export function buildMeaningful(rng: Rng, d: Difficulty): { facts: MeaningfulFacts; draft: Draft } {
  for (let attempt = 0; attempt < 20; attempt++) {
    let r: { facts: MeaningfulFacts; draft: Draft } | null = null;
    switch (d) {
      case 'easy':
        r = countLetters(rng, d, 4);
        break;
      case 'medium': {
        const f = rng.pick(['letters', 'count', 'letter'] as const);
        r = f === 'letters' ? countLetters(rng, d, 4) : f === 'count' ? positionsCount(rng, d, 4, 8) : positionsLetter(rng, d, 4, 8);
        break;
      }
      case 'hard': {
        const f = rng.pick(['letters', 'count', 'letter'] as const);
        r = f === 'letters' ? countLetters(rng, d, 5) : f === 'count' ? positionsCount(rng, d, 5, 9) : positionsLetter(rng, d, 5, 9);
        break;
      }
      case 'extreme': {
        const f = rng.pick(['count', 'letter'] as const);
        r = f === 'count' ? positionsCount(rng, d, 5, 10) : positionsLetter(rng, d, 5, 10);
        break;
      }
    }
    if (r) return r;
  }
  throw new Error('meaningful-word: could not build');
}
