/**
 * Questions read off the unique arrangement. Distractors come from real mistakes: reading "above" as "below",
 * off-by-one counts, and the answer in an arrangement that satisfies every clue except one ("forgot clue k").
 */
import type { Rng } from '../../../../lib/rng';
import { type Clue, type Layout, colOf, holds, rowOf, slotCount, worldView } from '../../solver/puzzles/model';
import { shuffleChoices, fixedChoices } from '../../shared/options';
import { COUNT_OPTION, type Renderer } from './render';
import type { Explainer } from './explain';

export type QSpec =
  | { q: 'who-at'; s: number }
  | { q: 'who-rel'; e: number; d: 1 | -1 }
  | { q: 'who-vert'; e: number; d: 1 | -1 }
  | { q: 'who-side'; e: number; east: boolean }
  | { q: 'pos-of'; e: number }
  | { q: 'count-between'; a: number; b: number }
  | { q: 'count-dir'; e: number; dir: 1 | -1 }
  | { q: 'attr-of'; p: number; k: number }
  | { q: 'odd' }
  | { q: 'true-stmt' }
  | { q: 'combo' }
  | { q: 'alpha' }
  | { q: 'possible-value'; e: number };

export interface QOut {
  spec: QSpec;
  prompt: string;
  options: string[];
  answerIndex: number;
  steps: string[];
  shortcut?: string;
  trap?: string;
  tags: string[];
}

export class World {
  readonly L: Layout;
  readonly P: number;
  readonly S: number;
  readonly personAt: number[];
  constructor(
    L: Layout,
    readonly slot: number[],
  ) {
    this.L = L;
    this.P = L.persons;
    this.S = slotCount(L);
    this.personAt = new Array<number>(this.S).fill(-1);
    for (let p = 0; p < this.P; p++) this.personAt[slot[p]] = p;
  }
  holder(e: number): number {
    return this.personAt[this.slot[e]];
  }
  /** persons strictly before this slot */
  before(s: number): number {
    let n = 0;
    for (let t = 0; t < s; t++) if (this.personAt[t] >= 0) n++;
    return n;
  }
  after(s: number): number {
    let n = 0;
    for (let t = s + 1; t < this.S; t++) if (this.personAt[t] >= 0) n++;
    return n;
  }
  between(a: number, b: number): number {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    let n = 0;
    for (let t = lo + 1; t < hi; t++) if (this.personAt[t] >= 0) n++;
    return n;
  }
  /** value index of category k (1-based) held by person p */
  attr(p: number, k: number): number {
    for (let v = 0; v < this.P; v++) if (this.slot[k * this.P + v] === this.slot[p]) return v;
    return -1;
  }
}

export interface NearWorld {
  w: World;
  /** index of the clue this arrangement breaks */
  clue: number;
}

export interface QCtx {
  r: Renderer;
  x: Explainer;
  clues: Clue[];
  truth: World;
  near: NearWorld[];
  rng: Rng;
  /** comparison: value of every slot */
  values?: number[];
}

const PROMPT_ODD = 'Four of the following five are alike in a certain way based on the given arrangement and so form a group. Which one does not belong to that group?';

function ordered(rng: Rng, labels: string[], correct: number): { options: string[]; answerIndex: number } {
  // window of 5 consecutive labels containing the answer at a uniformly chosen feasible rank
  const n = labels.length;
  const ranks = [0, 1, 2, 3, 4].filter((rk) => correct - rk >= 0 && correct - rk + 4 <= n - 1);
  const rk = rng.pick(ranks);
  const start = correct - rk;
  return fixedChoices(labels.slice(start, start + 5), rk);
}

