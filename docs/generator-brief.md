# Generator author brief (read fully before writing code)

MockHall is a free, no-login, mobile-first mock-test app for SBI Clerk and IBPS Clerk prelims. The first real
user sits SBI Clerk prelims on 26 Sep 2026 — ship correct, exam-faithful generators fast. **A wrong answer key is
a P0 bug.**

## Read first
- `SPEC.md` sections 2, 7 (all), 8 (your chapters), 14.2–14.3, 15.
- Shared contracts — **do not modify** (if one has a bug or lacks a helper, work around it locally in your chapter
  folder and report it):
  - `src/content/types.ts` — Question, QuestionSet, Item, ChartSpec, TableSpec, VisualSpec
  - `src/content/generators/types.ts` — `defineGenerator`, `ChapterGenerator`, `GenResult`, `SubtypeDef`
  - `src/content/generators/shared/question.ts` — `makeQuestion`, `makeSet`, `single`
  - `src/content/generators/shared/options.ts` — `numericChoices` (mistake-based, sorted, uniform rank),
    `shuffleChoices`, `fixedChoices`, `assertDistinct`
  - `src/content/targets.ts` — `targetSeconds(kind, d)`, `setTargetSeconds(kind, d, count)`
  - `src/lib/rng.ts` (seeded RNG), `src/lib/format.ts` (`inr`, `indian`, `pct`, `plain`, `fracTex`, `mixedTex`,
    `ratio`, `ordinal`, `hoursMinutes`, `gcd`, `lcm`, `reduce`, `roundTo`, `isWhole`)
  - `src/content/rich.ts` — the Rich text format
  - `tests/helpers/harness.ts` — `describeGenerator`
  - **Reference pattern:** `tests/helpers/example-generator.ts` + `tests/unit/harness.test.ts`. Copy it.
- `research/archetypes.md` if it exists (a research agent is writing it concurrently — check it midway, don't wait).

## Rich text rules (prompts, options, steps, stimuli)
- Plain text + `**bold**`, `*italic*`, `$tex$` (KaTeX: `\frac{3}{4}`, `\sqrt{144}`, `12^2`, `\times`, `\div`),
  `\n` line break, `\n\n` paragraph, lines starting `- ` are bullets.
- Never use `$` for currency (use ₹ via `inr()`), never `*` for multiplication (use `×` or `$\times$`).
  Escape literal `$`/`*` as `\$`/`\*` (e.g. coded-inequality symbols).
- No HTML. No `undefined`/`NaN`/`null` leaking into text (the harness fails on them).

## Per chapter deliverables
1. `src/content/generators/<subject>/<chapter>.ts` — `export const generator = defineGenerator<Facts>(meta, SUBTYPES, impl)`
   with `export interface <Name>Facts`. `name: '<subject>.<chapter>'`, `version: 1`. Helper modules may live in
   `src/content/generators/<subject>/<chapter>/`. Keep chapters self-contained.
2. `src/content/verify/<subject>/<chapter>.ts` — `export function verify(res: GenResult<Facts>): (number | string)[]`
   (expected option index or expected option text per question, in item order). **Independent**: a different
   method where possible (enumeration / simulation / exact rational arithmetic / substituting each option back
   vs the generator's formula). It may `import type` from the generator and import `src/lib/format.ts` /
   `src/content/rich.ts`, nothing else from generator code. Recompute from `facts` (inputs only — never store the
   answer in facts).
3. `tests/property/<subject>/<chapter>.test.ts` — `describeGenerator(generator, { verify, sanity })` with
   chapter-specific sanity checks (no negative ages, no absurd profit %, no ₹0.37 prices, realistic speeds, set sizes…).

## Quality bar
- Real SBI/IBPS Clerk wording, number ranges and trap styles. Ladder: easy < **medium = exactly clerk prelims** <
  hard = PO prelims / toughest clerk shifts < extreme = mains-level (nobody should hit 100%).
- **Build backward**: choose clean answers and intermediates first (integers, neat fractions, % that map to simple
  fractions, π = 22/7 with radii in multiples of 7).
- Distractors from **real mistakes**, each documented via `numericChoices({ mistakes: [{ value, why }] })`.
  Numeric options ascending, same format. "None of these"/"Cannot be determined" only where real papers use them.
- Solutions (SPEC 7.5): `steps` one operation per line with units; `shortcut` = the exam trick; `trap` = why the most
  tempting wrong option is wrong; `visual` where it helps (VisualSpec from ground truth).
- `tags`: lowercase `category:value`, e.g. `percent:successive-change`, `trick:alligation`.
- Indian context: ₹ with Indian grouping, lakh/crore where natural, Indian names from all regions and genders,
  everyday settings (shops, trains, farms, banks, schools). British/Indian spelling.
- Correct letter roughly uniform over A–E (harness: each letter 10–30% per subtype × difficulty). With fixed-order
  options (inequality, syllogism, quadratic, DS) pick the target answer category uniformly first, then construct.
- Every subtype supports all four difficulties unless genuinely impossible (then declare `difficulties`).
- Deterministic: never `Math.random` (lint-banned in src/content), no `Date`, no global state.
- Set items (DI, puzzles, series/coding sets): use `makeSet`; each question's solution stands alone.

## Process and machine limits (8 GB RAM shared by ~10 agents — respect this)
- Iterate chapter by chapter. Run ONLY your own tests, always single-worker:
  PowerShell: `$env:PROP_SEEDS=100; npx vitest run tests/property/<subject>/<chapter>.test.ts --maxWorkers=1`
  Final pass per chapter with the default 500 seeds: `Remove-Item Env:PROP_SEEDS; npx vitest run <file> --maxWorkers=1`.
- Typecheck sparingly (it is memory-heavy): `npx tsc --noEmit -p .` — fix errors in YOUR files only; other agents
  are editing other files concurrently, ignore their errors.
- Eyeball output: print 3–5 samples per chapter (e.g. a throwaway script run with `npx tsx`, kept outside `src/`
  or deleted afterwards) and read them as a strict exam-setter: natural wording? realistic numbers? does the
  solution teach the fast method?
- Never start dev servers, never run the whole test suite, never run git, never touch files you don't own.

## Final report (your last message)
Per chapter: subtypes (id: label, difficulties), tests passed (seeds × subtype × difficulty), 2 sample questions
(prompt, options, key), known limitations, and any shared-contract issues you worked around.
