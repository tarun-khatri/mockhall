# Content QA report

Generated 2026-09-23 by `npm run qa`.

Pipeline (SPEC 7.6): authored as JSON in batches → zod schema + near-duplicate (trigram > 0.85) + British-spelling checks
(`scripts/validate-authored.ts`) → **blind solve** by a separate agent that sees no keys (`scripts/qa/export-blind.ts`),
rating ambiguity 1–5 → comparison with the keys (`scripts/qa/compare-blind.ts`). An item passes only if the blind answer
matches the key with ambiguity ≤ 2. Para jumbles are solved twice with shuffled labels and both orders must match.
Passing items are recorded with a content hash; editing an item afterwards un-verifies it and the build fails.

| Chapter | Written | Passed | Rewritten | Dropped | Final (E/M/H/X) | Questions served |
|---|---|---|---|---|---|---|
| error-spotting | 70 items | 70 | 0 | 0 | 70 (14/24/18/14) | 70 |
| fillers | 70 items | 70 | 0 | 0 | 70 (14/24/18/14) | 70 |
| para-jumbles | 10 sets | 10 | 0 | 0 | 10 (2/4/3/1) | 50 |
| phrase-replacement | 60 items | 60 | 0 | 0 | 60 (12/20/16/12) | 60 |
| reading-comprehension | 10 passages | 10 | 0 | 0 | 10 (2/4/3/1) | 100 |

Total authored questions served: **350**.

No item failed a blind solve.

## Generated English (hybrid)

Misspelt words are generated from a curated word list with dictionary-vetted misspellings; answers are checked by an
independent verifier in the property tests (see `tests/property/english/`), not by blind solve.
