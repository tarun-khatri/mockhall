# SPEC.md — Build "MockHall": a free, no-login, mobile-first mock test site for SBI Clerk & IBPS Clerk

> **How to use this file**
> 1. Make an empty folder, save this file inside it as `SPEC.md`.
> 2. Open Claude Code in that folder and send:
>    `Read SPEC.md end to end before doing anything. Then write PLAN.md, and execute Phase 1 until its definition of done passes and the site is deployed. Keep PROGRESS.md updated. Don't ask me questions unless you're truly blocked.`
> 3. After Phase 1 ships, send: `Continue with Phase 2 from SPEC.md.`
>
> "MockHall" is a working name. Rename freely.

---

## 1. Your role and the mission

You are three people at once:

- A **senior full-stack engineer** who ships fast, lean, well-tested static web apps.
- A **product designer** who has used Adda247, Testbook and Oliveboard daily and knows exactly why aspirants love (and hate) them.
- A **banking-exam content lead** who has cleared SBI/IBPS Clerk and PO, taught Quant, Reasoning and English at a coaching institute, and has studied every memory-based paper since 2016.

Build a static web app for aspirants who can't pay for test series. It must beat paid apps on the three things that matter:

1. **Question quality** — exam-accurate, four difficulty levels, correct answer keys, solutions that teach the fastest method.
2. **Exam fidelity** — the real test interface, sectional timing, negative marking, palette, all of it.
3. **Honest analysis** — where time went, where marks leaked, what to practise next.

No login. No backend. No ads. Open the URL, tap, practise.

The first real user has **SBI Clerk prelims on Saturday 26 September 2026**, then **IBPS Clerk prelims on 10–11 October 2026**. Speed of delivery matters: Phase 1 must be usable the same day you start.

---

## 2. Non-negotiables

1. **Mobile only for now.** Design for 360–430 px portrait. On larger screens, centre a 480 px column. No desktop layout work.
2. **No login, no accounts, no server, no ads, no trackers.** Everything runs in the browser. Progress lives on the device (IndexedDB), with export/import as a JSON file.
3. **Every answer key must be provably correct.** Quant and most Reasoning questions come from code generators whose answers are computed and then re-verified by an independent second implementation. Authored content (English, critical reasoning) must pass a blind-solve check (section 7.6). A wrong answer key is a P0 bug.
4. **Exam fidelity.** 5 options (A–E) per question, +1 / −0.25 marking, sectional timing, the standard palette colour convention, and the same control vocabulary as the real exam: *Save & next*, *Mark for review & next*, *Clear response*, *Submit*.
5. **Familiar flow, own identity.** Aspirants should feel at home if they come from Adda247, but do not copy any app's name, logo, colours, copy, illustrations or questions.
6. **Timers are deadline-based** and survive reloads, tab switches, screen lock and phone calls (section 10.4).
7. **Works offline** after first load (PWA).
8. **No verbatim reproduction** of previous-year papers, coaching material or books. Study them for patterns, number ranges and trap styles, then write originals.

---

## 3. Research brief (verified September 2026 — build on this, don't redo it from scratch)

### 3.1 Dates

| Exam | Prelims | Mains |
|---|---|---|
| SBI Clerk (Junior Associate) 2026 | 26 & 27 Sep, 3 Oct 2026 (backlog-vacancy prelims already held 16 Sep 2026) | ~Nov 2026 (tentative) |
| IBPS Clerk (CRP CSA-XVI) 2026 | 10–11 Oct 2026 | 27 Dec 2026 |

### 3.2 Prelims pattern (same structure for SBI Clerk and IBPS Clerk)

| Section | Questions | Marks | Time |
|---|---|---|---|
| English Language | 30 | 30 | 20 min |
| Numerical Ability | 35 | 35 | 20 min |
| Reasoning Ability | 35 | 35 | 20 min |
| **Total** | **100** | **100** | **60 min** |

- 5 options per question. −0.25 for each wrong answer. Unanswered = 0.
- Sectional timing: when a section's 20 minutes end, the next section opens automatically. No going back.
- **Section order varies by exam and year.** SBI Clerk 16 Sep 2026 (backlog): English → Quant → Reasoning. IBPS Clerk 2025: Numerical → English → Reasoning. Make order configurable; default to the SBI order.
- Implied pace: ~34 s per Quant/Reasoning question, ~40 s per English question.

### 3.3 "Good attempts" benchmarks (for the result screen)

| Paper | English | Numerical | Reasoning | Overall |
|---|---|---|---|---|
| SBI Clerk 16 Sep 2026, shift 1 (easy–moderate) | 25–28 | 23–26 | 26–29 | 74–83 |
| SBI Clerk 27 Sep 2025, shift 2 | 23–25 | 25–28 | 26–29 | 74–82 |
| IBPS Clerk 4 Oct 2025, shift 1 | — | — | — | 70–76 |

Label these in the UI as "Good attempts reported by coaching analyses — not official cut-offs." Cut-offs vary by state and category.

### 3.4 What actually gets asked (recent shifts, 2024–2026)

**Reasoning (35)**
- **Puzzles & seating: 15–20 Qs**, as 3–4 sets of 3–5 questions each. Types reported recently:
  - Parallel rows (10 persons, 5 facing north / 5 facing south)
  - Linear seating with an *uncertain number of persons*
  - Circular (8 persons facing inside, or mixed)
  - Square (4 at corners facing inside, 4 at middles facing outside)
  - Floor puzzles (8 floors; or 4 floors × 2 flats)
  - Box / stack (8)
  - Day-based (Monday–Sunday)
  - Month-based (8 months, non-consecutive, with 30/31-day logic)
  - Sequence-based puzzles
  - Comparison (height/weight): usually 2–3 Qs
- Inequality: 3–5 (direct and coded)
- Syllogism: 3–5 (incl. "only a few" and possibility cases)
- Alphanumeric / letter / word / number-based series: ~5
- Direction: 3–4, Blood relation: 2–3
- Coding–decoding: 0–5 (a full 5-question set appeared in IBPS Clerk 2025)
- Miscellaneous: 1–3 (meaningful word, word/letter pair formation, number-based, odd one out)
- Mostly mains, rare in prelims: machine input–output, data sufficiency, statement-based critical reasoning.

**Numerical Ability (35)**
- **Simplification / approximation: 10–15** — the single biggest scoring block.
- **Data interpretation: 10–13** — table (e.g. male/female split), bar, line, caselet (incl. SI/CI caselet), pie.
- **Arithmetic word problems: 10–13** — ages, percentage, profit & loss, partnership, SI/CI, time & work, speed-distance-time, trains, boats, mixtures, mensuration, averages, ratio.
- Number series (missing/wrong): 0–5 — absent in several 2025–26 shifts but still appears.
- Quadratic equations: rare in clerk prelims lately; more common in PO and mains.

**English (30)**
- Reading comprehension: 7–10 (recent themes: a bio company, a fashion product, nutrition; plus synonym/antonym of words from the passage)
- Error detection: 5
- Para jumbles / sentence rearrangement: 5–7
- Single fillers: 3–5
- Misspelt words: 4–5
- Phrase replacement / sentence improvement: ~3
- Word swap: 0–5, Match the column: 1–2, Word usage: ~1, Cloze: 0–7

### 3.5 How to use older papers

The two-stage prelims + mains format is only about a decade old, and the current puzzle-heavy style is newer still. So weight papers like this:

- **2022–2026:** highest weight — these define question style and difficulty.
- **2019–2021:** medium weight.
- **Older:** only for arithmetic archetypes and classic traps.

Before writing any authored content, do your own web research across memory-based papers and shift-wise analyses (Bankersadda/Adda247, Guidely, PracticeMock, Testbook, Oliveboard, time4education, Careerpower). Write `research/archetypes.md`: for every chapter, list subtypes, typical number ranges, option styles, trap patterns, and how often each appeared 2019–2026. **Never copy question text.** Generators and authored content must be driven by this file.