/** Build a 5-option name question: correct first, preferred distractors (with reasons), then others. */
function nameChoices(
  c: QCtx,
  correct: number,
  prefs: { p: number; why: string }[],
  exclude: number[],
): { options: string[]; answerIndex: number; trap?: string } {
  const { r, rng, truth } = c;
  const label = (p: number) => r.setup.names[p];
  const chosen: number[] = [];
  let trap: string | undefined;
  for (const pr of prefs) {
    if (pr.p < 0 || pr.p === correct || exclude.includes(pr.p) || chosen.includes(pr.p)) continue;
    if (chosen.length === 0) trap = pr.why;
    chosen.push(pr.p);
    if (chosen.length === 4) break;
  }
  const others = rng.shuffle([...Array(truth.P).keys()].filter((p) => p !== correct && !exclude.includes(p) && !chosen.includes(p)));
  while (chosen.length < 4 && others.length) chosen.push(others.shift()!);
  const ch = shuffleChoices(rng, label(correct), chosen.map(label));
  return { ...ch, trap };
}

/** Answers of a question in the near worlds (different from the truth), with the clue each world breaks. */
function nearAnswers<T>(c: QCtx, f: (w: World) => T | null, truthAns: T): { ans: T; clue: number }[] {
  const out: { ans: T; clue: number }[] = [];
  for (const n of c.near) {
    const a = f(n.w);
    if (a === null || a === truthAns || out.some((o) => o.ans === a)) continue;
    out.push({ ans: a, clue: n.clue });
  }
  return out;
}

function countWord(n: number): string {
  return COUNT_OPTION[n];
}

