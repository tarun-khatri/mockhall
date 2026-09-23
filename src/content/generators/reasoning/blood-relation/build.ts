/**
 * Builders for reasoning.blood-relation. Ground truth is an explicit Family; statements are read off it;
 * answers come from structural predicates + gender enumeration on that structure ("Cannot be determined"
 * only when the asked person's gender — or the term itself — genuinely varies between consistent worlds).
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, FamilyLink, FamilyMember, Rich, VisualSpec } from '../../../types';
import type { QuestionDraft, SetQuestionDraft } from '../../shared/question';
import { shuffleChoices, fixedChoices, type Choices } from '../../shared/options';
import { targetSeconds } from '../../../targets';
import {
  Family,
  REL_GENDER,
  answerTerm,
  genderWorlds,
  indianNames,
  letterSource,
  links,
  personName,
  type NameSource,
  primitive,
  randomFamily,
  randomPath,
  relKind,
  termOf,
  type G,
  type P,
  type Rel,
  type Stmt,
} from './family';

export const CBD = 'Cannot be determined';

type Kind = NonNullable<ReturnType<typeof relKind>>;

const RELATED: Record<Kind, Kind[]> = {
  child: ['grandchild', 'nephew', 'sibling', 'childInLaw'],
  parent: ['grandparent', 'uncle', 'parentInLaw', 'sibling'],
  spouse: ['sibling', 'siblingInLaw', 'childInLaw', 'cousin'],
  sibling: ['cousin', 'siblingInLaw', 'child', 'spouse'],
  grandchild: ['child', 'nephew', 'cousin', 'grandparent'],
  grandparent: ['parent', 'uncle', 'grandchild', 'parentInLaw'],
  nephew: ['child', 'cousin', 'grandchild', 'uncle'],
  uncle: ['parent', 'grandparent', 'cousin', 'nephew'],
  cousin: ['sibling', 'nephew', 'siblingInLaw', 'uncle'],
  childInLaw: ['child', 'siblingInLaw', 'spouse', 'parentInLaw'],
  parentInLaw: ['parent', 'grandparent', 'childInLaw', 'uncle'],
  siblingInLaw: ['sibling', 'cousin', 'spouse', 'childInLaw'],
};

const flip = (g: G): G => (g === 'm' ? 'f' : 'm');

/** Four relation-word distractors + CBD fixed at E. `answer` null = CBD is correct. */
export function relationChoices(rng: Rng, kind: Kind, xg: G, answer: string | null): Choices {
  const words: string[] = [];
  const push = (w: string) => {
    if (w !== answer && !words.includes(w) && words.length < 4) words.push(w);
  };
  if (answer === null) {
    push(termOf(kind, 'm'));
    push(termOf(kind, 'f'));
  } else push(termOf(kind, flip(xg)));
  for (const k of RELATED[kind]) push(termOf(k, xg));
  for (const k of RELATED[kind]) push(termOf(k, flip(xg)));
  if (answer === null) {
    const opts = rng.shuffle(words.slice(0, 4));
    return fixedChoices([...opts, CBD], 4);
  }
  // the answer goes uniformly into A–D; "Cannot be determined" stays at E
  const pos = rng.int(0, 3);
  const others = rng.shuffle(words.slice(0, 3));
  const opts = [...others.slice(0, pos), answer, ...others.slice(pos)];
  return fixedChoices([...opts, CBD], pos);
}

function stmtText(s: Stmt): string {
  return `${s.x} is the ${s.rel} of ${s.y}.`;
}

/** Statement between two linked persons, with a random (or forced) subject. */
function stmtFor(rng: Rng, f: Family, a: P, b: P, subject?: 'a' | 'b'): Stmt {
  const s = subject ?? (rng.chance(0.5) ? 'a' : 'b');
  const [x, y] = s === 'a' ? [a, b] : [b, a];
  const rel = primitive(f, x, y);
  if (!rel) throw new Error('not a primitive link');
  return { x: x.name, rel, y: y.name };
}

/** Generation index of each person (elders 0). */
function generations(f: Family): Map<number, number> {
  const gen = new Map<number, number>();
  const depth = (p: P): number => {
    if (gen.has(p.id)) return gen.get(p.id)!;
    let d = 0;
    if (p.parents.length) d = depth(f.get(p.parents[0])) + 1;
    else if (p.spouse !== undefined && f.get(p.spouse).parents.length) d = depth(f.get(p.spouse));
    gen.set(p.id, d);
    return d;
  };
  f.ps.forEach(depth);
  return gen;
}