---

## 4. Delivery phases

### Phase 1 — "Usable before Saturday" (first session; ship within hours, not days)

Build in this order and deploy as soon as step 4 works end to end:

1. Exam engine: test screen, palette, deadline timers, sectional timing, scoring, submit, result, solutions, resume after reload.
2. Generators with verified answers for the highest-weight topics:
   - Quant: simplification + approximation, DI (table, bar, line, caselet), arithmetic mix (percentage, P&L, ratio/ages, SI/CI, time & work, SDT/trains/boats, averages, partnership, mixtures).
   - Reasoning: seating & puzzles (at least linear, parallel rows, circular, floor, day/month, comparison), inequality, syllogism, direction, blood relation, alphanumeric/letter series.
3. Authored English, verified: RC (≥ 8 passages), error spotting (≥ 60), para jumbles (≥ 8 sets), fillers (≥ 60), phrase replacement (≥ 50), misspelt words (generator-assisted, ≥ 80).
4. **Full mock (SBI pattern)** + three sectional mocks + chapter practice at all four difficulties for everything above.
5. Deploy. Print the URL.

### Phase 2 — "Complete coverage" (before IBPS Clerk prelims, 10 Oct)

- Every chapter in section 8 at ≥ 50 verified questions per chapter (generators: unlimited, plus a frozen reference set).
- Extreme tier everywhere.
- IBPS section order and blueprint variants.
- Progress analytics, mistakes book, "Try a similar one", speed drills, rough pad, share-by-link, download-all-for-offline.

### Phase 3 — "Mains" (before SBI mains in November and IBPS mains on 27 Dec)

- Mains-level chapters: input–output, data sufficiency, statement & conclusion/assumption/argument/course of action, cause & effect, cloze, para filler, para summary, quadratic, harder DI.
- Research the current official mains pattern first (it changes), then add a mains mock mode.

---

## 5. Tech stack and architecture

| Concern | Choice | Why |
|---|---|---|
| Build | Vite + React (latest stable) + TypeScript `strict` | Fast, static output |
| Styling | Tailwind CSS v4 with design tokens as CSS variables | Tokens drive light/dark themes |
| State | Zustand, persisted to IndexedDB via `idb-keyval` | Tiny, simple |
| Routing | React Router with SPA fallback on the host | Clean URLs, shareable test links |
| Maths rendering | KaTeX | Fractions, roots, powers render properly |
| Charts (DI) | Hand-written SVG components (bar, grouped bar, line, multi-line, pie, stacked bar) | No chart library — bundle budget |
| Content validation | `zod` schemas for every question/set | Bad content fails the build |
| RNG | Seeded PRNG (`sfc32` or `mulberry32`) | Reproducible questions. **`Math.random` is banned in generators** |
| Heavy work | Web Worker for puzzle solving and mock assembly | UI never janks |
| PWA | `vite-plugin-pwa` (Workbox) | Offline, installable |
| Fonts | Self-hosted via `@fontsource` (no Google Fonts CDN at runtime) | Offline + privacy |
| Tests | Vitest, `fast-check`, Playwright (mobile emulation), `@axe-core/playwright` | Section 14 |
| Hosting | Cloudflare Pages or Vercel (static), GitHub repo | Free, fast in India |

### Suggested structure

```
/src
  /app            routes, layout, bottom nav
  /exam           test engine: store, timer, scoring, palette, section flow
  /screens        Home, Practice, ChapterConfig, Instructions, Exam, Result, Solutions, Progress, Mistakes, Settings
  /components     OptionRow, Bubble, TimerPill, PaletteSheet, StimulusPanel, BottomSheet, RoughPad, charts/*
  /content
    /generators
      /quant       one file per chapter, each exporting generate(seed, difficulty, subtype)
      /reasoning   same; puzzles use /solver
      /solver      constraint solver for seating & puzzles, syllogism region engine, inequality closure
    /verify        independent re-implementations used only by tests and build checks
    /authored      JSON banks (English, critical reasoning), one file per chapter
    /blueprints    mock blueprints (SBI, IBPS, variants)
  /analytics      aggregation per chapter/subtype/difficulty, pace, weak-area ranking
  /lib            rng, katex, format (₹, Indian digit grouping), storage
/scripts          build-time generation of puzzle banks, content QA, duplicate detection
/research         archetypes.md and notes
/tests            unit, property, e2e
```

---

## 6. Data model (TypeScript)

```ts
type Subject = 'english' | 'quant' | 'reasoning';
type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';
type Rich = string; // markdown + inline KaTeX ($...$). Sanitised. No raw HTML.

interface Question {
  id: string;                 // stable, e.g. "quant.si-ci.diff-3yr.h.9f2c1a"
  subject: Subject;
  chapter: ChapterId;         // see section 8
  subtype: string;            // e.g. "ci-si-difference-3yr"
  difficulty: Difficulty;
  setId?: string;             // shared stimulus (puzzle, DI, RC, cloze, para jumble, caselet)
  prompt: Rich;
  options: [Rich, Rich, Rich, Rich, Rich]; // exactly 5, all distinct after normalisation
  answerIndex: 0 | 1 | 2 | 3 | 4;
  targetSeconds: number;      // section 7.3
  solution: {
    steps: Rich[];            // one operation per step
    shortcut?: Rich;          // the fastest exam method
    trap?: Rich;              // why the most tempting wrong option is wrong
    visual?: VisualSpec;      // e.g. final seating diagram, Venn, direction path
    rule?: string;            // English: grammar rule name
  };
  tags: string[];             // concept tags, e.g. "grammar:subject-verb-agreement", "trick:successive-percent"
  source: 'generator' | 'authored';
  generator?: { name: string; version: number; seed: string };
  verification: { method: 'computed+independent' | 'solver-unique' | 'blind-solve'; passedAt: string };
}

interface QuestionSet {
  id: string;
  subject: Subject;
  chapter: ChapterId;
  kind: 'puzzle' | 'seating' | 'di' | 'caselet' | 'rc' | 'cloze' | 'parajumble' | 'coding' | 'input-output';
  difficulty: Difficulty;
  stimulus: Rich;             // clues, passage, caselet text
  chart?: ChartSpec;          // DI
  table?: TableSpec;          // DI
  questionIds: string[];
  targetSeconds: number;      // for the whole set
}

interface TestConfig {
  kind: 'practice' | 'chapter-test' | 'sectional' | 'full-mock' | 'drill' | 'weak-mix' | 'mistakes';
  exam: 'sbi-clerk' | 'ibps-clerk';
  sections: { subject: Subject; count: number; seconds: number; blueprint?: string }[];
  sectionOrder: Subject[];
  sectionalTiming: boolean;
  strictTimer: boolean;       // true = timer never pauses (mocks default)
  instantFeedback: boolean;   // practice only
  difficultyMix: Record<Difficulty, number>;
  seed: string;
  pace: 'exam' | 'pressure' | 'relaxed' | 'untimed'; // 1.0x, 0.8x, 1.3x, none
}

interface ResponseState {
  selected: number | null;
  marked: boolean;
  visited: boolean;
  activeMs: number;           // time spent on-screen while the page is visible
  visits: number;
  answerChanges: number;
}

interface Attempt {
  id: string;
  config: TestConfig;
  questions: Question[];      // full snapshot, so history survives generator changes
  sets: QuestionSet[];
  sectionDeadlines: number[]; // epoch ms, per section
  pausedAt?: number;          // non-strict modes only
  currentSection: number;
  currentIndex: number;
  responses: Record<string, ResponseState>;
  status: 'in-progress' | 'submitted';
  createdAt: number;
  submittedAt?: number;
}
```

