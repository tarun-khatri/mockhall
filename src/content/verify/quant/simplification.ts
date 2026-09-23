/**
 * Independent verifier for quant.simplification.
 *
 * Method (independent of the generator): parse the equation exactly as PRINTED in the prompt (a small TeX parser
 * with textbook BODMAS: brackets → powers/roots → "of" → × ÷ left to right → + − left to right), then
 *  - exact questions: substitute EVERY option for "?" and evaluate both sides with exact BigInt rational
 *    arithmetic (roots only when exact). Exactly one option may balance the equation.
 *  - approximation: compute the exact value of "?" in floating point (bisection when "?" is inside) and pick
 *    the nearest option; the runner-up must be clearly further away.
 * As a cross-check the facts tree (the generator's structure) is evaluated with a separate mini-evaluator and
 * must agree with the parsed prompt.
 */
import type { GenResult } from '../../generators/types';
import type { SimplificationFacts } from '../../generators/quant/simplification';
import { mathSegments } from '../../rich';

/* ------------------------------------------------------------------ */
/* Exact rationals on BigInt                                           */
/* ------------------------------------------------------------------ */

interface R {
  n: bigint;
  d: bigint;
}

function bgcd(a: bigint, b: bigint): bigint {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b) [a, b] = [b, a % b];
  return a;
}

function mk(n: bigint, d = 1n): R {
  if (d === 0n) throw new Error('division by zero');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = bgcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}

const radd = (a: R, b: R) => mk(a.n * b.d + b.n * a.d, a.d * b.d);
const rsub = (a: R, b: R) => mk(a.n * b.d - b.n * a.d, a.d * b.d);
const rmul = (a: R, b: R) => mk(a.n * b.n, a.d * b.d);
const rdiv = (a: R, b: R) => {
  if (b.n === 0n) throw new Error('division by zero');
  return mk(a.n * b.d, a.d * b.n);
};
const req = (a: R, b: R) => a.n === b.n && a.d === b.d;

function powInt(a: R, k: bigint): R {
  if (k < 0n) return powInt(rdiv(mk(1n), a), -k);
  if (k > 400n) throw new Error('exponent too large');
  let out = mk(1n);
  for (let i = 0n; i < k; i++) out = rmul(out, a);
  return out;
}

/** Exact integer k-th root of a non-negative bigint, or null. */
function iroot(x: bigint, k: number): bigint | null {
  if (x < 0n) return null;
  if (x < 2n) return x;
  // binary search
  let lo = 0n;
  let hi = 1n;
  while (hi ** BigInt(k) <= x) hi *= 2n;
  while (lo < hi - 1n) {
    const mid = (lo + hi) / 2n;
    if (mid ** BigInt(k) <= x) lo = mid;
    else hi = mid;
  }
  return lo ** BigInt(k) === x ? lo : null;
}

function rroot(a: R, k: number): R | null {
  const n = iroot(a.n, k);
  const d = iroot(a.d, k);
  return n === null || d === null ? null : mk(n, d);
}

/** a^e for rational e = p/q: exact only when the q-th root is exact. */
function rpow(a: R, e: R): R | null {
  if (e.d === 1n) return powInt(a, e.n);
  const r = rroot(a, Number(e.d));
  return r ? powInt(r, e.n) : null;
}

function parseDecimal(s: string): R {
  const [i, f = ''] = s.split('.');
  return mk(BigInt(i + f), 10n ** BigInt(f.length));
}

/* ------------------------------------------------------------------ */
/* TeX subset parser                                                   */
/* ------------------------------------------------------------------ */

type Ast =
  | { k: 'num'; v: R }
  | { k: 'unk' }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; a: Ast; b: Ast }
  | { k: 'pct'; a: Ast }
  | { k: 'of'; a: Ast; b: Ast }
  | { k: 'pow'; a: Ast; e: Ast }
  | { k: 'root'; n: number; a: Ast };

