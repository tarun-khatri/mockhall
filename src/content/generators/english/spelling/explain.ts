/**
 * Solution text for misspelt-word questions: which letters differ, named by rule family, with the correct
 * letters highlighted inside the word (e.g. "acco**mm**odate — double 'm'").
 */
import type { Rich } from '../../../types';
import { TIER_RANK, WORD, type Family } from './data';

export const FAMILY_NAME: Record<Family, string> = {
  dbl: 'doubled consonants',
  ie: "'ie' or 'ei'",
  ance: '-ance/-ence and -ant/-ent',
  able: '-able/-ible',
  sil: 'silent letters',
  vow: 'vowels in unstressed syllables',
  sede: '-sede/-ceed/-cede',
  e: "keeping or dropping 'e' before a suffix",
  cs: "'c' or 's'",
  ord: 'letter order',
};

export const FAMILY_TAG: Record<Family, string> = {
  dbl: 'spelling:double-consonant',
  ie: 'spelling:ie-ei',
  ance: 'spelling:ance-ence',
  able: 'spelling:able-ible',
  sil: 'spelling:silent-letter',
  vow: 'spelling:unstressed-vowel',
  sede: 'spelling:sede-ceed-cede',
  e: 'spelling:silent-e',
  cs: 'spelling:c-s',
  ord: 'spelling:letter-order',
};

/** Where two spellings differ: shared prefix length and the differing middle of each. */
export function spellingDiff(correct: string, wrong: string): { at: number; right: string; bad: string } {
  let i = 0;
  while (i < correct.length && i < wrong.length && correct[i] === wrong[i]) i++;
  let j = 0;
  while (j < correct.length - i && j < wrong.length - i && correct[correct.length - 1 - j] === wrong[wrong.length - 1 - j]) j++;
  return { at: i, right: correct.slice(i, correct.length - j), bad: wrong.slice(i, wrong.length - j) };
}

const mark = (w: string, a: number, b: number) => `${w.slice(0, a)}**${w.slice(a, b)}**${w.slice(b)}`;

/** One-line rule for a specific slip, e.g. "acco**mm**odate — double 'm', not a single 'm'". */
export function explainSlip(correct: string, wrong: string, fam: Family): Rich {
  const { at, right, bad } = spellingDiff(correct, wrong);
  // Endings: show the whole correct ending.
  if (fam === 'sede') {
    const m = correct.match(/(sede|ceed|cede)(s|d)?$/);
    if (m && m.index !== undefined) {
      const wm = wrong.match(/(sede|ceed|cede|ceede)(s|d)?$/);
      return `${mark(correct, m.index, m.index + m[1].length)} — it ends in -${m[1]}${wm ? `, not -${wm[1]}` : ''}`;
    }
  }
  if ((fam === 'ance' || fam === 'able') && right && bad) {
    const tailRight = correct.slice(at);
    const tailBad = wrong.slice(at);
    return `${mark(correct, at, correct.length)} — it ends in -${tailRight}, not -${tailBad}`;
  }
  if (right && bad) return `${mark(correct, at, at + right.length)} — '${right}', not '${bad}'`;
  if (right) {
    // the misspelling dropped letters
    let a = at;
    let b = at + right.length;
    if (fam === 'dbl' && right.length === 1) {
      if (correct[a - 1] === right) a--;
      else if (correct[b] === right) b++;
      return `${mark(correct, a, b)} — double '${right}'`;
    }
    return `${mark(correct, a, b)} — the '${right}' must not be dropped`;
  }
  // the misspelling added letters
  if (fam === 'dbl' && bad.length === 1) {
    const a = correct[at - 1] === bad ? at - 1 : at;
    return `${mark(correct, a, a + 1)} — a single '${bad}', not a double`;
  }
  const a = Math.max(0, at - 1);
  const b = Math.min(correct.length, at + 1);
  return `${mark(correct, a, b)} — there is no '${bad}' between these letters`;
}

/**
 * How tempting a correctly spelt word is to mark as wrong: tier first, then how many "tricky" features it
 * shows (double letters, silent-letter clusters, unusual vowel runs), then length.
 */
export function temptation(word: string): number {
  const tier = TIER_RANK[WORD.get(word)?.d ?? 'easy'];
  const doubles = (word.match(/([a-z])\1/g) ?? []).length;
  const odd = (word.match(/(ie|ei|ae|oe|eu|ua|au|gn|mn|ps|rh|sc|ch|ph|gh|qu)/g) ?? []).length;
  return tier * 100 + doubles * 10 + odd * 5 + word.length / 100;
}

/** The correctly spelt word most likely to be picked by mistake (ties broken by position). */
export function mostTempting(words: readonly string[]): string {
  let best = words[0];
  for (const w of words) if (temptation(w) > temptation(best)) best = w;
  return best;
}

export function listWords(words: readonly string[]): string {
  const b = words.map((w) => `**${w}**`);
  if (b.length <= 1) return b.join('');
  return `${b.slice(0, -1).join(', ')} and ${b[b.length - 1]}`;
}