---

## 7. The question engine

### 7.1 Two sources of questions

1. **Generators (GEN)** — code that builds a question from a seed and difficulty, computes the answer, and builds distractors from real mistakes. Used for all Quant, and all Reasoning except critical reasoning and word-category classification. Generators give effectively unlimited fresh practice, so "50 per chapter" is a floor, not a ceiling.
2. **Authored banks (AUTH)** — written by you (Claude) as JSON: English and statement-based reasoning. Every item goes through the verification pipeline in 7.6.
3. **Hybrid (HYB)** — authored frames plus generated variation (e.g. misspelt words: authored sentences, generated misspellings checked against a dictionary).

**Build backward, not forward.** Pick the clean answer first, then construct the question so the numbers work out exactly like real papers (integers, neat fractions, π = 22/7 with radii in multiples of 7, percentages that map to simple fractions).

### 7.2 Seeds, IDs, snapshots

- Every generated question is a pure function of `(generatorName, version, subtype, difficulty, seed)`.
- Fixed mocks ("Mock 01" … "Mock 30") use fixed seeds so retakes are identical and comparable. "Fresh mock" uses a random seed.
- Attempts store full question snapshots, so bumping a generator version never corrupts history.
- **Puzzles and seating are pre-generated at build time** (`/scripts/build-puzzles.ts`): at least 150 verified-unique sets per type per difficulty, shipped as lazy-loaded JSON. The solver is too slow to guarantee instant runtime generation on low-end phones. Also run the solver in a Worker for fresh runtime sets, prefetching the next set while the user works on the current one.

### 7.3 Difficulty ladder and time targets

| Level | Meaning | Share in a mixed chapter set |
|---|---|---|
| Easy | One concept, one or two steps, clean numbers. Warm-up; slightly below exam level | 20% |
| Medium | **Exactly SBI/IBPS Clerk prelims level** (most shifts are rated easy–moderate) | 35% |
| Hard | Toughest clerk shifts and PO prelims level; 3+ steps, fractions, traps, more case-splitting | 30% |
| Extreme | Mains and beyond; combined concepts, uncertain counts, heavy calculation. Builds speed headroom — nobody should hit 100% here | 15% |

Target time per question (seconds). Sets list the time for the whole set.

| Question kind | Easy | Medium | Hard | Extreme |
|---|---|---|---|---|
| Simplification / approximation | 20 | 30 | 45 | 60 |
| Arithmetic word problem | 35 | 50 | 75 | 110 |
| Number series | 25 | 35 | 50 | 70 |
| Quadratic comparison | 25 | 35 | 45 | 60 |
| DI set (5 Qs) | 200 | 270 | 360 | 450 |
| Caselet set (3 Qs) | 120 | 160 | 220 | 280 |
| Puzzle / seating set (5 Qs) | 180 | 270 | 380 | 500 |
| Short reasoning (inequality, syllogism, direction, blood relation, series, coding, ranking) | 20 | 30 | 45 | 65 |
| Critical reasoning | 35 | 50 | 70 | 90 |
| English single (error, filler, spelling, phrase, word swap, usage) | 20 | 30 | 40 | 55 |
| Para jumble set (5 Qs) | 150 | 200 | 260 | 320 |
| RC set (per passage, incl. reading, 8–10 Qs) | 300 | 390 | 480 | 600 |
| Cloze set (5–8 Qs) | 150 | 210 | 270 | 330 |

- Timed chapter tests default to the sum of targets, rounded up to the minute. Pace options: *Exam pace* (1.0×, default), *Pressure* (0.8×), *Relaxed* (1.3×), *Untimed*.
- After enough attempts are stored, compare the user's median time per subtype with the target and show it (section 11).

### 7.4 Options and distractors

- Exactly 5 options, all distinct after normalisation (trim, case, numeric value).
- **Numeric distractors come from real mistakes**, and each generator documents which mistake produced which distractor. Examples: wrong base in percentage, SI instead of CI, forgetting to subtract the principal, adding speeds instead of subtracting, off-by-one in years or steps, rounding too early, using the whole instead of a part, reversing a ratio.
- Numeric options sorted ascending, similar magnitude, formatted the same way.
- "None of these" / "Cannot be determined" appear only where real papers use them (DS, inequality, blood relation with undetermined gender, some arithmetic). When present, they are the correct answer in roughly 10–15% of those cases, and only when the logic genuinely demands it.
- Across any test, the correct letter must be close to uniform across A–E (tested; section 14).
- Approximation: options at least ~8% apart so the nearest option is unambiguous. Verify by computing the exact value and checking the nearest option equals the key.

### 7.5 Solution format (what makes this better than paid apps)

Every solution has:

1. **Answer:** e.g. "(C) ₹1,440".
2. **Steps:** numbered, one operation per line, units shown.
3. **Fast method:** the exam trick, e.g. "Successive change: a + b + ab/100", "Efficiency method with LCM", "Unit digit elimination", "Use options — only (B) is divisible by 7".
4. **Trap:** why the most tempting wrong option is wrong.
5. **Visuals where they help** (generated from ground truth, never hand-drawn):
   - Seating/puzzles: final arrangement as SVG (circle, rows, square, floor table, box stack), plus which clues to start with and why ("Clues 3 and 5 fix two seats — start there").
   - Syllogism: the minimal Venn diagram(s) that prove or disprove each conclusion.
   - Direction: the path drawn on a grid with the shortest distance marked.
   - Blood relation: family tree with gender markers.
   - Inequality: the chain rewritten with the relevant link highlighted.
6. **English:** rule name, the corrected sentence, and a one-line reason.
7. **Your time vs target time** (shown in the solutions screen).

### 7.6 Verification pipeline (answer keys must be right)

**Generators**
- Every generator has an **independent verifier** in `/content/verify` written separately (different method where possible — e.g. brute-force enumeration vs formula). Property tests run ≥ 500 seeds × each difficulty × each subtype and assert: key equals verifier's answer; exactly one option matches; options distinct; values in sane ranges (no negative ages, no 400% profit unless intended, no ₹0.37 prices); prompt renders through KaTeX without errors.
- **Seating/puzzles:** the solver must confirm **exactly one** arrangement satisfies all clues (or, for uncertain-count puzzles, exactly one count and the asked facts are fixed). Every question's answer is read from the unique solution. Difficulty is measured, not guessed: record the solver's branching (number of cases that survive the first pass) and bucket into levels.
- **Syllogism:** region-enumeration engine. For n sets, enumerate all subsets of the 2ⁿ−1 Venn regions (for 4 sets: 2¹⁵ = 32,768 worlds). Keep worlds consistent with the statements. A conclusion is *definitely true* if true in every world; *possible* if true in at least one. Encode "Only a few A are B" as: some A are B AND some A are not B. Also verify against a hand-checked table of ≥ 40 classic cases.
- **Inequality:** build the relation graph, compute the transitive closure over {>, ≥, =}; a conclusion is true only if implied. Handle "either–or" correctly: two conclusions on the same pair that are individually undetermined but jointly exhaustive (e.g. A > B and A = B when A ≥ B is known).

**Authored content**
1. Write in batches of 25 per chapter as JSON.
2. **Blind solve:** a separate subagent (or a fresh pass with the key hidden) answers every question and rates ambiguity 1–5.
3. Any mismatch, or ambiguity ≥ 3, is rewritten and re-solved, or deleted.
4. Para jumbles: blind-solve twice with the sentence order shuffled; both passes must agree with the key.
5. Schema check (zod), near-duplicate check (normalised text + trigram similarity > 0.85 rejected), and a spelling/grammar sanity pass on everything except the deliberately wrong parts.
6. Write `content-qa-report.md`: per chapter — written, passed, rewritten, dropped, final count.