/** Family-tree visual; people outside `shown` are drawn only when they connect shown people. */
export function familyVisual(f: Family, shown: ReadonlySet<string>, knownGender: (p: P) => G | '?', caption?: string): VisualSpec {
  const gen = generations(f);
  const keep = new Set<number>(f.ps.filter((p) => shown.has(p.name)).map((p) => p.id));
  // add connectors: parents of kept people that have a kept sibling or kept grand-relatives
  for (const p of f.ps) if (keep.has(p.id)) for (const q of p.parents) keep.add(q);
  const members: FamilyMember[] = f.ps
    .filter((p) => keep.has(p.id))
    .map((p) => ({ id: String(p.id), name: shown.has(p.name) ? p.name : '(not named)', gender: shown.has(p.name) ? knownGender(p) : '?', generation: gen.get(p.id)! }));
  const links: FamilyLink[] = [];
  for (const p of f.ps) {
    if (!keep.has(p.id)) continue;
    if (p.spouse !== undefined && keep.has(p.spouse) && p.id < p.spouse) links.push({ type: 'spouse', a: String(p.id), b: String(p.spouse) });
    for (const q of p.parents) if (keep.has(q)) links.push({ type: 'parent', parent: String(q), child: String(p.id) });
  }
  return { type: 'family', members, links, ...(caption ? { caption } : {}) };
}

function genderOf(worlds: readonly Map<number, G>[], p: P): G | '?' {
  const s = new Set(worlds.map((w) => w.get(p.id)!));
  return s.size === 1 ? [...s][0] : '?';
}

/** Step-by-step relation of path[0] to each later person on the path. */
function chainSteps(f: Family, path: readonly P[], worlds: readonly Map<number, G>[]): Rich[] {
  const x = path[0];
  const out: Rich[] = [];
  for (let i = 1; i < path.length; i++) {
    const k = relKind(f, x, path[i]);
    if (!k) continue;
    const g = genderOf(worlds, x);
    const term = g === '?' ? (termOf(k, 'm') === termOf(k, 'f') ? termOf(k, 'm') : `${termOf(k, 'm').toLowerCase()} or ${termOf(k, 'f').toLowerCase()}`) : termOf(k, g);
    out.push(`So ${x.name} is the ${term.toLowerCase()} of ${path[i].name}.`);
  }
  return out;
}

type Draft = Omit<QuestionDraft, 'subtype' | 'difficulty'>;

/** Shortest chain of primitive links from x to y, spelled out as facts + the running relation. */
function explainLink(f: Family, x: P, y: P, worlds: readonly Map<number, G>[]): Rich[] {
  const prev = new Map<number, number>([[x.id, -1]]);
  const q = [x];
  while (q.length) {
    const a = q.shift()!;
    if (a.id === y.id) break;
    for (const b of links(f, a)) if (!prev.has(b.id)) {
      prev.set(b.id, a.id);
      q.push(b);
    }
  }
  const path: P[] = [];
  for (let c = y.id; c !== -1; c = prev.get(c)!) path.unshift(f.get(c));
  const facts: Rich[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const k = relKind(f, b, a)!;
    const g = genderOf(worlds, b);
    facts.push(`${b.name} is the ${g === '?' ? `${termOf(k, 'm').toLowerCase()}/${termOf(k, 'f').toLowerCase()}` : termOf(k, g).toLowerCase()} of ${a.name}.`);
  }
  return [facts.join(' '), ...chainSteps(f, path, worlds).slice(-1)];
}

/* ------------------------------------------------------------------ */
/* Direct & coded                                                       */
/* ------------------------------------------------------------------ */

export interface DirectFacts {
  kind: 'direct';
  stmts: Stmt[];
  ask: { x: string; y: string };
}

export interface CodedFacts {
  kind: 'coded';
  codes: { sym: string; rel: Rel }[];
  /** Alternating name, symbol, name … */
  expr: string[];
  ask: { x: string; y: string };
}

