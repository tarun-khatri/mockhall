import { z } from 'zod';

/**
 * zod schemas for content. Bad content fails the build (scripts/build-banks.ts) and the content tests.
 * Authored JSON formats (English and critical reasoning) are documented next to each schema.
 */

export const difficultySchema = z.enum(['easy', 'medium', 'hard', 'extreme']);
export const subjectSchema = z.enum(['english', 'quant', 'reasoning']);

/** Rich text: non-empty, no raw HTML, balanced `$` math delimiters (escaped `\$` ignored). */
export const richSchema = z
  .string()
  .min(1)
  .refine((s) => !/<[a-zA-Z/!]/.test(s), 'Raw HTML is not allowed in rich text')
  .refine((s) => (s.replace(/\\\$/g, '').match(/\$/g)?.length ?? 0) % 2 === 0, 'Unbalanced $ math delimiters')
  .refine((s) => !/\b(undefined|NaN|Infinity)\b|\[object Object\]/.test(s), 'Rendering artefact in text');

const keySchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'keys are lowercase kebab-case');
const tagSchema = z.string().regex(/^[a-z0-9-]+:[a-z0-9-]+$/, 'tags look like "grammar:subject-verb-agreement"');

export const solutionSchema = z.object({
  steps: z.array(richSchema).min(1),
  shortcut: richSchema.optional(),
  trap: richSchema.optional(),
  rule: z.string().min(1).optional(),
  visual: z.unknown().optional(),
});

const fiveOptions = z
  .array(richSchema)
  .length(5)
  .refine((opts) => new Set(opts.map((o) => o.trim().toLowerCase())).size === 5, 'Options must be distinct');

/**
 * Authored single question.
 * {
 *   "key": "es-014",                      // unique within the file
 *   "subtype": "classic-parts",
 *   "difficulty": "medium",
 *   "prompt": "…",
 *   "options": ["…","…","…","…","No error"],
 *   "answerIndex": 2,
 *   "solution": { "steps": ["…"], "shortcut": "…", "trap": "…", "rule": "Subject–verb agreement" },
 *   "tags": ["grammar:subject-verb-agreement"]
 * }
 */
export const authoredQuestionSchema = z.object({
  key: keySchema,
  subtype: keySchema,
  difficulty: difficultySchema,
  prompt: richSchema,
  options: fiveOptions,
  answerIndex: z.number().int().min(0).max(4),
  solution: solutionSchema,
  tags: z.array(tagSchema).min(1),
});
export type AuthoredQuestion = z.infer<typeof authoredQuestionSchema>;

/** Question inside an authored set: difficulty is inherited from the set unless given. */
export const authoredSetQuestionSchema = authoredQuestionSchema.extend({
  difficulty: difficultySchema.optional(),
});

/**
 * Authored stimulus set (reading comprehension, cloze).
 * { "key": "rc-03", "subtype": "business", "difficulty": "medium", "title": "…", "stimulus": "passage…", "questions": [ … ] }
 */
export const authoredSetSchema = z.object({
  key: keySchema,
  subtype: keySchema,
  difficulty: difficultySchema,
  title: z.string().min(1),
  stimulus: richSchema,
  questions: z.array(authoredSetQuestionSchema).min(3).max(10),
});
export type AuthoredSet = z.infer<typeof authoredSetSchema>;

/**
 * Para jumble set. Questions are built by the loader from `order`, so keys cannot drift from the order.
 * {
 *   "key": "pj-04", "subtype": "five-sentence", "difficulty": "medium", "title": "…",
 *   "sentences": [ { "label": "A", "text": "…" }, … ],       // 5 or 6 sentences, labels A–F
 *   "order": "CAEBD",                                        // correct order of all labels
 *   "fixed": { "label": "E", "position": 3 },               // optional: sentence that stays in place (6-sentence variant)
 *   "explanation": ["C introduces …", "A continues …"],     // the linking logic, one step per line
 *   "tags": ["para:chronology"]
 * }
 */
