/**
 * Independent verifier for reasoning.direction.
 * Walks are simulated with complex-number headings, facing turns with floating-point rotation, the rotated
 * compass by enumerating every rotation/reflection of the compass, shadows by trying every facing, and point
 * sets by relaxation over the clue list.
 */
import type { GenResult } from '../../generators/types';
import type { CodeDef, DirectionFacts, DistDisplay, FacingTurn, LegTurn, PointClue } from '../../generators/reasoning/direction';

const NAMES: Record<string, string> = { N: 'North', NE: 'North-east', E: 'East', SE: 'South-east', S: 'South', SW: 'South-west', W: 'West', NW: 'North-west' };
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const UNIT: Record<string, [number, number]> = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };

type C = [number, number]; // complex re + i·im; re = east, im = north
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const I: C = [0, 1];
const MINUS_I: C = [0, -1];

/** Compass name of a displacement (bank convention: both offsets non-zero → corner direction). */
function nameOf(dx: number, dy: number): string {
  if (dx === 0 && dy === 0) throw new Error('zero displacement');
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI; // anticlockwise from east
  if (dy === 0) return dx > 0 ? 'East' : 'West';
  if (dx === 0) return dy > 0 ? 'North' : 'South';
  if (ang > 0 && ang < 90) return 'North-east';
  if (ang > 90) return 'North-west';
  if (ang < -90) return 'South-west';
  return 'South-east';
}

function distText(sq: number, mode: DistDisplay): string {
  const r = Math.round(Math.sqrt(sq));
  if (r * r === sq) return `${r} m`;
  if (mode === 'raw') return `$\\sqrt{${sq}}$ m`;
  // largest square factor by trial from the top
  for (let k = Math.floor(Math.sqrt(sq)); k >= 2; k--) if (sq % (k * k) === 0) return `$${k}\\sqrt{${sq / (k * k)}}$ m`;
  return `$\\sqrt{${sq}}$ m`;
}

/* ---------------------------------- walk ---------------------------------- */

function walkEnd(first: string, legs: { turn?: LegTurn; length: number }[]): C {
  let h: C = UNIT[first];
  let p: C = [0, 0];
  legs.forEach((leg, i) => {
    if (i > 0 && leg.turn) {
      if (leg.turn.t === 'left') h = mul(h, I);
      else if (leg.turn.t === 'right') h = mul(h, MINUS_I);
      else if (leg.turn.t === 'back') h = [-h[0], -h[1]];
      else h = UNIT[leg.turn.dir];
    }
    p = [p[0] + h[0] * leg.length, p[1] + h[1] * leg.length];
  });
  return p;
}

/* --------------------------------- facing --------------------------------- */

/** Heading as an angle in radians anticlockwise from east; clockwise turns subtract. */
function turnRad(t: FacingTurn): number {
  const deg = 'how' in t ? (t.how === 'left' ? 90 : t.how === 'right' ? -90 : 180) : t.cw ? -t.deg : t.deg;
  return (deg * Math.PI) / 180;
}
function compassOfAngle(rad: number): string {
  const x = Math.round(Math.cos(rad) * 1000);
  const y = Math.round(Math.sin(rad) * 1000);
  return nameOf(x === 0 ? 0 : Math.sign(x), y === 0 ? 0 : Math.sign(y));
}
function radOf(code: string): number {
  // compass code → angle anticlockwise from east
  const idx = COMPASS.indexOf(code); // clockwise from north in 45° steps
  return ((90 - idx * 45) * Math.PI) / 180;
}

/* --------------------------------- shadow --------------------------------- */

function rightOf(v: C): C {
  return [v[1], -v[0]];
}

/* --------------------------------- points --------------------------------- */

function solvePoints(clues: readonly PointClue[]): Map<string, C> {
  const pos = new Map<string, C>([[clues[0].b, [0, 0]]]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of clues) {
      const [vx, vy] = UNIT[c.dir];
      const pb = pos.get(c.b);
      const pa = pos.get(c.a);
      if (pb && !pa) {
        pos.set(c.a, [pb[0] + vx * c.dist, pb[1] + vy * c.dist]);
        changed = true;
      } else if (pa && !pb) {
        pos.set(c.b, [pa[0] - vx * c.dist, pa[1] - vy * c.dist]);
        changed = true;
      } else if (pa && pb && (pa[0] - pb[0] !== vx * c.dist || pa[1] - pb[1] !== vy * c.dist)) throw new Error('inconsistent clues');
    }
  }
  const names = new Set(clues.flatMap((c) => [c.a, c.b]));
  if (pos.size !== names.size) throw new Error('points not all fixed');
  return pos;
}

/* --------------------------------- coded ---------------------------------- */

function evalChain(codes: readonly CodeDef[], chain: readonly string[]): Map<string, C> {
  const pos = new Map<string, C>([[chain[0], [0, 0]]]);
  for (let i = 0; i + 2 < chain.length; i += 2) {
    const c = codes.find((x) => x.sym === chain[i + 1]);
    if (!c) throw new Error(`unknown code ${chain[i + 1]}`);
    const left = pos.get(chain[i])!;
    const [vx, vy] = UNIT[c.dir];
    // left is d m <dir> of right → right = left − d·dir
    pos.set(chain[i + 2], [left[0] - vx * c.dist, left[1] - vy * c.dist]);
  }
  return pos;
}