export function buildQuestion(c: QCtx, spec: QSpec): QOut | null {
  const { r, x, truth, rng } = c;
  const L = r.L;
  const V = r.V;
  const P = truth.P;
  const name = (p: number) => r.setup.names[p];
  const tags = ['puzzle:' + r.setup.sub];
  switch (spec.q) {
    case 'who-at': {
      const ans = truth.personAt[spec.s];
      if (ans < 0) return null;
      const prompt = L.kind === 'rank' ? `Who is ${r.rankPhrase(spec.s)}?` : L.kind === 'box' ? `Which box is kept ${r.posPhrase({ t: 'slot', s: spec.s })}?` : `Who ${V.s} ${r.posPhrase({ t: 'slot', s: spec.s })}?`;
      const mirror = truth.personAt[truth.S - 1 - spec.s];
      const prefs: { p: number; why: string }[] = [];
      for (const n of nearAnswers(c, (w) => w.personAt[spec.s], ans)) if (n.ans >= 0) prefs.push({ p: n.ans, why: `**${name(n.ans)}** would be ${x.loc(spec.s)} only if clue ${n.clue + 1} were ignored — clue ${n.clue + 1} rules that arrangement out.` });
      if (L.cols === 1) prefs.push({ p: mirror, why: `**${name(mirror)}** is ${x.loc(truth.S - 1 - spec.s)} — counting from the wrong end gives ${name(mirror)}.` });
      if (spec.s + 1 < truth.S) prefs.push({ p: truth.personAt[spec.s + 1], why: `**${name(truth.personAt[spec.s + 1])}** is one place off, ${x.loc(spec.s + 1)}.` });
      const ch = nameChoices(c, ans, prefs, []);
      return { spec, prompt, ...ch, steps: [`From the final arrangement, ${x.pos(spec.s)} → **${name(ans)}**.`], tags: [...tags, 'puzzle:position'] };
    }
    case 'who-rel': {
      const s = truth.slot[spec.e] + spec.d;
      if (s < 0 || s >= truth.S || L.kind === 'month' || L.kind === 'rank' || L.kind === 'flat') return null;
      const ans = truth.personAt[s];
      if (ans < 0 || ans === truth.holder(spec.e)) return null;
      const dirWord = spec.d > 0 ? V.up : V.down;
      const prompt = L.kind === 'box' ? `Which box is kept immediately ${dirWord} ${r.ref(spec.e)}?` : `Who ${V.s} immediately ${dirWord} ${r.ref(spec.e)}?`;
      const opp = truth.slot[spec.e] - spec.d;
      const prefs: { p: number; why: string }[] = [];
      if (opp >= 0 && opp < truth.S && truth.personAt[opp] >= 0)
        prefs.push({ p: truth.personAt[opp], why: `**${name(truth.personAt[opp])}** is immediately ${spec.d > 0 ? V.down : V.up} ${r.ref(spec.e)} — the opposite direction.` });
      for (const n of nearAnswers(c, (w) => { const t = w.slot[spec.e] + spec.d; return t >= 0 && t < w.S ? w.personAt[t] : null; }, ans))
        if (n.ans >= 0) prefs.push({ p: n.ans, why: `**${name(n.ans)}** fits only if clue ${n.clue + 1} is ignored.` });
      const two = truth.slot[spec.e] + 2 * spec.d;
      if (two >= 0 && two < truth.S) prefs.push({ p: truth.personAt[two], why: `**${name(truth.personAt[two])}** is two places ${dirWord}, not immediately ${dirWord}.` });
      const ch = nameChoices(c, ans, prefs, [truth.holder(spec.e)]);
      return {
        spec,
        prompt,
        ...ch,
        steps: [`${r.ref(spec.e, true)} is ${x.loc(truth.slot[spec.e])}, so the place immediately ${dirWord} is ${x.pos(s)} → **${name(ans)}**.`],
        tags: [...tags, 'puzzle:neighbour'],
      };
    }
    case 'who-vert':
    case 'who-side': {
      if (L.kind !== 'flat') return null;
      const s0 = truth.slot[spec.e];
      let s: number;
      let prompt: string;
      let rel: string;
      if (spec.q === 'who-vert') {
        const row = rowOf(L, s0) + spec.d;
        if (row < 0 || row >= L.rows) return null;
        s = row * 2 + colOf(L, s0);
        rel = `immediately ${spec.d > 0 ? 'above' : 'below'}`;
        prompt = `Who lives ${rel} ${r.ref(spec.e)}?`;
      } else {
        if ((colOf(L, s0) === 1) === spec.east) return null;
        s = rowOf(L, s0) * 2 + (spec.east ? 1 : 0);
        rel = `to the ${spec.east ? 'east' : 'west'} of`;
        prompt = `Who lives ${rel} ${r.ref(spec.e)}?`;
      }
      const ans = truth.personAt[s];
      const prefs: { p: number; why: string }[] = [];
      const diag = rowOf(L, s) * 2 + (1 - colOf(L, s));
      if (spec.q === 'who-vert') {
        prefs.push({ p: truth.personAt[diag], why: `**${name(truth.personAt[diag])}** lives on that floor but in the other flat — "immediately above/below" means the same type of flat.` });
        const other = (rowOf(L, s0) - spec.d) * 2 + colOf(L, s0);
        if (rowOf(L, s0) - spec.d >= 0 && rowOf(L, s0) - spec.d < L.rows) prefs.push({ p: truth.personAt[other], why: `**${name(truth.personAt[other])}** is on the opposite side vertically.` });
      } else {
        const up = rowOf(L, s0) + 1 < L.rows ? truth.personAt[s0 + 2] : -1;
        prefs.push({ p: up, why: `**${up >= 0 ? name(up) : ''}** lives directly above, not on the same floor.` });
      }
      for (const n of nearAnswers(c, (w) => w.personAt[s], ans)) prefs.push({ p: n.ans, why: `**${name(n.ans)}** fits only if clue ${n.clue + 1} is ignored.` });
      const ch = nameChoices(c, ans, prefs, [truth.holder(spec.e)]);
      return { spec, prompt, ...ch, steps: [`${r.ref(spec.e, true)} lives in ${x.pos(s0)}; the flat ${rel} it is ${x.pos(s)} → **${name(ans)}**.`], tags: [...tags, 'puzzle:neighbour'] };
    }
    case 'pos-of': {
      if (L.kind === 'rank') return null;
      const s = truth.slot[spec.e];
      const who = r.ref(spec.e);
      const prompt =
        L.kind === 'floor'
          ? `On which floor does ${who} live?`
          : L.kind === 'flat'
            ? `Where does ${who} live?`
            : L.kind === 'box'
              ? `At which position from the bottom is ${who} kept?`
              : L.kind === 'day'
                ? `On which day does ${who} go?`
                : L.kind === 'week'
                  ? `On which day does ${who} have a lecture?`
                  : L.kind === 'session'
                    ? `When does ${who} have a lecture?`
                    : L.kind === 'month'
                      ? `In which month was ${who} born?`
                      : `On which date was ${who} born?`;
      const labels = [...Array(truth.S).keys()].map((t) => r.posLabel(t));
      const ch = ordered(rng, labels, s);
      const near = nearAnswers(c, (w) => w.slot[spec.e], s).find((n) => ch.options.includes(labels[n.ans]));
      return {
        spec,
        prompt,
        ...ch,
        steps: [`From the final arrangement, ${who} is ${x.loc(s)} → **${labels[s]}**.`],
        trap: near ? `**${labels[near.ans]}** is where ${who} would be if clue ${near.clue + 1} were ignored.` : undefined,
        tags: [...tags, 'puzzle:position'],
      };
    }
    case 'count-between': {
      if (L.kind === 'flat' || L.kind === 'rank') return null;
      const sa = truth.slot[spec.a];
      const sb = truth.slot[spec.b];
      if (truth.holder(spec.a) === truth.holder(spec.b)) return null;
      const n = truth.between(sa, sb);
      const prompt = `How many ${V.unit[1]} ${V.p} between ${r.ref(spec.a)} and ${r.ref(spec.b)}?`;
      const max = P - 2;
      const ch = ordered(rng, COUNT_OPTION.slice(0, max + 1), n);
      const gapSlots = Math.abs(sa - sb) - 1;
      const steps = [`${r.ref(spec.a, true)} is ${x.loc(sa)} and ${r.ref(spec.b)} is ${x.loc(sb)}.`];
      if (L.kind === 'month' && gapSlots !== n) steps.push(`${gapSlots} months lie between them, but ${gapSlots - n} of those have no birthday → **${countWord(n)}**.`);
      else steps.push(`Persons strictly between them: ${Math.max(sa, sb) - Math.min(sa, sb)} − 1 = ${n} → **${countWord(n)}**.`);
      return {
        spec,
        prompt,
        ...ch,
        steps,
        shortcut: L.kind === 'month' ? 'Count only the months that have a birthday.' : 'Between positions a and b there are |a − b| − 1 places.',
        trap: `Counting ${x.pos(sa)} and ${x.pos(sb)} themselves gives ${n + 2}, not ${n}.`,
        tags: [...tags, 'puzzle:count'],
      };
    }
    case 'count-dir': {
      if (L.kind === 'flat') return null;
      const s = truth.slot[spec.e];
      const n = spec.dir === 1 ? truth.after(s) : truth.before(s);
      const w = r.measureWords();
      const prompt =
        L.kind === 'rank'
          ? `How many persons are ${spec.dir === 1 ? w.more : w.less} than ${r.ref(spec.e)}?`
          : `How many ${V.unit[1]} ${V.p} ${spec.dir === 1 ? V.up : V.down} ${r.ref(spec.e)}?`;
      const ch = ordered(rng, COUNT_OPTION.slice(0, P), n);
      const other = spec.dir === 1 ? truth.before(s) : truth.after(s);
      return {
        spec,
        prompt,
        ...ch,
        steps: [`${r.ref(spec.e, true)} is ${x.loc(s)}.`, `Count the ${V.unit[1]} ${L.kind === 'rank' ? (spec.dir === 1 ? w.more : w.less) : spec.dir === 1 ? V.up : V.down} → **${countWord(n)}**.`],
        trap: other !== n ? `${countWord(other)} is the count on the other side.` : undefined,
        tags: [...tags, 'puzzle:count'],
      };
    }
    case 'attr-of': {
      const cat = r.setup.cats[spec.k - 1];
      if (!cat) return null;
      const v = truth.attr(spec.p, spec.k);
      const who = name(spec.p);
      const prompt =
        L.kind === 'box'
          ? cat.kind === 'colour'
            ? `What is the colour of box ${who}?`
            : `What does box ${who} contain?`
          : cat.kind === 'city'
            ? `Which city is ${who} from?`
            : cat.kind === 'sport'
              ? `Which sport does ${who} play?`
              : cat.kind === 'subject'
                ? `Which subject does ${who} teach?`
                : `Which ${cat.kind} does ${who} like?`;
      const prefs: { v: number; why: string }[] = [];
      for (const n of nearAnswers(c, (w) => w.attr(spec.p, spec.k), v)) prefs.push({ v: n.ans, why: `**${cat.values[n.ans]}** would be ${who}'s only if clue ${n.clue + 1} were ignored.` });
      const s = truth.slot[spec.p];
      for (const d of [1, -1]) {
        const t = s + d;
        if (t >= 0 && t < truth.S && truth.personAt[t] >= 0) prefs.push({ v: truth.attr(truth.personAt[t], spec.k), why: `**${cat.values[truth.attr(truth.personAt[t], spec.k)]}** belongs to the neighbour ${x.loc(t)}.` });
      }
      const chosen: number[] = [];
      let trap: string | undefined;
      for (const pr of prefs) {
        if (pr.v === v || chosen.includes(pr.v)) continue;
        if (!chosen.length) trap = pr.why;
        chosen.push(pr.v);
        if (chosen.length === 4) break;
      }
      for (const o of rng.shuffle([...Array(P).keys()])) if (chosen.length < 4 && o !== v && !chosen.includes(o)) chosen.push(o);
      const ch = shuffleChoices(rng, cat.values[v], chosen.map((i) => cat.values[i]));
      return { spec, prompt, ...ch, trap, steps: [`From the final arrangement, ${who} (${x.pos(s)}) → **${cat.values[v]}**.`], tags: [...tags, 'puzzle:attribute'] };
    }
    case 'odd':
      return oddQuestion(c, spec, tags);
    case 'true-stmt':
      return statementQuestion(c, spec, tags);
    case 'combo':
      return comboQuestion(c, spec, tags);
    case 'alpha': {
      if (!['floor', 'box', 'day', 'week', 'rank'].includes(L.kind)) return null;
      const sorted = r.setup.names.map((nm, p) => ({ nm, p })).sort((a, b) => (a.nm < b.nm ? -1 : 1));
      // alphabetical order placed from the first slot of the stated direction
      const fromTop = L.kind === 'rank';
      let same = 0;
      const kept: string[] = [];
      sorted.forEach((o, i) => {
        const s = fromTop ? truth.S - 1 - i : i;
        if (truth.slot[o.p] === s) {
          same++;
          kept.push(o.nm);
        }
      });
      const w = r.measureWords();
      const prompt =
        L.kind === 'floor'
          ? 'If all the persons are rearranged in alphabetical order from the lowermost floor to the topmost floor, how many of them will remain on the same floor?'
          : L.kind === 'box'
            ? 'If all the boxes are rearranged in alphabetical order from the bottom to the top, how many boxes will remain at the same position?'
            : L.kind === 'rank'
              ? `If all the persons are arranged in alphabetical order from the ${w.top} to the ${w.bottom}, how many of them will keep the same position?`
              : `If all the persons are rescheduled in alphabetical order from Monday to Sunday, how many of them will keep the same day?`;
      const ch = ordered(rng, COUNT_OPTION.slice(0, P + 1), same);
      return {
        spec,
        prompt,
        ...ch,
        steps: [`Alphabetical order: ${sorted.map((o) => o.nm).join(', ')}.`, same ? `Compare with the final arrangement: only ${kept.join(', ')} stay${same === 1 ? 's' : ''} put → **${countWord(same)}**.` : 'Compare with the final arrangement: nobody keeps the same place → **None**.'],
        tags: [...tags, 'puzzle:reorder'],
      };
    }
    case 'possible-value':
      return possibleValueQuestion(c, spec, tags);
  }
}

