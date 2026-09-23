# DECISIONS

One line each: assumption or default → reason.

- Hosting: GitHub Pages via GitHub Actions (public repo) → only `gh` is authenticated on this machine; Vercel/Cloudflare need an interactive login. Static + SPA fallback (404.html copy) works the same.
- TypeScript 6.0.x, not 7.0 → typescript-eslint supports `<6.1`; TS 7 (native) would break linting.
- Vite 8 / React 19.3 / React Router 8 / Vitest 5 / Tailwind 4.3 → latest stable at build time; all peer ranges verified.
- Node 22 locally (22.20) with react-router's engines warning (wants ≥ 22.22) → harmless for a static build; CI uses Node 24.
- No path aliases → relative imports work identically in Vite, Vitest and tsx scripts without extra config (TS 6 deprecates baseUrl).
- Vitest `maxWorkers: 2` (agents told to use 1) → dev machine has 8 GB RAM shared by ~12 parallel agents.
- Property tests: `PROP_SEEDS` env (default 500 locally, 100 in CI) with a fixed fast-check seed in CI for reproducibility.
- Rich text is a tiny in-house markdown subset (bold, italic, `$tex$`, line breaks, bullets, escapes) → no markdown library in the bundle; nothing is ever rendered as raw HTML except KaTeX output.
- `*` and `$` are reserved in rich text → coded-inequality symbols must be escaped (`\$`, `\*`) or avoided.
- Question ids hash the rendered content (prompt + options + set id) → identical content = identical id, so mock assembly de-duplicates by id.
- Set questions carry the set's subtype (question kind goes in tags) → "Try a similar one" regenerates the same set type.
- `QuestionSet` gains `subtype` and optional `title`; `Attempt` gains `sectionQuestionIds`, `sectionStartedAt`, `sectionEndedAt`, `draft`, `bookmarks` → needed for sectional flow, resume-exact-selection and bookmarks.
- Numeric options: answer rank chosen uniformly first, then mistake distractors on each side, then fillers at "nice" steps → uniform correct letter while keeping real-mistake distractors.
- Generators return `{ item, facts }`; `facts` holds ground-truth inputs only, so verifiers recompute answers independently.
- Research ran in parallel with generator/content work (not strictly before) → Phase 1 deadline is 2 days away; SPEC section 3.4/8 already carries the key research; archetypes.md refines generators afterwards.
- Para jumble questions are built by the loader from the authored `order` → keys cannot drift from the order.
- Authored items are verified per content hash → editing an item after blind solve un-verifies it and fails the build.
- Misspelt-words dictionary is dev-only → runtime ships only vetted variants (bundle budget).
- Phase 1 English mock slot "word usage or match the column (1)" is filled by a filler until those chapters ship in Phase 2.
