# Bank expansion brief (Oct 2026: IBPS Clerk prelims 10–11 Oct, mains 27 Dec)

Goal: add **100–150 new questions per chapter**, written to the real 2024–26 IBPS/SBI Clerk pattern, a notch harder than
the current banks (users report the existing items feel easy and they have already solved them). Quality bar is the
same as `docs/authoring-brief.md`: **a wrong key is a P0 bug**, and every item is solved BLIND by a separate examiner.
Any mismatch, or an ambiguity rating ≥ 3, sends the item back.

## Read first
1. `docs/authoring-brief.md` (rules still apply, except the difficulty split below).
2. `research/archetypes.md`, the section for your chapter (formats, frequencies, traps seen in 2022–26 papers).
3. `src/content/schema.ts` (`authoredQuestionSchema`, `authoredSetSchema`, `paraJumbleSetSchema`).
4. The **whole existing file** for your chapter. Match its prompt wording, option style, solution style and tags exactly,
   and do not reuse its sentences, passages, topics or tested word pairs.

You may use web search to check the current exam pattern, a grammar rule, an idiom's meaning or a fact used in a
passage. Never copy or closely paraphrase a published question: every item must be original.

## Difficulty for new items
Labels: easy < medium (= clerk prelims) < hard (= PO prelims / tough clerk shifts) < extreme (= mains).
Split the new items roughly **10% easy / 40% medium / 35% hard / 15% extreme**. "Hard" must be genuinely hard: closer
distractors, subtler rules, two-step logic. It must not be obscure, trick-worded or ambiguous.

## Mechanics
- Keys continue the file's numbering (e.g. the file ends at `es-070` → start at `es-071`). Lowercase kebab-case.
- Write in batches of ~20–30 to a JSON file in your scratch folder (given in your task), then append it:
  `npx tsx scripts/authoring/append.ts <chapter> <batch.json>`
  The batch is an array of single items, or `{ "sets": [...] }` / `{ "paraJumbles": [...] }`. Nothing is written if
  any entry fails the schema; fix and re-run.
- After each append run `npx tsx scripts/validate-authored.ts <chapter>.json` and fix every ERROR (near-duplicates
  included). American-spelling warnings must be fixed unless the item tests spelling on purpose.
- Never edit or delete existing (already verified) entries: that un-verifies them and fails the build.
- Exactly 5 distinct options; one defensible answer. Balance the correct letter across A–E (~20% each). Where the format
  fixes an option position ("No error", "No replacement required", "No interchange required", "All are correct"),
  that option is correct only **5–10%** of the time (research: 2 of 54 real items), and the rest spread over A–D.
- Rich text: plain text + `**bold**` / `*italic*`, `\n` line breaks. **Never use `$`** (write ₹ for money).
- British/Indian spelling; Indian names and settings; neutral topics (no party politics, religion, caste, real living
  people).
- Solutions: `steps` (why the key is right AND why the strongest rival fails), `trap`, optional `shortcut`, `rule`
  for grammar. Tags `category:value`.
- Only touch your chapter's JSON file and your scratch folder. No git, no dev server, no full test runs.

## Self-check before you finish (do it for every item)
Solve each item cold as a strict examiner who has not seen the key. If a second option is arguable, rewrite it.
Check that the key index points at the option the solution names.

## Final message
New-item counts per subtype and difficulty, the answer-letter distribution, the key range you used, and any key you
are less than certain about.

## Quant (arithmetic) banks — extra rules

Quant chapters are generator chapters; the new hand-written items live in `src/content/authored/quant/<chapter>.json`
(created by the append script on the first batch) and are mixed with generated questions (`mixedProvider` in
`src/content/providers.ts`, ~40% of draws). Their purpose is **variety the generators cannot give**: real
2024–26 IBPS/SBI Clerk arithmetic templates (research/archetypes.md §1, Q3–Q18), multi-step twists, and the
"recurring templates within a cycle" with fresh numbers.