export const paraJumbleSetSchema = z
  .object({
    key: keySchema,
    subtype: keySchema,
    difficulty: difficultySchema,
    title: z.string().min(1),
    sentences: z
      .array(z.object({ label: z.string().regex(/^[A-F]$/), text: richSchema }))
      .min(5)
      .max(6),
    order: z.string().regex(/^[A-F]{5,6}$/),
    fixed: z.object({ label: z.string().regex(/^[A-F]$/), position: z.number().int().min(1).max(6) }).optional(),
    explanation: z.array(richSchema).min(2),
    tags: z.array(tagSchema).min(1),
  })
  .refine((s) => s.order.length === s.sentences.length, 'order must use every sentence exactly once')
  .refine((s) => new Set(s.order).size === s.order.length, 'order has a repeated label')
  .refine((s) => s.sentences.every((x) => s.order.includes(x.label)), 'order and sentence labels differ')
  .refine((s) => !s.fixed || s.order[s.fixed.position - 1] === s.fixed.label, 'fixed sentence is not at its position');
export type ParaJumbleSet = z.infer<typeof paraJumbleSetSchema>;

export const authoredFileSchema = z.object({
  chapter: z.string().min(1),
  version: z.number().int().min(1),
  items: z.array(authoredQuestionSchema).optional(),
  sets: z.array(authoredSetSchema).optional(),
  paraJumbles: z.array(paraJumbleSetSchema).optional(),
});
export type AuthoredFile = z.infer<typeof authoredFileSchema>;

/* ------------------------------------------------------------------ */
/* Runtime question / set / item schemas (banks, import validation)    */
/* ------------------------------------------------------------------ */

export const questionSchema = z.object({
  id: z.string().min(3),
  subject: subjectSchema,
  chapter: z.string().min(1),
  subtype: z.string().min(1),
  difficulty: difficultySchema,
  setId: z.string().optional(),
  prompt: richSchema,
  options: z.tuple([richSchema, richSchema, richSchema, richSchema, richSchema]),
  answerIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  targetSeconds: z.number().positive(),
  solution: solutionSchema,
  tags: z.array(z.string()),
  source: z.enum(['generator', 'authored']),
  generator: z.object({ name: z.string(), version: z.number(), seed: z.string() }).optional(),
  verification: z.object({
    method: z.enum(['computed+independent', 'solver-unique', 'blind-solve']),
    passedAt: z.string(),
  }),
});

export const questionSetSchema = z.object({
  id: z.string().min(3),
  subject: subjectSchema,
  chapter: z.string().min(1),
  kind: z.enum(['puzzle', 'seating', 'di', 'caselet', 'rc', 'cloze', 'parajumble', 'coding', 'input-output', 'series']),
  subtype: z.string().min(1),
  difficulty: difficultySchema,
  title: z.string().optional(),
  stimulus: richSchema,
  chart: z.unknown().optional(),
  table: z.unknown().optional(),
  questionIds: z.array(z.string()).min(1),
  targetSeconds: z.number().positive(),
});

export const itemSchema = z
  .object({
    set: questionSetSchema.optional(),
    questions: z.array(questionSchema).min(1),
  })
  .refine(
    (it) => !it.set || (it.set.questionIds.length === it.questions.length && it.questions.every((q, i) => q.id === it.set!.questionIds[i] && q.setId === it.set!.id)),
    'set.questionIds must match the questions (same order) and every question.setId must be the set id',
  );

/** Pre-generated bank file (puzzles, seating): public/banks/<chapter>/<subtype>.<difficulty>.json */
export const bankFileSchema = z.object({
  chapter: z.string(),
  subtype: z.string(),
  difficulty: difficultySchema,
  generator: z.object({ name: z.string(), version: z.number() }),
  generatedAt: z.string(),
  items: z.array(itemSchema).min(1),
});
