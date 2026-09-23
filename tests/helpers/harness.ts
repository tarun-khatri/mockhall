/**
 * Property-test harness for generators (SPEC 14.2).
 *
 *   import { generator } from '../../../src/content/generators/quant/percentage';
 *   import { verify } from '../../../src/content/verify/quant/percentage';
 *   describeGenerator(generator, { verify });
 *
 * For every subtype × supported difficulty it runs PROP_SEEDS seeds (default 500; CI uses fewer) and asserts:
 * the independent verifier agrees with the key; exactly one option matches; 5 distinct options; ids and
 * set links are well-formed; rich text is clean and every $…$ renders in KaTeX; determinism; plus any
 * chapter-specific `sanity` checks. It also checks the correct-letter spread per subtype/difficulty.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import katex from 'katex';
import type { ChapterGenerator, GenResult } from '../../src/content/generators/types';
import { subtypeSupports } from '../../src/content/generators/types';
import { DIFFICULTIES, type Difficulty, type Question } from '../../src/content/types';
import { mathSegments, normaliseOption } from '../../src/content/rich';
import { itemSchema } from '../../src/content/schema';

export const PROP_SEEDS = Number(process.env.PROP_SEEDS ?? 500);

export interface HarnessOptions<F> {
  /** Independent verifier: expected answer per question, in item order — an option index or the expected option text. */
  verify: (res: GenResult<F>) => (number | string)[];
  /** Chapter-specific sanity checks (value ranges etc.). Return problem strings. */
  sanity?: (res: GenResult<F>) => string[] | void;
  seeds?: number;
  subtypes?: string[];
  difficulties?: Difficulty[];
  /** Skip the letter-spread check (only for generators with a documented fixed-order option style). */
  skipLetterSpread?: boolean;
}

const katexCache = new Map<string, string | null>();
export function katexProblem(tex: string): string | null {
  if (katexCache.has(tex)) return katexCache.get(tex)!;
  let problem: string | null = null;
  try {
    katex.renderToString(tex, { throwOnError: true, strict: 'error' });
  } catch (e) {
    problem = `KaTeX failed on "${tex}": ${(e as Error).message}`;
  }
  katexCache.set(tex, problem);
  return problem;
}

const ARTEFACT = /\b(undefined|NaN|Infinity|null)\b|\[object Object\]/;

export function richProblems(label: string, text: string | undefined): string[] {
  if (text === undefined) return [];
  const out: string[] = [];
  if (typeof text !== 'string' || !text.trim()) out.push(`${label}: empty`);
  else {
    if (ARTEFACT.test(text)) out.push(`${label}: rendering artefact in "${text.slice(0, 80)}"`);
    if (/<[a-zA-Z/!]/.test(text)) out.push(`${label}: raw HTML`);
    if ((text.replace(/\\\$/g, '').match(/\$/g)?.length ?? 0) % 2) out.push(`${label}: unbalanced $`);
    for (const tex of mathSegments(text)) {
      const p = katexProblem(tex);
      if (p) out.push(`${label}: ${p}`);
    }
  }
  return out;
}

function questionProblems(gen: ChapterGenerator<unknown>, q: Question, subtype: string, difficulty: Difficulty): string[] {
  const p: string[] = [];
  if (q.subject !== gen.subject) p.push(`subject ${q.subject}`);
  if (q.chapter !== gen.chapter) p.push(`chapter ${q.chapter}`);
  if (q.difficulty !== difficulty) p.push(`difficulty ${q.difficulty} != ${difficulty}`);
  if (q.subtype !== subtype) p.push(`subtype ${q.subtype} != ${subtype}`);
  if (!/^[a-z]+\.[a-z-]+\.[a-z0-9-]+\.[emhx]\.[0-9a-f]{6,}$/.test(q.id)) p.push(`bad id ${q.id}`);
  if (!Array.isArray(q.options) || q.options.length !== 5) p.push(`options length ${q.options?.length}`);
  else {
    const keys = q.options.map(normaliseOption);
    if (new Set(keys).size !== 5) p.push(`options not distinct: ${JSON.stringify(q.options)}`);
  }
  if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 4) p.push(`answerIndex ${q.answerIndex}`);
  if (!(q.targetSeconds > 0)) p.push(`targetSeconds ${q.targetSeconds}`);
  if (!q.solution?.steps?.length) p.push('no solution steps');
  if (q.source !== 'generator' || q.generator?.name !== gen.name || q.generator?.version !== gen.version) p.push('generator stamp');
  p.push(...richProblems('prompt', q.prompt));
  q.options?.forEach((o, i) => p.push(...richProblems(`option ${'ABCDE'[i]}`, o)));
  q.solution?.steps?.forEach((s, i) => p.push(...richProblems(`step ${i + 1}`, s)));
  p.push(...richProblems('shortcut', q.solution?.shortcut));
  p.push(...richProblems('trap', q.solution?.trap));
  return p;
}