/* ------------------------------------------------------------------ */

function oddQuestion(c: QCtx, spec: QSpec, tags: string[]): QOut | null {
  const { r, truth, rng, x } = c;
  const L = r.L;
  if (L.kind === 'rank') return null;
  const P = truth.P;
  // signature of a pair (a, b): ordinal offset (linear) or (row, col) offset (flats)
  const ordOf = (e: number) => truth.before(truth.slot[e]);
  const sig = (a: number, b: number): string => (L.kind === 'flat' ? `${rowOf(L, truth.slot[b]) - rowOf(L, truth.slot[a])},${colOf(L, truth.slot[b]) - colOf(L, truth.slot[a])}` : String(ordOf(b) - ordOf(a)));
  const absSig = (sg: string) => sg.split(',').map((v) => Math.abs(Number(v))).join(',');
  const useAttr = r.setup.cats.length > 0 && rng.chance(0.4);
  const K = useAttr ? rng.int(1, r.setup.cats.length) : 0;
  const seconds = useAttr ? [...Array(P).keys()].map((v) => K * P + v) : [...Array(P).keys()];
  const pairs: { a: number; b: number; s: string }[] = [];
  for (let a = 0; a < P; a++) for (const b of seconds) if (truth.holder(b) !== a) pairs.push({ a, b, s: sig(a, b) });
  const bySig = new Map<string, typeof pairs>();
  for (const p of pairs) {
    if (!bySig.has(p.s)) bySig.set(p.s, []);
    bySig.get(p.s)!.push(p);
  }
  const good = rng.shuffle([...bySig.entries()].filter(([sg, ps]) => ps.length >= 4 && sg.split(',').every((v) => Math.abs(Number(v)) <= 3)));
  if (!good.length) return null;
  const [sg, ps] = good[0];
  const four = rng.sample(ps, 4);
  const oddCands = pairs.filter((p) => p.s !== sg && absSig(p.s) !== absSig(sg) && !four.some((f) => f.a === p.a && f.b === p.b));
  // prefer an odd pair that looks close (offset one more or less)
  const close = oddCands.filter((p) => L.kind === 'flat' || Math.abs(Math.abs(Number(p.s)) - Math.abs(Number(sg))) === 1);
  const odd = rng.pick(close.length ? close : oddCands);
  if (!odd) return null;
  const text = (p: { a: number; b: number }) => `${r.label(p.a)} – ${r.label(p.b)}`;
  const ch = shuffleChoices(rng, text(odd), four.map(text));
  const describe = (sgn: string) => {
    if (L.kind === 'flat') {
      const [dr, dc] = sgn.split(',').map(Number);
      const v = dr === 0 ? 'on the same floor' : `${Math.abs(dr)} floor${Math.abs(dr) > 1 ? 's' : ''} ${dr > 0 ? 'above' : 'below'}`;
      const h = dc === 0 ? 'in the same type of flat' : dc > 0 ? 'in the east flat' : 'in the west flat';
      return `${v}, ${h}`;
    }
    const d = Number(sgn);
    const unit = L.kind === 'month' ? 'birthdays' : 'places';
    return `${Math.abs(d)} ${Math.abs(d) === 1 ? unit.replace(/s$/, '') : unit} ${d > 0 ? r.V.up : r.V.down}`;
  };
  const second = useAttr ? 'the holder of the second item' : 'the second person';
  const where = (p: { a: number; b: number }) => `${r.label(p.a)}: ${x.pos(truth.slot[p.a])}, ${r.label(p.b)}: ${x.pos(truth.slot[p.b])}`;
  return {
    spec,
    prompt: PROMPT_ODD,
    ...ch,
    steps: [
      `In ${four.map(text).join(', ')}, ${second} is ${describe(sg)} the first.`,
      `In ${text(odd)} (${where(odd)}) it is ${describe(odd.s)} → **${text(odd)}** is the odd one.`,
    ],
    tags: [...tags, 'puzzle:odd-one-out'],
  };
}

