/**
 * Independent verifier for reasoning.input-output.
 *
 * It does NOT read the rule from the facts. From the printed input and Steps I–II it searches the whole rule
 * family (any single move or word+number pair of moves, all orders / ends / number operations, cycles of one or
 * two step types), re-simulates every rule that reproduces the printed steps with its own single-array machine,
 * insists that all of them give the same complete run (otherwise the set is ambiguous and it throws), and then
 * answers each question from that run.
 */
import type { GenResult } from "../../generators/types";
import type {
  InputOutputFacts,
  IoMove,
  IoOp,
} from "../../generators/reasoning/input-output";
import { ordinal } from "../../../lib/format";

const ROMAN: [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];
function roman(n: number): string {
  let s = "";
  for (const [v, r] of ROMAN)
    while (n >= v) {
      s += r;
      n -= v;
    }
  return s;
}
const stepLabel = (n: number) => `Step ${roman(n)}`;

const numeric = (t: string) => /^\d+$/.test(t);

function transform(t: string, op: IoOp): string {
  if (op.t === "add") return `${parseInt(t, 10) + op.k}`;
  if (op.t === "sub") return `${parseInt(t, 10) - op.k}`;
  if (op.t === "rev") return `${parseInt([...t].reverse().join(""), 10)}`;
  return t;
}

/** Runs the machine on one array: [0, L) arranged left, [len − R, len) arranged right. */
function run(
  input: readonly string[],
  cycle: IoMove[][],
  limit = 40,
  visible?: { ok: boolean },
): string[][] {
  let line = input.slice();
  let L = 0;
  let R = 0;
  const out: string[][] = [line.slice()];
  for (let s = 0; s < limit && L + R < line.length; s++) {
    const moves = cycle[s % cycle.length];
    let acted = false;
    for (const m of moves) {
      // candidates among the unarranged block, of the move's kind
      let best: number | null = null;
      for (let i = L; i < line.length - R; i++) {
        if (numeric(line[i]) !== (m.kind === "num")) continue;
        if (best === null) best = i;
        else {
          const cmp =
            m.kind === "num"
              ? parseInt(line[i], 10) - parseInt(line[best], 10)
              : line[i].localeCompare(line[best], "en");
          if ((m.order === "asc" && cmp < 0) || (m.order === "desc" && cmp > 0))
            best = i;
        }
      }
      if (best === null) continue;
      acted = true;
      const tok = m.kind === "num" ? transform(line[best], m.op) : line[best];
      // an element that is already where it would go, unchanged: the move is invisible
      if (
        visible &&
        tok === line[best] &&
        best === (m.end === "left" ? L : line.length - R - 1) &&
        L + R + 1 < line.length
      )
        visible.ok = false;
      const rest = [...line.slice(0, best), ...line.slice(best + 1)];
      if (m.end === "left") {
        rest.splice(L, 0, tok);
        L++;
      } else {
        rest.splice(rest.length - R, 0, tok);
        R++;
      }
      line = rest;
    }
    if (!acted) break;
    const prev = out[out.length - 1];
    if (L + R >= line.length && line.join("\u0001") === prev.join("\u0001"))
      break; // a final step that changes nothing
    out.push(line.slice());
  }
  return out;
}

function family(): IoMove[][] {
  const ops: IoOp[] = [{ t: "none" }, { t: "rev" }];
  for (let k = 1; k <= 9; k++) ops.push({ t: "add", k }, { t: "sub", k });
  const w: IoMove[] = [];
  const n: IoMove[] = [];
  for (const order of ["asc", "desc"] as const)
    for (const end of ["left", "right"] as const) {
      w.push({ kind: "word", order, end, op: { t: "none" } });
      for (const op of ops) n.push({ kind: "num", order, end, op });
    }
  const steps: IoMove[][] = [...w, ...n].map((m) => [m]);
  for (const a of w) for (const b of n) steps.push([a, b], [b, a]);
  return steps;
}

export function inferRun(f: InputOutputFacts): string[][] {
  const same = (a: readonly string[], b: readonly string[]) =>
    a.join("\u0001") === b.join("\u0001");
  const kinds = new Set(f.input.map((t) => (numeric(t) ? "num" : "word")));
  // a move on a kind the input does not contain never acts: such rules duplicate simpler ones
  const fam = family().filter((x) => x.every((m) => kinds.has(m.kind)));
  // only rules whose every move in the shown steps is visible count as "inferable"
  const first = fam.filter((x) => {
    const v = { ok: true };
    const r = run(f.input, [x], 1, v);
    return v.ok && r.length > 1 && same(r[1], f.shown[0]);
  });
  let found: string[][] | null = null;
  const consider = (cycle: IoMove[][]) => {
    const v = { ok: true };
    const head = run(f.input, cycle, f.shown.length, v);
    if (
      !v.ok ||
      head.length <= f.shown.length ||
      !f.shown.every((l, i) => same(head[i + 1], l))
    )
      return;
    const r = run(f.input, cycle);
    if (!found) found = r;
    else if (found.length !== r.length || found.some((l, i) => !same(l, r[i])))
      throw new Error(
        "ambiguous: two rules fit the shown steps but differ later",
      );
  };
  for (const x of first) {
    consider([x]);
    for (const y of fam) consider([x, y]);
  }
  if (!found) throw new Error("no rule reproduces the shown steps");
  return found;
}

export function verify(res: GenResult<InputOutputFacts>): string[] {
  const f = res.facts;
  const lines = inferRun(f);
  const last = lines.length - 1;
  return f.questions.map((q) => {
    switch (q.t) {
      case "which-step": {
        const s = lines.findIndex((l) => l.join(" ") === q.line.join(" "));
        if (s < 1) throw new Error("line is not a step");
        return stepLabel(s);
      }
      case "last-step":
        return stepLabel(last);
      case "position": {
        const l = lines[q.step];
        const i = l.indexOf(q.el);
        return `${ordinal(q.from === "left" ? i + 1 : l.length - i)} from the ${q.from} end`;
      }
      case "nth": {
        const l = lines[q.step];
        return q.from === "left" ? l[q.k - 1] : l[l.length - q.k];
      }
      case "middle": {
        const l = lines[q.step];
        const a = l.indexOf(q.a);
        const b = l.indexOf(q.b);
        if ((a + b) % 2) throw new Error("no single middle element");
        return l[(a + b) / 2];
      }
      case "count-between": {
        const l = lines[q.step];
        return String(Math.abs(l.indexOf(q.a) - l.indexOf(q.b)) - 1);
      }
      case "sum": {
        const l = lines[q.step];
        return String(parseInt(l[q.i - 1], 10) + parseInt(l[q.j - 1], 10));
      }
    }
  });
}