export function itemProblems<F>(gen: ChapterGenerator<F>, res: GenResult<F>, subtype: string, difficulty: Difficulty, opts: HarnessOptions<F>): string[] {
  const problems: string[] = [];
  const { item } = res;
  const parsed = itemSchema.safeParse(item);
  if (!parsed.success) problems.push(...parsed.error.issues.slice(0, 5).map((i) => `schema ${i.path.join('.')}: ${i.message}`));
  if (!item.questions?.length) return [...problems, 'no questions'];
  if (item.set) {
    const s = item.set;
    if (s.subtype !== subtype) problems.push(`set subtype ${s.subtype}`);
    if (s.difficulty !== difficulty) problems.push(`set difficulty ${s.difficulty}`);
    if (s.chapter !== gen.chapter || s.subject !== gen.subject) problems.push('set chapter/subject');
    problems.push(...richProblems('stimulus', s.stimulus));
    if (s.table) {
      for (const row of s.table.rows) for (const cell of row) if (typeof cell === 'number' && !Number.isFinite(cell)) problems.push('table NaN');
    }
    if (s.chart) {
      const nums: number[] =
        s.chart.type === 'pie' ? s.chart.slices.map((x) => x.value) : s.chart.series.flatMap((x) => x.values);
      if (nums.some((n) => !Number.isFinite(n))) problems.push('chart NaN');
    }
  }
  const ids = new Set<string>();
  for (const q of item.questions) {
    if (ids.has(q.id)) problems.push(`duplicate id ${q.id}`);
    ids.add(q.id);
    problems.push(...questionProblems(gen as ChapterGenerator<unknown>, q, subtype, difficulty).map((x) => `[${q.id}] ${x}`));
  }
  // independent verifier
  let expected: (number | string)[] = [];
  try {
    expected = opts.verify(res);
  } catch (e) {
    problems.push(`verifier threw: ${(e as Error).message}`);
  }
  if (expected.length !== item.questions.length) problems.push(`verifier returned ${expected.length} answers for ${item.questions.length} questions`);
  item.questions.forEach((q, i) => {
    const exp = expected[i];
    if (exp === undefined) return;
    if (typeof exp === 'number') {
      if (exp !== q.answerIndex) problems.push(`[${q.id}] key ${'ABCDE'[q.answerIndex]} but verifier says ${'ABCDE'[exp] ?? exp}`);
    } else {
      const want = normaliseOption(exp);
      const matches = q.options.map((o, j) => (normaliseOption(o) === want ? j : -1)).filter((j) => j >= 0);
      if (matches.length !== 1) problems.push(`[${q.id}] verifier answer "${exp}" matches ${matches.length} options ${JSON.stringify(q.options)}`);
      else if (matches[0] !== q.answerIndex) problems.push(`[${q.id}] key ${'ABCDE'[q.answerIndex]} but verifier answer "${exp}" is option ${'ABCDE'[matches[0]]}`);
    }
  });
  const extra = opts.sanity?.(res);
  if (extra) problems.push(...extra);
  return problems;
}

export function describeGenerator<F>(gen: ChapterGenerator<F>, opts: HarnessOptions<F>): void {
  const seeds = opts.seeds ?? PROP_SEEDS;
  describe(`${gen.name} v${gen.version}`, () => {
    it('declares subtypes', () => {
      expect(gen.subtypes.length).toBeGreaterThan(0);
      expect(new Set(gen.subtypes.map((s) => s.id)).size).toBe(gen.subtypes.length);
    });
    for (const st of gen.subtypes) {
      if (opts.subtypes && !opts.subtypes.includes(st.id)) continue;
      for (const d of opts.difficulties ?? DIFFICULTIES) {
        if (!subtypeSupports(st, d)) continue;
        it(`${st.id} / ${d}`, () => {
          const letters = [0, 0, 0, 0, 0];
          let runs = 0;
          fc.assert(
            fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (n) => {
              const seed = `p${n}`;
              const res = gen.build(seed, d, st.id);
              const problems = itemProblems(gen, res, st.id, d, opts);
              if (runs % 10 === 0) {
                const again = gen.build(seed, d, st.id);
                if (JSON.stringify(again) !== JSON.stringify(res)) problems.push('not deterministic for the same seed');
              }
              runs++;
              if (problems.length) throw new Error(`${gen.name} ${st.id}/${d} seed="${seed}":\n  - ${problems.slice(0, 12).join('\n  - ')}`);
              for (const q of res.item.questions) letters[q.answerIndex]++;
            }),
            { numRuns: seeds, ...(process.env.CI ? { seed: 20260926 } : {}) },
          );
          const total = letters.reduce((a, b) => a + b, 0);
          if (!opts.skipLetterSpread && total >= 250) {
            const shares = letters.map((x) => x / total);
            const bad = shares.some((s) => s < 0.1 || s > 0.3);
            expect(bad, `correct-letter spread ${letters.join('/')} for ${st.id}/${d}`).toBe(false);
          }
        });
      }
    }
  });
}