### 7.7 Volumes

| Chapter type | Minimum at end of Phase 2 |
|---|---|
| Generator chapters | Unlimited at runtime + a frozen reference set of ≥ 60 (15/20/15/10 by difficulty) |
| Set-based generator chapters (puzzles, seating, DI) | ≥ 150 pre-generated sets per type per difficulty |
| Authored single-question chapters | ≥ 60 (12 easy / 20 medium / 16 hard / 12 extreme) |
| RC | ≥ 20 passages (8–10 Qs each) |
| Para jumbles / cloze | ≥ 15 sets each |
| Critical reasoning (each of the 5 chapters) | ≥ 50 |

Highest-weight chapters (simplification, DI, puzzles/seating, RC, error spotting, fillers, para jumbles) should go well beyond the minimum.

---

## 8. Chapter-by-chapter specification

Legend — **Priority:** P1 = high weight in prelims (Phase 1), P2 = regular in prelims or IBPS variants (Phase 2), P3 = mainly mains (Phase 3). **Method:** GEN / AUTH / HYB (section 7.1). Ladder notes describe what changes from Easy → Extreme. Use `research/archetypes.md` to refine every item below.

### 8.1 Quantitative Aptitude (user's list + 2 extras that keep appearing)

**Q1. Simplification & Approximation** — P1 — GEN
- Subtypes: BODMAS chains; fractions and mixed fractions; decimals; "x% of y"; squares/cubes/roots (squares to 35, cubes to 25); exponents with same base (2ᵃ × 4ᵇ = 8^?); missing value "?" anywhere in the expression; approximation with near-integers (e.g. 24.98% of 1199.87 + 16.02² ≈ ?).
- Ladder: E — 3 terms, integers, "?" on the right. M — 4–5 terms with one %, fraction or root. H — 5–7 terms, mixed fractions, "?" inside (?², √?, ?% of). X — nested brackets, ?³, double approximation, factor recognition needed.
- Rules: exact items must resolve to an integer or neat fraction (build backward). Approximation per 7.4.
- Teach: digit-sum check, unit-digit elimination, % ↔ fraction table (12.5% = 1/8, 16.66% = 1/6 …), squares and cubes recall.

**Q2. Number Series** — P2 (prelims 0–5) — GEN
- Subtypes: missing number, wrong number. Pattern families (≥ 30): ±n², ±n³, ×k ± c, ×1+1, ×2+2…, increasing multipliers, differences in AP/GP, second- and third-level differences, alternating twin series, prime differences, n² ± 1, sum of previous two, ×0.5 / ×1.5 decimals, ÷ patterns.
- Ladder: E — single constant step. M — growing differences, ×k + c. H — two-level differences, alternating, wrong-number. X — mixed operations with decimals/fractions, three-level, alternating + wrong number.
- Uniqueness: run a pattern finder over all families; the intended pattern must be the simplest that fits every given term, and no distractor may be produced by another family that also fits.

**Q3. Percentage** — P1 — GEN
- Subtypes: base change (A is x% more than B → B is ?% less than A), successive change, population growth/depreciation, election (invalid votes, winning margin), income–expenditure–savings, marks and pass %, % of % chains.
- Traps: wrong base, adding successive percentages directly.

**Q4. Profit & Loss** — P1 — GEN
- Subtypes: CP/SP/MP, discount, successive discounts, profit on SP vs CP, dishonest dealer (false weights), buy x get y free, two items at the same SP (one profit, one loss), overall profit/loss, marked-up-then-discounted.
- X: combined with partnership or SI, or multi-stage supply chain.

**Q5. Ratio & Proportion** — P1 — GEN
- Subtypes: dividing amounts, ratio change after adding/removing, coins in a bag, income/expenditure ratios, mean/third/fourth proportional, compounded ratios, variation.

**Q6. Partnership** — P1 — GEN
- Subtypes: time-weighted capital, joining/withdrawing mid-year, capital changes, working-partner salary or commission before split, finding capital from profit share.

**Q7. Speed, Distance & Time** — P1 — GEN (includes trains)
- Subtypes: average speed, relative speed, trains crossing pole/platform/each other/a man, meeting point, late/early arrival, stoppage time, circular track (X).
- Traps: adding speeds when moving in the same direction; km/h ↔ m/s (×5/18).

**Q8. Boat & Stream** — P1 — GEN
- Subtypes: upstream/downstream speed, still-water speed, round-trip time, ratio of times, distance covered in total time.

**Q9. Simple & Compound Interest** — P1 — GEN
- Subtypes: SI basics, CI annual/half-yearly/quarterly, CI−SI difference for 2 and 3 years, sum doubling/tripling, sum split at different rates, instalments (X), SI/CI caselets for DI.

**Q10. Averages** — P1 — GEN
- Subtypes: add/remove/replace a member, wrong entry corrected, cricket runs, teacher joining a class, consecutive numbers, weighted average of groups.

**Q11. Time & Work** — P1 — GEN
- Subtypes: efficiency (LCM method), working together, one leaves after d days, alternate days, M₁D₁H₁/W₁ = M₂D₂H₂/W₂, wages split by work done, men–women–children equivalence (H/X).

**Q12. Pipes & Cisterns** — P2 — GEN
- Subtypes: fill/empty, leak, alternate opening, pipe closed after t minutes, tank partly full at start.

**Q13. Quadratic Equations** — P2 (P1 for mains) — GEN
- Format: two equations in x and y; options: x > y, x < y, x ≥ y, x ≤ y, x = y or relation cannot be established.
- Generate from chosen roots (integer → fractional → surd forms); include x² = k type (± roots).
- Traps: sign of roots, comparing when roots interleave.

**Q14. Mensuration 2D & 3D** — P2 — GEN
- 2D: rectangle, square, circle, semicircle, triangle, trapezium, rhombus, path around/inside a field, % change in area when sides change.
- 3D: cube, cuboid, cylinder, cone, sphere, hemisphere; melting and recasting; water level rise; cost of painting.
- π = 22/7 with radii in multiples of 7.

**Q15. Data Interpretation** — P1 — GEN (set-based, 5 Qs per set; caselets 3 Qs)
- Types: table (incl. male/female split, 5 entities × 3–4 attributes), bar (single and grouped), line (single and multi), pie (degrees or %), stacked bar, caselet (paragraph data), missing-value table (X), arithmetic DI (SI/CI or P&L inside the data).
- Question types per set: ratio, % increase/decrease, average, difference, "what % of", sum across categories.
- Values printed on charts, as in clerk papers. Build values backward so answers are clean.
- Render charts as responsive SVG that stays readable at 360 px width; tables scroll horizontally inside their container.

**Q16. Problems on Ages** (extra) — P1 — GEN
- Ratios now and after/before n years, sum and ratio, family members, average-age combos.

**Q17. Mixture & Alligation** (extra) — P1 — GEN
- Alligation of prices, milk–water replacement (repeated removal), mixing two solutions, profit via adding water.

### 8.2 Reasoning Ability (the 17 chapters from the user's index)

**R1. Coding–Decoding** — P1/P2 — GEN
- Subtypes: letter shift (+n/−n/alternating), reverse order, opposite-letter pairs (A↔Z), positional rules, **new-pattern sentence coding** (e.g. "sky is blue" → codes; every asked word must decode uniquely — verify), letter–number coding with conditions (mains), "how many letters stay in place".
- Must support a full 5-question coding set (seen in IBPS Clerk 2025).

**R2. Classification (odd one out)** — P2 — HYB
- Letter groups (GEN: gap patterns, mirror pairs, vowel positions), numbers (GEN: primes, squares, divisibility, digit sums), words by category (AUTH).

