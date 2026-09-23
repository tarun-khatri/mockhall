import { describe, expect, it } from 'vitest';
import { describeGenerator, PROP_SEEDS } from '../../helpers/harness';
import { ALL_CORRECT, ALL_CORRECT_SHARE, BOLD_PROMPT, STANDALONE_PROMPT, generator, type SpellingFacts } from '../../../src/content/generators/english/spelling';
import { verify } from '../../../src/content/verify/english/spelling';
import { FRAMES, TIER_RANK, VARIANTS, WORD, WORDS, WORDS_BY_TIER } from '../../../src/content/generators/english/spelling/data';
import type { GenResult } from '../../../src/content/generators/types';
import { DIFFICULTIES } from '../../../src/content/types';

const FRAME_BY_ID = new Map(FRAMES.map((f) => [f.id, f]));
/** misspelling → the word it corrupts */
const BASE_OF = new Map<string, string>();
for (const [w, list] of VARIANTS) for (const v of list) BASE_OF.set(v.form, w);

function sanity(res: GenResult<SpellingFacts>): string[] {
  const p: string[] = [];
  const q = res.item.questions[0];
  const d = q.difficulty;
  const { shown, frameId } = res.facts;
  if (shown.length !== 4) return ['facts.shown must have 4 words'];
  const wrong = shown.map((w, i) => (WORD.has(w) ? -1 : i)).filter((i) => i >= 0);
  if (wrong.length > 1) p.push(`${wrong.length} misspelt words`);
  for (const i of wrong) if (!BASE_OF.has(shown[i])) p.push(`"${shown[i]}" is neither a list word nor a vetted variant`);
  const bases = shown.map((w) => BASE_OF.get(w) ?? w);
  if (new Set(bases).size !== 4) p.push('same base word shown twice');

  if (q.subtype === 'bold-in-sentence') {
    const f = frameId ? FRAME_BY_ID.get(frameId) : undefined;
    if (!f) return [...p, `unknown frame ${frameId}`];
    if (!q.prompt.startsWith(BOLD_PROMPT + '\n\n')) p.push('bold prompt wording');
    if (bases.join('|') !== f.words.join('|')) p.push(`shown words do not match frame ${f.id}`);
    const level = Math.max(...f.words.map((w) => TIER_RANK[WORD.get(w)!.d]));
    if (wrong.length === 0 && level !== TIER_RANK[d]) p.push(`all-correct frame level ${level} for ${d}`);
  } else {
    if (frameId !== null) p.push('standalone item carries a frame');
    if (q.prompt !== STANDALONE_PROMPT) p.push('standalone prompt wording');
    for (const b of bases) if (WORD.get(b)!.d !== d) p.push(`standalone word ${b} is ${WORD.get(b)!.d}, not ${d}`);
  }
  // difficulty drives the tier of the corrupted word
  for (const i of wrong) if (WORD.get(bases[i])!.d !== d) p.push(`corrupted word ${bases[i]} is ${WORD.get(bases[i])!.d}, not ${d}`);
  // key: misspelt option, or E = All correct
  const expectKey = wrong.length ? wrong[0] : 4;
  if (q.answerIndex !== expectKey) p.push(`answerIndex ${q.answerIndex}, expected ${expectKey}`);
  if (q.options[4] !== ALL_CORRECT) p.push('option E must be All correct');
  // solution names the correct spelling
  if (wrong.length && !q.solution.steps[0].includes(`**${bases[wrong[0]]}**`)) p.push('solution does not give the correct spelling');
  if (!q.solution.shortcut || !q.solution.trap || !q.solution.rule) p.push('shortcut/trap/rule missing');
  if (!q.tags.length || q.tags.some((t) => !/^[a-z0-9-]+:[a-z0-9-]+$/.test(t))) p.push(`bad tags ${q.tags.join(',')}`);
  return p;
}

// "All correct" sits at E (the exam convention) and is the key only ~8% of the time, below the harness's
// 10% floor per letter — so the generic spread check is replaced by the specific one below.
describeGenerator(generator, { verify, sanity, skipLetterSpread: true });

describe('english.spelling letter spread (A–D uniform, E ≈ 8%)', () => {
  const n = Math.max(1000, PROP_SEEDS * 2);
  for (const st of generator.subtypes) {
    for (const d of DIFFICULTIES) {
      it(`${st.id} / ${d}`, () => {
        const counts = [0, 0, 0, 0, 0];
        for (let i = 0; i < n; i++) counts[generator.build(`ls${i}`, d, st.id).item.questions[0].answerIndex]++;
        const shares = counts.map((c) => c / n);
        for (let k = 0; k < 4; k++) expect(shares[k], `letter ${'ABCD'[k]} ${counts.join('/')}`).toBeGreaterThan(0.17);
        for (let k = 0; k < 4; k++) expect(shares[k], `letter ${'ABCD'[k]} ${counts.join('/')}`).toBeLessThan(0.28);
        expect(Math.abs(shares[4] - ALL_CORRECT_SHARE), `E share ${counts.join('/')}`).toBeLessThan(0.035);
      });
    }
  }
});

describe('english.spelling data', () => {
  it('has ≥ 400 words, each with 2–4 vetted variants, spread over all tiers', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(400);
    expect(new Set(WORDS.map((w) => w.w)).size).toBe(WORDS.length);
    for (const d of DIFFICULTIES) expect(WORDS_BY_TIER[d].length).toBeGreaterThanOrEqual(60);
    for (const e of WORDS) {
      expect(e.w).toMatch(/^[a-z]+$/);
      expect(e.h.trim().length, e.w).toBeGreaterThan(0);
      const v = VARIANTS.get(e.w)!;
      expect(v.length, e.w).toBeGreaterThanOrEqual(2);
      expect(v.length, e.w).toBeLessThanOrEqual(4);
      for (const x of v) {
        expect(x.form).not.toBe(e.w);
        expect(WORD.has(x.form), `${x.form} is itself a list word`).toBe(false);
      }
    }
  });

  it('has ≥ 120 frames with exactly four distinct list-word slots, none sentence-initial', () => {
    expect(FRAMES.length).toBeGreaterThanOrEqual(120);
    expect(new Set(FRAMES.map((f) => f.id)).size).toBe(FRAMES.length);
    for (const f of FRAMES) {
      expect(f.words.length, f.id).toBe(4);
      expect(new Set(f.words).size, f.id).toBe(4);
      for (const w of f.words) expect(WORD.has(w), `${f.id}: ${w}`).toBe(true);
      expect(/^\{/.test(f.text) || /[.!?:;]\s+\{/.test(f.text), `${f.id} slot starts a sentence`).toBe(false);
      expect(f.text.replace(/\{[a-z]+\}/g, '')).not.toMatch(/[{}*$]/);
    }
  });

  it('covers every difficulty × slot position, and every difficulty for all-correct frames', () => {
    for (const d of DIFFICULTIES) {
      for (let p = 0; p < 4; p++) expect(FRAMES.filter((f) => WORD.get(f.words[p])!.d === d).length, `${d} slot ${p}`).toBeGreaterThanOrEqual(10);
      const level = FRAMES.filter((f) => Math.max(...f.words.map((w) => TIER_RANK[WORD.get(w)!.d])) === TIER_RANK[d]);
      expect(level.length, `all-correct frames for ${d}`).toBeGreaterThanOrEqual(8);
    }
  });
});
