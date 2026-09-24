# Authored-content brief (English + critical reasoning)

MockHall: free mock tests for SBI/IBPS Clerk (prelims) and PO/Clerk mains. **A wrong key is a P0 bug.** Every item you
write will be solved BLIND by a separate examiner; any mismatch or ambiguity ≥ 3 sends it back.

## Read first
- `SPEC.md` sections 2, 7.3–7.7, 8.2 (R13–R17), 8.3 (English), 15.
- `src/content/schema.ts` — your file must satisfy `authoredFileSchema` (`items` for single questions, `sets` for
  RC/cloze passages).
- `research/archetypes.md` — formats and frequencies actually seen 2022–2026.
- Existing examples: `src/content/authored/english/error-spotting.json`, `reading-comprehension.json`.

## Where files go
- English: `src/content/authored/english/<chapter>.json`
- Critical reasoning: `src/content/authored/reasoning/<chapter>.json`
- `{ "chapter": "<chapter-id>", "version": 1, "items": [...] }` (or `"sets": [...]`). Chapter ids are in
  `src/content/chapters.ts`.

## Rules
- Original content only; never copy or closely paraphrase published questions.
- Difficulty split for single-question chapters (≥ 60 items): 12 easy / 20 medium / 16 hard / 12 extreme
  (easy < medium = clerk prelims < hard = PO prelims < extreme = mains).
- Exactly 5 options, one defensible answer. Distractors must be clearly wrong to an expert yet tempting.
- Balance correct letters over A–E (~20% each) unless the format fixes an option position (e.g. "No interchange
  required" always last — then that one is correct ~8–12%, spread the rest over A–D).
- Solutions: `steps` (1–3 lines: why the answer is right, why the main rival fails), `trap`, optional `shortcut`,
  `rule` for grammar items. Tags lowercase `category:value` (e.g. `grammar:tense`, `cr:assumption-implicit`).
- British/Indian spelling; Indian names and everyday settings; neutral topics (no party politics, religion, caste,
  real living people). Rich text: plain text + `**bold**` / `*italic*` only, lines separated with `\n`. NEVER use `$`.
- Keys `<prefix>-001`… lowercase kebab-case, unique in the file.
- Validate after every batch of ~25: `npx tsx scripts/validate-authored.ts <file>.json` (from C:\Users\dell\IBPS-SBI);
  fix all errors. Re-read every item as a strict examiner before finishing.
- Only create/modify your assigned files. No git. Machine has limited RAM: no dev servers, no full test runs.

## Final message
Counts per difficulty per file, answer-letter distribution, and any keys you are less than certain about.