const PATH_LEN: Record<Difficulty, [number, number]> = { easy: [2, 2], medium: [3, 3], hard: [3, 4], extreme: [4, 5] };

interface Chain {
  f: Family;
  path: P[];
  x: P;
  y: P;
  kind: Kind;
  stmts: Stmt[];
  worlds: Map<number, G>[];
  answer: string | null;
}

/** A chain of primitive statements along a path; the asked person is x (path[0]) about y (path[end]). */
function makeChain(rng: Rng, d: Difficulty, names: NameSource, coded: boolean): Chain {
  const wantCbd = rng.chance(0.18);
  for (let attempt = 0; attempt < 400; attempt++) {
    const f = randomFamily(rng, names, 8);
    const len = rng.int(...PATH_LEN[d]);
    const start = rng.pick(f.ps);
    const path = randomPath(rng, f, start, len);
    if (!path) continue;
    const x = path[0];
    const y = path[path.length - 1];
    const kind = relKind(f, x, y);
    if (!kind || kind === 'spouse') continue;
    if (d !== 'easy' && (kind === 'child' || kind === 'parent' || kind === 'sibling') && rng.chance(0.7)) continue;
    // Statements: x's own statement makes x the object (hidden) or the subject (revealed).
    const stmts: Stmt[] = [];
    for (let i = 0; i + 1 < path.length; i++) {
      if (coded) stmts.push(stmtFor(rng, f, path[i + 1], path[i], 'a'));
      else if (i === 0) stmts.push(stmtFor(rng, f, path[0], path[1], wantCbd ? 'b' : rng.chance(0.75) ? 'a' : 'b'));
      else stmts.push(stmtFor(rng, f, path[i], path[i + 1]));
    }
    const worlds = genderWorlds(f, stmts);
    if (!worlds.length) continue;
    const answer = answerTerm(f, x, y, worlds);
    if (wantCbd !== (answer === null)) continue;
    return { f, path, x, y, kind, stmts, worlds, answer };
  }
  throw new Error('blood-relation: could not build a chain');
}

function chainDraft(rng: Rng, d: Difficulty, c: Chain, prompt: string, extraSteps: Rich[], tags: string[]): Draft {
  const xg = genderOf(c.worlds, c.x);
  const choices = relationChoices(rng, c.kind, xg === '?' ? c.x.g : xg, c.answer);
  const k = c.kind;
  const steps: Rich[] = [...extraSteps, ...chainSteps(c.f, c.path, c.worlds)];
  if (c.answer === null) steps.push(`${c.x.name}'s gender is never stated or implied, so ${c.x.name} could be the ${termOf(k, 'm').toLowerCase()} or the ${termOf(k, 'f').toLowerCase()} → **${CBD}**.`);
  else steps.push(`Answer: **${c.answer}**.`);
  const shown = new Set(c.path.map((p) => p.name));
  const trap =
    c.answer === null
      ? `Guessing ${c.x.name}'s gender from the name or the story is not allowed — only the relation words fix gender.`
      : termOf(k, 'm') === termOf(k, 'f')
        ? `${c.answer} is the same word for both genders, so an unknown gender does not make it "${CBD}".`
        : `${termOf(k, xg === 'f' ? 'm' : 'f')} has the wrong gender: ${c.x.name} is ${xg === 'f' ? 'female' : 'male'} (from the relation words).`;
  return {
    prompt,
    ...choices,
    solution: {
      steps,
      shortcut: 'Draw the tree as you read: ▲ generation up, ▼ down, = marriage; mark +/− for male/female only when a relation word fixes it.',
      trap,
      visual: familyVisual(c.f, shown, (p) => genderOf(c.worlds, p), 'Squares/circles as stated; "?" = gender not known'),
    },
    tags: ['blood:chain', ...(c.answer === null ? ['blood:cannot-determine'] : []), ...tags],
    targetSeconds: targetSeconds('short-reasoning', d),
  };
}

export function buildDirect(rng: Rng, d: Difficulty): { facts: DirectFacts; draft: Draft } {
  const c = makeChain(rng, d, indianNames(rng), false);
  const order = d === 'hard' || d === 'extreme' ? rng.shuffle(c.stmts) : c.stmts;
  const prompt = `${order.map(stmtText).join(' ')} How is ${c.x.name} related to ${c.y.name}?`;
  const steps: Rich[] = c.stmts.map((s) => `${s.x} is the ${s.rel} of ${s.y} → ${s.x} is ${REL_GENDER[s.rel] === 'm' ? 'male' : 'female'}.`);
  return { facts: { kind: 'direct', stmts: c.stmts, ask: { x: c.x.name, y: c.y.name } }, draft: chainDraft(rng, d, c, prompt, steps, ['blood:direct']) };
}