function statementQuestion(c: QCtx, spec: QSpec, tags: string[]): QOut | null {
  const { r, truth, rng, clues, x } = c;
  const L = r.L;
  const w = worldView(L, truth.slot);
  const P = truth.P;
  const S = truth.S;
  const clueTexts = new Set(clues.map((cl) => r.clue(cl)));
  const persons = rng.shuffle([...Array(P).keys()]);
  const cands: Clue[] = [];
  for (const a of persons) {
    for (const b of persons) {
      if (a === b) continue;
      const d = truth.slot[a] - truth.slot[b];
      if (L.kind === 'flat') {
        cands.push({ k: 'vert', a, b, d: 1 }, { k: 'srow', a, b }, { k: 'east', a, b });
      } else if (L.kind === 'rank') {
        cands.push({ k: 'order', a, b });
      } else if (L.kind === 'month') {
        cands.push({ k: 'order', a, b }, { k: 'gap', a, b, n: Math.max(1, truth.between(truth.slot[a], truth.slot[b]) + rng.pick([-1, 0, 1])) });
      } else {
        if (Math.abs(d) <= 3) cands.push({ k: 'delta', a: d > 0 ? a : b, b: d > 0 ? b : a, d: Math.max(1, Math.abs(d) + rng.pick([-1, 0, 0, 1])) });
        cands.push({ k: 'gap', a, b, n: Math.max(1, Math.abs(d) - 1 + rng.pick([-1, 0, 1])) }, { k: 'order', a, b });
      }
    }
    if (L.kind !== 'flat' || rng.chance(0.5)) cands.push({ k: 'is', e: a, p: { t: 'slot', s: rng.chance(0.5) ? truth.slot[a] : rng.int(0, S - 1) } });
    for (let k = 1; k <= r.setup.cats.length; k++) cands.push({ k: 'link', a, b: k * P + rng.int(0, P - 1) });
  }
  const valid = cands;
  const truths = rng.shuffle(valid.filter((cl) => holds(w, cl) && !clueTexts.has(r.clue(cl))));
  const falses = rng.shuffle(valid.filter((cl) => !holds(w, cl)));
  if (!truths.length || falses.length < 4) return null;
  const t = truths[0];
  const text = (cl: Clue) => r.clue(cl).replace(/\.$/, '');
  const seen = new Set([text(t)]);
  const fs: Clue[] = [];
  for (const f of falses) {
    if (seen.has(text(f))) continue;
    seen.add(text(f));
    fs.push(f);
    if (fs.length === 4) break;
  }
  if (fs.length < 4) return null;
  const ch = shuffleChoices(rng, text(t), fs.map(text));
  const reason = (cl: Clue): string => {
    if (cl.k === 'link') {
      const k = Math.floor(cl.b / P);
      return `${r.label(cl.a)} ${r.attrPred(k * P + truth.attr(cl.a, k), false)}`;
    }
    const ents = cl.k === 'is' ? [cl.e] : 'a' in cl && 'b' in cl ? [cl.a, cl.b] : [];
    return ents
      .filter((e) => e < P)
      .map((e) => `${r.label(e)} is ${x.loc(truth.slot[e])}`)
      .join(', ');
  };
  return {
    spec,
    prompt: 'Which of the following statements is true?',
    ...ch,
    steps: [...fs.map((f) => `"${text(f)}" — false (${reason(f)}).`), `"${text(t)}" — true (${reason(t)}) → this is the answer.`],
    tags: [...tags, 'puzzle:statements'],
  };
}

