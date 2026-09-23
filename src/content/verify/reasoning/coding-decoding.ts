/**
 * Independent verifier for reasoning.coding-decoding.
 *
 * - Letter / number codes: the rule is INFERRED from the examples by searching a catalogue of rule families
 *   (written independently of the generator, with wider parameter ranges); every rule that reproduces all
 *   examples is applied to the asked word, and they must all agree.
 * - Letters in place: recomputed directly.
 * - Sentence sets: brute-force search for every word→code assignment consistent with the statements; an asked
 *   word must get the same code in all of them. Options are then matched by content.
 */
import type { GenResult } from '../../generators/types';
import type { CodingFacts, SentenceQuestionFact } from '../../generators/reasoning/coding-decoding';

const AMBIGUOUS = '#ambiguous#';

/* ------------------------------------------------------------------ */
/* Letter rules                                                        */
/* ------------------------------------------------------------------ */

const BASE = 65;
const ix = (ch: string) => ch.charCodeAt(0) - BASE; // 0..25
const ch = (i: number) => String.fromCharCode(BASE + (((i % 26) + 26) % 26));
const VOW = 'AEIOU';

type MapFn = (c: string, i: number) => string;

function mapFamilies(): MapFn[] {
  const fns: MapFn[] = [];
  for (let k = -6; k <= 6; k++) fns.push((c) => ch(ix(c) + k));
  for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) if (a !== b) fns.push((c, i) => ch(ix(c) + (i % 2 ? b : a)));
  for (let s = -4; s <= 4; s++) for (let t = -3; t <= 3; t++) if (t) fns.push((c, i) => ch(ix(c) + s + i * t));
  fns.push((c) => ch(25 - ix(c)));
  for (let k = -4; k <= 4; k++) if (k) fns.push((c) => ch(25 - ix(c) + k));
  for (let k = -4; k <= 4; k++) fns.push((c, i) => (i % 2 ? ch(ix(c) + k) : ch(25 - ix(c))));
  for (let v = -4; v <= 4; v++) for (let w = -4; w <= 4; w++) if (v !== w) fns.push((c) => ch(ix(c) + (VOW.includes(c) ? v : w)));
  return fns;
}

const reverse = (s: string) => s.split('').reverse().join('');
function halves(s: string): string {
  const h = Math.floor(s.length / 2);
  return reverse(s.slice(0, h)) + (s.length % 2 ? s.charAt(h) : '') + reverse(s.slice(s.length - h));
}
const mapWord = (f: MapFn, s: string) => s.split('').map((c, i) => f(c, i)).join('');

type WordRule = (s: string) => string;
let LETTER_RULES: WordRule[] | null = null;
function letterRules(): WordRule[] {
  if (LETTER_RULES) return LETTER_RULES;
  const out: WordRule[] = [];
  for (const f of mapFamilies()) {
    out.push((s) => mapWord(f, s));
    out.push((s) => mapWord(f, reverse(s)));
    out.push((s) => reverse(mapWord(f, s)));
    out.push((s) => mapWord(f, halves(s)));
    out.push((s) => halves(mapWord(f, s)));
  }
  LETTER_RULES = out;
  return out;
}

/* ------------------------------------------------------------------ */
/* Number rules                                                        */
/* ------------------------------------------------------------------ */

const fwd = (c: string) => ix(c) + 1;
const bwd = (c: string) => 26 - ix(c);

let NUMBER_RULES: WordRule[] | null = null;
function numberRules(): WordRule[] {
  if (NUMBER_RULES) return NUMBER_RULES;
  const out: WordRule[] = [];
  for (const g of [fwd, bwd]) {
    out.push((s) => s.split('').map((c) => String(g(c))).join(''));
    for (let m = 1; m <= 3; m++)
      for (let c = 0; c <= 4; c++)
        for (let d = -6; d <= 12; d++) out.push((s) => String(m * s.split('').reduce((acc, x) => acc + g(x), 0) + c * s.length + d));
  }
  NUMBER_RULES = out;
  return out;
}

function inferAndApply(rules: WordRule[], examples: { word: string; code: string }[], query: string): string {
  const outs = new Set<string>();
  for (const r of rules) if (examples.every((e) => r(e.word) === e.code)) outs.add(r(query));
  return outs.size === 1 ? [...outs][0] : AMBIGUOUS;
}

/* ------------------------------------------------------------------ */
/* Letters in place                                                    */
/* ------------------------------------------------------------------ */

const COUNT_TEXT = ['None', 'One', 'Two', 'Three', 'More than three'];

function inPlace(word: string, mode: string): string {
  let letters = word.split('');
  if (mode === 'shift-alpha') letters = letters.map((c) => (VOW.includes(c) ? ch(ix(c) + 1) : ch(ix(c) - 1)));
  const sorted = [...letters].sort((a, b) => (mode === 'reverse-alpha' ? b.localeCompare(a) : a.localeCompare(b)));
  let same = 0;
  for (let i = 0; i < letters.length; i++) if (letters[i] === sorted[i]) same++;
  return COUNT_TEXT[Math.min(same, 4)];
}

