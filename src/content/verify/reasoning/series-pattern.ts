/**
 * Independent verifier for reasoning.series-pattern.
 * Re-derives every answer from the facts with separate code: window scans, pointer walking, exhaustive pattern
 * search, counting-sort rearrangement and permutation enumeration against the lexicon.
 */
import type { GenResult } from '../../generators/types';
import type {
  AlnumQ,
  Cond,
  ElClass,
  NumCond,
  NumQ,
  NumStep,
  RankRef,
  Removal,
  SeriesPatternFacts,
} from '../../generators/reasoning/series-pattern';

const COUNT_TEXT = ['None', 'One', 'Two', 'Three', 'More than three'];
const countText = (n: number) => COUNT_TEXT[Math.min(4, n)];
const COUNT_TEXT_4 = ['One', 'Two', 'Three', 'Four', 'More than four'];
const countText4 = (n: number) => {
  if (n < 1) throw new Error('count of zero with One…More than four options');
  return COUNT_TEXT_4[Math.min(4, n - 1)];
};
const escape = (s: string) => s.replace(/[\\$*]/g, (c) => '\\' + c);

/* ------------------------------ alphanumeric ------------------------------ */

function kindOf(el: string): 'L' | 'D' | 'S' {
  if (/^[A-Z]$/.test(el)) return 'L';
  if (/^[1-9]$/.test(el)) return 'D';
  return 'S';
}

function belongs(el: string, c: ElClass): boolean {
  const k = kindOf(el);
  if (c === 'symbol') return k === 'S';
  if (c === 'letter') return k === 'L';
  if (c === 'vowel') return k === 'L' && 'AEIOU'.indexOf(el) >= 0;
  if (c === 'consonant') return k === 'L' && 'AEIOU'.indexOf(el) < 0;
  if (c === 'number') return k === 'D';
  if (c === 'even') return k === 'D' && '2468'.indexOf(el) >= 0;
  if (c === 'square') return k === 'D' && [1, 2, 3].some((r) => String(r * r) === el);
  return k === 'D' && '13579'.indexOf(el) >= 0;
}

function removeElements(arr: string[], r: Removal): string[] {
  const kill: boolean[] = arr.map((el, i) => {
    if (!belongs(el, r.cls)) return false;
    if (!r.rel) return true;
    const nb = r.rel === 'followed' ? arr[i + 1] : arr[i - 1];
    return nb !== undefined && belongs(nb, r.by!);
  });
  return arr.filter((_, i) => !kill[i]);
}

function neighbourOk(nb: string | undefined, c: Cond | undefined): boolean {
  if (!c) return true;
  if (nb === undefined) return !!c.neg; // no neighbour: fails a positive condition, meets a negative one
  return c.neg ? !belongs(nb, c.cls) : belongs(nb, c.cls);
}

function walk(arr: string[], startIdx: number, k: number, dir: 'left' | 'right'): number {
  let i = startIdx;
  for (let s = 0; s < k; s++) i += dir === 'right' ? 1 : -1;
  if (i < 0 || i >= arr.length) throw new Error('walked off the arrangement');
  return i;
}

function fromEnd(arr: string[], from: 'left' | 'right', m: number): number {
  // walk m-1 steps inward from the end
  return from === 'left' ? walk(arr, 0, m - 1, 'right') : walk(arr, arr.length - 1, m - 1, 'left');
}

function tripletAt(arr: string[], i: number, a: number, b: number): string | null {
  const x = arr[i];
  const y = arr[i + a];
  const z = arr[i + b];
  if (x === undefined || y === undefined || z === undefined) return null;
  return x + '\u0001' + y + '\u0001' + z;
}

