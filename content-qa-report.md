# Content QA report

Generated 2026-09-24 by `npm run qa`.

Pipeline (SPEC 7.6): authored as JSON in batches → zod schema + near-duplicate (trigram > 0.85) + British-spelling checks
(`scripts/validate-authored.ts`) → **blind solve** by a separate agent that sees no keys (`scripts/qa/export-blind.ts`),
rating ambiguity 1–5 → comparison with the keys (`scripts/qa/compare-blind.ts`). An item passes only if the blind answer
matches the key with ambiguity ≤ 2. Para jumbles are solved twice with shuffled labels and both orders must match.
Passing items are recorded with a content hash; editing an item afterwards un-verifies it and the build fails.

| Chapter | Written | Passed | Rewritten | Dropped | Final (E/M/H/X) | Questions served |
|---|---|---|---|---|---|---|
| cloze | 15 passages | 15 | 0 | 0 | 15 (3/5/4/3) | 90 |
| connectors | 60 items | 60 | 3 | 0 | 60 (12/20/16/12) | 60 |
| error-spotting | 70 items | 70 | 0 | 0 | 70 (14/24/18/14) | 70 |
| fillers | 70 items | 70 | 0 | 0 | 70 (14/24/18/14) | 70 |
| grammar | 60 items | 60 | 1 | 0 | 60 (12/20/16/12) | 60 |
| match-column | 60 items | 60 | 1 | 0 | 60 (12/20/16/12) | 60 |
| para-filler | 60 items | 59 | 1 | 0 | 59 (12/19/16/12) | 60 |
| para-jumbles | 15 sets | 15 | 0 | 0 | 15 (3/6/4/2) | 75 |
| para-summary | 60 items | 60 | 0 | 0 | 60 (12/20/16/12) | 60 |
| phrase-replacement | 60 items | 60 | 0 | 0 | 60 (12/20/16/12) | 60 |
| reading-comprehension | 20 passages | 20 | 0 | 0 | 20 (4/8/6/2) | 200 |
| word-swap | 60 items | 60 | 0 | 0 | 60 (12/20/16/12) | 60 |
| word-usage | 60 items | 60 | 1 | 0 | 60 (12/20/16/12) | 60 |
| cause-effect | 50 items | 50 | 0 | 0 | 50 (10/17/13/10) | 50 |
| course-of-action | 50 items | 50 | 0 | 0 | 50 (10/17/13/10) | 50 |
| statement-argument | 50 items | 50 | 0 | 0 | 50 (10/17/13/10) | 50 |
| statement-assumption | 50 items | 50 | 2 | 0 | 50 (10/17/13/10) | 50 |
| statement-conclusion | 50 items | 50 | 0 | 0 | 50 (10/17/13/10) | 50 |

Total authored questions served: **1235**.

## Items that failed a blind solve at least once

- **connectors**: cn-056, cn-057, cn-058
- **grammar**: gr-060
- **match-column**: mc-050
- **para-filler**: pf-032
- **word-usage**: wu-053
- **statement-assumption**: sa-008, sa-031

## Generated English (hybrid)

Misspelt words are generated from a curated word list with dictionary-vetted misspellings; answers are checked by an
independent verifier in the property tests (see `tests/property/english/`), not by blind solve.
