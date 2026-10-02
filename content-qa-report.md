# Content QA report

Generated 2026-10-01 by `npm run qa`.

Pipeline (SPEC 7.6): authored as JSON in batches → zod schema + near-duplicate (trigram > 0.85) + British-spelling checks
(`scripts/validate-authored.ts`) → **blind solve** by a separate agent that sees no keys (`scripts/qa/export-blind.ts`),
rating ambiguity 1–5 → comparison with the keys (`scripts/qa/compare-blind.ts`). An item passes only if the blind answer
matches the key with ambiguity ≤ 2. Para jumbles are solved twice with shuffled labels and both orders must match.
Passing items are recorded with a content hash; editing an item afterwards un-verifies it and the build fails.

| Chapter | Written | Passed | Rewritten | Dropped | Final (E/M/H/X) | Questions served |
|---|---|---|---|---|---|---|
| cloze | 35 passages | 35 | 0 | 0 | 35 (5/13/11/6) | 210 |
| connectors | 160 items | 160 | 7 | 0 | 160 (22/60/51/27) | 160 |
| error-spotting | 200 items | 200 | 0 | 0 | 200 (27/76/63/34) | 200 |
| fillers | 200 items | 200 | 1 | 0 | 200 (27/76/63/34) | 200 |
| grammar | 160 items | 160 | 3 | 0 | 160 (22/60/51/27) | 160 |
| match-column | 160 items | 160 | 2 | 0 | 160 (22/60/51/27) | 160 |
| para-filler | 160 items | 160 | 1 | 0 | 160 (22/60/51/27) | 160 |
| para-jumbles | 40 sets | 40 | 0 | 0 | 40 (5/16/13/6) | 200 |
| para-summary | 160 items | 160 | 0 | 0 | 160 (22/60/51/27) | 160 |
| phrase-replacement | 180 items | 180 | 0 | 0 | 180 (24/68/58/30) | 180 |
| reading-comprehension | 34 passages | 34 | 1 | 0 | 34 (5/13/12/4) | 340 |
| spelling | 100 items | 100 | 0 | 0 | 100 (5/30/40/25) | 100 |
| word-swap | 190 items | 190 | 0 | 0 | 190 (25/72/61/32) | 190 |
| word-usage | 160 items | 160 | 1 | 0 | 160 (22/60/51/27) | 160 |
| blood-relation | 50 passages | 50 | 0 | 0 | 50 (3/15/19/13) | 110 |
| cause-effect | 143 items | 143 | 0 | 7 | 143 (18/54/46/25) | 143 |
| classification | 100 items | 100 | 0 | 0 | 100 (5/30/40/25) | 100 |
| coding-decoding | 46 passages | 46 | 0 | 0 | 46 (3/14/17/12) | 110 |
| course-of-action | 150 items | 150 | 2 | 0 | 150 (20/57/48/25) | 150 |
| data-sufficiency | 99 items | 99 | 0 | 1 | 99 (5/30/40/24) | 99 |
| direction | 50 passages | 50 | 0 | 0 | 50 (3/15/19/13) | 106 |
| inequality | 100 items | 100 | 0 | 0 | 100 (5/30/40/25) | 100 |
| input-output | 15 passages | 15 | 0 | 4 | 15 (1/5/6/3) | 75 |
| order-ranking | 100 items | 100 | 0 | 0 | 100 (5/30/40/25) | 100 |
| puzzles | 22 passages | 22 | 0 | 0 | 22 (1/6/9/6) | 106 |
| seating | 22 passages | 22 | 0 | 0 | 22 (1/6/9/6) | 110 |
| series-pattern | 54 passages | 54 | 5 | 0 | 54 (3/16/21/14) | 110 |
| statement-argument | 150 items | 150 | 1 | 0 | 150 (20/57/48/25) | 150 |
| statement-assumption | 150 items | 150 | 5 | 0 | 150 (20/57/48/25) | 150 |
| statement-conclusion | 150 items | 150 | 0 | 0 | 150 (20/57/48/25) | 150 |
| syllogism | 100 items | 100 | 0 | 0 | 100 (5/30/40/25) | 100 |
| ages | 100 items | 100 | 0 | 0 | 100 (10/40/35/15) | 100 |
| averages | 100 items | 100 | 1 | 0 | 100 (10/40/35/15) | 100 |
| boats-streams | 100 items | 100 | 0 | 0 | 100 (10/40/35/15) | 100 |
| data-interpretation | 22 passages | 22 | 0 | 0 | 22 (1/6/9/6) | 110 |
| interest | 100 items | 100 | 0 | 0 | 100 (10/40/35/15) | 100 |
| mensuration | 100 items | 100 | 0 | 0 | 100 (10/40/35/15) | 100 |
| mixtures | 100 items | 100 | 0 | 0 | 100 (10/40/35/15) | 100 |
| number-problems | 120 items | 120 | 1 | 0 | 120 (12/48/42/18) | 120 |
| number-series | 98 items | 98 | 0 | 2 | 98 (5/30/38/25) | 98 |
| partnership | 100 items | 100 | 0 | 0 | 100 (10/40/35/15) | 100 |
| percentage | 100 items | 100 | 0 | 0 | 100 (10/40/35/15) | 100 |
| pipes-cisterns | 100 items | 100 | 0 | 0 | 100 (10/40/35/15) | 100 |
| profit-loss | 100 items | 100 | 0 | 0 | 100 (10/40/35/15) | 100 |
| quadratic | 100 items | 100 | 0 | 0 | 100 (5/30/40/25) | 100 |
| ratio-proportion | 100 items | 100 | 0 | 0 | 100 (10/40/35/15) | 100 |
| simplification | 120 items | 120 | 0 | 0 | 120 (6/36/48/30) | 120 |
| speed-distance | 100 items | 100 | 0 | 0 | 100 (10/40/35/15) | 100 |
| time-work | 100 items | 100 | 0 | 0 | 100 (10/40/35/15) | 100 |

Total authored questions served: **6397**.

## Items that failed a blind solve at least once

- **connectors**: cn-056, cn-057, cn-058, cn-065, cn-070, cn-085, cn-091
- **fillers**: fi-196
- **grammar**: gr-060, gr-062, gr-157
- **match-column**: mc-050, mc-124
- **para-filler**: pf-032
- **reading-comprehension**: rc-32
- **word-usage**: wu-053
- **cause-effect**: ce-051, ce-053, ce-083, ce-086, ce-099, ce-102, ce-112
- **course-of-action**: ca-060, ca-112
- **data-sufficiency**: ds-037
- **input-output**: io-06, io-13, io-18, io-20
- **series-pattern**: sp-04, sp-07, sp-08, sp-14, sp-16
- **statement-argument**: sg-149
- **statement-assumption**: sa-008, sa-031, sa-117, sa-136, sa-144
- **averages**: av-062
- **number-problems**: np-054
- **number-series**: ns-078, ns-080

## Generated English (hybrid)

Misspelt words are generated from a curated word list with dictionary-vetted misspellings; answers are checked by an
independent verifier in the property tests (see `tests/property/english/`), not by blind solve.