/* ---------------------------------- entry --------------------------------- */

export function verify(res: GenResult<DirectionFacts>): (number | string)[] {
  const f = res.facts;
  switch (f.kind) {
    case 'walk': {
      const [dx, dy] = walkEnd(f.first, f.legs);
      const sq = dx * dx + dy * dy;
      if (f.ask === 'distance') return [distText(sq, f.display)];
      if (f.ask === 'direction') return [nameOf(dx, dy)];
      if (f.ask === 'start-from-end') return [nameOf(-dx, -dy)];
      return [`${distText(sq, f.display)}, ${nameOf(dx, dy)}`];
    }
    case 'final-facing': {
      if (f.variant === 'turns') {
        let a = radOf(f.start);
        for (const t of f.turns) a += turnRad(t);
        return [compassOfAngle(a)];
      }
      // all 16 symmetries of the 8-point compass: i → (s·i + r) mod 8, s = ±1
      const images = new Set<string>();
      for (const s of [1, -1])
        for (let r = 0; r < 8; r++) {
          const map = (code: string) => COMPASS[(((s * COMPASS.indexOf(code) + r) % 8) + 8) % 8];
          if (f.examples.every(([from, to]) => map(from) === to)) images.add(map(f.ask));
        }
      if (images.size !== 1) throw new Error(`rotated compass ambiguous: ${[...images]}`);
      return [NAMES[[...images][0]]];
    }
    case 'shadow': {
      const shadow: C = f.time === 'morning' ? [-1, 0] : [1, 0];
      const candidates: C[] = [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ];
      const ok = candidates.filter((face) => {
        const right = rightOf(face);
        const left: C = [-right[0], -right[1]];
        const behind: C = [-face[0], -face[1]];
        const want = f.rel === 'front' ? face : f.rel === 'right' ? right : f.rel === 'left' ? left : behind;
        return want[0] === shadow[0] && want[1] === shadow[1];
      });
      if (ok.length !== 1) throw new Error('shadow facing not unique');
      let a = Math.atan2(ok[0][1], ok[0][0]);
      if (f.ask === 'other') a += Math.PI;
      for (const t of f.turns) a += turnRad(t);
      return [compassOfAngle(a)];
    }
    case 'coded-direction': {
      if (f.ask.t === 'which') {
        const ask = f.ask;
        const hits = (f.options ?? []).map((opt, i) => {
          const pos = evalChain(f.codes, opt);
          const a = pos.get(ask.of)!;
          const b = pos.get(ask.wrt)!;
          return nameOf(a[0] - b[0], a[1] - b[1]) === NAMES[ask.dir] ? i : -1;
        }).filter((i) => i >= 0);
        if (hits.length !== 1) throw new Error(`which-expression: ${hits.length} options fit`);
        return [hits[0]];
      }
      const pos = evalChain(f.codes, f.chain);
      const a = pos.get(f.ask.of)!;
      const b = pos.get(f.ask.wrt)!;
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      const sq = dx * dx + dy * dy;
      if (f.ask.t === 'direction') return [nameOf(dx, dy)];
      if (f.ask.t === 'distance') return [distText(sq, f.ask.display)];
      return [`${distText(sq, f.ask.display)}, ${nameOf(dx, dy)}`];
    }
    case 'point-set': {
      const pos = solvePoints(f.clues);
      return f.questions.map((q) => {
        switch (q.t) {
          case 'direction': {
            const a = pos.get(q.of)!;
            const b = pos.get(q.wrt)!;
            return nameOf(a[0] - b[0], a[1] - b[1]);
          }
          case 'distance': {
            const a = pos.get(q.a)!;
            const b = pos.get(q.b)!;
            return distText((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2, q.display);
          }
          case 'odd-pair': {
            const dirs = q.pairs.map(([x, y]) => {
              const a = pos.get(x)!;
              const b = pos.get(y)!;
              return nameOf(a[0] - b[0], a[1] - b[1]);
            });
            const odd = dirs.map((dd, i) => (dirs.filter((e) => e === dd).length === 1 ? i : -1)).filter((i) => i >= 0);
            const majority = dirs.filter((dd) => dirs.filter((e) => e === dd).length === 4);
            if (odd.length !== 1 || majority.length !== 4) throw new Error('odd pair not unique');
            return odd[0];
          }
          case 'route': {
            let total = 0;
            for (let i = 1; i < q.via.length; i++) {
              const link = f.clues.find((c) => (c.a === q.via[i - 1] && c.b === q.via[i]) || (c.b === q.via[i - 1] && c.a === q.via[i]));
              if (!link) throw new Error(`no direct link ${q.via[i - 1]}–${q.via[i]}`);
              total += link.dist;
            }
            return `${total} m`;
          }
          case 'new-point': {
            const base = pos.get(q.clue.b)!;
            const [vx, vy] = UNIT[q.clue.dir];
            const z: C = [base[0] + vx * q.clue.dist, base[1] + vy * q.clue.dist];
            const t = pos.get(q.to)!;
            return distText((z[0] - t[0]) ** 2 + (z[1] - t[1]) ** 2, q.display);
          }
        }
      });
    }
  }
}