**R3. Arrangement & Pattern (series)** — P1 — GEN
- Alphanumeric series with symbols: "How many numbers are immediately preceded by a letter and followed by a symbol?", "What is 4th to the right of the 12th from the left?", rule-based removal then position.
- Letter/word based: rearrange a word's letters alphabetically — how many stay in place; letter pairs with as many letters between them as in the alphabet; meaningful words from given letters (dictionary-checked).
- Number-based: sets of three-digit numbers — reverse digits / add 1 to first digit / product of digits of the highest.

**R4. Inequality** — P1 — GEN (closure engine, 7.6)
- Subtypes: direct, coded symbols, combined statements, "which symbol replaces ? so that the expression holds", either–or cases.
- Options: If only I is true / only II / either I or II / neither / both.

**R5. Syllogism & Venn Diagram** — P1 — GEN (region engine, 7.6)
- Subtypes: 2–3 statements with 2 conclusions; possibility conclusions ("All A being C is a possibility"); "only a few"; reverse (find which statements make the conclusions true — H/X); Venn diagram representation (P3, SVG options).
- Visual solution: minimal Venn diagrams showing why.

**R6. Input–Output** — P2 (P1 for mains) — GEN
- Machine rearrangement of words/numbers (one element moves per step, ascending/descending), shifting patterns, arithmetic operations on numbers per step.
- Questions: step X, last step number, position of an element in a step, which element is n-th from the right in step k.

**R7. Order & Ranking** — P1 — GEN
- Position from both ends, total persons, interchange positions, comparison ordering (height/weight/marks — also used as the 3-Q mini puzzle in mocks).

**R8. Seating Arrangement** — P1 — GEN + solver (build-time bank)
- Linear: single row facing north/south/mixed; **parallel rows** (5 + 5, facing each other or same direction); **uncertain number of persons**.
- Circular: facing inside / outside / mixed.
- Square / rectangular: 4 at corners + 4 at middles, inside/outside mixes.
- Ladder: E — 5–6 persons, mostly direct clues. M — 8 persons, some relative clues (typical prelims). H — 8–10 persons, negative clues ("neither … nor"), 2–3 case splits. X — 10–12 persons, two attributes (e.g. person + profession), uncertain count, 4+ case splits.
- Questions: who sits n-th to the left/right of X, how many between, immediate neighbours, "four of the five are alike — which is odd", which statement is true, final position after an interchange.

**R9. Puzzle** — P1 — GEN + solver (build-time bank)
- Floor (8 floors; 4 floors × 2 flats), box/stack (8), **day-based** (Mon–Sun), **month-based** (Jan–Dec with 30/31 days; dates like 12th/19th), year/age-based, comparison (height/weight), sequence/scheduling with 2–3 attributes (person × city × colour), designation-based.
- Same ladder logic and question styles as R8.

**R10. Blood Relation** — P1 — GEN
- Direct statements, coded relations ("A + B means A is the father of B"), family puzzle (3 generations, up to 8 members). "Cannot be determined" is correct only when gender or link is truly undetermined — verify from the family graph.

**R11. Distance & Direction** — P1 — GEN
- Coordinate walks, shortest distance (Pythagorean triples or clean surds), final facing direction, shadow-based (sunrise/sunset logic), coded directions ("A # B means A is 5 m north of B"), pole/point-based sets.

**R12. Data Sufficiency** — P2/P3 — GEN (reuses R7–R11 engines)
- Standard 5 options (I alone / II alone / either alone / both needed / even both insufficient). The solver checks sufficiency of each combination.

**R13. Statement & Conclusion** — P3 — AUTH
**R14. Statement & Assumption** — P3 — AUTH
**R15. Statement & Argument** — P3 — AUTH
**R16. Statement & Course of Action** — P3 — AUTH
**R17. Cause & Effect** — P3 — AUTH
- Follow the standard bank-exam conventions strictly: a conclusion must follow from the statement alone; an assumption is implicit and necessary; a strong argument is relevant, important and directly linked; a course of action is practical and addresses the stated problem; cause–effect options include independent causes and common-cause cases.
- Tag each item with the principle it tests. Blind-solve verification is mandatory here — these are the easiest to get subtly wrong.

### 8.3 English Language (the 14 chapters from the user's index)

Use **British/Indian English spelling** (colour, organise, programme) — the exams use it, and spelling questions depend on it. Tag every item with its grammar or vocabulary concept for analytics.

**E1. Basic Grammar** — P2 — AUTH
- Concept drills: subject–verb agreement, tenses, articles, prepositions, pronouns, adjectives/adverbs, degrees of comparison, conditionals, parallelism, modifiers, question tags, gerund/infinitive, "one of the + plural".

**E2. Error Spotting** — P1 — AUTH
- Classic format: sentence split into (A)–(D) + (E) No error. Also newer variants (which highlighted part is incorrect; which part needs correction).
- Ladder: E — obvious agreement/article error. M — prelims standard. H — neither–nor agreement, subjunctive, redundancy, idioms. X — subtle usage, two plausible errors with only one real.

**E3. Sentence Improvement / Phrase Replacement** — P1 — AUTH
- Bold phrase + 4 replacements + "No replacement required" (correct in ~15% of items).

**E4. Filler** — P1 — AUTH
- Single, double and triple blanks; grammar-based and vocabulary-based; "which word fits both sentences" variant.

**E5. Sentence Connectors / Conjunction** — P2 — AUTH
- Combine two sentences with given starters ("Although", "Despite", "Not only") — options like "Only A", "Both A and B", "None".

**E6. Spellings (misspelt words)** — P1 — HYB
- Authored sentences with 4–5 highlighted words; the generator corrupts one word using real misspelling rules (doubled consonants, ie/ei, -ance/-ence, -able/-ible, dropped silent letters) from a curated list of ≥ 400 commonly misspelt words. The corrupted form must not be a valid word (check against a bundled dictionary). Include "All correct" as an option where the format allows.

**E7. Word Swap** — P1/P2 — AUTH
- Sentence with 4–5 bold words; which pair must be swapped to make it correct, or "No swap required".

**E8. Word Usage** — P2 — AUTH
- One word used in 2–3 sentences; which use(s) are correct. Homographs, phrasal verbs, confusables (affect/effect, principal/principle).

**E9. Cloze Test** — P2 — AUTH
- 250–350 word original passage, 5–8 blanks, 5 options each.

**E10. Reading Comprehension** — P1 — AUTH
- Original passages, 350–550 words. Themes: banking, RBI and monetary policy, UPI/fintech, economy, agriculture, health and nutrition, environment, a business case (e.g. a small bio company, a consumer brand), technology/AI, social issues. Neutral tone; no political controversy.
- 8–10 questions per passage: main idea, fact-based, inference, tone, title, "which of the following is/are true (I, II, III)", synonym and antonym of highlighted words.

**E11. Para Jumbles** — P1 — AUTH (set-based)
- 5–6 sentences (sometimes one fixed). Set questions: which is the first / second / … / last sentence after rearrangement; plus full-order variants.

**E12. Match the Column** — P2 — AUTH
- Column I (3 starters) × Column II (3 endings); options like "A–E, B–D, C–F".

**E13. Para Filler** — P3 — AUTH
- A paragraph with one missing sentence; choose the best fit.

**E14. Para Summary** — P3 — AUTH
- Choose the option that best summarises the paragraph.

---

## 9. Test modes and mock blueprints

### 9.1 Modes

