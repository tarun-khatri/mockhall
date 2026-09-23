import type { ChartSpec, Difficulty, Item, Question, QuestionSet, Rich, SetKind, Solution, TableSpec, VerificationMethod } from '../../types';
import { DIFFICULTY_LETTER } from '../../types';
import { shortHash } from '../../../lib/hash';
import { GENERATORS_VERIFIED_AT } from '../../verified';
import type { GenMeta } from '../types';

/** What a generator fills in for one single question. */
export interface QuestionDraft {
  subtype: string;
  difficulty: Difficulty;
  prompt: Rich;
  /** Exactly 5. */
  options: Rich[];
  answerIndex: number;
  solution: Solution;
  tags?: string[];
  targetSeconds: number;
}

/** Question inside a set: subtype and difficulty come from the set; target defaults to an even share. */
export interface SetQuestionDraft {
  prompt: Rich;
  options: Rich[];
  answerIndex: number;
  solution: Solution;
  tags?: string[];
  targetSeconds?: number;
}

export interface SetDraft {
  kind: SetKind;
  subtype: string;
  difficulty: Difficulty;
  title?: string;
  stimulus: Rich;
  chart?: ChartSpec;
  table?: TableSpec;
  /** Whole-set target (use setTargetSeconds from targets.ts). */
  targetSeconds: number;
  questions: SetQuestionDraft[];
}

function assertOptions(options: Rich[], answerIndex: number, where: string): asserts answerIndex is 0 | 1 | 2 | 3 | 4 {
  if (options.length !== 5) throw new Error(`${where}: expected 5 options, got ${options.length}`);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 4) {
    throw new Error(`${where}: bad answerIndex ${answerIndex}`);
  }
}

/** Build a Question with a stable, content-derived id: `${subject}.${chapter}.${subtype}.${d}.${hash}`. */
export function makeQuestion(
  meta: GenMeta,
  seed: string,
  draft: QuestionDraft,
  opts: { setId?: string; method?: VerificationMethod } = {},
): Question {
  assertOptions(draft.options, draft.answerIndex, meta.name);
  const content = [opts.setId ?? '', draft.prompt, ...draft.options].join('\u0001');
  const id = `${meta.subject}.${meta.chapter}.${draft.subtype}.${DIFFICULTY_LETTER[draft.difficulty]}.${shortHash(content, 8)}`;
  return {
    id,
    subject: meta.subject,
    chapter: meta.chapter,
    subtype: draft.subtype,
    difficulty: draft.difficulty,
    ...(opts.setId ? { setId: opts.setId } : {}),
    prompt: draft.prompt,
    options: draft.options as Question['options'],
    answerIndex: draft.answerIndex,
    targetSeconds: Math.max(1, Math.round(draft.targetSeconds)),
    solution: draft.solution,
    tags: draft.tags ?? [],
    source: 'generator',
    generator: { name: meta.name, version: meta.version, seed },
    verification: { method: opts.method ?? 'computed+independent', passedAt: GENERATORS_VERIFIED_AT },
  };
}

/** Build a set Item: the QuestionSet plus its questions, ids linked both ways. */
export function makeSet(meta: GenMeta, seed: string, draft: SetDraft, opts: { method?: VerificationMethod } = {}): Item {
  if (!draft.questions.length) throw new Error(`${meta.name}: empty set`);
  const d = DIFFICULTY_LETTER[draft.difficulty];
  const setHash = shortHash(
    [draft.stimulus, JSON.stringify(draft.chart ?? null), JSON.stringify(draft.table ?? null), ...draft.questions.map((q) => q.prompt)].join('\u0001'),
    8,
  );
  const setId = `${meta.subject}.${meta.chapter}.set.${draft.subtype}.${d}.${setHash}`;
  const share = draft.targetSeconds / draft.questions.length;
  const questions = draft.questions.map((q) =>
    makeQuestion(
      meta,
      seed,
      {
        subtype: draft.subtype,
        difficulty: draft.difficulty,
        prompt: q.prompt,
        options: q.options,
        answerIndex: q.answerIndex,
        solution: q.solution,
        tags: q.tags,
        targetSeconds: q.targetSeconds ?? share,
      },
      { setId, method: opts.method },
    ),
  );
  const ids = new Set(questions.map((q) => q.id));
  if (ids.size !== questions.length) throw new Error(`${meta.name}: duplicate question inside set ${setId}`);
  const set: QuestionSet = {
    id: setId,
    subject: meta.subject,
    chapter: meta.chapter,
    kind: draft.kind,
    subtype: draft.subtype,
    difficulty: draft.difficulty,
    ...(draft.title ? { title: draft.title } : {}),
    stimulus: draft.stimulus,
    ...(draft.chart ? { chart: draft.chart } : {}),
    ...(draft.table ? { table: draft.table } : {}),
    questionIds: questions.map((q) => q.id),
    targetSeconds: Math.max(1, Math.round(draft.targetSeconds)),
  };
  return { set, questions };
}

/** Wrap a single question as an Item. */
export function single(question: Question): Item {
  return { questions: [question] };
}
