/**
 * Letter- and number-coding rules for the coding–decoding generator, plus the rule catalogue used to reject
 * ambiguous examples (every rule consistent with the examples must give the same code for the asked word).
 */

export type Transform =
  | { kind: 'shift'; k: number }
  | { kind: 'alt'; k1: number; k2: number }
  | { kind: 'incr'; start: number; step: number }
  | { kind: 'opposite' }
  | { kind: 'opp-shift'; k: number }
  | { kind: 'opp-alt'; k: number }
  | { kind: 'vc'; kv: number; kc: number };

export type Arrange = 'none' | 'reverse' | 'halves';

export interface LetterRule {
  t: Transform;
  arrange: Arrange;
  order: 'arrange-first' | 'transform-first';
}

export const posOf = (ch: string): number => ch.charCodeAt(0) - 64;
export const letterAt = (p: number): string => String.fromCharCode(65 + ((((p - 1) % 26) + 26) % 26));
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);
export const isVowel = (ch: string): boolean => VOWELS.has(ch);

export function positionDependent(t: Transform): boolean {
  return t.kind === 'alt' || t.kind === 'incr' || t.kind === 'opp-alt';
}

/** Shift applied to the letter at 0-based index i (for display). */
export function shiftAt(t: Transform, ch: string, i: number): number | 'opp' | 'opp+' {
  switch (t.kind) {
    case 'shift':
      return t.k;
    case 'alt':
      return i % 2 === 0 ? t.k1 : t.k2;
    case 'incr':
      return t.start + i * t.step;
    case 'vc':
      return isVowel(ch) ? t.kv : t.kc;
    case 'opposite':
      return 'opp';
    case 'opp-shift':
      return 'opp+';
    case 'opp-alt':
      return i % 2 === 0 ? 'opp' : t.k;
  }
}

export function transform(t: Transform, word: string): string {
  return [...word]
    .map((ch, i) => {
      const p = posOf(ch);
      switch (t.kind) {
        case 'shift':
          return letterAt(p + t.k);
        case 'alt':
          return letterAt(p + (i % 2 === 0 ? t.k1 : t.k2));
        case 'incr':
          return letterAt(p + t.start + i * t.step);
        case 'opposite':
          return letterAt(27 - p);
        case 'opp-shift':
          return letterAt(27 - p + t.k);
        case 'opp-alt':
          return i % 2 === 0 ? letterAt(27 - p) : letterAt(p + t.k);
        case 'vc':
          return letterAt(p + (isVowel(ch) ? t.kv : t.kc));
      }
    })
    .join('');
}

const rev = (s: string) => [...s].reverse().join('');

export function arrange(a: Arrange, w: string): string {
  if (a === 'none') return w;
  if (a === 'reverse') return rev(w);
  const h = Math.floor(w.length / 2);
  const mid = w.length % 2 ? w[h] : '';
  return rev(w.slice(0, h)) + mid + rev(w.slice(w.length - h));
}

export function applyRule(r: LetterRule, w: string): string {
  return r.order === 'arrange-first' ? transform(r.t, arrange(r.arrange, w)) : arrange(r.arrange, transform(r.t, w));
}

export const signed = (k: number): string => (k > 0 ? `+${k}` : k < 0 ? `−${-k}` : '0');

export function describeTransform(t: Transform): string {
  const places = (k: number) => `${Math.abs(k)} place${Math.abs(k) === 1 ? '' : 's'} ${k > 0 ? 'forward' : 'backward'}`;
  switch (t.kind) {
    case 'shift':
      return t.k === 0 ? 'the letters themselves are not changed' : `each letter moves ${places(t.k)} (${signed(t.k)})`;
    case 'alt':
      return `letters in odd positions (1st, 3rd, …) move ${signed(t.k1)} and letters in even positions (2nd, 4th, …) move ${signed(t.k2)}`;
    case 'incr':
      return `the 1st letter moves ${signed(t.start)}, the 2nd ${signed(t.start + t.step)}, the 3rd ${signed(t.start + 2 * t.step)} and so on`;
    case 'opposite':
      return 'each letter is replaced by its opposite letter (A↔Z, B↔Y, C↔X …; positions add up to 27)';
    case 'opp-shift':
      return `each letter is replaced by its opposite letter (positions add up to 27) and then moved ${signed(t.k)}`;
    case 'opp-alt':
      return `letters in odd positions are replaced by their opposite letters (positions add up to 27) and letters in even positions move ${signed(t.k)}`;
    case 'vc':
      return `vowels move ${signed(t.kv)} and consonants move ${signed(t.kc)}`;
  }
}

export function describeArrange(a: Arrange): string {
  return a === 'reverse' ? 'the letters are written in reverse order' : a === 'halves' ? 'each half of the word is written in reverse order (the middle letter of an odd-length word stays put)' : '';
}