type TokType = 'num' | 'unk' | '+' | '-' | '*' | '/' | '=' | '~' | '%' | '^' | 'of' | 'frac' | 'sqrt' | 'open' | 'close' | '{' | '}';
interface Tok {
  t: TokType;
  v?: string;
  /** Whitespace directly before this token. */
  sp: boolean;
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let sp = false;
  const push = (t: TokType, v?: string) => {
    out.push({ t, v, sp });
    sp = false;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') {
      sp = true;
      i++;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      push('num', src.slice(i, j));
      i = j;
      continue;
    }
    if (c === '?') {
      push('unk');
      i++;
      continue;
    }
    if ('+-=^'.includes(c)) {
      push(c as TokType);
      i++;
      continue;
    }
    if (c === '(' || c === '[') {
      push('open', c);
      i++;
      continue;
    }
    if (c === ')' || c === ']') {
      push('close', c);
      i++;
      continue;
    }
    if (c === '{') {
      push('{');
      i++;
      continue;
    }
    if (c === '}') {
      push('}');
      i++;
      continue;
    }
    if (c === '\\') {
      const rest = src.slice(i);
      const simple: [string, TokType, string?][] = [
        ['\\times', '*'],
        ['\\div', '/'],
        ['\\approx', '~'],
        ['\\%', '%'],
        ['\\frac', 'frac'],
        ['\\sqrt', 'sqrt'],
        ['\\{', 'open', '{'],
        ['\\}', 'close', '}'],
      ];
      const lr = rest.match(/^\\(left|right)(\(|\)|\[|\]|\\\{|\\\})/);
      if (lr) {
        const delim = lr[2].replace('\\', '');
        push(lr[1] === 'left' ? 'open' : 'close', delim);
        i += lr[0].length;
        continue;
      }
      const text = rest.match(/^\\text\{\s*of\s*\}/);
      if (text) {
        push('of');
        i += text[0].length;
        continue;
      }
      const hit = simple.find(([s]) => rest.startsWith(s) && !/[a-zA-Z]/.test(rest[s.length] ?? '') );
      if (hit) {
        push(hit[1], hit[2]);
        i += hit[0].length;
        continue;
      }
      throw new Error(`verifier: unknown TeX command at "${rest.slice(0, 12)}"`);
    }
    throw new Error(`verifier: unexpected character "${c}"`);
  }
  return out;
}

const PAIR: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

class Parser {
  private i = 0;
  constructor(private toks: Tok[]) {}

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }
  private next(): Tok {
    const t = this.toks[this.i++];
    if (!t) throw new Error('verifier: unexpected end of expression');
    return t;
  }
  private expect(t: TokType): Tok {
    const tok = this.next();
    if (tok.t !== t) throw new Error(`verifier: expected ${t}, got ${tok.t}`);
    return tok;
  }
  done(): boolean {
    return this.i >= this.toks.length;
  }

  equation(): { lhs: Ast; rel: '=' | '~'; rhs: Ast } {
    const lhs = this.expr();
    const rel = this.next();
    if (rel.t !== '=' && rel.t !== '~') throw new Error('verifier: missing = or ≈');
    const rhs = this.expr();
    if (!this.done()) throw new Error('verifier: trailing tokens');
    return { lhs, rel: rel.t, rhs };
  }

  expr(): Ast {
    let a = this.term();
    for (let t = this.peek(); t && (t.t === '+' || t.t === '-'); t = this.peek()) {
      this.next();
      a = { k: 'bin', op: t.t, a, b: this.term() };
    }
    return a;
  }

  term(): Ast {
    let a = this.ofx();
    for (let t = this.peek(); t && (t.t === '*' || t.t === '/'); t = this.peek()) {
      this.next();
      a = { k: 'bin', op: t.t, a, b: this.ofx() };
    }
    return a;
  }

  /** "of" binds tighter than × and ÷ (the O of BODMAS). */
  ofx(): Ast {
    const a = this.post();
    if (this.peek()?.t === 'of') {
      this.next();
      return { k: 'of', a, b: this.ofx() };
    }
    return a;
  }

  post(): Ast {
    let a = this.prim();
    if (this.peek()?.t === '^') {
      this.next();
      a = { k: 'pow', a, e: this.group() };
    }
    if (this.peek()?.t === '%') {
      this.next();
      a = { k: 'pct', a };
    }
    return a;
  }

  group(): Ast {
    this.expect('{');
    const e = this.expr();
    this.expect('}');
    return e;
  }

  prim(): Ast {
    const t = this.next();
    switch (t.t) {
      case 'num': {
        const v = parseDecimal(t.v!);
        const nx = this.peek();
        if (nx && nx.t === 'frac' && !nx.sp) {
          // mixed number such as 2\frac{1}{3}
          this.next();
          const a = this.group();
          const b = this.group();
          if (a.k !== 'num' || b.k !== 'num') throw new Error('verifier: bad mixed number');
          return { k: 'num', v: radd(v, rdiv(a.v, b.v)) };
        }
        return { k: 'num', v };
      }
      case 'unk':
        return { k: 'unk' };
      case 'frac': {
        const a = this.group();
        const b = this.group();
        return { k: 'bin', op: '/', a, b };
      }
      case 'sqrt': {
        let n = 2;
        const nx = this.peek();
        if (nx && nx.t === 'open' && nx.v === '[') {
          this.next();
          n = Number(this.expect('num').v);
          const c = this.next();
          if (c.t !== 'close' || c.v !== ']') throw new Error('verifier: bad root index');
        }
        return { k: 'root', n, a: this.group() };
      }
      case 'open': {
        const e = this.expr();
        const c = this.next();
        if (c.t !== 'close' || c.v !== PAIR[t.v!]) throw new Error(`verifier: unbalanced bracket ${t.v}`);
        return e;
      }
      default:
        throw new Error(`verifier: unexpected token ${t.t}`);
    }
  }
}

