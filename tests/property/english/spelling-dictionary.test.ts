/**
 * Dev-only dictionary check for the misspelt-words chapter. The dictionary (an-array-of-english-words, MIT,
 * ~275k words incl. British spellings and accepted variants) is never imported from src/.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import variantsFile from '../../../src/content/generators/english/spelling/variants.json';
import { canonical, loadWords } from '../../../scripts/banks/spelling-variants';

const require = createRequire(import.meta.url);
const DICT = new Set<string>(require('an-array-of-english-words'));
const VARIANTS = (variantsFile as unknown as { variants: Record<string, [string, string][]> }).variants;
const LIST = loadWords();

describe('english.spelling dictionary vetting', () => {
  it('every curated word is a dictionary word', () => {
    const missing = LIST.map((e) => e.w).filter((w) => !DICT.has(w));
    expect(missing).toEqual([]);
  });

  it('every shipped misspelling is NOT a dictionary word (so it is never a valid spelling)', () => {
    const real = Object.values(VARIANTS)
      .flat()
      .map(([form]) => form)
      .filter((f) => DICT.has(f));
    expect(real).toEqual([]);
  });

  it('no misspelling is merely an accepted variant (-ise/-ize, -our/-or, -re/-er, ae/oe, -ll-, licence/license…)', () => {
    const bad: string[] = [];
    for (const [w, list] of Object.entries(VARIANTS)) for (const [form] of list) if (canonical(form) === canonical(w)) bad.push(`${w}→${form}`);
    expect(bad).toEqual([]);
    // the guard itself treats the classic pairs as equivalent
    for (const [a, b] of [
      ['organise', 'organize'],
      ['colour', 'color'],
      ['centre', 'center'],
      ['judgement', 'judgment'],
      ['licence', 'license'],
      ['practice', 'practise'],
      ['travelled', 'traveled'],
      ['manoeuvre', 'maneuver'],
      ['programme', 'program'],
      ['fulfil', 'fulfill'],
      ['analyse', 'analyze'],
      ['catalogue', 'catalog'],
    ]) expect(canonical(a), `${a}/${b}`).toBe(canonical(b));
  });

  it('every list word has a variants entry and no variant is a list word', () => {
    const listSet = new Set(LIST.map((e) => e.w));
    for (const e of LIST) expect(VARIANTS[e.w]?.length ?? 0, e.w).toBeGreaterThanOrEqual(2);
    const clash = Object.values(VARIANTS)
      .flat()
      .map(([f]) => f)
      .filter((f) => listSet.has(f));
    expect(clash).toEqual([]);
  });
});
