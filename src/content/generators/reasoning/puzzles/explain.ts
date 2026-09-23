/**
 * Worked solution from the human-model case tree: which clues fix positions first, what each chain of clues
 * places, where the case split is, which clue kills each wrong case, and the final arrangement.
 */
import type { Clue } from '../../solver/puzzles/model';
import { rowOf, colOf } from '../../solver/puzzles/model';
import { CAUSE_ALLDIFF, CAUSE_HIDDEN, type PlaceEvent, type TNode } from '../../solver/puzzles/csp';
import type { Renderer } from './render';

const UNARY = new Set<Clue['k']>(['is', 'not', 'val', 'rval']);

function bits(m: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 31; i++) if (m & (1 << i)) out.push(i);
  return out;
}

export class Explainer {
  constructor(
    readonly r: Renderer,
    readonly clues: readonly Clue[],
  ) {}

  /** Position in running text: "floor 6", "position 3", "Wednesday", "19th June", "flat A of floor 2". */
  pos(s: number): string {
    const L = this.r.L;
    switch (L.kind) {
      case 'floor':
        return `floor ${s + 1}`;
      case 'box':
        return `position ${s + 1}`;
      case 'flat':
        return `flat ${this.r.setup.labels.flats![colOf(L, s)]} of floor ${rowOf(L, s) + 1}`;
      case 'rank':
        return this.r.rankPhrase(s).replace(/^the /, '');
      default:
        return this.r.posLabel(s);
    }
  }

  private who(e: number, start = false): string {
    return this.r.ref(e, start);
  }

  private clueList(ids: number[]): string {
    const n = [...new Set(ids)].sort((a, b) => a - b).map((i) => i + 1);
    if (n.length === 1) return `clue ${n[0]}`;
    return `clues ${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
  }

  private placeText(ev: PlaceEvent): string {
    const whyIds = bits(ev.why).filter((i) => i < this.clues.length);
    const at = this.pos(ev.s);
    if (ev.cause === CAUSE_HIDDEN) return `${this.who(ev.e, true)} can only be on ${at} (every other place is ruled out)`;
    if (ev.cause === CAUSE_ALLDIFF) return `${this.who(ev.e, true)} takes the only place left, ${at}`;
    if (ev.cause < 0) return `${this.who(ev.e, true)} → ${at} (counting the vacant places)`;
    const ids = whyIds.length ? whyIds.slice(-3) : [ev.cause];
    if (!ids.includes(ev.cause)) ids.push(ev.cause);
    return `${this.clueList(ids).replace(/^c/, 'C')} → ${this.who(ev.e)} on ${at}`;
  }

  private deadText(node: TNode): string {
    if (node.dead) {
      if (node.dead.cause >= 0) return `clue ${node.dead.cause + 1} cannot be satisfied`;
      return `no place is left for ${this.who(node.dead.e)}`;
    }
    const killers = new Set<number>();
    const walk = (n: TNode) => {
      if (n.dead && n.dead.cause >= 0) killers.add(n.dead.cause);
      n.split?.kids.forEach(walk);
    };
    walk(node);
    return killers.size ? `every sub-case breaks ${this.clueList([...killers].slice(0, 3))}` : 'every sub-case fails';
  }

  private alive(node: TNode): boolean {
    if (node.solved) return true;
    return !!node.split?.kids.some((k) => this.alive(k));
  }

  /** Steps for one node (the first pass at the root, or one surviving case). */
  private nodeSteps(node: TNode, depth: number, out: string[]): void {
    const direct = node.events.filter((ev) => ev.cause >= 0 && UNARY.has(this.clues[ev.cause].k) && depth === 0);
    const rest = node.events.filter((ev) => !direct.includes(ev));
    if (depth === 0) {
      if (direct.length) {
        const parts = direct.map((ev) => `${this.who(ev.e)} on ${this.pos(ev.s)} (clue ${ev.cause + 1})`);
        out.push(`Start with the clue${direct.length > 1 ? 's' : ''} that fix a position outright: ${parts.join('; ')}.`);
      } else out.push('No clue fixes a position outright, so begin with the clues that limit the options most.');
    }
    const shown = rest.slice(0, depth === 0 ? 6 : 4);
    for (let i = 0; i < shown.length; i += 2) out.push(shown.slice(i, i + 2).map((ev) => this.placeText(ev)).join('; ') + '.');
    if (rest.length > shown.length) {
      const names = rest.slice(shown.length).map((ev) => `${this.who(ev.e)} (${this.pos(ev.s)})`);
      out.push(`The same clues then place ${names.join(', ')}.`);
    }
    if (node.split) {
      const { e, kids, why } = node.split;
      const opts = kids.map((k) => this.pos(k.assign!.s));
      const src = bits(why).filter((i) => i < this.clues.length);
      out.push(
        `Now ${this.who(e)} can be on ${opts.slice(0, -1).join(', ')} or ${opts[opts.length - 1]}${src.length ? ` (${this.clueList(src.slice(-3))})` : ''} — make ${kids.length} cases.`,
      );
      const good = kids.find((k) => this.alive(k));
      for (const k of kids) {
        if (k === good) continue;
        out.push(`Case ${this.who(e)} on ${this.pos(k.assign!.s)}: ${this.deadText(k)} — rejected.`);
      }
      if (good) {
        out.push(`Case ${this.who(e)} on ${this.pos(good.assign!.s)} survives.`);
        if (depth < 3) this.nodeSteps(good, depth + 1, out);
        else out.push('Continuing the same way, the remaining clues fix everyone.');
      }
    }
  }

  steps(tree: TNode): string[] {
    const out: string[] = [];
    this.nodeSteps(tree, 0, out);
    return out;
  }

  /** "Final arrangement (top to bottom): …" */
  finalLine(truth: number[]): string {
    const { r } = this;
    const P = r.P;
    const personAt = new Array<number>(r.S).fill(-1);
    for (let p = 0; p < P; p++) personAt[truth[p]] = p;
    const L = r.L;
    const name = (s: number) => (personAt[s] < 0 ? '—' : r.setup.names[personAt[s]]);
    if (L.kind === 'floor' || L.kind === 'box') return `Final arrangement (top to bottom): ${[...Array(r.S).keys()].reverse().map(name).join(', ')}.`;
    if (L.kind === 'rank') {
      const w = r.measureWords();
      return `Final order (${w.top} to ${w.bottom}): ${[...Array(r.S).keys()].reverse().map(name).join(' > ')}.`;
    }
    if (L.kind === 'flat') {
      const rows = [...Array(L.rows).keys()].reverse().map((row) => `floor ${row + 1}: ${name(row * 2)} | ${name(row * 2 + 1)}`);
      return `Final arrangement (${r.setup.labels.flats![0]} | ${r.setup.labels.flats![1]}): ${rows.join('; ')}.`;
    }
    const parts = [...Array(r.S).keys()].map((s) => `${this.pos(s)} – ${name(s)}`);
    return `Final arrangement: ${parts.join(', ')}.`;
  }

  /** Clues that fix positions outright (for the shortcut line). */
  directClues(tree: TNode): number[] {
    return [...new Set(tree.events.filter((ev) => ev.cause >= 0 && UNARY.has(this.clues[ev.cause].k)).map((ev) => ev.cause))];
  }
}