const SYMS = ['+', '−', '×', '÷', '@', '#', '%', '&', '★', '©'];
const RELS: Rel[] = ['father', 'mother', 'son', 'daughter', 'brother', 'sister', 'husband', 'wife'];

export function buildCoded(rng: Rng, d: Difficulty): { facts: CodedFacts; draft: Draft } {
  for (let attempt = 0; attempt < 50; attempt++) {
    const c = makeChain(rng, d, letterSource(rng), true);
    // Asked: last person about the first (object only → may be hidden) or first about last.
    const used = [...new Set(c.stmts.map((s) => s.rel))];
    const extra = rng.shuffle(RELS.filter((r) => !used.includes(r))).slice(0, Math.max(0, (d === 'easy' ? 4 : 6) - used.length));
    const rels = rng.shuffle([...used, ...extra]);
    const syms = rng.sample(SYMS, rels.length);
    const codes = rels.map((rel, i) => ({ sym: syms[i], rel }));
    // chain order: path[end] … path[0] with each link "later is rel of earlier" → expression reads from the far end
    const seq = [...c.path].reverse();
    const expr: string[] = [seq[0].name];
    for (let i = 0; i + 1 < seq.length; i++) {
      const s = c.stmts.find((t) => t.x === seq[i].name && t.y === seq[i + 1].name);
      if (!s) throw new Error('coded: missing link');
      expr.push(codes.find((k) => k.rel === s.rel)!.sym, seq[i + 1].name);
    }
    const prompt = `In a certain code language:\n${codes.map((k) => `- 'A ${k.sym} B' means A is the ${k.rel} of B.`).join('\n')}\n\nIf '${expr.join(' ')}' is true, how is ${c.x.name} related to ${c.y.name}?`;
    const steps: Rich[] = [`Decode pair by pair: ${c.stmts.slice().reverse().map((s) => `${s.x} is the ${s.rel} of ${s.y}`).join('; ')}.`];
    return { facts: { kind: 'coded', codes, expr, ask: { x: c.x.name, y: c.y.name } }, draft: chainDraft(rng, d, c, prompt, steps, ['blood:coded']) };
  }
  throw new Error('coded: could not build');
}

/* ------------------------------------------------------------------ */
/* Pointing                                                             */
/* ------------------------------------------------------------------ */

export interface PStep {
  rel: Rel;
  only?: boolean;
}
export interface PointingFacts {
  kind: 'pointing';
  speaker: { name: string; g: G };
  target: G;
  /** Chain from the speaker ("my father" → "the only son of my father" …). */
  rhs: PStep[];
  /** Two-sided form: "<target's lhs> is <rhs>"; absent: "<target> is <rhs>". */
  lhs?: Rel;
}

function ensureParents(f: Family, p: P): void {
  if (p.parents.length) return;
  const fa = f.add('', 'm');
  const mo = f.add('', 'f');
  f.marry(fa, mo);
  p.parents = [fa.id, mo.id];
}
function ensureSpouse(f: Family, p: P): P {
  if (p.spouse !== undefined) return f.get(p.spouse);
  const s = f.add('', p.g === 'm' ? 'f' : 'm');
  f.marry(p, s);
  return s;
}

/** Materialise one step from node n; null if the step is impossible (e.g. "wife" of a woman). */
function stepFrom(f: Family, n: P, s: PStep): P | null {
  const g = REL_GENDER[s.rel];
  switch (s.rel) {
    case 'father':
    case 'mother':
      ensureParents(f, n);
      return f.ps.find((q) => n.parents.includes(q.id) && q.g === g)!;
    case 'husband':
    case 'wife':
      if (n.g === g) return null;
      return ensureSpouse(f, n);
    case 'son':
    case 'daughter': {
      const sp = ensureSpouse(f, n);
      const kids = f.children(n).filter((k) => k.g === g);
      if (s.only && kids.length > 1) return null;
      if (s.only && kids.length === 1) return kids[0];
      return f.add('', g, n.g === 'm' ? [n.id, sp.id] : [sp.id, n.id]);
    }
    case 'brother':
    case 'sister': {
      ensureParents(f, n);
      const sibs = f.siblings(n).filter((k) => k.g === g);
      if (s.only && sibs.length > 1) return null;
      if (s.only && sibs.length === 1) return sibs[0];
      return f.add('', g, n.parents.slice());
    }
  }
}

