/**
 * DS on distance & direction. Points on a plane linked by clues:
 *  - exact:  "P is 6 m to the north of Q"
 *  - line:   "P is due north of Q" (distance not given)
 * Worlds = every placement consistent with the clues. The unknown distances are enumerated over 1..B per axis,
 * where B = 2·(sum of the exact offsets on that axis + number of unknown lengths on it + 1) + 2 — a bound large
 * enough (difference-constraint argument) that every achievable direction and every variation of the distance
 * shows up. Placements where the two asked points coincide are rejected by the generator (no convention needed).
 */
import type { Rng } from "../../../../lib/rng";
import type { Difficulty } from "../../../types";
import {
  CAP_NUM_WORD,
  findPair,
  listAnd,
  listOr,
  sizesFor,
  type Category,
  type DsDraft,
  type Scenario,
} from "./common";

export type Dir4 = "N" | "S" | "E" | "W";
export type DirClue =
  | { t: "exact"; a: string; b: string; d: number; dir: Dir4 }
  | { t: "line"; a: string; b: string; dir: Dir4 };
export type DirAsk = { t: "dir" | "dist"; a: string; b: string };

export interface DsDirectionFacts {
  kind: "direction";
  points: string[];
  I: DirClue[];
  II: DirClue[];
  ask: DirAsk;
}

const VEC: Record<Dir4, [number, number]> = {
  N: [0, 1],
  S: [0, -1],
  E: [1, 0],
  W: [-1, 0],
};
const NAME: Record<Dir4, string> = {
  N: "north",
  S: "south",
  E: "east",
  W: "west",
};

export function dirLabel(dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return "same";
  const ns = dy > 0 ? "north" : dy < 0 ? "south" : "";
  const ew = dx > 0 ? "east" : dx < 0 ? "west" : "";
  return ns && ew ? `${ns}-${ew}` : ns || ew;
}

export function dirClueText(c: DirClue): string {
  return c.t === "exact"
    ? `${c.a} is ${c.d} m to the ${NAME[c.dir]} of ${c.b}.`
    : `${c.a} is due ${NAME[c.dir]} of ${c.b}.`;
}

/** All (dx, dy) of a relative to b over consistent placements, or null if a and b are not linked. */
function displacements(
  cl: readonly DirClue[],
  a: string,
  b: string,
): [number, number][] | null {
  const Sx = cl.reduce(
    (s, c) =>
      s +
      (c.t === "exact"
        ? Math.abs(VEC[c.dir][0]) * c.d
        : c.dir === "E" || c.dir === "W"
          ? 1
          : 0),
    1,
  );
  const Sy = cl.reduce(
    (s, c) =>
      s +
      (c.t === "exact"
        ? Math.abs(VEC[c.dir][1]) * c.d
        : c.dir === "N" || c.dir === "S"
          ? 1
          : 0),
    1,
  );
  const Bx = 2 * Sx + 2;
  const By = 2 * Sy + 2;
  // spanning order from b
  const order: { c: DirClue; from: string; to: string }[] = [];
  const reached = new Set([b]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of cl) {
      if (reached.has(c.a) && !reached.has(c.b)) {
        order.push({ c, from: c.a, to: c.b });
        reached.add(c.b);
        grew = true;
      } else if (reached.has(c.b) && !reached.has(c.a)) {
        order.push({ c, from: c.b, to: c.a });
        reached.add(c.a);
        grew = true;
      }
    }
  }
  if (!reached.has(a)) return null;
  const inTree = new Set(order.map((o) => o.c));
  const checks = cl.filter((c) => !inTree.has(c) && reached.has(c.a));
  const pos = new Map<string, [number, number]>([[b, [0, 0]]]);
  const out: [number, number][] = [];
  const ok = (c: DirClue) => {
    const [ax, ay] = pos.get(c.a)!;
    const [bx, by] = pos.get(c.b)!;
    const [ux, uy] = VEC[c.dir];
    if (c.t === "exact") return ax - bx === ux * c.d && ay - by === uy * c.d;
    const dx = ax - bx;
    const dy = ay - by;
    return ux !== 0 ? dy === 0 && dx * ux > 0 : dx === 0 && dy * uy > 0;
  };
  const rec = (i: number) => {
    for (const c of checks) if (pos.has(c.a) && pos.has(c.b) && !ok(c)) return;
    if (i === order.length) {
      const [x, y] = pos.get(a)!;
      out.push([x, y]);
      return;
    }
    const { c, from, to } = order[i];
    const [fx, fy] = pos.get(from)!;
    const sign = to === c.a ? 1 : -1; // a = b + v  ⇒  to = from + sign·v
    const [ux, uy] = VEC[c.dir];
    const lens =
      c.t === "exact"
        ? [c.d]
        : Array.from({ length: ux !== 0 ? Bx : By }, (_, k) => k + 1);
    for (const L of lens) {
      pos.set(to, [fx + sign * ux * L, fy + sign * uy * L]);
      rec(i + 1);
    }
    pos.delete(to);
  };
  rec(0);
  return out;
}

