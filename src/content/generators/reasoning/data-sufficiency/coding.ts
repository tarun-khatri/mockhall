/**
 * DS on sentence coding: "'sky is blue' is written as 'ka la ta'" (codes in jumbled order). Worlds = every
 * one-to-one word→code mapping consistent with the given sentences (only the words and codes that appear in
 * them); a word that appears in no given sentence has an unknown code.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty } from '../../../types';
import { findPair, listOr, sizesFor, type Category, type DsDraft, type Scenario } from './common';

export interface CodedSentence {
  words: string[];
  /** Codes in the order printed (jumbled). */
  codes: string[];
}
export type CodeAsk = { t: 'code'; word: string } | { t: 'meaning'; code: string };

export interface DsCodingFacts {
  kind: 'coding';
  I: CodedSentence[];
  II: CodedSentence[];
  ask: CodeAsk;
}

const WORDS = [
  'sun', 'rises', 'east', 'work', 'hard', 'always', 'good', 'people', 'like', 'green', 'tea', 'sky', 'blue', 'rain',
  'falls', 'heavy', 'bank', 'opens', 'early', 'book', 'read', 'daily', 'cold', 'milk', 'hot', 'play', 'cricket', 'team',
  'wins', 'match', 'city', 'life', 'fast', 'train', 'runs', 'late', 'river', 'flows', 'deep', 'farm', 'grows', 'rice',
];
const CODES = ['ka', 'ta', 'ma', 'pa', 'la', 'zo', 'ni', 'ri', 'su', 'de', 'fo', 'ge', 'hu', 'jo', 'ke', 'lo', 'me', 'nu', 'po', 'ru', 'se', 'ti', 'vo', 'wa', 'ye', 'bi', 'ci', 'da'];

function worldsAnswer(sents: readonly CodedSentence[], ask: CodeAsk): Set<string> {
  const words = [...new Set(sents.flatMap((s) => s.words))];
  const codes = [...new Set(sents.flatMap((s) => s.codes))];
  if (ask.t === 'code' ? !words.includes(ask.word) : !codes.includes(ask.code)) return new Set(['unknown:1', 'unknown:2']);
  const map = new Map<string, string>();
  const used = new Set<string>();
  const out = new Set<string>();
  const rec = (i: number) => {
    if (i === words.length) {
      if (!sents.every((s) => s.words.every((w) => s.codes.includes(map.get(w)!)))) return;
      if (ask.t === 'code') out.add(map.get(ask.word)!);
      else for (const [w, c] of map) if (c === ask.code) out.add(w);
      return;
    }
    const w = words[i];
    for (const c of codes) {
      if (used.has(c)) continue;
      // every sentence containing w must contain c
      if (!sents.every((s) => !s.words.includes(w) || s.codes.includes(c))) continue;
      map.set(w, c);
      used.add(c);
      rec(i + 1);
      used.delete(c);
      map.delete(w);
    }
  };
  rec(0);
  return out;
}

export function sentenceText(s: CodedSentence): string {
  return `'${s.words.join(' ')}' is written as '${s.codes.join(' ')}'`;
}

export function buildCoding(rng: Rng, d: Difficulty, target: Category): DsDraft<DsCodingFacts> | null {
  const V = { easy: 5, medium: 6, hard: 7, extreme: 8 }[d];
  const vocab = rng.sample(WORDS, V);
  const code = new Map(vocab.map((w, i) => [w, rng.sample(CODES, V)[i]] as const));
  if (new Set(code.values()).size !== V) return null;
  const sentences: CodedSentence[] = [];
  const seen = new Set<string>();
  for (let t = 0; t < 60 && sentences.length < 14; t++) {
    const k = rng.int(2, Math.min(4, V - 1));
    const words = rng.sample(vocab, k);
    const key = [...words].sort().join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    sentences.push({ words, codes: rng.shuffle(words.map((w) => code.get(w)!)) });
  }
  const ask: CodeAsk = rng.chance(0.7) ? { t: 'code', word: rng.pick(vocab) } : { t: 'meaning', code: code.get(rng.pick(vocab))! };
  const sc: Scenario<CodedSentence> = {
    atoms: sentences,
    key: (s) => [...s.words].sort().join(' '),
    answers: (cl) => worldsAnswer(cl, ask),
  };
  const sizes = sizesFor(d, [1, 1], [1, 2], [2, 2], [2, 2]);
  const res = findPair(rng, sc, target, sizes, 40);
  if (!res) return null;
  const text = (cl: CodedSentence[]) => `In the code language, ${cl.map(sentenceText).join(' and ')}.`;
  const quoted = ask.t === 'code' ? `'${ask.word}'` : `'${ask.code}'`;
  const say = (ans: Set<string>): string => {
    const xs = [...ans].sort();
    if (xs[0].startsWith('unknown')) return `${quoted} does not appear at all, so it cannot be decoded`;
    if (ask.t === 'code') return xs.length === 1 ? `the code for ${quoted} is '${xs[0]}'` : `the code for ${quoted} could be ${listOr(xs.map((x) => `'${x}'`))}`;
    return xs.length === 1 ? `${quoted} means '${xs[0]}'` : `${quoted} could mean ${listOr(xs.map((x) => `'${x}'`))}`;
  };
  return {
    facts: { kind: 'coding', I: res.I, II: res.II, ask },
    context: '',
    question: ask.t === 'code' ? `What is the code for '${ask.word}' in a certain code language?` : `In a certain code language, what does the code '${ask.code}' stand for?`,
    I: text(res.I),
    II: text(res.II),
    say,
    shortcut: 'A word’s code is the code common to every sentence containing that word — after removing codes already fixed for other words. If two codes are still possible, the data are not sufficient.',
    tags: ['ds:coding', 'coding:sentence'],
    res,
  };
}
