/**
 * E6 Misspelt words (HYB): authored sentence frames + curated word list + dictionary-vetted misspellings.
 *
 * Build backward: decide first whether the key is "All correct" (~8%, matching 2024–26 papers) or which of
 * A–D is misspelt (uniform), then pick a frame / words whose target word sits at that tier, then corrupt it with
 * one of its vetted misspellings. "All correct" is always option E, as in the exam.
 */
import { defineGenerator, type SubtypeDef } from '../types';
import { makeQuestion, single } from '../shared/question';
import { fixedChoices } from '../shared/options';
import { targetSeconds } from '../../targets';
import type { Difficulty, Rich } from '../../types';
import type { Rng } from '../../../lib/rng';
import { FRAMES, SLOT, TIER_RANK, VARIANTS, WORD, WORDS_BY_TIER, type Frame, type Variant } from './spelling/data';
import { FAMILY_NAME, FAMILY_TAG, explainSlip, listWords, mostTempting } from './spelling/explain';

export interface SpellingFacts {
  /** Sentence frame used (bold-in-sentence), or null for the standalone list. */
  frameId: string | null;
  /** The four words exactly as shown, in option order A–D (one may be a misspelling). */
  shown: string[];
}

export const ALL_CORRECT = 'All correct';
/** Share of items whose key is "All correct" (research update: rare in 2024–26 papers). */
export const ALL_CORRECT_SHARE = 0.08;

export const BOLD_PROMPT =
  "In the following sentence, four words are given in bold. One of them may be misspelt. Choose the misspelt word. If all the words are correctly spelt, choose 'All correct'.";
export const STANDALONE_PROMPT = "Which of the following words is misspelt? If all are correctly spelt, choose 'All correct'.";

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'bold-in-sentence', label: 'Bold words in a sentence', weight: 3 },
  { id: 'standalone', label: 'Word list', weight: 1 },
];

const LETTERS = 'ABCDE';

/** Hard and extreme lean on the most classic (subtle) slip of the word; easy and medium use any vetted one. */
function pickVariant(rng: Rng, word: string, difficulty: Difficulty): Variant {
  const list = VARIANTS.get(word);
  if (!list || list.length < 2) throw new Error(`spelling: no vetted variants for "${word}"`);
  if (TIER_RANK[difficulty] >= 2 && rng.chance(0.6)) return list[0];
  return rng.pick(list);
}

function frameLevel(f: Frame): number {
  return Math.max(...f.words.map((w) => TIER_RANK[WORD.get(w)!.d]));
}

function pickFrame(rng: Rng, difficulty: Difficulty, slot: number): Frame {
  const want = TIER_RANK[difficulty];
  const pool =
    slot < 0
      ? FRAMES.filter((f) => frameLevel(f) === want)
      : FRAMES.filter((f) => WORD.get(f.words[slot])!.d === difficulty);
  if (!pool.length) throw new Error(`spelling: no frame for ${difficulty} slot ${slot}`);
  return rng.pick(pool);
}

/** Two words share a stem (accommodate / accommodation): never show both in one standalone list. */
function sameStem(a: string, b: string): boolean {
  const n = Math.min(6, a.length, b.length);
  return a.slice(0, n) === b.slice(0, n);
}

function pickStandaloneWords(rng: Rng, difficulty: Difficulty): string[] {
  const pool = rng.shuffle(WORDS_BY_TIER[difficulty].map((e) => e.w));
  const out: string[] = [];
  for (const w of pool) {
    if (out.some((o) => sameStem(o, w))) continue;
    out.push(w);
    if (out.length === 4) return out;
  }
  throw new Error(`spelling: not enough distinct ${difficulty} words`);
}

export const generator = defineGenerator<SpellingFacts>(
  { name: 'english.spelling', version: 1, subject: 'english', chapter: 'spelling' },
  SUBTYPES,
  ({ meta, seed, difficulty, subtype, rng }) => {
    const allCorrect = rng.chance(ALL_CORRECT_SHARE);
    const slot = allCorrect ? -1 : rng.int(0, 3);

    let frame: Frame | null = null;
    let words: string[];
    if (subtype.id === 'bold-in-sentence') {
      frame = pickFrame(rng, difficulty, slot);
      words = frame.words;
    } else {
      words = pickStandaloneWords(rng, difficulty);
    }

    const variant = slot >= 0 ? pickVariant(rng, words[slot], difficulty) : null;
    const shown = words.map((w, i) => (i === slot && variant ? variant.form : w));
    const choices = fixedChoices([...shown, ALL_CORRECT], slot >= 0 ? slot : 4);

    let prompt: Rich;
    if (frame) {
      let k = 0;
      const sentence = frame.text.replace(SLOT, () => `**${shown[k++]}**`);
      prompt = `${BOLD_PROMPT}\n\n${sentence}`;
    } else {
      prompt = STANDALONE_PROMPT;
    }

    const correctOthers = words.filter((_, i) => i !== slot);
    const tempting = mostTempting(correctOthers);
    const temptingHook = WORD.get(tempting)!.h;
    const steps: Rich[] = [];
    let shortcut: Rich;
    let trap: Rich;
    let rule: string;
    let tags: string[];

    if (slot >= 0 && variant) {
      const word = words[slot];
      steps.push(`(${LETTERS[slot]}) '${variant.form}' is misspelt. The correct spelling is **${word}**.`);
      steps.push(`Rule — ${FAMILY_NAME[variant.fam]}: ${explainSlip(word, variant.form, variant.fam)}.`);
      if (frame) {
        let k = 0;
        const corrected = frame.text.replace(SLOT, () => {
          const i = k++;
          return i === slot ? `**${words[i]}**` : words[i];
        });
        steps.push(`Corrected sentence: ${corrected}`);
      }
      steps.push(`The other words — ${listWords(correctOthers)} — are spelt correctly.`);
      shortcut = `Memory hook for **${word}**: ${WORD.get(word)!.h}`;
      trap = `**${tempting}** looks unusual but is spelt correctly. ${temptingHook}`;
      rule = `Spelling: ${FAMILY_NAME[variant.fam]}`;
      tags = [FAMILY_TAG[variant.fam]];
    } else {
      steps.push(`Check each word: ${listWords(words)} are all spelt correctly.`);
      steps.push(`So the answer is (E) ${ALL_CORRECT}.`);
      shortcut = `Memory hook for **${tempting}**: ${temptingHook}`;
      trap = `**${tempting}** is the most tempting pick, but it is spelt correctly. Choose a word only when you can say which letter is wrong.`;
      rule = 'Spelling: all words correct';
      tags = ['spelling:all-correct'];
    }

    const q = makeQuestion(meta, seed, {
      subtype: subtype.id,
      difficulty,
      prompt,
      options: choices.options,
      answerIndex: choices.answerIndex,
      solution: { steps, shortcut, trap, rule },
      tags,
      targetSeconds: targetSeconds('english-single', difficulty),
    });
    return { item: single(q), facts: { frameId: frame?.id ?? null, shown } };
  },
);