function comboQuestion(c: QCtx, spec: QSpec, tags: string[]): QOut | null {
  const { r, truth, rng, x } = c;
  if (!r.setup.cats.length || r.L.kind === 'rank') return null;
  const P = truth.P;
  const k = rng.int(1, r.setup.cats.length);
  const cat = r.setup.cats[k - 1];
  const text = (p: number, s: number, v: number) => `${r.label(p)} – ${r.posLabel(s)} – ${cat.values[v]}`;
  const p0 = rng.int(0, P - 1);
  const correct = text(p0, truth.slot[p0], truth.attr(p0, k));
  const wrong = new Set<string>();
  const others = rng.shuffle([...Array(P).keys()]);
  for (const p of others) {
    if (wrong.size >= 4) break;
    const s = truth.slot[p];
    const v = truth.attr(p, k);
    const mode = rng.int(0, 1);
    let t: string;
    if (mode === 0) {
      // right position, wrong item
      const v2 = (v + rng.int(1, P - 1)) % P;
      t = text(p, s, v2);
    } else {
      // right item, wrong position (a neighbouring one)
      let s2 = s + rng.pick([1, -1, 2]);
      if (s2 < 0 || s2 >= truth.S) s2 = s - 1 >= 0 ? s - 1 : s + 1;
      t = text(p, s2, v);
    }
    if (t !== correct) wrong.add(t);
  }
  if (wrong.size < 4) return null;
  const ch = shuffleChoices(rng, correct, [...wrong]);
  return {
    spec,
    prompt: 'Which of the following combinations is correct?',
    ...ch,
    steps: [`${r.label(p0)} is ${x.loc(truth.slot[p0])} and ${r.attrPred(k * P + truth.attr(p0, k), false)} → **${correct}**.`, 'Each other option gets either the position or the item wrong.'],
    trap: 'Two of the three parts match in the wrong options — check all three.',
    tags: [...tags, 'puzzle:combination'],
  };
}