| Mode | What it is | Timer | Feedback |
|---|---|---|---|
| Chapter practice | Pick chapter → difficulty (Easy / Medium / Hard / Extreme / Mixed) → count (10 / 20 / 30 / 50) → optional subtype chips | Per-question stopwatch, or untimed | Instant (toggle) |
| Chapter test | Same picker, exam-style | Sum of targets × pace | At the end |
| Sectional mock | English 30 Qs / 20 min, Numerical 35 / 20, Reasoning 35 / 20, built from the blueprint | 20 min | At the end |
| **Full mock** | 100 Qs / 60 min, sectional timing, SBI or IBPS order | 3 × 20 min, strict | At the end |
| Speed drill | e.g. 20 simplification in 7 min, 10 inequality in 3 min, 10 syllogism in 5 min, 10 misspelt in 3 min, 1 puzzle set in 4 min | Countdown + live pace meter | At the end |
| Weak-area mix | Auto-built from analytics: lowest accuracy × highest exam weight | Exam pace | At the end |
| Mistakes revision | Wrong, skipped and bookmarked questions | Untimed | Instant |

- **Fixed mocks:** "Mock 01" … "Mock 30" (fixed seeds, each labelled with its blueprint variant) + **"Fresh mock"** (random seed).
- **Mock difficulty presets:** *Exam level* (15% easy / 50% medium / 30% hard / 5% extreme), *Tough* (0/35/45/20), *Extreme* (0/10/50/40).
- **Share:** every test's config + seed is encoded in the URL (`/t/<encoded>`), so a friend opening it gets the identical paper.

### 9.2 Blueprints (from section 3.4; each mock picks one variant)

**Reasoning (35)**
- Variant A (SBI-style): 3 puzzle/seating sets × 5 (no two of the same type) + 3-Q comparison or sequence mini-puzzle = 18; inequality 3; syllogism 3; series 5; direction 2 + blood relation 2; misc 2 (meaningful word / pair formation / odd one out / number-based).
- Variant B (IBPS 2025-style): 3 puzzle/seating sets × 5 = 15; coding–decoding set 5; syllogism 3; direction 3; blood relation 2; inequality 3; series 4.

**Numerical Ability (35)**
- Variant A: simplification/approximation 12; DI 2 sets × 5 = 10; caselet 3; arithmetic 10.
- Variant B: simplification 10; number series 5; DI 2 sets × 5 = 10; arithmetic 10.
- Variant C (2024-style): simplification 15; DI 1 set × 5; number series 5; arithmetic 10.
- Arithmetic draws across chapters without repeating a chapter until all have appeared.

**English (30)**
- Variant A: RC 9; error detection 5; para jumble 5; filler 3; misspelt 4; phrase replacement 3; word usage or match the column 1.
- Variant B: RC 10; error detection 5; word swap 5; para jumble 5; match the column 2; word usage 1; filler 2.

Blueprints live in `/content/blueprints` as data so adding a pattern later is config, not code. Assert in tests that every blueprint sums to the section total.

---

## 10. Screens and UX (mobile)

Bottom navigation (hidden during tests): **Home · Practice · Mocks · Progress · Mistakes**. Settings via an icon on Home.

### 10.1 Home
- Top: app name (small), settings icon, and a line with the user's target exam and countdown (e.g. "SBI Clerk prelims in 3 days"), set in Settings.
- **Continue** row if a test is in progress (name, section, time left). One tap resumes.
- **Full mock** as the primary action, then **Sectional mocks** (3 rows), then **Practice by subject** (3 rows showing chapters practised and accuracy), then **Speed drills** as a horizontal row of chips.
- Lists and rows, not a grid of identical cards. No marketing hero, no illustrations.

### 10.2 Practice → Subject → Chapter → Config sheet
- Chapter list shows: name, priority marker for exam weight (e.g. "High weight in prelims"), your accuracy, questions done.
- Tap a chapter → bottom sheet: difficulty (segmented), count, mode (Practice / Test), pace, subtype chips (collapsed by default), **Start**. Remember last choices per chapter.

### 10.3 Instructions (mocks only)
- Mirrors the real exam: sections, questions, time, marking, the palette legend. Checkbox "I have read the instructions", then **Start test**. Keep it to one screen.

### 10.4 The exam screen (the most important screen — make it perfect)

**Layout, top to bottom (portrait, 360 px wide):**
1. **Top bar (56 px):** section name (tap opens section tabs; disabled for other sections in sectional-timing mode), **timer pill** on the right (mm:ss, tabular figures), palette button (grid icon).
2. **Info strip:** "Q 12 of 35", marks "+1 / −0.25", small per-question stopwatch (toggle in the test menu), bookmark icon, rough-pad icon.
3. **Stimulus panel** (only for set questions): collapsible panel with the puzzle clues / DI chart / RC passage, max height ~45% of the viewport with its own scroll, and a sticky mini-header ("Puzzle — question 3 of 5" / "Passage"). State (open/closed, scroll position) persists while moving within the set. For RC also offer a full-screen "Read passage" view.
4. **Question text** (17 px default, adjustable).
5. **Options A–E:** full-width rows, min 52 px tall, OMR-style bubble with the letter + option text. Tap anywhere on the row to select; tap again to deselect. No accidental double-actions.
6. **Bottom action bar** (fixed, safe-area aware, ~64 px): **Mark for review & next** · **Clear response** · **Save & next** (primary). A small "‹ Previous" in the info strip or via the palette.

**Palette (bottom sheet):**
- Section tabs; legend with live counts; grid of question numbers (5–6 per row, ≥ 44 px cells); **Submit test** at the bottom.
- Status convention (keep these semantics exactly, users know them from the real exam):
  - Not visited — grey
  - Not answered (visited) — red
  - Answered — green
  - Marked for review (no answer) — purple
  - Answered & marked for review — purple with a green tick. **This one is evaluated.**
- Saving rule (mirror the real exam, it builds the right habit): a selection counts only after *Save & next* or *Mark for review & next*. If the user jumps away via the palette or *Previous* with an unsaved selection, the question keeps its last saved state, and a small toast says "Answer not saved — use Save & next". State this rule on the instructions screen.

**Timer rules:**
- Store `sectionDeadline = startedAt + sectionSeconds` (epoch ms). Display `deadline − Date.now()`, updated with `requestAnimationFrame`/1 s tick. Never count down with a decrementing counter — it drifts when the tab is backgrounded.
- On `visibilitychange`, `pageshow` and app resume, recompute immediately. If the deadline has passed while away, close the section and advance (strict mode).
- Strict mode (default for sectional and full mocks): timer never pauses, like the real exam. Non-strict (practice, chapter tests): pausing records `pausedAt` and extends deadlines on resume.
- Warnings: at 5:00 the pill turns amber; at 1:00 it turns red with a single subtle pulse and a toast ("1 minute left in Reasoning"). Optional short vibration (Settings).
- Section end: auto-save the current response, show a 3-second interstitial ("Reasoning time is over. Numerical Ability starts now."), then continue.
- Request a **Screen Wake Lock** during tests (re-acquire on visibility change).

**Protection against accidents:**
- `beforeunload` warning during a test. Intercept the Android back button (history state): show "Leave the test? Your progress is saved." In strict mode, say the timer keeps running.
- The attempt is saved to IndexedDB on every interaction (debounced ~300 ms) and on `pagehide`. A reload returns to the exact question, selection, stimulus state and correct remaining time.

**Submit flow:**
- Bottom sheet with a per-section table: answered, not answered, marked, not visited. Buttons: **Submit test** and **Keep going**. Full mocks also auto-submit when the last section ends.

**Rough pad (Phase 2):**
- Pencil icon opens a drawing overlay: the question stays visible in the top ~35%, a canvas below. Pen, eraser, undo, clear. Strokes kept per question for the attempt. Pointer Events, smooth lines, works with one finger.

**Test menu (⋮):** font size (A− / A+), theme (light / dark / system), per-question stopwatch on/off, instructions, report a problem with this question (saves locally to a "reported" list included in the export file).

### 10.5 Practice-mode feedback
- After selecting (with instant feedback on): lock the option, show correct/wrong state on the bubbles, reveal the solution below with the fast method first, then **Next**. Show "Your time 0:42 · Target 0:30".