export function buildDirection(
  rng: Rng,
  d: Difficulty,
  target: Category,
): DsDraft<DsDirectionFacts> | null {
  const n = { easy: 4, medium: 5, hard: 5, extreme: 6 }[d];
  const pool = rng.pick([
    "PQRSTUV",
    "ABCDEFG",
    "JKLMNPQ",
    "EFGHJKL",
    "KLMNPQR",
  ]);
  const points = pool.slice(0, n).split("");
  const coord = new Map<string, [number, number]>([[points[0], [0, 0]]]);
  for (let i = 1; i < n; i++) {
    let placed = false;
    for (let t = 0; t < 50 && !placed; t++) {
      const from = coord.get(points[rng.int(0, i - 1)])!;
      const dir = rng.pick(["N", "S", "E", "W"] as const);
      const L = rng.int(2, d === "easy" || d === "medium" ? 9 : 12);
      const p: [number, number] = [
        from[0] + VEC[dir][0] * L,
        from[1] + VEC[dir][1] * L,
      ];
      if ([...coord.values()].some(([x, y]) => x === p[0] && y === p[1]))
        continue;
      coord.set(points[i], p);
      placed = true;
    }
    if (!placed) return null;
  }
  const C = (x: string) => coord.get(x)!;
  const pairs: [string, string][] = [];
  for (const a of points)
    for (const b of points) if (a !== b) pairs.push([a, b]);
  const diag = pairs.filter(
    ([a, b]) => C(a)[0] !== C(b)[0] && C(a)[1] !== C(b)[1],
  );
  const [qa, qb] =
    diag.length && rng.chance(0.75) ? rng.pick(diag) : rng.pick(pairs);
  const ask: DirAsk = {
    t: d !== "easy" && rng.chance(0.3) ? "dist" : "dir",
    a: qa,
    b: qb,
  };
  const atoms: DirClue[] = [];
  for (const [a, b] of pairs) {
    if (a > b) continue;
    const [x1, y1] = C(a);
    const [x2, y2] = C(b);
    if (x1 !== x2 && y1 !== y2) continue;
    const [p, q] = rng.chance(0.5) ? [a, b] : [b, a];
    const [dx, dy] = [C(p)[0] - C(q)[0], C(p)[1] - C(q)[1]];
    const dir: Dir4 = dx > 0 ? "E" : dx < 0 ? "W" : dy > 0 ? "N" : "S";
    if (Math.abs(dx + dy) <= 25)
      atoms.push({ t: "exact", a: p, b: q, d: Math.abs(dx + dy), dir });
    if (rng.chance(d === "easy" ? 0.4 : 0.5))
      atoms.push({ t: "line", a: p, b: q, dir });
  }
  const cache = new Map<string, Set<string>>();
  const answersOf = (cl: readonly DirClue[]): Set<string> => {
    const key = cl
      .map((c) => JSON.stringify(c))
      .sort()
      .join("|");
    const hit = cache.get(key);
    if (hit) return hit;
    const res = answersUncached(cl);
    cache.set(key, res);
    return res;
  };
  const answersUncached = (cl: readonly DirClue[]): Set<string> => {
    const disp = displacements(cl, qa, qb);
    if (!disp) return new Set(["unlinked:1", "unlinked:2"]);
    const out = new Set<string>();
    for (const [x, y] of disp)
      out.add(
        x === 0 && y === 0
          ? "same"
          : ask.t === "dir"
            ? dirLabel(x, y)
            : `d2:${x * x + y * y}`,
      );
    return out;
  };
  const sc: Scenario<DirClue> = {
    atoms,
    key: (c) => JSON.stringify(c),
    answers: answersOf,
    openBase: true,
    ok: (ans) => !ans.has("same"),
    accept: (cl) =>
      cl.filter((c) => c.t === "line").length <= 1 &&
      cl.some((c) => [c.a, c.b].some((x) => x === qa || x === qb)),
  };
  const sizes = sizesFor(d, [1, 2], [2, 2], [2, 3], [2, 3]);
  const res = findPair(rng, sc, target, sizes, 40);
  if (!res) return null;
  const text = (cl: DirClue[]) => cl.map(dirClueText).join(" ");
  const dist = (k: string) => {
    const v = Number(k.slice(3));
    const r = Math.round(Math.sqrt(v));
    return r * r === v ? `${r} m` : `$\\sqrt{${v}}$ m`;
  };
  const say = (ans: Set<string>): string => {
    const xs = [...ans].sort();
    if (xs[0].startsWith("unlinked"))
      return `${qa} cannot be linked to ${qb}, so its position relative to ${qb} is unknown`;
    if (ask.t === "dir")
      return xs.length === 1
        ? `${qa} is to the ${xs[0]} of ${qb}`
        : `${qa} could be to the ${listOr(xs)} of ${qb}`;
    return xs.length === 1
      ? `${qa} is ${dist(xs[0])} from ${qb}`
      : `the distance could be ${listOr(xs.slice(0, 3).map(dist))}${xs.length > 3 ? " and more" : ""}`;
  };
  return {
    facts: { kind: "direction", points, I: res.I, II: res.II, ask },
    context: `${CAP_NUM_WORD[n]} points — ${listAnd(points)} — lie on a flat field.`,
    question:
      ask.t === "dir"
        ? `In which direction is point ${qa} with respect to point ${qb}?`
        : `What is the shortest distance between points ${qa} and ${qb}?`,
    I: text(res.I),
    II: text(res.II),
    say,
    shortcut:
      ask.t === "dir"
        ? "Place the second point at the origin and add the moves. The direction is fixed only when both the north–south and the east–west offsets have a known sign."
        : 'Distance needs both offsets exactly: a "due north" clue without metres leaves the length open.',
    tags: [
      "ds:direction",
      `direction:${ask.t === "dir" ? "relative-direction" : "shortest-distance"}`,
    ],
    res,
  };
}
