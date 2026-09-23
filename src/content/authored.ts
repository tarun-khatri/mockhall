/**
 * Authored banks → Items. Pure; used by the app loader and by build/QA scripts.
 * Every authored item is content-hashed: a blind-solve pass records the hash, and an item whose content changed
 * after verification is treated as unverified (the build fails on those).
 */
import type { ChapterId, Difficulty, Item, Question, QuestionSet } from './types';
import { DIFFICULTY_LETTER } from './types';
import type { AuthoredFile, AuthoredQuestion, AuthoredSet, ParaJumbleSet } from './schema';
import { setTargetSeconds, targetSeconds, TARGETS } from './targets';
import { shortHash } from '../lib/hash';

export interface QaRecord {
  hash: string;
  passedAt: string;
}

/** QA file shape: src/content/authored/english/_qa/<chapter>.json */
export interface QaFile {
  chapter: string;
  records: Record<string, QaRecord>;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Hash of the parts that decide the answer (prompt, options, key, stimulus) — solution edits don't un-verify. */
export function authoredHash(entry: AuthoredQuestion | AuthoredSet | ParaJumbleSet): string {
  if ('sentences' in entry) return shortHash(stable({ s: entry.sentences, o: entry.order, f: entry.fixed ?? null }), 12);
  if ('stimulus' in entry)
    return shortHash(stable({ st: entry.stimulus, q: entry.questions.map((q) => ({ p: q.prompt, o: q.options, a: q.answerIndex })) }), 12);
  return shortHash(stable({ p: entry.prompt, o: entry.options, a: entry.answerIndex }), 12);
}

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

function authoredQuestion(
  chapter: ChapterId,
  q: AuthoredQuestion | (Omit<AuthoredQuestion, 'difficulty'> & { difficulty?: Difficulty }),
  difficulty: Difficulty,
  passedAt: string,
  extra: { setId?: string; targetSeconds: number },
): Question {
  return {
    id: `english.${chapter}.${q.subtype}.${DIFFICULTY_LETTER[difficulty]}.${q.key}`,
    subject: 'english',
    chapter,
    subtype: q.subtype,
    difficulty,
    ...(extra.setId ? { setId: extra.setId } : {}),
    prompt: q.prompt,
    options: q.options as Question['options'],
    answerIndex: q.answerIndex as Question['answerIndex'],
    targetSeconds: Math.round(extra.targetSeconds),
    solution: q.solution as Question['solution'],
    tags: q.tags,
    source: 'authored',
    verification: { method: 'blind-solve', passedAt },
  };
}

export function singleItems(chapter: ChapterId, file: AuthoredFile, passed: (key: string) => string | null): Item[] {
  const out: Item[] = [];
  for (const q of file.items ?? []) {
    const at = passed(q.key);
    if (!at) continue;
    out.push({ questions: [authoredQuestion(chapter, q, q.difficulty, at, { targetSeconds: targetSeconds('english-single', q.difficulty) })] });
  }
  return out;
}

export function rcItems(chapter: ChapterId, file: AuthoredFile, passed: (key: string) => string | null): Item[] {
  const out: Item[] = [];
  for (const s of file.sets ?? []) {
    const at = passed(s.key);
    if (!at) continue;
    const setId = `english.${chapter}.set.${s.subtype}.${DIFFICULTY_LETTER[s.difficulty]}.${s.key}`;
    const total = TARGETS['rc-set'][s.difficulty];
    const questions = s.questions.map((q) =>
      authoredQuestion(chapter, { ...q, subtype: s.subtype }, q.difficulty ?? s.difficulty, at, { setId, targetSeconds: total / s.questions.length }),
    );
    const set: QuestionSet = {
      id: setId,
      subject: 'english',
      chapter,
      kind: chapter === 'cloze' ? 'cloze' : 'rc',
      subtype: s.subtype,
      difficulty: s.difficulty,
      title: s.title,
      stimulus: s.stimulus,
      questionIds: questions.map((q) => q.id),
      targetSeconds: total,
    };
    out.push({ set, questions });
  }
  return out;
}

/** Para jumble questions are generated from the order, so the key can never drift from it. */
export function paraJumbleItems(chapter: ChapterId, file: AuthoredFile, passed: (key: string) => string | null): Item[] {
  const out: Item[] = [];
  for (const pj of file.paraJumbles ?? []) {
    const at = passed(pj.key);
    if (!at) continue;
    out.push(paraJumbleItem(chapter, pj, at));
  }
  return out;
}

export function paraJumbleItem(chapter: ChapterId, pj: ParaJumbleSet, passedAt: string): Item {
  const labels = pj.sentences.map((s) => s.label).sort();
  const n = labels.length;
  const setId = `english.${chapter}.set.${pj.subtype}.${DIFFICULTY_LETTER[pj.difficulty]}.${pj.key}`;
  const labelList = labels.map((l) => `(${l})`);
  const intro = `Rearrange the following ${n} sentences ${labelList.slice(0, -1).join(', ')} and ${labelList[n - 1]} in the proper sequence to form a meaningful paragraph, then answer the questions that follow.`;
  const fixedNote = pj.fixed ? `\n\nSentence **(${pj.fixed.label})** is fixed as the **${ORD[pj.fixed.position - 1]}** sentence.` : '';
  const body = pj.sentences
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((s) => `**(${s.label})** ${s.text}`)
    .join('\n');
  const stimulus = `${intro}${fixedNote}\n\n${body}`;

  // Positions to ask: all five for 5 sentences; for 6, skip the fixed position (or one derived from the key).
  let positions = Array.from({ length: n }, (_, i) => i);
  if (n === 6) {
    const skip = pj.fixed ? pj.fixed.position - 1 : parseInt(shortHash(pj.key, 4), 16) % 6;
    positions = positions.filter((p) => p !== skip);
  }
  const orderText = pj.order.split('').join(' ');
  const total = setTargetSeconds('parajumble-set', pj.difficulty, positions.length);
  const questions: Question[] = positions.map((pos, qi) => {
    const correct = pj.order[pos];
    let optionLabels = labels;
    if (n === 6) {
      const others = labels.filter((l) => l !== correct);
      const drop = others[parseInt(shortHash(`${pj.key}:${pos}`, 4), 16) % others.length];
      optionLabels = labels.filter((l) => l !== drop);
    }
    const which = pos === n - 1 ? `${ORD[pos].toUpperCase()} (LAST)` : ORD[pos].toUpperCase();
    return {
      id: `english.${chapter}.${pj.subtype}.${DIFFICULTY_LETTER[pj.difficulty]}.${pj.key}-p${pos + 1}`,
      subject: 'english',
      chapter,
      subtype: pj.subtype,
      difficulty: pj.difficulty,
      setId,
      prompt: `Which of the following should be the **${which}** sentence after rearrangement?`,
      options: optionLabels.map((l) => `(${l})`) as Question['options'],
      answerIndex: optionLabels.indexOf(correct) as Question['answerIndex'],
      targetSeconds: Math.round(total / positions.length),
      solution: {
        steps: [`Correct order: **${orderText}**`, ...pj.explanation, `So the ${ORD[pos]} sentence is **(${correct})**.`],
        shortcut: qi === 0 ? 'Find the opener first: it introduces the topic and never starts with a pronoun or a connective like "however" or "this".' : undefined,
      },
      tags: pj.tags,
      source: 'authored',
      verification: { method: 'blind-solve', passedAt },
    };
  });
  const set: QuestionSet = {
    id: setId,
    subject: 'english',
    chapter,
    kind: 'parajumble',
    subtype: pj.subtype,
    difficulty: pj.difficulty,
    title: pj.title,
    stimulus,
    questionIds: questions.map((q) => q.id),
    targetSeconds: total,
  };
  // drop undefined shortcut keys for clean snapshots
  for (const q of questions) if (!q.solution.shortcut) delete q.solution.shortcut;
  return { set, questions };
}

/** All items in an authored file, filtered by QA (or unfiltered when `qa` is null, e.g. dev). */
export function authoredItems(chapter: ChapterId, file: AuthoredFile, qa: QaFile | null): Item[] {
  const byKey = new Map<string, AuthoredQuestion | AuthoredSet | ParaJumbleSet>();
  for (const x of file.items ?? []) byKey.set(x.key, x);
  for (const x of file.sets ?? []) byKey.set(x.key, x);
  for (const x of file.paraJumbles ?? []) byKey.set(x.key, x);
  const passed = (key: string): string | null => {
    if (!qa) return 'unverified';
    const rec = qa.records[key];
    const entry = byKey.get(key);
    if (!rec || !entry) return null;
    return rec.hash === authoredHash(entry) ? rec.passedAt : null;
  };
  return [...singleItems(chapter, file, passed), ...rcItems(chapter, file, passed), ...paraJumbleItems(chapter, file, passed)];
}