const INV_LHS: Record<Rel, (f: Family, n: P, g: G) => P | null> = {
  father: (f, n, g) => (n.g === 'm' ? f.add('', g, [n.id, ensureSpouse(f, n).id]) : null),
  mother: (f, n, g) => (n.g === 'f' ? f.add('', g, [ensureSpouse(f, n).id, n.id]) : null),
  brother: (f, n, g) => (n.g === 'm' ? (ensureParents(f, n), f.add('', g, n.parents.slice())) : null),
  sister: (f, n, g) => (n.g === 'f' ? (ensureParents(f, n), f.add('', g, n.parents.slice())) : null),
  husband: (f, n, g) => (n.g === 'm' && g === 'f' && n.spouse === undefined ? (() => { const t = f.add('', 'f'); f.marry(n, t); return t; })() : n.g === 'm' && g === 'f' ? f.get(n.spouse!) : null),
  wife: (f, n, g) => (n.g === 'f' && g === 'm' && n.spouse === undefined ? (() => { const t = f.add('', 'm'); f.marry(n, t); return t; })() : n.g === 'f' && g === 'm' ? f.get(n.spouse!) : null),
  son: () => null,
  daughter: () => null,
};

function phrase(steps: readonly PStep[]): string {
  let s = `my ${steps[0].only ? 'only ' : ''}${steps[0].rel}`;
  for (let i = 1; i < steps.length; i++) s = `the ${steps[i].only ? 'only ' : ''}${steps[i].rel} of ${s}`;
  return s;
}

