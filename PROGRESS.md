# PROGRESS

Live: https://tarun-khatri.github.io/mockhall/ (GitHub Pages via CI) · Vercel: import `tarun-khatri/mockhall` (vercel.json included)

## Phase 1 — done
- Exam engine: deadline timers, strict/non-strict, sectional flow + interstitial, save rule, palette, scoring, resume
  (IndexedDB + synchronous live mirror), wake lock, back-button guard. Unit tests: 40.
- Screens: Home, Practice + chapter sheet, Mocks (30 fixed + fresh, SBI/IBPS order, presets), Instructions, Exam, Result,
  Solutions (filters, bookmark, try-similar, report), Progress, Mistakes, Settings (export/import/reset, offline download).
- PWA offline; icons; GitHub Actions CI (typecheck → lint → unit → property → content gate → build → e2e → deploy).
- **English** (blind-solved, 0 mismatches — content-qa-report.md): RC 10 passages/100 Q (2/4/3/1), error spotting 70
  (14/24/18/14), phrase replacement 60 (12/20/16/12), fillers 70 (14/24/18/14), para jumbles 10 sets/50 Q (2/4/3/1),
  misspelt-words generator (476 words, 215 frames, 1,042 dictionary-vetted variants).
- **Numerical** (all 17 chapters, 500 seeds × subtype × difficulty, independent verifiers): simplification, number series,
  DI (9 chart/table types incl. caselet), percentage, P&L, ratio, ages, averages, partnership, mixtures, interest,
  speed-distance, time & work, boats, pipes, mensuration, quadratic.
- **Reasoning**: inequality, syllogism (+73 classic cases), coding–decoding (incl. 5-Q set), classification, series,
  direction, blood relation, order & ranking — 500 seeds each. Puzzles: 7 types × 4 levels × 150 solver-unique sets
  (3,900). Seating: 6 types × 4 levels × 60 sets (1,440). Every shipped set re-verified by an independent solver in CI.
- E2E (Playwright): 11 scenarios at 360 px + smoke on Pixel 7 / iPhone 13 geometry, incl. axe and no-horizontal-scroll.

## Known issues
- Runtime seating/puzzle generator suites fail a few extreme/edge seeds locally (9 of 790 property tests). These
  generators are NOT served — the app uses the pre-verified banks. Fix before Phase 2 on-device generation.
- Seating banks are 60 per type × level (target 150): `npx tsx scripts/banks/seating.ts --count=150`.
- Lighthouse not yet measured on the deployed build.
- Research findings not yet in SPEC: "problems on numbers" chapter, new English formats → Phase 2.

## Next (Phase 2, before IBPS Clerk 10 Oct)
Word swap, match the column, word usage, cloze, connectors, data sufficiency; seating top-up to 150; rough pad;
runtime puzzle generation in a Worker; Lighthouse ≥ 95.
