# PROGRESS

Live site: https://tarun-khatri.github.io/mockhall/ (GitHub Pages, deployed by `.github/workflows/ci.yml` on green CI)

## Done
- Scaffold, shared contracts, RNG, formatting, rich text, zod schemas, property-test harness with independent verifiers.
- Exam engine: deadline timers, strict/non-strict, sectional flow with interstitial, save rule, palette statuses, scoring,
  resume after reload (IndexedDB + synchronous live mirror), wake lock, back-button guard. 17 unit tests.
- Screens: Home, Practice, chapter sheet, Mocks (30 fixed + fresh, SBI/IBPS order, presets), Instructions, Exam, Result
  (good attempts, negative-marking insight, time map, time sinks, topic table), Solutions (filters, bookmark, try a similar
  one, report), Progress, Mistakes (revise mode), Settings (export/import/reset, download for offline).
- PWA: precached shell + generators + fonts + KaTeX; banks runtime-cached; icons; offline indicator.
- English (verified by blind solve, 0 mismatches — see content-qa-report.md): RC 10 passages / 100 Q, error spotting 70,
  phrase replacement 60, fillers 70, para jumbles 10 sets / 50 Q; misspelt words generator (476 words, 215 frames).
- Reasoning generators at 500 seeds × subtype × difficulty: inequality, syllogism (+73 classic cases), coding–decoding
  (incl. 5-Q sentence-coding set), classification, series-pattern, direction, blood relation, order & ranking.
- Quant generators at 500 seeds: simplification, percentage, simple & compound interest.
- E2E (Playwright, 360 px): palette statuses & counts, section expiry → interstitial → lock, reload keeps question/selection/
  time, strict timer while hidden, back-button dialog, exact scoring, solutions filters, try-similar, practice feedback,
  offline chapter practice, export → reset → import, axe + no horizontal scroll on all tab screens.
- Research: research/archetypes.md.

## In progress (agents)
- Quant: data interpretation, number series; profit & loss, ratio, ages, averages, partnership, mixtures;
  speed-distance, time & work, boats, pipes, mensuration, quadratic.
- Seating and puzzle solvers + verified banks (≥ 60 → 150 sets per subtype × difficulty).

## Next
- Integrate remaining chapters; re-run full mock e2e with seating/puzzle/DI present; screenshot review of DI charts and
  puzzle visuals at 360 px (light/dark); Lighthouse; deploy.

## Known issues / decisions pending
- Research found approximation is rare in 2024–26 (all exact) — simplification weights adjusted.
- "Problems on numbers / linear equations" appears in recent papers but is not in SPEC section 8 → Phase 2 chapter.
- New English formats (word rearrangement, sentence-fragment ordering, "which sentence is incorrect") → Phase 2.
- iPhone e2e runs on Chromium with iPhone 13 geometry (WebKit not installed locally).