export function buildPointing(rng: Rng, d: Difficulty): { facts: PointingFacts; draft: Draft } {
  const nSteps = d === 'easy' ? 2 : d === 'medium' ? rng.int(2, 3) : d === 'hard' ? 3 : rng.int(3, 4);
  for (let attempt = 0; attempt < 500; attempt++) {
    const f = new Family();
    const sg: G = rng.chance(0.5) ? 'm' : 'f';
    const used = new Set<string>();
    const sp = f.add(personName(rng, sg, used), sg);
    const twoSided = d !== 'easy' && rng.chance(0.55);
    const rhs: PStep[] = [];
    const onlyChecks: { from: P; st: PStep; res: P }[] = [];
    let n: P | null = sp;
    const k = twoSided ? nSteps - 1 : nSteps;
    for (let i = 0; i < k && n; i++) {
      const rel = rng.pick(i === 0 ? (['father', 'mother', 'brother', 'sister', 'husband', 'wife', 'son', 'daughter'] as Rel[]) : RELS);
      // at most one "only" per statement (as in real papers; two interacting "only"s need case analysis)
      const only = !rhs.some((s) => s.only) && (rel === 'son' || rel === 'daughter' || rel === 'brother' || rel === 'sister') && rng.chance(d === 'easy' ? 0.3 : 0.5);
      const st: PStep = { rel, ...(only ? { only } : {}) };
      // avoid going straight back (e.g. "the son of my father" without "only" is ambiguous with the speaker)
      const prev = rhs[rhs.length - 1];
      const par = (r: Rel) => r === 'father' || r === 'mother';
      const kid = (r: Rel) => r === 'son' || r === 'daughter';
      const sib = (r: Rel) => r === 'brother' || r === 'sister';
      if (prev && !only && ((par(prev.rel) && kid(rel)) || (kid(prev.rel) && par(rel)) || (sib(prev.rel) && sib(rel)))) {
        n = null;
        break;
      }
      rhs.push(st);
      const from: P = n!;
      n = stepFrom(f, from, st);
      if (n && st.only) onlyChecks.push({ from, st, res: n });
    }
    if (!n || rhs.length !== k) continue;
    const tg: G = rng.chance(0.5) ? 'm' : 'f';
    let target: P | null = n;
    let lhs: Rel | undefined;
    if (twoSided) {
      lhs = rng.pick(['father', 'mother', 'brother', 'sister', 'husband', 'wife'] as Rel[]);
      target = INV_LHS[lhs](f, n, tg);
    } else if (n.g !== tg) continue;
    if (!target || target.id === sp.id || target.g !== tg) continue;
    // "only" must still hold once the whole family is drawn
    const onlyOk = onlyChecks.every(({ from, st, res }) => {
      const g = REL_GENDER[st.rel];
      const pool = st.rel === 'son' || st.rel === 'daughter' ? f.children(from) : f.siblings(from);
      const same = pool.filter((q) => q.g === g);
      return same.length === 1 && same[0].id === res.id;
    });
    if (!onlyOk) continue;
    const kind = relKind(f, target, sp);
    if (!kind) continue;
    if (d !== 'easy' && (kind === 'spouse' || kind === 'parent') && rng.chance(0.6)) continue;
    const answer = termOf(kind, tg);
    // five relation words, shuffled (no CBD: every gender is fixed here)
    const words: string[] = [];
    const push = (w: string) => {
      if (w !== answer && !words.includes(w)) words.push(w);
    };
    push(termOf(kind, flip(tg)));
    for (const r of RELATED[kind]) push(termOf(r, tg));
    for (const r of RELATED[kind]) push(termOf(r, flip(tg)));
    const choices = shuffleChoices(rng, answer, words.slice(0, 4));
    const pron = tg === 'm' ? 'He' : 'She';
    const poss = tg === 'm' ? 'His' : 'Her';
    const young = kind === 'child' || kind === 'grandchild' || kind === 'nephew';
    const who = tg === 'm' ? (young && rng.chance(0.5) ? 'a boy' : 'a man') : young && rng.chance(0.5) ? 'a girl' : 'a woman';
    const quote = twoSided ? `${poss} ${lhs} is ${phrase(rhs)}.` : `${pron} is ${phrase(rhs)}.`;
    const speaker = sp.name;
    // explanation: resolve the chain one step at a time
    const steps: Rich[] = [`${speaker} is ${sg === 'm' ? 'male' : 'female'}.`];
    const f2 = new Family();
    const s2 = f2.add(speaker, sg);
    let m: P = s2;
    for (let i = 0; i < rhs.length; i++) {
      const nx = stepFrom(f2, m, rhs[i])!;
      const kk = nx.id === s2.id ? null : relKind(f2, nx, s2);
      const who2 = nx.id === s2.id ? `${speaker} ${sg === 'm' ? 'himself' : 'herself'}` : kk ? `${speaker}'s ${termOf(kk, nx.g).toLowerCase()}` : `a relative of ${speaker}`;
      steps.push(`"${phrase(rhs.slice(0, i + 1))}" = ${who2}.`);
      m = nx;
    }
    if (twoSided) steps.push(`${poss} ${lhs} is that person, so the ${who.split(' ')[1]} is the ${termOf(kind, tg).toLowerCase()} of ${speaker}.`);
    steps.push(`Answer: **${answer}**.`);
    const shown = new Set<string>([speaker]);
    return {
      facts: { kind: 'pointing', speaker: { name: speaker, g: sg }, target: tg, rhs, ...(lhs ? { lhs } : {}) },
      draft: {
        prompt: `Pointing to ${who} in a photograph, ${speaker} said, '${quote}' How is the ${who.split(' ')[1]} in the photograph related to ${speaker}?`,
        ...choices,
        solution: {
          steps,
          shortcut: 'Decode the sentence from the end ("my …") backwards, one relation at a time; "only son/daughter" can be the speaker.',
          trap: onlyChecks.some((c) => c.res.id === sp.id)
            ? `"The only ${onlyChecks.find((c) => c.res.id === sp.id)!.st.rel}" here is ${speaker} — ${sg === 'm' ? 'he' : 'she'} is that only child, so no new person is added.`
            : onlyChecks.length
              ? `"Only" points to one particular person — identify who it is (it could even be ${speaker}) before adding anyone new.`
              : `${termOf(kind, flip(tg))} ignores the gender given by the pronoun in the statement.`,
          visual: familyVisual(f, shown, (p) => p.g, `${speaker} and the person in the photograph`),
        },
        tags: ['blood:pointing', ...(rhs.some((s) => s.only) ? ['trap:only-child'] : [])],
        targetSeconds: targetSeconds('short-reasoning', d),
      },
    };
  }
  throw new Error('pointing: could not build');
}