function verifyAlnum(q: AlnumQ, elements: string[]): string {
  switch (q.type) {
    case 'count': {
      const arr = q.removal ? removeElements(elements, q.removal) : elements;
      let n = 0;
      for (let i = 0; i < arr.length; i++) {
        if (belongs(arr[i], q.target) && neighbourOk(arr[i - 1], q.prev) && neighbourOk(arr[i + 1], q.next)) n++;
      }
      return q.style === 'upto4' ? countText4(n) : countText(n);
    }
    case 'sum': {
      let s = 0;
      for (let i = 0; i < elements.length; i++) {
        if (belongs(elements[i], q.target) && neighbourOk(elements[i - 1], q.prev) && neighbourOk(elements[i + 1], q.next)) s += Number(elements[i]);
      }
      return String(s);
    }
    case 'position': {
      let arr = elements.slice();
      if (q.removal) arr = removeElements(arr, q.removal);
      if (q.reverse) {
        const c = q.reverse.count;
        const block = q.reverse.end === 'left' ? arr.slice(0, c) : arr.slice(arr.length - c);
        const rev: string[] = [];
        for (let i = block.length - 1; i >= 0; i--) rev.push(block[i]);
        arr = q.reverse.end === 'left' ? rev.concat(arr.slice(c)) : arr.slice(0, arr.length - c).concat(rev);
      }
      const base = fromEnd(arr, q.from, q.m);
      return escape(arr[walk(arr, base, q.k, q.dir)]);
    }
    case 'anchor': {
      const at = elements.map((e, i) => (e === q.anchor ? i : -1)).filter((i) => i >= 0);
      if (at.length !== 1) throw new Error('anchor not unique');
      let i = at[0];
      for (const s of q.steps) i = walk(elements, i, s.k, s.dir);
      return escape(elements[i]);
    }
    case 'middle': {
      const a = fromEnd(elements, q.a.from, q.a.m);
      const b = fromEnd(elements, q.b.from, q.b.m);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      // step inward from both sides until they meet
      let x = lo;
      let y = hi;
      while (y - x > 1) {
        x++;
        y--;
      }
      if (x !== y) throw new Error('no single middle element');
      return escape(elements[x]);
    }
    case 'odd-one-out': {
      const opts = q.options.map((t) => t.join('\u0001'));
      const oddSet = new Set<number>();
      for (let a = -5; a <= 5; a++)
        for (let b = -5; b <= 5; b++) {
          if (!a || !b || a === b) continue;
          const all = new Set<string>();
          for (let i = 0; i < elements.length; i++) {
            const t = tripletAt(elements, i, a, b);
            if (t) all.add(t);
          }
          const fit = opts.map((o) => all.has(o));
          const n = fit.filter(Boolean).length;
          if (n === 5) throw new Error('all five options fit one pattern');
          if (n === 4) oddSet.add(fit.indexOf(false));
        }
      if (oddSet.size !== 1) throw new Error(`odd one not unique: ${[...oddSet]}`);
      const idx = [...oddSet][0];
      return q.options[idx].map(escape).join('');
    }
    case 'series-next': {
      const terms = q.terms.map((t) => t.join('\u0001'));
      const answers = new Set<string>();
      for (let s = 0; s < elements.length; s++)
        for (let a = -5; a <= 5; a++)
          for (let b = -5; b <= 5; b++) {
            if (!a || !b || a === b) continue;
            if (tripletAt(elements, s, a, b) !== terms[0]) continue;
            for (let d = -10; d <= 10; d++) {
              if (!d) continue;
              if (tripletAt(elements, s + d, a, b) !== terms[1] || tripletAt(elements, s + 2 * d, a, b) !== terms[2]) continue;
              answers.add(tripletAt(elements, s + 3 * d, a, b) ?? 'OUT');
            }
          }
      if (answers.size !== 1 || answers.has('OUT')) throw new Error(`series answer not unique: ${[...answers]}`);
      return [...answers][0].split('\u0001').map(escape).join('');
    }
  }
}

/* -------------------------------- numbers -------------------------------- */

function transform(n: number, steps: NumStep[]): number {
  let s = String(n);
  for (const st of steps) {
    if (st.t === 'reverse') s = s[2] + s[1] + s[0];
    else if (st.t === 'swap') {
      const c = s.split('');
      const t = c[st.i];
      c[st.i] = c[st.j];
      c[st.j] = t;
      s = c.join('');
    } else if (st.t === 'sort') {
      const c = s.split('').map(Number);
      // selection sort (independent of Array.sort)
      for (let i = 0; i < 3; i++)
        for (let j = i + 1; j < 3; j++) if (st.order === 'asc' ? c[j] < c[i] : c[j] > c[i]) [c[i], c[j]] = [c[j], c[i]];
      s = c.join('');
    } else {
      const val = Number(s);
      if (st.when === 'odd' && val % 2 !== 1) continue;
      if (st.when === 'even' && val % 2 !== 0) continue;
      const c = s.split('').map(Number);
      c[st.pos] += st.v;
      if (c[st.pos] < 1 || c[st.pos] > 9) throw new Error('digit out of range');
      s = c.join('');
    }
  }
  return Number(s);
}

function rankPick(vals: number[], r: RankRef): number {
  // count how many values beat each candidate
  for (const v of vals) {
    const better = vals.filter((w) => (r.order === 'highest' ? w > v : w < v)).length;
    if (better === r.k - 1) return v;
  }
  throw new Error('rank not found');
}

function holds(n: number, c: NumCond): boolean {
  if (c.t === 'even') return n % 2 === 0;
  if (c.t === 'odd') return n % 2 !== 0;
  if (c.t === 'div') return Number.isInteger(n / c.n);
  if (c.t === 'gt') return n > c.n;
  return n < c.n;
}

