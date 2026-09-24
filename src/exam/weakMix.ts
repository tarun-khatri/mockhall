import type { ExamId, TestConfig } from '../content/types';
import { weakAreas } from '../analytics';
import { chapterMeta } from '../content/chapters';
import { readLog } from '../lib/storage';
import { randomSeed } from '../lib/rng';
import { assembleChapter } from './assemble';
import { launch } from './launch';
import type { SectionInput } from './engine';

/** Weak-area mix (SPEC 9.1): lowest accuracy × highest exam weight, ~20 questions across up to 4 subtypes, exam pace. */
export async function launchWeakMix(exam: ExamId): Promise<string> {
  const log = await readLog();
  const weak = weakAreas(log, 4);
  if (!weak.length) throw new Error('Answer a few more questions first — the mix needs at least 3 attempts in a topic.');
  const seed = `weak-${randomSeed()}`;
  const section: SectionInput = { questions: [], sets: [] };
  for (const [i, w] of weak.entries()) {
    try {
      const part = await assembleChapter(w.chapter, 5, 'medium', [w.subtype], `${seed}:${i}`);
      section.questions.push(...part.questions);
      section.sets.push(...part.sets);
    } catch {
      /* chapter unavailable offline — skip it */
    }
  }
  if (!section.questions.length) throw new Error('Could not build the mix right now. Check your connection and try again.');
  const subject = chapterMeta(weak[0].chapter).subject;
  const config: TestConfig = {
    kind: 'weak-mix',
    exam,
    title: 'Weak-area mix',
    sections: [{ subject, count: section.questions.length, seconds: 0, title: 'Weak-area mix' }],
    sectionOrder: [subject],
    sectionalTiming: false,
    strictTimer: false,
    instantFeedback: false,
    difficultyMix: { easy: 0, medium: 1, hard: 0, extreme: 0 },
    seed,
    pace: 'exam',
    difficulty: 'medium',
  };
  return launch(config, [section]);
}