/* ------------------------------------------------------------------ */
/* Family puzzle (3-question set)                                       */
/* ------------------------------------------------------------------ */

export type PuzzleQ = { t: 'rel'; x: string; y: string } | { t: 'count'; g: G } | { t: 'who'; term: string; of: string; options: string[] };

export interface PuzzleFacts {
  kind: 'family-puzzle';
  members: string[];
  stmts: Stmt[];
  questions: PuzzleQ[];
}

export function buildPuzzle(rng: Rng, d: Difficulty): { facts: PuzzleFacts; stimulus: Rich; questions: SetQuestionDraft[] } {
  const maxSize = d === 'easy' ? 6 : d === 'medium' ? 7 : 8;
  for (let attempt = 0; attempt < 300; attempt++) {
    const f = randomFamily(rng, letterSource(rng), maxSize);
    if (f.ps.length < (d === 'easy' ? 5 : 6)) continue;
    // spanning tree of primitive links (random BFS)
    const inTree = new Set<number>([rng.pick(f.ps).id]);
    const stmts: Stmt[] = [];
    while (inTree.size < f.ps.length) {
      const edges: [P, P][] = [];
      for (const id of inTree) {
        const p = f.get(id);
        const nb = [...p.parents.map((i) => f.get(i)), ...f.children(p), ...f.siblings(p), ...(p.spouse !== undefined ? [f.get(p.spouse)] : [])];
        for (const q of nb) if (!inTree.has(q.id)) edges.push([p, q]);
      }
      const [a, b] = rng.pick(edges);
      stmts.push(stmtFor(rng, f, a, b));
      inTree.add(b.id);
    }
    const worlds = genderWorlds(f, stmts);
    if (!worlds.length) continue;
    const gens = generations(f);
    const nGen = new Set(gens.values()).size;
    const couples = f.ps.filter((p) => p.spouse !== undefined).length / 2;
    const qs: SetQuestionDraft[] = [];
    const facts: PuzzleQ[] = [];
    // two relation questions between people not directly linked by a statement
    const direct = new Set(stmts.flatMap((s) => [`${s.x}|${s.y}`, `${s.y}|${s.x}`]));
    const pairs: [P, P][] = [];
    for (const x of f.ps) for (const y of f.ps) if (x.id !== y.id && !direct.has(`${x.name}|${y.name}`) && relKind(f, x, y) && relKind(f, x, y) !== 'spouse') pairs.push([x, y]);
    const picked: [P, P][] = [];
    for (const want of [rng.chance(0.18), rng.chance(0.18)]) {
      const cand = rng.shuffle(pairs).find(([x, y]) => !picked.some(([a, b]) => a.id === x.id && b.id === y.id) && (answerTerm(f, x, y, worlds) === null) === want);
      if (cand) picked.push(cand);
    }
    if (picked.length < 2) continue;
    for (const [x, y] of picked) {
      const kind = relKind(f, x, y)!;
      const ans = answerTerm(f, x, y, worlds);
      const xg = genderOf(worlds, x);
      const choices = relationChoices(rng, kind, xg === '?' ? x.g : xg, ans);
      qs.push({
        prompt: `How is ${x.name} related to ${y.name}?`,
        ...choices,
        solution: {
          steps: [
            ...explainLink(f, x, y, worlds),            ans === null ? `${x.name}'s gender cannot be fixed from the clues → **${CBD}**.` : `Answer: **${ans}**.`,
          ],
          shortcut: 'Build the whole tree once (couples side by side, children below), then read every answer off it.',
          trap: ans === null ? `No clue fixes ${x.name}'s gender, so both ${termOf(kind, 'm')} and ${termOf(kind, 'f')} are possible.` : `Read the relation from ${x.name}'s side: ${x.name} is the ${ans.toLowerCase()} of ${y.name}, not the other way round.`,
          visual: familyVisual(f, new Set(f.ps.map((p) => p.name)), (p) => genderOf(worlds, p)),
        },
        tags: ['blood:family-puzzle', ...(ans === null ? ['blood:cannot-determine'] : [])],
      });
      facts.push({ t: 'rel', x: x.name, y: y.name });
    }
    // third: count of females (if all genders fixed) or "who is the … of …"
    const allFixed = f.ps.every((p) => genderOf(worlds, p) !== '?');
    if (allFixed && rng.chance(0.5)) {
      const g: G = rng.chance(0.6) ? 'f' : 'm';
      const count = f.ps.filter((p) => genderOf(worlds, p) === g).length;
      const pos = rng.int(0, 4);
      const lo = count - pos;
      if (lo < 1) continue;
      const opts = [0, 1, 2, 3, 4].map((i) => String(lo + i));
      qs.push({
        prompt: `How many ${g === 'f' ? 'female' : 'male'} members are there in the family?`,
        ...fixedChoices(opts, pos),
        solution: {
          steps: [`Genders fixed by the clues: ${f.ps.map((p) => `${p.name} (${genderOf(worlds, p) === 'm' ? 'M' : 'F'})`).join(', ')}.`, `${g === 'f' ? 'Female' : 'Male'} members = **${count}**.`],
          shortcut: 'Mark each person\'s gender on the tree the moment a clue fixes it; the count is then a glance.',
          trap: 'A husband/wife clue fixes the gender of both partners — do not skip the spouses who appear only as objects.',
          visual: familyVisual(f, new Set(f.ps.map((p) => p.name)), (p) => genderOf(worlds, p)),
        },
        tags: ['blood:family-puzzle', 'blood:count'],
      });
      facts.push({ t: 'count', g });
    } else {
      // "Who is the <term> of Y?" — unique person holding a determined term
      let done = false;
      for (const y of rng.shuffle(f.ps)) {
        for (const x of rng.shuffle(f.ps)) {
          if (x.id === y.id || direct.has(`${x.name}|${y.name}`)) continue;
          const t = relKind(f, x, y) ? answerTerm(f, x, y, worlds) : null;
          if (!t) continue;
          const holders = f.ps.filter((z) => z.id !== y.id && relKind(f, z, y) && answerTerm(f, z, y, worlds) === t);
          const maybe = f.ps.filter((z) => z.id !== y.id && relKind(f, z, y) && worlds.some((w) => termOf(relKind(f, z, y)!, w.get(z.id)!) === t));
          if (holders.length !== 1 || maybe.length !== 1) continue;
          const others = rng.shuffle(f.ps.filter((z) => z.id !== x.id && z.id !== y.id)).slice(0, 4).map((z) => z.name);
          if (others.length < 4) continue;
          const choices = shuffleChoices(rng, x.name, others);
          qs.push({
            prompt: `Who is the ${t.toLowerCase()} of ${y.name}?`,
            ...choices,
            solution: {
              steps: [...explainLink(f, x, y, worlds), `Only ${x.name} fits → **${x.name}**.`],
              shortcut: 'Locate the person on the tree and move to the asked relation directly.',
              trap: `Check gender too: a ${termOf(relKind(f, x, y)!, flip(genderOf(worlds, x) as G)).toLowerCase()} would not be the ${t.toLowerCase()}.`,
              visual: familyVisual(f, new Set(f.ps.map((p) => p.name)), (p) => genderOf(worlds, p)),
            },
            tags: ['blood:family-puzzle', 'blood:who'],
          });
          facts.push({ t: 'who', term: t, of: y.name, options: choices.options });
          done = true;
          break;
        }
        if (done) break;
      }
      if (!done) continue;
    }
    const order = d === 'easy' ? stmts : rng.shuffle(stmts);
    const intro = `There are ${f.ps.length} members — ${f.ps.map((p) => p.name).slice().sort().join(', ')} — in a family of ${nGen === 3 ? 'three' : 'two'} generations. There ${couples === 1 ? 'is one married couple' : `are ${['', 'one', 'two', 'three', 'four'][couples]} married couples`} in the family.`;
    const stimulus = `Study the following information carefully and answer the questions given below.\n\n${intro}\n${order.map(stmtText).join('\n')}`;
    return { facts: { kind: 'family-puzzle', members: f.ps.map((p) => p.name), stmts, questions: facts }, stimulus, questions: qs };
  }
  throw new Error('family-puzzle: could not build');
}