- File shape: `{ "chapter": "<chapter>", "version": 1, "items": [...] }`; subtype **`exam-style`** for every item;
  keys `<prefix>-001`… (prefix given in your task).
- Prompt: the question only, as in the exam (no "Solve:" preamble). Options: 5 distinct numeric answers with units
  in the exam style ("₹1,250", "12 km/h", "18 years", "7.5 hours", "240 cm²", "3 : 5"); Indian digit grouping for ₹.
  Never "None of these" or "Cannot be determined" (not seen in 2024–26 arithmetic). Put the reverse ratio among the
  options for ratio answers. Distractors come from real mistakes (wrong base, SI vs CI, adding percentages, upstream
  vs downstream, forgetting a phase, reversed ratio) and sit close to the key.
- KaTeX is allowed for fractions only: `$\frac{2}{3}$`, `$5\frac{1}{3}$` (balanced `$`). Write money as ₹, never `$`.
- **Verify every key by computation**: for each item, compute the answer from the givens with a short script
  (node or python) that you write independently of your reasoning, and confirm exactly one option equals it.
  Keep the numbers clean (integer or .5/.25 answers, or simple fractions) as real papers do.
- Variety: at least 12 distinct templates per chapter, no template used more than ~8 times, and mix in harder
  two- and three-step items (e.g. a percentage item that feeds a ratio; a partnership item with a mid-year
  withdrawal and a salary for the working partner).
- `solution.steps`: 2–4 lines of working; `shortcut` where a faster method exists; `trap` naming the tempting wrong
  option and the mistake behind it. Tags like `arith:successive-percent`, `template:two-scheme-si`.
- Run `npx tsx scripts/authoring/sample.ts <chapter> 40` to see what the generator already produces, and write different templates and twists rather than copies of it.

## Round 2 — hand-written banks for generator topics (puzzles, seating, reasoning, simplification, DI…)

These chapters already have generators (or pre-built puzzle/seating banks). Your hand-written bank is mixed in with
them (`mixedProvider`, ~40% of draws). Goals: **harder** than the generator, closer to the newest 2024–26 shifts,
more varied clue/stem styles.

- **Difficulty for round 2: ~5% easy / 30% medium / 40% hard / 25% extreme.** Hard = tough clerk/PO prelims shift;
  extreme = PO/mains. Never obscure or ambiguous — difficulty must come from more steps and closer distractors.
- File: `src/content/authored/<subject>/<chapter>.json` (created by the first append). Use the **generator's own subtype
  ids** (run `npx tsx scripts/authoring/sample.ts <chapter> 8 [subtype]` to list them and to see the exact prompt and
  option style) so your items also feed mock slots that ask for those subtypes. Copy the generator's prompt wording,
  option wording and set-intro wording exactly.
- Sets (puzzles, seating, family/direction point sets, sentence coding, alphanumeric series, caselets, input–output):
  append `{ "sets": [ { "key", "subtype", "difficulty", "title", "stimulus", "questions": [ …3–5 questions with keys
  like pz-07-q1… ] } ] }`. Questions inside a set must be answerable from the stimulus alone.
- Rich text: `**bold**`, `*italic*`, `\n` line breaks; KaTeX `$…$` is allowed for maths (simplification, √ distances);
  escape a literal `$` or `*` as `\$` / `\*` (e.g. symbols in alphanumeric series or coded inequalities). No raw HTML.
- **Verify every key with a script you write**, independently of how you built the item:
  - puzzles/seating/blood relation/direction/ranking: brute-force every arrangement consistent with the clues; there
    must be **exactly one** arrangement (or, for questions that tolerate a case split, every surviving case must give
    the same answer); compute each answer from the solution.
  - syllogism: check each conclusion over all set diagrams (or a small-universe model search); possibility and
    "only a few" by the standard bank-exam rules.
  - inequality, coding, series, input–output, simplification, number series, quadratics, caselets: compute.
  Exactly one option must equal the computed answer. Keep the checker in your scratch folder.
- "None of these" / "Cannot be determined" only where the generator or the real exam uses them for that format, and as
  the key ≤ 8% of the time.
