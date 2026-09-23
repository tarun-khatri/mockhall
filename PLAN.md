# PLAN — MockHall

Free, no-login, mobile-first mock tests for SBI Clerk (prelims 26 Sep 2026) and IBPS Clerk (10–11 Oct 2026).
Source of truth: `SPEC.md`. Decisions: `DECISIONS.md`. Status: `PROGRESS.md`.

## 1. Architecture

Static SPA (Vite + React 19 + TypeScript strict), deployed to GitHub Pages by GitHub Actions. No server.

```
src/
  app/           App shell, routes (React Router, lazy per route), bottom nav, theme
  exam/          engine: store (Zustand), timer maths, scoring, palette status, section flow, assembly, persistence
  screens/       Home, Practice, ChapterList, Mocks, Instructions, Exam, Result, Solutions, Progress, Mistakes, Settings
  components/    OptionRow/Bubble, TimerPill, PaletteSheet, StimulusPanel, BottomSheet, SegmentedControl, Chip, Toast,
                 Rich (markdown-lite + KaTeX), charts/* (SVG), visuals/* (seating, grid, venn, path, family, chain)
  content/
    types.ts, chapters.ts, schema.ts (zod), rich.ts, targets.ts        ← shared contracts
    generators/{quant,reasoning,english}/<chapter>.ts                 ← one generator per chapter
    generators/solver/{inequality,syllogism,seating,puzzles}/         ← engines
    generators/shared/{question,options}.ts                           ← makeQuestion/makeSet, option builders
    verify/<subject>/<chapter>.ts                                     ← independent verifiers (tests only)
    authored/english/*.json                                           ← authored banks (blind-solved)
    blueprints/                                                       ← mock blueprints as data
    providers.ts                                                      ← lazy chapter loaders (generator | bank)
  analytics/     per-chapter/subtype aggregation, weak areas, mistakes
  lib/           rng (sfc32), hash, format (₹, Indian grouping), storage (idb-keyval)
public/banks/    pre-generated puzzle/seating banks + compiled authored banks (runtime-cached, not precached)
scripts/         build-banks, banks/{seating,puzzles,spelling-variants}, validate-authored, blind-solve export/compare
tests/           unit/, property/<subject>/, content/, e2e/ (Playwright), helpers/harness.ts
```

**Question pipeline.** Every chapter exposes a provider: `item(seed, difficulty, subtype?) → Item` (a single question
or a set). Generators are pure functions of `(name, version, subtype, difficulty, seed)`; bank chapters (puzzles,
seating, authored English) pick deterministically from lazily fetched JSON. Mock assembly walks a blueprint, draws
items with derived seeds, de-duplicates by content-hash id, and snapshots full questions into the Attempt.

**Exam engine.** Attempt state in Zustand, persisted to IndexedDB (debounced 300 ms + `pagehide`). Timers are
deadline-based (`sectionDeadlines[]` epoch ms), recomputed on every tick/visibility change; strict mode never pauses.
Section expiry auto-saves the draft, shows a 3 s interstitial and opens the next section; the last section auto-submits.
Save rule mirrors the real exam: only *Save & next* / *Mark for review & next* commit a selection.

**Verification.** Generators: independent verifier per chapter + fast-check harness (≥ 500 seeds × subtype ×
difficulty locally, fewer in CI). Puzzles/seating: solver-unique at bank build + CI re-verification of every shipped
set. Authored English: zod schema, near-duplicate check, blind solve by a separate agent with keys hidden; items are
content-hashed at verification time so any later edit un-verifies them and fails the build.

## 2. Generator list (Phase 1 unless marked)