---

## 11. Results, solutions and analytics

### 11.1 Result screen (right after submit)
- **Score:** net score out of total, per-section scores, correct / wrong / skipped, accuracy, time used per section.
- **Attempts vs good-attempts band** (section 3.3), with the disclaimer.
- **Negative-marking insight:** "Wrong answers cost you 3.25 marks. Skipping your 13 wrong answers would have scored X." Also the accuracy you need at your attempt count to reach a target score.
- **Time map:** one strip per section — a bar per question, height = time spent, colour = correct / wrong / skipped. Tapping a bar opens that solution.
- **Time sinks:** the 3–5 questions where you spent the most time relative to target, especially wrong ones ("Q23 puzzle — 2:40, wrong").
- **Topic table:** chapter/subtype rows with attempted, accuracy, average time vs target. Sort by marks lost.
- **Next steps:** buttons for *View solutions*, *Reattempt*, *Practise weak topics* (builds a weak-area mix).

### 11.2 Solutions screen
- Same layout as the exam screen. Filters: All / Correct / Wrong / Skipped / Marked / Bookmarked.
- Correct option in green; your wrong choice in red; your time vs target.
- Solution block per 7.5: Answer → Steps → Fast method → Trap → Visual.
- Buttons: **Bookmark**, **Try a similar one** (same generator, subtype and difficulty, new seed), **Report**.

### 11.3 Progress tab
- Per-subject and per-chapter mastery (accuracy weighted by difficulty), questions done, median time vs target.
- Mock score trend (last 20 mocks), per-section trend, attempts vs accuracy scatter.
- "Your weakest 5 subtypes by marks at stake" (accuracy gap × exam weight), each with a one-tap drill.
- Keep it factual. No badges, streak flames or confetti.

### 11.4 Mistakes tab
- Every wrong, skipped-after-visit and bookmarked question, grouped by chapter. Revise mode (untimed, instant feedback). Remove once answered correctly twice in a row (setting).

### 11.5 Settings
- Target exam and date (countdown on Home), default section order (SBI / IBPS), theme, font size, strict timer for mocks, vibration, per-question stopwatch default.
- **Export progress** (JSON download) and **Import progress**, so switching phones keeps history. **Reset all data** with confirmation.
- About: data stays on this device; no account; how answer keys are verified.

---

## 12. Visual design system

### 12.1 Direction
**An exam hall, not a SaaS dashboard.** Calm, high-legibility, ink on paper. The user will stare at this for hours under time pressure, often late at night, on a budget Android phone. Every pixel should reduce effort.

**One signature element, everything else quiet:** the options use **OMR-style bubbles** — a hollow circle with the letter inside that fills with ink when chosen (120 ms fill, like shading an answer sheet). In solutions, the correct bubble fills green and a wrong choice fills red. Nothing else gets decorative treatment.

### 12.2 Typography
- **Atkinson Hyperlegible Next** (`@fontsource/atkinson-hyperlegible-next`; fall back to `@fontsource/atkinson-hyperlegible` if unavailable). It was designed to keep similar glyphs distinct — 0/O, 1/l/I, 5/S, 8/B — which matters when misreading one digit costs a mark. One family for everything.
- Weights: 400 body, 600 emphasis, 700 headings and the timer.
- Scale (px): 13 / 15 / 17 / 20 / 24 / 30. Question text 17 (user-adjustable 15–21), options 16, line-height 1.5.
- `font-variant-numeric: tabular-nums` for the timer, scores, palette numbers and numeric options.
- Sentence case everywhere. No all-caps labels, no letter-spaced eyebrow labels.
- KaTeX output sized to match body text.

### 12.3 Colour tokens (CSS variables; verify WCAG AA for every text/background pair)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#F5F7FA` | `#10182A` | App background (cool, not cream) |
| `--surface` | `#FFFFFF` | `#172238` | Sheets, stimulus panel, option rows |
| `--ink` | `#15213D` | `#E7ECF5` | Primary text (ballpoint blue-black) |
| `--ink-2` | `#55607A` | `#9AA6BD` | Secondary text, bubble outlines |
| `--line` | `#E1E5EC` | `#26324A` | Dividers, borders |
| `--pen` | `#2446C7` | `#8AA4FF` | Primary action, selected bubble |
| `--answered` | `#178A57` | `#3DBB7E` | Palette: answered; correct |
| `--not-answered` | `#D2433A` | `#F0655B` | Palette: not answered; wrong |
| `--marked` | `#6A3DBF` | `#A583F0` | Palette: marked for review |
| `--not-visited` | `#CBD1DB` | `#3A4660` | Palette: not visited |
| `--warn` | `#C77A00` | `#F0A93B` | Timer under 5 minutes |

### 12.4 Layout and components
- 4 px spacing grid; 16 px screen padding; tap targets ≥ 48 px (palette cells ≥ 44 px).
- Radius has hierarchy: option rows 12 px, bottom sheets 20 px (top corners only), chips fully rounded, palette cells 10 px. Not one radius for everything.
- Separate list items with hairline dividers; use elevated surfaces only for sheets and the stimulus panel. No grid of identical shadowed cards, no gradient washes.
- Icons: `lucide-react`, sparingly, 20–22 px, always with a text label or aria-label.
- Components: `OptionRow`, `Bubble`, `TimerPill`, `PaletteSheet`, `StimulusPanel`, `BottomSheet`, `SegmentedControl`, `Chip`, `Toast`, `ResultStrip`, `RoughPad`, charts (`BarChart`, `GroupedBar`, `LineChart`, `PieChart`, `StackedBar`), `DataTable`, diagram renderers (`SeatingDiagram`, `FloorTable`, `VennDiagram`, `DirectionPath`, `FamilyTree`).