function possibleValueQuestion(c: QCtx, spec: QSpec, tags: string[]): QOut | null {
  const { r, truth, rng, clues, values } = c;
  if (r.L.kind !== 'rank' || !values || spec.q !== 'possible-value') return null;
  const e = spec.e;
  const s = truth.slot[e];
  // known values by slot
  const known = new Map<number, number>();
  for (const cl of clues) {
    if (cl.k === 'val') known.set(truth.slot[cl.e], cl.v);
    if (cl.k === 'rval') known.set(cl.s, cl.v);
  }
  if (known.has(s)) return null;
  const below = [...known.keys()].filter((t) => t < s);
  const above = [...known.keys()].filter((t) => t > s);
  if (!below.length || !above.length) return null;
  const lo = known.get(Math.max(...below))!;
  const hi = known.get(Math.min(...above))!;
  const v = values[s];
  if (!(v > lo && v < hi)) return null;
  const unit = r.setup.labels.measure === 'weight' ? 'kg' : 'cm';
  const rank = rng.int(0, 4);
  const opts: number[] = [];
  for (let i = rank; i > 0; i--) opts.push(lo - i * rng.int(2, 4) - (i === rank ? 0 : 0));
  opts.push(v);
  for (let i = 1; i <= 4 - rank; i++) opts.push(hi + i * rng.int(2, 4));
  const uniq = [...new Set(opts)].sort((a, b) => a - b);
  if (uniq.length !== 5) return null;
  const ch = fixedChoices(uniq.map((n) => `${n} ${unit}`), uniq.indexOf(v));
  const w = r.measureWords();
  return {
    spec,
    prompt: `Which of the following can be the ${r.setup.labels.measure === 'weight' ? 'weight' : 'height'} of ${r.ref(e)}?`,
    ...ch,
    steps: [
      `${r.ref(e, true)} is ${r.rankPhrase(s)}.`,
      `The nearest known value ${w.less === 'shorter' ? 'below' : 'below'} is ${lo} ${unit} and the nearest known value above is ${hi} ${unit}.`,
      `So the value lies strictly between ${lo} and ${hi} ${unit} → only **${v} ${unit}** fits.`,
    ],
    trap: `Values at or beyond ${lo} ${unit} or ${hi} ${unit} would break the order — all values are different.`,
    tags: [...tags, 'puzzle:value'],
  };
}
