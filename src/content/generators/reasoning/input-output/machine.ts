/**
 * Input–output machine model (R6).
 *
 * The line is [arranged-left block] [unarranged elements, original relative order] [arranged-right block].
 * Step s applies rule.cycle[(s − 1) mod cycle length]; each step has one or two moves. A move picks, among the
 * unarranged elements of its kind, the first by its order (words alphabetically, numbers by value), optionally
 * transforms it (numbers only: add k, subtract k, reverse the digits) and places it at the end of the left
 * block or at the start of the right block. The machine stops when nothing is left unarranged; a final step
 * that changes nothing is not counted.
 */

export type IoKind = "word" | "num";
export type IoOp =
  | { t: "none" }
  | { t: "add"; k: number }
  | { t: "sub"; k: number }
  | { t: "rev" };
export interface IoMove {
  kind: IoKind;
  order: "asc" | "desc";
  end: "left" | "right";
  op: IoOp;
}
export interface IoRule {
  cycle: IoMove[][];
}

export const isNum = (t: string) => /^\d+$/.test(t);

export function applyOp(tok: string, op: IoOp): string {
  const v = Number(tok);
  switch (op.t) {
    case "none":
      return tok;
    case "add":
      return String(v + op.k);
    case "sub":
      return String(v - op.k);
    case "rev":
      return String(Number(tok.split("").reverse().join("")));
  }
}

interface State {
  left: string[];
  mid: string[];
  right: string[];
}

function pick(mid: readonly string[], m: IoMove): number {
  let best = -1;
  for (let i = 0; i < mid.length; i++) {
    const t = mid[i];
    if ((m.kind === "num") !== isNum(t)) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const b = mid[best];
    const less = m.kind === "num" ? Number(t) < Number(b) : t < b;
    if (m.order === "asc" ? less : !less) best = i;
  }
  return best;
}

export interface SimResult {
  /** lines[0] = input, lines[s] = step s. */
  lines: string[][];
  /** Number of the last step. */
  last: number;
  /** A move that changes nothing happened before the final step (confusing for a solver). */
  midNoOp: boolean;
}

export function simulate(
  input: readonly string[],
  rule: IoRule,
  maxSteps = 30,
): SimResult {
  const st: State = { left: [], mid: input.slice(), right: [] };
  const lines: string[][] = [input.slice()];
  let midNoOp = false;
  for (let s = 1; s <= maxSteps && st.mid.length; s++) {
    const moves = rule.cycle[(s - 1) % rule.cycle.length];
    let noOps = 0;
    let acted = 0;
    for (const m of moves) {
      const i = pick(st.mid, m);
      if (i < 0) continue;
      acted++;
      const tok = st.mid[i];
      const placedAt = m.end === "left" ? 0 : st.mid.length - 1;
      const out = m.kind === "num" ? applyOp(tok, m.op) : tok;
      if (i === placedAt && out === tok) noOps++;
      st.mid.splice(i, 1);
      if (m.end === "left") st.left.push(out);
      else st.right.unshift(out);
    }
    if (!acted) break; // nothing of the required kinds left
    const line = [...st.left, ...st.mid, ...st.right];
    const prev = lines[lines.length - 1];
    const same =
      line.length === prev.length && line.every((t, j) => t === prev[j]);
    if (st.mid.length === 0 && same) break; // final step changed nothing: not counted
    if (noOps > 0 && st.mid.length > 0) midNoOp = true;
    lines.push(line);
  }
  return { lines, last: lines.length - 1, midNoOp };
}

const OPS: IoOp[] = [
  { t: "none" },
  { t: "rev" },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((k) => [
    { t: "add", k } as IoOp,
    { t: "sub", k } as IoOp,
  ]),
];

/** Every single move and every word+number pair of moves (both orders): the family a solver could infer. */
export function stepFamily(): IoMove[][] {
  const words: IoMove[] = [];
  const nums: IoMove[] = [];
  for (const order of ["asc", "desc"] as const)
    for (const end of ["left", "right"] as const) {
      words.push({ kind: "word", order, end, op: { t: "none" } });
      for (const op of OPS) nums.push({ kind: "num", order, end, op });
    }
  const out: IoMove[][] = [...words.map((m) => [m]), ...nums.map((m) => [m])];
  for (const w of words) for (const n of nums) out.push([w, n], [n, w]);
  return out;
}

const eqLine = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((t, i) => t === b[i]);

/**
 * All complete step sequences of family rules (cycle length 1 or 2) that reproduce the shown steps.
 * The shown steps determine the machine iff every returned sequence is identical.
 */
export function consistentRuns(
  input: readonly string[],
  shown: readonly (readonly string[])[],
): string[][][] {
  // moves on a kind absent from the input never act, so rules differing only there behave identically
  const hasW = input.some((t) => !isNum(t));
  const hasN = input.some(isNum);
  const fam = stepFamily().filter((x) =>
    x.every((m) => (m.kind === "word" ? hasW : hasN)),
  );
  // A solver only infers moves it can see: rules with a move that changes nothing in the shown steps are out.
  const fits = (rule: IoRule) => {
    const sim = simulate(input, rule, shown.length);
    return (
      !sim.midNoOp &&
      sim.lines.length > shown.length &&
      shown.every((l, i) => eqLine(sim.lines[i + 1], l))
    );
  };
  const s1 = fam.filter((x) => {
    const sim = simulate(input, { cycle: [x] }, 1);
    return (
      !sim.midNoOp && sim.lines.length > 1 && eqLine(sim.lines[1], shown[0])
    );
  });
  const runs: string[][][] = [];
  for (const x of s1) {
    if (fits({ cycle: [x] })) runs.push(simulate(input, { cycle: [x] }).lines);
    for (const y of fam)
      if (fits({ cycle: [x, y] }))
        runs.push(simulate(input, { cycle: [x, y] }).lines);
  }
  return runs;
}

export function sameRuns(runs: readonly string[][][]): boolean {
  return (
    runs.length > 0 &&
    runs.every(
      (r) =>
        r.length === runs[0].length && r.every((l, i) => eqLine(l, runs[0][i])),
    )
  );
}
