# PROGRESS

Live: https://tarun-khatri.github.io/mockhall/ (GitHub Pages via CI) · Vercel: import `tarun-khatri/mockhall` (vercel.json included)

## Phase 1 — done
- Exam engine (deadline timers, strict/non-strict, sectional flow + interstitial, save rule, palette, scoring, resume via
  IndexedDB + live mirror, wake lock, back guard); full mock (SBI/IBPS order), 30 fixed + fresh mocks, 3 sectional mocks,
  chapter practice/test at 4 difficulties; result (good attempts, negative-marking insight, time map, time sinks, topics);
  solutions (filters, bookmark, try-similar, report); PWA offline; CI → GitHub Pages; Vercel config.
- Lighthouse (live, mobile): performance 98, accessibility 100, best practices 100.

## Phase 2 — done
- Every section-8 chapter meets SPEC 7.7 volumes:
  - Generators (30, independent verifiers, 500 seeds × subtype × difficulty) + frozen 60-question reference sets
    with a drift test.
  - Puzzles 7 types × 4 levels × 150 and seating 6 types × 4 levels × 150 solver-unique sets (7,500), re-verified in CI.
  - Authored, all blind-verified (content-qa-report.md): RC 20 passages, para jumbles 15, cloze 15, error spotting 70,
    phrase replacement 60, fillers 70, word swap 60, word usage 60, connectors 60, match the column 60, grammar 60,
    misspelt-words generator.
- IBPS order + all blueprint variants (English A/B, Quant A/B/C, Reasoning A/B); mock presets (exam/tough/extreme).
- Progress analytics, mistakes book, try a similar one, speed drills, rough pad, share links, download-all-offline,
  weak-area mix, on-device fresh puzzles/seating in a Web Worker (bank fallback).

## Phase 3 — done
- research/mains.md (official 2026 patterns). Mains mock mode: IBPS Clerk mains (40/40/40, 35 min each, marks 1/1.5/1.25)
  and SBI Clerk mains (40/50/50), 10 fixed + fresh each, per-section marks with quarter-mark penalty.
- Mains chapters: input–output, data sufficiency (generators); statement & conclusion / assumption / argument, course of
  action, cause & effect (50 each), para filler (60), para summary (60) — all blind-verified; quadratic; harder DI tiers.

## Bank expansion — Oct 2026 (before IBPS Clerk prelims 10–11 Oct)
- Authored questions served: 1,235 → **4,643**, every one blind-verified (content-qa-report.md). New items lean harder
  (~10/40/35/15 E/M/H/X) and follow the 2024–26 papers (research/archetypes.md).
- English: error spotting 200, fillers 200, word swap 190, phrase replacement 180, grammar/word usage/connectors/match
  the column/para filler/para summary 160 each, RC 34 passages (340 Q), cloze 35 passages (210 Q), para jumbles 40 sets
  (200 Q). New formats: incorrect-sentence, 3-word and fragment rearrangement, idiom meaning, connector fix, combine
  sentences, RC in-passage blank.
- Quant: hand-written exam-style banks (100 each, key computed by script and blind-solved) mixed into the 13 arithmetic
  generator chapters (~40% of draws; subtype chip "Exam-style word problems"); new chapter **Problems on numbers &
  equations** (120) in the arithmetic rotation.
- Critical reasoning (mains): conclusion/assumption/argument/course of action 150 each, cause & effect 143.
- Chapter practice and tests serve questions not yet attempted on the device first.
- Tooling: scripts/authoring/{append,sample}.ts; docs/expansion-brief.md, docs/blind-solve-brief.md.

## Known limitations
- General/Financial Awareness and Computer Aptitude (mains) are not covered — they need current-affairs content.
- The quant "data sufficiency" and "quantity comparison" mains topics are filled with arithmetic/quadratic.
- Earliest 60 seating sets per cell keep older (longer) worked-solution wording; keys are verified.
- iPhone e2e runs on Chromium with iPhone 13 geometry (WebKit not installed locally).