| Chapter | Subtypes |
|---|---|
| Simplification & approximation | bodmas, fractions, decimals, percent-of, powers-roots, exponents, missing-inside, approximation |
| Number series | missing-number, wrong-number (≥ 30 pattern families) |
| Data interpretation (set) | table, bar, grouped-bar, line, multi-line, pie, caselet (3 Q), missing-table (H/X), arithmetic-di (H/X) |
| Percentage | base-change, successive-change, population, election, income-savings, marks-pass, percent-chain |
| Profit & loss | cp-sp-mp, discount, successive-discount, profit-on-sp, dishonest-dealer, buy-get-free, same-sp, overall, markup-discount |
| Ratio & proportion | divide, change-after-add, coins, income-expenditure, proportionals, compounded, variation |
| Partnership | time-weighted, join-withdraw, capital-change, working-partner, capital-from-share |
| Speed, distance & time | average-speed, relative-speed, trains (pole/platform/each other/man), meeting-point, late-early, stoppage, circular (X) |
| Boats & streams | up-down, still-water, round-trip, time-ratio, total-time-distance |
| Simple & compound interest | si-basic, ci-annual, ci-half-quarterly, ci-si-diff-2yr/3yr, doubling, split-sum, instalments (X) |
| Averages | add-remove-replace, wrong-entry, cricket, teacher-joins, consecutive, weighted |
| Time & work | efficiency-lcm, together, leaves-after, alternate-days, mdh-w, wages, men-women-children (H/X) |
| Pipes & cisterns | fill-empty, leak, alternate, closed-after, partly-full |
| Mensuration | 2D shapes, path, area-change, 3D solids, melt-recast, water-level, painting |
| Quadratic | two-equation comparison (5 fixed options), x² = k |
| Problems on ages | ratio-now-later, sum-ratio, family, average-age |
| Mixture & alligation | alligation-price, replacement, two-solutions, water-profit |
| Seating (set, bank) | linear-single, linear-parallel, linear-uncertain (H/X), circular-inside, circular-mixed, square |
| Puzzles (set, bank) | floor, floor-flat, box, day, month, comparison (3 Q), scheduling (H/X) |
| Inequality | direct, combined, coded, missing-symbol, either-or |
| Syllogism | two-statement, three-statement, possibility, only-a-few, reverse (H/X) |
| Coding–decoding | letter-shift, reverse, opposite-pairs, positional, sentence-coding set (5 Q), letters-in-place |
| Series & pattern | alphanumeric-set (5 Q), number-set (3 Q), word-rearrange, letter-pairs, meaningful-word |
| Direction | walk, final-facing, shadow, coded-direction, point-set |
| Blood relation | direct, coded, family-puzzle, pointing |
| Order & ranking | position-both-ends, total-persons, interchange, comparison-single |
| Classification | letter-groups, numbers (words-by-category AUTH in Phase 2) |
| Misspelt words (HYB) | bold-in-sentence, standalone (≥ 400-word list, ≥ 120 frames, dictionary-vetted variants) |
| Phase 2 | data sufficiency, word swap, match the column, word usage, cloze, connectors, grammar drills |
| Phase 3 | input–output, statement & conclusion/assumption/argument/course of action, cause & effect, para filler, para summary, mains DI |

## 3. Authored content batches (English)

| Chapter | Phase 1 target | Difficulty split (E/M/H/X) |
|---|---|---|
| Reading comprehension | 10 passages × 10 Q | 2/4/3/1 |
| Error spotting | 70 | 14/24/18/14 |
| Phrase replacement | 60 | 12/20/16/12 |
| Fillers | 70 | 14/24/18/14 |
| Para jumbles | 10 sets (5-, 6-, 6-fixed) | 2/4/3/1 |
| Misspelt words | generator (≥ 80 distinct items) | by word difficulty |

Each batch: write (agent A) → schema + near-dup check → blind solve with keys hidden (agent B, fresh context) →
mismatches or ambiguity ≥ 3 rewritten or dropped → `content-qa-report.md` → content hash recorded in `_qa/`.
Para jumbles are blind-solved twice with shuffled labels.

## 4. Milestones

### Phase 1 — usable before Saturday 26 Sep
- [ ] M0 Scaffold, contracts, harness, agents launched
- [ ] M1 Exam engine: store, deadline timers, sectional flow, save rule, palette, scoring, persistence, resume
- [ ] M2 Screens: Home, Practice → chapter config sheet, Mocks, Instructions, Exam, Result, Solutions, Settings (+ basic Progress/Mistakes)
- [ ] M3 Quant generators (simplification, DI, arithmetic mix) + verifiers green at 500 seeds
- [ ] M4 Reasoning generators + puzzle/seating banks verified unique
- [ ] M5 English banks written, blind-solved, QA report
- [ ] M6 Blueprints (SBI order), full mock + 3 sectional mocks + chapter practice at 4 difficulties
- [ ] M7 PWA (offline, installable), e2e suite, axe, 360 px screenshots reviewed
- [ ] M8 CI (typecheck → lint → unit → property → content QA → build → e2e) and deploy to GitHub Pages; URL printed

### Phase 2 — before IBPS Clerk (10 Oct)
- [ ] Every section-8 chapter at SPEC 7.7 volumes with extreme tier; frozen reference sets
- [ ] IBPS order + all blueprint variants; Mock 01–30 fixed + fresh mocks; difficulty presets
- [ ] Progress analytics, mistakes book, Try a similar one, speed drills, rough pad, share links, download-all-for-offline
- [ ] Runtime puzzle generation in a Worker; Lighthouse ≥ 95 everywhere

### Phase 3 — mains
- [ ] Research current mains pattern; mains chapters (input–output, DS, critical reasoning ×5, cloze, para filler/summary, quadratic, harder DI); mains mock mode