export function parseEquation(tex: string): { lhs: Ast; rel: '=' | '~'; rhs: Ast } {
  return new Parser(tokenize(tex)).equation();
}

function parseValue(text: string): R {
  const tex = text.replace(/\$/g, '').trim();
  const p = new Parser(tokenize(tex));
  const ast = p.expr();
  if (!p.done()) throw new Error(`verifier: cannot read option "${text}"`);
  const v = evalExact(ast, null);
  if (!v) throw new Error(`verifier: option "${text}" is not rational`);
  return v;
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

const hasUnkAst = (a: Ast): boolean => {
  switch (a.k) {
    case 'unk':
      return true;
    case 'num':
      return false;
    case 'bin':
    case 'of':
      return hasUnkAst(a.a) || hasUnkAst(a.b);
    case 'pct':
    case 'root':
      return hasUnkAst(a.a);
    case 'pow':
      return hasUnkAst(a.a) || hasUnkAst(a.e);
  }
};

/** Exact value, or null when a root is irrational / undefined. */
function evalExact(a: Ast, x: R | null): R | null {
  switch (a.k) {
    case 'num':
      return a.v;
    case 'unk':
      if (!x) throw new Error('verifier: unknown without a value');
      return x;
    case 'bin': {
      const l = evalExact(a.a, x);
      const r = evalExact(a.b, x);
      if (!l || !r) return null;
      if (a.op === '+') return radd(l, r);
      if (a.op === '-') return rsub(l, r);
      if (a.op === '*') return rmul(l, r);
      if (r.n === 0n) return null;
      return rdiv(l, r);
    }
    case 'pct': {
      const v = evalExact(a.a, x);
      return v ? rdiv(v, mk(100n)) : null;
    }
    case 'of': {
      const l = evalExact(a.a, x);
      const r = evalExact(a.b, x);
      return l && r ? rmul(l, r) : null;
    }
    case 'pow': {
      const e = evalExact(a.e, x);
      if (!e) return null;
      if (a.a.k === 'root') {
        // (ᵏ√b)^e = b^(e/k)
        const inner = evalExact(a.a.a, x);
        return inner ? rpow(inner, rdiv(e, mk(BigInt(a.a.n)))) : null;
      }
      const b = evalExact(a.a, x);
      if (!b) return null;
      if (b.n === 0n && e.n <= 0n) return null;
      return rpow(b, e);
    }
    case 'root': {
      const v = evalExact(a.a, x);
      return v ? rroot(v, a.n) : null;
    }
  }
}

function evalFloat(a: Ast, x: number): number {
  switch (a.k) {
    case 'num':
      return Number(a.v.n) / Number(a.v.d);
    case 'unk':
      return x;
    case 'bin': {
      const l = evalFloat(a.a, x);
      const r = evalFloat(a.b, x);
      return a.op === '+' ? l + r : a.op === '-' ? l - r : a.op === '*' ? l * r : l / r;
    }
    case 'pct':
      return evalFloat(a.a, x) / 100;
    case 'of':
      return evalFloat(a.a, x) * evalFloat(a.b, x);
    case 'pow':
      return Math.pow(evalFloat(a.a, x), evalFloat(a.e, x));
    case 'root':
      return a.n === 2 ? Math.sqrt(evalFloat(a.a, x)) : Math.pow(evalFloat(a.a, x), 1 / a.n);
  }
}

/* ------------------------------------------------------------------ */
/* Facts cross-check: the generator's tree, evaluated independently    */
/* ------------------------------------------------------------------ */

type FNode = SimplificationFacts['lhs'];

function factsToAst(node: FNode): Ast {
  switch (node.t) {
    case 'num':
      return { k: 'num', v: mk(BigInt(node.n), BigInt(node.d)) };
    case 'unk':
      return { k: 'unk' };
    case 'sum':
      return node.items.slice(1).reduce<Ast>((acc, it) => ({ k: 'bin', op: it.neg ? '-' : '+', a: acc, b: factsToAst(it.x) }), factsToAst(node.items[0].x));
    case 'prod': {
      const p = node.items.slice(1).reduce<Ast>((acc, it) => ({ k: 'bin', op: '*', a: acc, b: factsToAst(it) }), factsToAst(node.items[0]));
      return node.div ? { k: 'bin', op: '/', a: p, b: factsToAst(node.div) } : p;
    }
    case 'pct':
      return { k: 'of', a: { k: 'pct', a: factsToAst(node.p) }, b: factsToAst(node.x) };
    case 'of':
      return { k: 'of', a: factsToAst(node.f), b: factsToAst(node.x) };
    case 'pow':
      return { k: 'pow', a: factsToAst(node.b), e: factsToAst(node.e) };
    case 'root':
      return { k: 'root', n: node.k, a: factsToAst(node.x) };
    case 'br':
      return factsToAst(node.x);
    case 'frac':
      return { k: 'bin', op: '/', a: factsToAst(node.a), b: factsToAst(node.b) };
  }
}

/* ------------------------------------------------------------------ */
/* Solving                                                             */
/* ------------------------------------------------------------------ */

function balances(lhs: Ast, rhs: Ast, x: R): boolean {
  let l: R | null;
  let r: R | null;
  try {
    l = evalExact(lhs, x);
    r = evalExact(rhs, x);
  } catch {
    return false;
  }
  return !!l && !!r && req(l, r);
}

/** Exact value of "?" in floating point for approximation questions. */
function solveFloat(lhs: Ast, rhs: Ast): number {
  if (rhs.k === 'unk' && !hasUnkAst(lhs)) return evalFloat(lhs, 0);
  if (lhs.k === 'unk' && !hasUnkAst(rhs)) return evalFloat(rhs, 0);
  const f = (x: number) => evalFloat(lhs, x) - evalFloat(rhs, x);
  let lo = 1e-9;
  let hi = 1e8;
  const slo = Math.sign(f(lo));
  if (slo === Math.sign(f(hi))) throw new Error('verifier: cannot bracket the unknown');
  for (let k = 0; k < 300; k++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(f(mid)) === slo) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function nearest(values: number[], target: number): number {
  const dist = values.map((v) => Math.abs(v - target));
  const order = dist.map((d, i) => [d, i] as const).sort((a, b) => a[0] - b[0]);
  const [best, second] = order;
  if (!(second[0] > best[0] * 1.5 + 1e-9)) throw new Error(`verifier: approximation is ambiguous (exact ${target})`);
  return best[1];
}

export function verify(res: GenResult<SimplificationFacts>): number[] {
  const facts = res.facts;
  return res.item.questions.map((q) => {
    const segs = mathSegments(q.prompt);
    const eqTex = segs[segs.length - 1];
    const eq = parseEquation(eqTex);
    if ((eq.rel === '~') !== (facts.mode === 'approx')) throw new Error('verifier: relation does not match the mode');
    const fl = factsToAst(facts.lhs);
    const fr = factsToAst(facts.rhs);

    if (facts.mode === 'exact') {
      const known = hasUnkAst(eq.lhs) ? eq.rhs : eq.lhs;
      if (!hasUnkAst(eq.lhs) && !hasUnkAst(eq.rhs)) throw new Error('verifier: no unknown');
      if (!hasUnkAst(known) && !evalExact(known, null)) throw new Error('verifier: known side is not rational');
      const values = q.options.map(parseValue);
      const hits = values.map((v, i) => (balances(eq.lhs, eq.rhs, v) ? i : -1)).filter((i) => i >= 0);
      if (hits.length !== 1) throw new Error(`verifier: ${hits.length} options satisfy ${eqTex}`);
      if (!balances(fl, fr, values[hits[0]])) throw new Error('verifier: facts tree disagrees with the printed equation');
      return hits[0];
    }

    const values = q.options.map((o) => {
      const v = parseValue(o);
      return Number(v.n) / Number(v.d);
    });
    const exact = solveFloat(eq.lhs, eq.rhs);
    const pick = nearest(values, exact);
    const exactFacts = solveFloat(fl, fr);
    if (Math.abs(exactFacts - exact) > 1e-6 * Math.max(1, Math.abs(exact))) throw new Error('verifier: facts tree disagrees with the printed equation');
    return pick;
  });
}