export function describeRule(r: LetterRule): string {
  const tr = describeTransform(r.t);
  if (r.arrange === 'none') return cap(tr);
  if (r.t.kind === 'shift' && r.t.k === 0) return cap(describeArrange(r.arrange));
  const ar = describeArrange(r.arrange);
  if (!positionDependent(r.t)) return `${cap(ar)}, and ${tr}`;
  return r.order === 'arrange-first' ? `First ${ar}; then ${tr}` : `First ${tr}; then ${ar}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Every rule the ambiguity check considers. */
let CATALOGUE: LetterRule[] | null = null;
export function letterCatalogue(): LetterRule[] {
  if (CATALOGUE) return CATALOGUE;
  const ts: Transform[] = [];
  for (let k = -6; k <= 6; k++) ts.push({ kind: 'shift', k });
  for (let k1 = -4; k1 <= 4; k1++) for (let k2 = -4; k2 <= 4; k2++) if (k1 !== k2) ts.push({ kind: 'alt', k1, k2 });
  for (let start = -4; start <= 4; start++) for (const step of [-3, -2, -1, 1, 2, 3]) ts.push({ kind: 'incr', start, step });
  ts.push({ kind: 'opposite' });
  for (let k = -4; k <= 4; k++) if (k) ts.push({ kind: 'opp-shift', k });
  for (let k = -4; k <= 4; k++) ts.push({ kind: 'opp-alt', k });
  for (let kv = -4; kv <= 4; kv++) for (let kc = -4; kc <= 4; kc++) if (kv !== kc) ts.push({ kind: 'vc', kv, kc });
  const out: LetterRule[] = [];
  for (const t of ts) {
    for (const a of ['none', 'reverse', 'halves'] as const) {
      if (t.kind === 'shift' && t.k === 0 && a === 'none') continue;
      out.push({ t, arrange: a, order: 'transform-first' });
      if (a !== 'none' && positionDependent(t)) out.push({ t, arrange: a, order: 'arrange-first' });
    }
  }
  CATALOGUE = out;
  return out;
}

/** Codes the query can get under the rules that fit every example. */
export function possibleLetterCodes(examples: readonly { word: string; code: string }[], query: string): Set<string> {
  const out = new Set<string>();
  for (const r of letterCatalogue()) {
    if (examples.every((e) => e.word.length === e.code.length && applyRule(r, e.word) === e.code)) out.add(applyRule(r, query));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Number (alphabet-position) rules                                    */
/* ------------------------------------------------------------------ */

export type NumRule =
  | { kind: 'concat'; f: 'pos' | 'rev' }
  /** m × (sum of positions) + c × (number of letters) + d */
  | { kind: 'sum'; f: 'pos' | 'rev'; m: number; c: number; d: number };

export const val = (f: 'pos' | 'rev', ch: string): number => (f === 'pos' ? posOf(ch) : 27 - posOf(ch));

export function applyNum(r: NumRule, w: string): string {
  if (r.kind === 'concat') return [...w].map((ch) => String(val(r.f, ch))).join('');
  const s = [...w].reduce((acc, ch) => acc + val(r.f, ch), 0);
  return String(r.m * s + r.c * w.length + r.d);
}

let NUM_CATALOGUE: NumRule[] | null = null;
export function numCatalogue(): NumRule[] {
  if (NUM_CATALOGUE) return NUM_CATALOGUE;
  const out: NumRule[] = [
    { kind: 'concat', f: 'pos' },
    { kind: 'concat', f: 'rev' },
  ];
  for (const f of ['pos', 'rev'] as const)
    for (const m of [1, 2, 3])
      for (let c = 0; c <= 4; c++) for (let d = -6; d <= 12; d++) out.push({ kind: 'sum', f, m, c, d });
  NUM_CATALOGUE = out;
  return out;
}

export function possibleNumCodes(examples: readonly { word: string; code: string }[], query: string): Set<string> {
  const out = new Set<string>();
  for (const r of numCatalogue()) if (examples.every((e) => applyNum(r, e.word) === e.code)) out.add(applyNum(r, query));
  return out;
}

export function describeNum(r: NumRule): string {
  const fw = (f: 'pos' | 'rev') => (f === 'pos' ? 'its position in the alphabet (A = 1 … Z = 26)' : 'its position from the end of the alphabet (A = 26 … Z = 1)');
  if (r.kind === 'concat') return `Each letter is written as ${fw(r.f)}, and the numbers are written side by side`;
  const base = `the sum of the letters' ${r.f === 'pos' ? 'positions (A = 1 … Z = 26)' : 'reverse positions (A = 26 … Z = 1)'}`;
  let s = r.m === 1 ? cap(base) : `${r.m} × ${base}`;
  if (r.c) s += ` + ${r.c === 1 ? '' : `${r.c} × `}(number of letters)`;
  if (r.d) s += ` ${r.d > 0 ? '+' : '−'} ${Math.abs(r.d)}`;
  return s;
}

/* ------------------------------------------------------------------ */
/* Letters in place                                                    */
/* ------------------------------------------------------------------ */

export type InPlaceMode = 'alpha' | 'reverse-alpha' | 'shift-alpha';

/** vowel → next letter, consonant → previous letter (no wrap needed for A…Z? A→B, B→A, Z→Y). */
export function shiftVowelConsonant(word: string): string {
  return [...word].map((ch) => letterAt(posOf(ch) + (isVowel(ch) ? 1 : -1))).join('');
}

export function inPlaceArrays(word: string, mode: InPlaceMode): { before: string[]; after: string[] } {
  const before = [...(mode === 'shift-alpha' ? shiftVowelConsonant(word) : word)];
  const after = [...before].sort();
  if (mode === 'reverse-alpha') after.reverse();
  return { before, after };
}

export function inPlaceCount(word: string, mode: InPlaceMode): number {
  const { before, after } = inPlaceArrays(word, mode);
  return before.filter((ch, i) => ch === after[i]).length;
}
