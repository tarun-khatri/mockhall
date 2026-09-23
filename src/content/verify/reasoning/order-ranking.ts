/**
 * Independent verifier for reasoning.order-ranking.
 * Rows: brute force over every row length and every seat of the people not pinned by a position clue,
 * keeping the arrangements that satisfy all statements; the answer must be the same in all of them
 * (otherwise "Cannot be determined"). Comparisons: backtracking placement rank by rank.
 */
import type { GenResult } from '../../generators/types';
import type { CmpClue, CompareFacts, OrderRankingFacts, RowFacts, RowStmt } from '../../generators/reasoning/order-ranking';

const CBD = 'Cannot be determined';

function verifyRow(f: RowFacts): string {
  const people = [...new Set(f.stmts.flatMap((s) => (s.t === 'pos' ? [s.who] : s.t === 'total' ? [] : s.t === 'middle' ? [s.a, s.b, s.c] : s.t === 'swap-pos' ? [s.a, s.b, s.who] : [s.a, s.b])))];
  if (f.ask.t === 'pos') people.push(f.ask.who);
  if (f.ask.t === 'between') people.push(f.ask.a, f.ask.b);
  const names = [...new Set(people)];
  const totalStmt = f.stmts.find((s): s is Extract<RowStmt, { t: 'total' }> => s.t === 'total');
  const answers = new Set<string>();
  for (let n = 2; n <= 150; n++) {
    if (totalStmt && totalStmt.n !== n) continue;
    const fromLeft = (from: 'left' | 'right', k: number) => (from === 'left' ? k : n - k + 1);
    const cand = names.map((nm) => {
      const pins = f.stmts.filter((s): s is Extract<RowStmt, { t: 'pos' }> => s.t === 'pos' && s.who === nm).map((s) => fromLeft(s.from, s.k));
      if (pins.length) return new Set(pins).size === 1 && pins[0] >= 1 && pins[0] <= n ? [pins[0]] : [];
      return Array.from({ length: n }, (_, i) => i + 1);
    });
    const pos = new Map<string, number>();
    const rec = (i: number) => {
      if (i === names.length) {
        const P = (x: string) => pos.get(x)!;
        const ok = f.stmts.every((s) => {
          switch (s.t) {
            case 'pos':
            case 'total':
              return true;
            case 'between':
              return Math.abs(P(s.a) - P(s.b)) - 1 === s.k;
            case 'order':
              return P(s.a) < P(s.b);
            case 'middle':
              return 2 * P(s.c) === P(s.a) + P(s.b);
            case 'swap-pos': {
              const after = s.who === s.a ? P(s.b) : s.who === s.b ? P(s.a) : P(s.who);
              return fromLeft(s.from, s.k) === after;
            }
          }
        });
        if (!ok) return;
        const ask = f.ask;
        if (ask.t === 'total') answers.add(String(n + (f.extra ?? 0)));
        else if (ask.t === 'between') answers.add(String(Math.abs(P(ask.a) - P(ask.b)) - 1));
        else {
          let p = P(ask.who);
          if (ask.afterSwap) {
            const [a, b] = ask.afterSwap;
            p = ask.who === a ? P(b) : ask.who === b ? P(a) : p;
          }
          answers.add(String(ask.from === 'left' ? p : n - p + 1));
        }
        return;
      }
      for (const p of cand[i]) {
        if ([...pos.values()].includes(p)) continue;
        pos.set(names[i], p);
        rec(i + 1);
        pos.delete(names[i]);
      }
    };
    rec(0);
  }
  if (!answers.size) throw new Error('no arrangement fits');
  if (answers.size > 1) return CBD;
  return [...answers][0];
}

function verifyCompare(f: CompareFacts): string {
  const n = f.people.length;
  const orders: string[][] = [];
  const rankOk = (c: CmpClue, person: string, r: number): boolean => {
    // quick prune for exact-rank clues
    if (c.t === 'rank' && c.a === person) return c.from === 'top' ? r === c.k - 1 : r === n - c.k;
    if (c.t === 'only' && c.a === person) return r === n - 2;
    if (c.t === 'only' && c.b === person) return r === n - 1;
    return true;
  };
  const cur: string[] = [];
  const place = () => {
    if (cur.length === n) {
      const r = (x: string) => cur.indexOf(x);
      const ok = f.clues.every((c) => {
        switch (c.t) {
          case 'gt':
            return r(c.a) < r(c.b);
          case 'between':
            return r(c.a) > r(c.hi) && r(c.a) < r(c.lo);
          case 'not':
            return c.end === 'top' ? r(c.a) > 0 : r(c.a) < n - 1;
          default:
            return true;
        }
      });
      if (ok) orders.push(cur.slice());
      return;
    }
    for (const p of f.people) {
      if (cur.includes(p)) continue;
      if (!f.clues.every((c) => rankOk(c, p, cur.length))) continue;
      // a person who must be below someone not yet placed cannot go now
      if (f.clues.some((c) => c.t === 'gt' && c.b === p && !cur.includes(c.a))) continue;
      cur.push(p);
      place();
      cur.pop();
    }
  };
  place();
  if (!orders.length) throw new Error('no order fits');
  const ask = f.ask;
  const ans = new Set(
    orders.map((o) => {
      if (ask.t === 'who') return ask.from === 'top' ? o[ask.k - 1] : o[n - ask.k];
      const i = o.indexOf(ask.a);
      const v = ask.dir === 'above' ? i : n - 1 - i;
      return v === 0 ? 'None' : String(v);
    }),
  );
  return ans.size === 1 ? [...ans][0] : CBD;
}

export function verify(res: GenResult<OrderRankingFacts>): (number | string)[] {
  const f = res.facts;
  return [f.kind === 'row' ? verifyRow(f) : verifyCompare(f)];
}