/* ------------------------------------------------------------------ */
/* Sentence sets                                                       */
/* ------------------------------------------------------------------ */

function solveAll(sentences: { words: string[]; codes: string[] }[]): Map<string, string>[] {
  const words = [...new Set(sentences.flatMap((s) => s.words))];
  const cand = new Map<string, string[]>();
  for (const w of words) {
    const containing = sentences.filter((s) => s.words.includes(w));
    cand.set(
      w,
      containing[0].codes.filter((c) => containing.every((s) => s.codes.includes(c))),
    );
  }
  // order: fewest candidates first
  words.sort((a, b) => cand.get(a)!.length - cand.get(b)!.length);
  const solutions: Map<string, string>[] = [];
  const assign = new Map<string, string>();
  const usedCodes = new Set<string>();
  const sentenceOk = () =>
    sentences.every((s) => {
      if (!s.words.every((w) => assign.has(w))) return true;
      const got = s.words.map((w) => assign.get(w)!).sort();
      const want = [...s.codes].sort();
      return got.length === want.length && got.every((c, i) => c === want[i]);
    });
  const rec = (k: number) => {
    if (solutions.length > 5000) return;
    if (k === words.length) {
      solutions.push(new Map(assign));
      return;
    }
    const w = words[k];
    for (const c of cand.get(w)!) {
      if (usedCodes.has(c)) continue;
      assign.set(w, c);
      usedCodes.add(c);
      if (sentenceOk()) rec(k + 1);
      assign.delete(w);
      usedCodes.delete(c);
    }
  };
  rec(0);
  return solutions;
}

function uniqueCode(sols: Map<string, string>[], w: string): string | null {
  const codes = new Set(sols.map((s) => s.get(w)));
  return codes.size === 1 ? [...codes][0] ?? null : null;
}

function uniqueWord(sols: Map<string, string>[], code: string): string | null {
  const words = new Set(sols.map((s) => [...s.entries()].find(([, c]) => c === code)?.[0]));
  return words.size === 1 ? [...words][0] ?? null : null;
}

const tokens = (opt: string) => opt.trim().split(/\s+/).sort();
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

function answerSentenceQ(q: SentenceQuestionFact, sols: Map<string, string>[], used: Set<string>, options: readonly string[]): number | string {
  switch (q.type) {
    case 'code-of':
      return uniqueCode(sols, q.word) ?? AMBIGUOUS;
    case 'word-of':
      return uniqueWord(sols, q.code) ?? AMBIGUOUS;
    case 'phrase': {
      const codes = q.words.map((w) => uniqueCode(sols, w));
      if (codes.some((c) => c === null)) return -1;
      const hits = options.map((o, i) => (sameSet(tokens(o), codes as string[]) ? i : -1)).filter((i) => i >= 0);
      return hits.length === 1 ? hits[0] : -1;
    }
    case 'words-of': {
      const ws = q.codes.map((c) => uniqueWord(sols, c));
      if (ws.some((w) => w === null)) return -1;
      const hits = options.map((o, i) => (sameSet(tokens(o), ws as string[]) ? i : -1)).filter((i) => i >= 0);
      return hits.length === 1 ? hits[0] : -1;
    }
    case 'may-be': {
      if (sols.some((s) => s.has(q.newWord))) return -1;
      const known = q.words.map((w) => uniqueCode(sols, w));
      if (known.some((c) => c === null)) return -1;
      const valid = options.map((o) => {
        const t = tokens(o);
        if (t.length !== known.length + 1) return false;
        const rest = [...t];
        for (const c of known as string[]) {
          const k = rest.indexOf(c);
          if (k < 0) return false;
          rest.splice(k, 1);
        }
        return rest.length === 1 && !used.has(rest[0]);
      });
      const hits = valid.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
      return hits.length === 1 ? hits[0] : -1;
    }
  }
}

export function verify(res: GenResult<CodingFacts>): (number | string)[] {
  const f = res.facts;
  const qs = res.item.questions;
  switch (f.kind) {
    case 'letter':
      return [inferAndApply(letterRules(), f.examples ?? [], f.query ?? '')];
    case 'number':
      return [inferAndApply(numberRules(), f.examples ?? [], f.query ?? '')];
    case 'in-place':
      return [inPlace(f.word ?? '', f.mode ?? 'alpha')];
    case 'sentence': {
      const sentences = f.sentences ?? [];
      const sols = solveAll(sentences);
      if (!sols.length) return qs.map(() => -1);
      const used = new Set(sentences.flatMap((s) => s.codes));
      return (f.questions ?? []).map((q, i) => answerSentenceQ(q, sols, used, qs[i]?.options ?? []));
    }
  }
}