### 12.5 Motion
- Only in response to actions: bubble fill (120 ms), sheet open/close (200 ms ease-out), section interstitial, timer pulse once at 1:00.
- No page-load animations, no staggered entrances, no hover effects to design around (it's touch).
- `prefers-reduced-motion`: remove all non-essential motion.

### 12.6 Copy
- Plain verbs, sentence case, same name for an action everywhere: *Save & next*, *Mark for review & next*, *Clear response*, *Submit test*, *Start test*, *Resume test*.
- Empty states tell the user what to do: "No mistakes saved yet. Take a chapter test and your wrong answers will collect here."
- Errors say what happened and how to fix it. They don't apologise.
- No emojis in the UI, no hype.

---

## 13. Persistence, offline and performance

- **Storage:** IndexedDB (`idb-keyval`) for attempts, responses, analytics aggregates, mistakes, bookmarks, settings. Debounced saves (~300 ms) + save on `pagehide`. Handle quota errors with a clear message and an export prompt.
- **Export/Import:** single versioned JSON file; import validates with zod and merges or replaces (user chooses).
- **Offline:** precache the app shell, generators, fonts and KaTeX; runtime-cache authored banks and puzzle banks on first use. Settings → **Download everything for offline** (shows size). Show a small offline indicator when there's no network — the app should still fully work.
- **Performance budgets (throttled mid-range Android, 4G):**
  - Initial JS ≤ 170 KB gzipped; everything else lazy-loaded per route and per chapter.
  - Each chapter bank JSON ≤ 120 KB gzipped (split if larger).
  - LCP < 1.8 s; interaction to next paint < 100 ms on option tap and Save & next.
  - Lighthouse mobile: Performance ≥ 95, Accessibility ≥ 95, Best Practices ≥ 95 (Phase 2 target; ≥ 90 acceptable in Phase 1).
- Pre-assemble the next section's questions in a Worker while the user is in the current one.

---

## 14. Testing — the quiz must be bulletproof

### 14.1 Unit (Vitest)
- Scoring (+1 / −0.25 / 0; answered & marked counts; marked without an answer doesn't).
- Palette status derivation for every state transition (select, clear, mark, save, navigate away unsaved).
- Timer maths with mocked `Date.now` and fake timers: deadlines, pause/resume (non-strict), expiry while hidden (strict).
- Section auto-advance and locking; auto-submit at the end of the last section.
- Blueprint totals; mock assembly never repeats a question within a test.
- URL seed encode/decode round-trip; export/import round-trip.
- Analytics aggregation (accuracy, median time, weak-area ranking).

### 14.2 Property-based (fast-check)
- Every generator × subtype × difficulty × ≥ 500 seeds: key equals the independent verifier; exactly one correct option; 5 distinct options; sane value ranges; KaTeX renders; deterministic for the same seed.
- Correct-letter distribution across 2,000+ generated questions is close to uniform (chi-square, p > 0.01).

### 14.3 Solvers and engines
- Every shipped puzzle/seating set: solver confirms uniqueness; every answer derives from the unique solution (runs in CI over all JSON).
- Syllogism: ≥ 40 hand-checked classic cases including "only a few" and possibility.
- Inequality: either–or cases and coded-symbol cases.
- Blood relation: undetermined-gender cases resolve to "Cannot be determined" and only those.

### 14.4 Content QA
- zod schema on every authored item; duplicate/near-duplicate detection; blind-solve results in `content-qa-report.md`. The build fails on schema errors or unverified items.

### 14.5 End-to-end (Playwright, mobile emulation: Pixel 7, iPhone 13, and a 360×740 small Android)
1. Full mock: answer 5, mark 2 (one answered, one not), clear 1 → palette colours and counts correct.
2. Section expiry via Playwright's clock API → interstitial → next section; previous section locked.
3. Reload mid-section → same question, selection and stimulus state; remaining time correct within 1 s.
4. Page hidden for 3 minutes (strict) → timer shows 3 minutes less on return.
5. Scripted answer pattern → result score equals the expected value exactly.
6. Solutions filters; "Try a similar one" returns the same subtype and difficulty with a different question.
7. Offline after first load (`context.setOffline(true)`) → app opens and chapter practice works.
8. Android back button during a mock → leave dialog.
9. Practice with instant feedback → options lock, solution shows, times shown.
10. Export → reset → import restores history.

### 14.6 Accessibility and visual checks
- `@axe-core/playwright`: no serious or critical violations on any screen.
- No horizontal page scroll at 360 px (`scrollWidth <= innerWidth`), except inside table/chart containers.
- Screenshot every screen at 360 px in light and dark. Look at them. Fix clipping, overflow, cramped spacing and contrast before calling UI done.

### 14.7 CI
- GitHub Actions: typecheck → lint → unit → property (reduced seed count in CI, full count locally) → content QA → build → e2e. Deploy only on green.

---

## 15. Content style rules

- Indian context: ₹ with Indian digit grouping (1,20,000), lakh/crore where natural, Indian names from all regions and genders, everyday Indian settings (shops, trains, farms, banks, schools).
- Every question self-contained, unambiguous, with units stated. No trick wording that real papers don't use.
- Seating/puzzle names: mix single letters (A–H, P–W) and first names, as real papers do.
- British/Indian English spelling throughout.
- RC and English topics neutral: no party politics, religion, caste, or real living individuals.
- Difficulty comes from logic, calculation and traps — never from confusing language.

---

## 16. How you (Claude Code) should work

1. Read this whole file first. Write `PLAN.md`: architecture, the full generator list with subtypes, content batches, and a milestone checklist mapped to the phases. Then start building; don't wait for approval.
2. Parallelise with subagents where available: (a) exam engine + UI, (b) Quant generators + verifiers, (c) Reasoning generators + solver + puzzle banks, (d) authored English content + QA. Integrate on the main thread.
3. Commit after each milestone with a clear message.
4. Keep `PROGRESS.md` current: done / in progress / next, per-chapter counts by difficulty, QA pass rates, known issues.
5. Record every assumption or default in `DECISIONS.md`, one line each.
6. Only ask the user when blocked on something only they can provide (e.g. hosting login). Otherwise decide and note it.
7. A chapter isn't done until its tests pass and it meets the counts in 7.7.
8. Use web search to re-check the exam pattern if anything looks off, and to study memory-based papers for `research/archetypes.md`. Don't copy text.
9. Keep dependencies lean; justify anything over ~20 KB gzipped in `DECISIONS.md`.
10. Screenshot and critique screens at 360 px against section 12 before calling UI done.
11. At the end of each phase: deploy, print the URL, and list gaps honestly.

---

## 17. Definition of done

**Phase 1**
- [ ] Full mock (SBI order) runs end to end on a real phone: 3 sections, sectional timers, auto-advance, submit, result, solutions.
- [ ] Reload, backgrounding and screen lock during a mock keep the exact state and correct time.
- [ ] Chapter practice at 4 difficulties for every Phase 1 chapter (section 4).
- [ ] All generator property tests pass; every shipped puzzle set verified unique.
- [ ] English banks meet Phase 1 counts, with `content-qa-report.md`.
- [ ] Palette statuses and scoring match section 10.4 exactly (e2e).
- [ ] Lighthouse mobile ≥ 90 performance and ≥ 95 accessibility.
- [ ] Deployed, installable, works offline after first load. URL printed.

**Phase 2**
- [ ] Every chapter in section 8 meets section 7.7 volumes, with extreme tier.
- [ ] IBPS order and all blueprint variants; 30 fixed mocks + fresh mocks.
- [ ] Progress, mistakes book, "Try a similar one", speed drills, rough pad, share links, download-all-for-offline.
- [ ] Lighthouse ≥ 95 across the board.

**Phase 3**
- [ ] Mains chapters complete; mains mock built on the researched current official pattern.

---

## 18. Sources used for the research brief (September 2026)

- SBI Clerk prelims dates 2026 (PW): https://www.pw.live/banking/exams/sbi-clerk-prelims-exam-date-2026-out
- SBI Clerk prelims pattern (Mahendras): https://www.mahendras.org/blogs/sbi-clerk-prelims-admit-card-2026-27
- SBI Clerk 16 Sep 2026 backlog analysis (Careerpower): https://www.careerpower.in/blog/sbi-clerk-prelims-exam-analysis-2026
- SBI Clerk 16 Sep 2026 shift 3 analysis (PracticeMock): https://www.practicemock.com/blog/sbi-clerk-prelims-exam-analysis/
- SBI Clerk 16 Sep 2026 all shifts (Guidely): https://guidely.in/exams/bank-insurance/sbi-clerk-exam-analysis
- SBI Clerk 2025 analyses (PW): https://www.pw.live/banking/exams/sbi-clerk-prelims-exam-analysis-2025-27-september-shift-2 and https://www.pw.live/banking/exams/sbi-clerk-exam-analysis-2025-shift-1-20-sept
- SBI Clerk 2025 analysis (Chegg India): https://www.cheggindia.com/govt-exams-blogs/sbi-clerk-prelims-exam-analysis/
- IBPS Clerk 2025 analyses (time4education): https://www.time4education.com/local/articlecms/page.php?id=8852 and https://www.time4education.com/local/articlecms/page.php?id=8853
- IBPS Clerk 2024 analysis (time4education): https://www.time4education.com/local/articlecms/page.php?id=8041
- IBPS Clerk 2026 dates (Careers360): https://news.careers360.com/ibps-clerk-recruitment-2026-notification-application-form-august-1-ibps-in-preliminary-exam-october-10-11-eligibility-vacancy-apply-link/amp
- IBPS 2026–27 calendar summary: https://www.indianpaycalculator.in/govt-news/ibps-calendar-2026-27-po-clerk-rrb-exam-dates