function verifyNumber(q: NumQ, numbers: number[]): string {
  const vals = numbers.map((n) => transform(n, q.steps));
  if (new Set(vals).size !== vals.length) throw new Error('transformed numbers not distinct');
  const digitOf = (n: number, p: number) => Number(String(n)[p]);
  switch (q.type) {
    case 'rank':
      return String(rankPick(vals, q.rank));
    case 'digit-arith': {
      const x = digitOf(rankPick(vals, q.a.rank), q.a.pos);
      const y = digitOf(rankPick(vals, q.b.rank), q.b.pos);
      return String(q.op === 'product' ? x * y : q.op === 'sum' ? x + y : Math.abs(x - y));
    }
    case 'count':
      return countText(vals.filter((v) => holds(v, q.cond)).length);
    case 'range-diff':
      return String(Math.max(...vals) - Math.min(...vals));
    case 'digit-sum': {
      const n = rankPick(vals, q.rank);
      return String(
        String(n)
          .split('')
          .reduce((s, c) => s + Number(c), 0),
      );
    }
  }
}

/* --------------------------------- words --------------------------------- */

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function countingSort(letters: string[], desc: boolean): string[] {
  const bins: number[] = new Array(26).fill(0);
  for (const c of letters) bins[ALPHA.indexOf(c)]++;
  const out: string[] = [];
  const order = desc ? [...Array(26).keys()].reverse() : [...Array(26).keys()];
  for (const i of order) for (let j = 0; j < bins[i]; j++) out.push(ALPHA[i]);
  return out;
}

function arrangeWord(word: string, order: 'alpha' | 'reverse' | 'halves'): string[] {
  const letters = word.split('');
  if (order === 'alpha') return countingSort(letters, false);
  if (order === 'reverse') return countingSort(letters, true);
  const h = letters.length / 2;
  if (!Number.isInteger(h)) throw new Error('odd length for halves');
  return countingSort(letters.slice(0, h), false).concat(countingSort(letters.slice(h), true));
}

function pairCount(word: string, mode: 'both' | 'forward' | 'backward'): number {
  let n = 0;
  for (let gap = 1; gap < word.length; gap++)
    for (let i = 0; i + gap < word.length; i++) {
      const a = ALPHA.indexOf(word[i]);
      const b = ALPHA.indexOf(word[i + gap]);
      if (b - a === gap && mode !== 'backward') n++;
      if (a - b === gap && mode !== 'forward') n++;
    }
  return n;
}

function permutations(letters: string[]): Set<string> {
  const out = new Set<string>();
  const used = letters.map(() => false);
  const cur: string[] = [];
  const rec = () => {
    if (cur.length === letters.length) {
      out.add(cur.join(''));
      return;
    }
    for (let i = 0; i < letters.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(letters[i]);
      rec();
      cur.pop();
      used[i] = false;
    }
  };
  rec();
  return out;
}

/* --------------------------------- entry --------------------------------- */

export function verify(res: GenResult<SeriesPatternFacts>): (number | string)[] {
  const f = res.facts;
  switch (f.kind) {
    case 'alphanumeric-set':
      return f.questions.map((q) => verifyAlnum(q, f.elements));
    case 'number-set':
      return f.questions.map((q) => verifyNumber(q, f.numbers));
    case 'word-rearrange': {
      const v = f.variant;
      if (v.v === 'same') {
        const r = arrangeWord(f.word, v.order);
        let same = 0;
        for (let i = 0; i < f.word.length; i++) if (r[i] === f.word[i]) same++;
        return [countText(same)];
      }
      const r = arrangeWord(f.word, v.order);
      let i = v.from === 'left' ? v.m - 1 : r.length - v.m;
      if (v.k && v.dir) i += v.dir === 'right' ? v.k : -v.k;
      if (i < 0 || i >= r.length) throw new Error('position outside word');
      return [r[i]];
    }
    case 'letter-pairs':
      return [countText(pairCount(f.word, f.mode))];
    case 'meaningful-word': {
      const letters = f.form === 'count-letters' ? f.letters : f.positions.map((p) => f.host[p - 1]);
      const lex = new Set(f.lexicon);
      const found = [...permutations(letters)].filter((w) => lex.has(w));
      if (f.form !== 'positions-letter') return [countText(found.length)];
      if (found.length === 0) return [f.codes[0]];
      if (found.length > 1) return [f.codes[1]];
      const w = found[0];
      return [f.from === 'left' ? w[f.k - 1] : w[w.length - f.k]];
    }
  }
}
