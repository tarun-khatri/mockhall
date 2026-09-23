/**
 * Sentence ("Chinese") coding systems.
 *
 * Every word has one code, each statement lists its words' codes in scrambled order. A word's *signature* is
 * the set of statements it appears in; its code has the same signature. Any consistent decoding maps words to
 * codes of the same signature, and within a signature class any matching works — so a word is decoded
 * uniquely exactly when no other word shares its signature. (The verifier re-checks this by brute force.)
 */
import type { Rng } from '../../../../lib/rng';

export interface CodedSentence {
  words: string[];
  /** Codes in display (scrambled) order. */
  codes: string[];
}

export interface CodeSystem {
  sentences: CodedSentence[];
  codeOf: Map<string, string>;
  /** Uniquely decodable words. */
  determined: string[];
}

export function signatureOf(sentences: readonly { words: readonly string[] }[], w: string): string {
  return sentences
    .map((s, i) => (s.words.includes(w) ? String(i) : ''))
    .filter(Boolean)
    .join(',');
}

export function determinedWords(sentences: readonly { words: readonly string[] }[]): string[] {
  const all = [...new Set(sentences.flatMap((s) => s.words))];
  const sig = new Map(all.map((w) => [w, signatureOf(sentences, w)]));
  const count = new Map<string, number>();
  for (const s of sig.values()) count.set(s, (count.get(s) ?? 0) + 1);
  return all.filter((w) => count.get(sig.get(w)!) === 1);
}

export interface SystemSpec {
  sentenceCount: number;
  minWords: number;
  maxWords: number;
  vocabSize: number;
  needDetermined: number;
}

export function buildSystem(rng: Rng, vocab: readonly string[], syllables: readonly string[], spec: SystemSpec): CodeSystem {
  for (let attempt = 0; attempt < 500; attempt++) {
    const words = rng.sample(vocab, spec.vocabSize);
    const codes = rng.sample(syllables, spec.vocabSize);
    const codeOf = new Map(words.map((w, i) => [w, codes[i]]));
    const sentences: CodedSentence[] = [];
    for (let s = 0; s < spec.sentenceCount; s++) {
      const size = rng.int(spec.minWords, spec.maxWords);
      const ws = rng.sample(words, size);
      sentences.push({ words: ws, codes: rng.shuffle(ws.map((w) => codeOf.get(w)!)) });
    }
    const used = new Set(sentences.flatMap((s) => s.words));
    if (used.size !== words.length) continue; // every word must appear somewhere
    const keys = sentences.map((s) => [...s.words].sort().join(' '));
    if (new Set(keys).size !== keys.length) continue;
    // scrambled codes must not simply follow the word order everywhere
    if (sentences.every((s) => s.words.every((w, i) => codeOf.get(w) === s.codes[i]))) continue;
    const determined = determinedWords(sentences);
    if (determined.length < spec.needDetermined) continue;
    // keep at least one undetermined pair when possible (as in real papers) for medium+
    return { sentences, codeOf, determined };
  }
  throw new Error('sentence coding: could not build a code system');
}

/** Explanation lines for decoding one word (valid for determined words). */
export function decodeSteps(sys: CodeSystem, w: string): string[] {
  const idx = sys.sentences.map((s, i) => (s.words.includes(w) ? i : -1)).filter((i) => i >= 0);
  const label = (i: number) => `statement ${i + 1}`;
  const common = sys.sentences[idx[0]].codes.filter((c) => idx.every((i) => sys.sentences[i].codes.includes(c)));
  const lines: string[] = [];
  if (idx.length === 1) lines.push(`'${w}' appears only in ${label(idx[0])}, whose codes are ${list(common)}.`);
  else lines.push(`'${w}' appears in ${idx.map(label).join(' and ')}; the codes common to them are ${list(common)}.`);
  const others = common.filter((c) => c !== sys.codeOf.get(w));
  if (others.length) {
    const reasons = others.map((c) => {
      const owner = [...sys.codeOf.entries()].find(([, code]) => code === c)![0];
      const extra = sys.sentences.findIndex((s, i) => !idx.includes(i) && s.codes.includes(c));
      return extra >= 0 ? `'${c}' also appears in ${label(extra)}, which has no '${w}'` : `'${c}' belongs to '${owner}'`;
    });
    lines.push(`Remove the codes of other words: ${reasons.join('; ')}.`);
  }
  lines.push(`So '${w}' is coded as '${sys.codeOf.get(w)}'.`);
  return lines;
}

function list(xs: readonly string[]): string {
  return xs.map((x) => `'${x}'`).join(', ');
}
