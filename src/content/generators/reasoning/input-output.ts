/**
 * R6 — Input–output (machine rearrangement). SPEC 8.2.
 *
 * Subtypes:
 *  - word-arrangement    words only; one word per step (alphabetical), one end or alternating ends
 *  - number-arrangement  numbers only; one number per step (ascending / descending), arithmetic change of the
 *                        moved number from medium up (add k, subtract k, reverse digits)
 *  - mixed-arrangement   words and numbers; a word and a number per step, or alternate steps
 *
 * The set shows the input and Steps I and II (real mains style); the solver must infer the rule. The generator
 * only keeps inputs whose shown steps pin the machine down: every rule of the family (any single move or
 * word+number pair, cycle of one or two step types, all orders, ends and number operations) that reproduces
 * Steps I and II must produce the same complete run. Five questions: which step is a given line, last step,
 * position of an element, n-th element from an end, element midway between two others / count between /
 * sum of two numbers.
 */
import type { GenMeta, SubtypeDef } from '../types';
import { defineGenerator } from '../types';
import { makeSet, type SetQuestionDraft } from '../shared/question';
import { numericChoices, shuffleChoices } from '../shared/options';
import { setTargetSeconds } from '../../targets';
import type { Difficulty, Rich } from '../../types';
import type { Rng } from '../../../lib/rng';
import { ordinal } from '../../../lib/format';
import { consistentRuns, isNum, sameRuns, simulate, type IoMove, type IoOp, type IoRule } from './input-output/machine';

export type { IoMove, IoOp, IoRule, IoKind } from './input-output/machine';

export type IoQuestion =
  | { t: 'which-step'; line: string[] }
  | { t: 'last-step' }
  | { t: 'position'; step: number; el: string; from: 'left' | 'right' }
  | { t: 'nth'; step: number; k: number; from: 'left' | 'right' }
  | { t: 'middle'; step: number; a: string; b: string }
  | { t: 'count-between'; step: number; a: string; b: string }
  | { t: 'sum'; step: number; i: number; j: number };

export interface InputOutputFacts {
  input: string[];
  /** Steps I and II exactly as printed. */
  shown: string[][];
  /** The machine used to build the set (the verifier re-infers it from `shown` instead of trusting it). */
  rule: IoRule;
  questions: IoQuestion[];
}

const META: GenMeta = { name: 'reasoning.input-output', version: 1, subject: 'reasoning', chapter: 'input-output' };

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'word-arrangement', label: 'Word arrangement', weight: 1 },
  { id: 'number-arrangement', label: 'Number arrangement & operations', weight: 1 },
  { id: 'mixed-arrangement', label: 'Words and numbers', weight: 1.5 },
];

const WORDS = [
  'apple', 'basket', 'cabin', 'delta', 'eagle', 'flame', 'globe', 'house', 'igloo', 'judge', 'kite', 'lemon', 'mango',
  'noble', 'ocean', 'petal', 'queen', 'river', 'solar', 'tiger', 'union', 'value', 'wheat', 'yield', 'zebra', 'brick',
  'crown', 'dream', 'earth', 'fresh', 'grand', 'hope', 'image', 'jolly', 'knot', 'light', 'metal', 'north', 'orbit',
  'pearl', 'quiet', 'royal', 'sugar', 'table', 'urban', 'vivid', 'water', 'young', 'about', 'bold', 'cycle', 'drive',
  'every', 'focus', 'green', 'honey', 'lotus', 'magic', 'never', 'offer', 'paper', 'rapid', 'stone', 'trust',
];

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
export const stepName = (s: number) => (s === 0 ? 'Input' : `Step ${ROMAN[s]}`);

const noOp: IoOp = { t: 'none' };
const mv = (kind: IoMove['kind'], order: IoMove['order'], end: IoMove['end'], op: IoOp = noOp): IoMove => ({ kind, order, end, op });

function randomOp(rng: Rng, allowRev = true): IoOp {
  const r = rng.next();
  if (allowRev && r < 0.25) return { t: 'rev' };
  return r < 0.65 ? { t: 'add', k: rng.int(1, 9) } : { t: 'sub', k: rng.int(1, 9) };
}

function pickRule(rng: Rng, sub: string, d: Difficulty): { rule: IoRule; words: number; nums: number } {
  const order = () => rng.pick(['asc', 'desc'] as const);
  const end = () => rng.pick(['left', 'right'] as const);
  const alt = (kind: IoMove['kind'], op1: IoOp = noOp, op2: IoOp = noOp): IoMove[][] => {
    const o = order();
    const e = end();
    // the two phases differ in order and end: "smallest to the left, largest to the right"
    return [[mv(kind, o, e, op1)], [mv(kind, o === 'asc' ? 'desc' : 'asc', e === 'left' ? 'right' : 'left', op2)]];
  };
  if (sub === 'word-arrangement') {
    const n = { easy: 6, medium: 7, hard: 8, extreme: 9 }[d];
    const cycle = d === 'easy' || (d === 'medium' && rng.chance(0.5)) ? [[mv('word', order(), end())]] : alt('word');
    return { rule: { cycle }, words: n, nums: 0 };
  }
  if (sub === 'number-arrangement') {
    const n = { easy: 6, medium: 7, hard: 8, extreme: 8 }[d];
    const cycle =
      d === 'easy'
        ? [[mv('num', order(), end())]]
        : d === 'medium'
          ? [[mv('num', order(), end(), randomOp(rng, false))]]
          : d === 'hard'
            ? alt('num', rng.chance(0.5) ? randomOp(rng) : noOp, randomOp(rng))
            : alt('num', randomOp(rng), randomOp(rng));
    return { rule: { cycle }, words: 0, nums: n };
  }
  // mixed
  const half = { easy: 3, medium: 4, hard: 4, extreme: 5 }[d];
  if (d === 'hard' && rng.chance(0.5)) {
    const e = end();
    const cycle = [[mv('word', order(), e)], [mv('num', order(), e === 'left' ? 'right' : 'left')]];
    return { rule: { cycle: rng.chance(0.5) ? cycle : [cycle[1], cycle[0]] }, words: half, nums: half };
  }
  const e = end();
  const w = mv('word', order(), e);
  const nm = mv('num', order(), rng.chance(0.7) ? (e === 'left' ? 'right' : 'left') : e, d === 'extreme' ? randomOp(rng) : noOp);
  return { rule: { cycle: [rng.chance(0.7) ? [w, nm] : [nm, w]] }, words: half, nums: half };
}

function opText(op: IoOp): string {
  switch (op.t) {
    case 'none':
      return '';
    case 'add':
      return ` and ${op.k} is added to it`;
    case 'sub':
      return ` and ${op.k} is subtracted from it`;
    case 'rev':
      return ' and its digits are reversed';
  }
}

function moveText(m: IoMove): string {
  const what =
    m.kind === 'word'
      ? `the word that comes ${m.order === 'asc' ? 'first' : 'last'} in alphabetical order`
      : `the ${m.order === 'asc' ? 'smallest' : 'largest'} number`;
  const where = m.end === 'left' ? 'goes to the left end (just after the elements already arranged there)' : 'goes to the right end (just before the elements already arranged there)';
  return `${what} among those not yet arranged ${where}${opText(m.op)}`;
}

export function ruleText(rule: IoRule): string {
  const one = (moves: IoMove[]) => moves.map(moveText).join('; also ');
  if (rule.cycle.length === 1) return `In every step, ${one(rule.cycle[0])}.`;
  return `In odd-numbered steps, ${one(rule.cycle[0])}. In even-numbered steps, ${one(rule.cycle[1])}.`;
}

function makeInput(rng: Rng, words: number, nums: number, rule: IoRule, d: Difficulty): string[] {
  const ops = rule.cycle.flat().map((m) => m.op);
  const hasRev = ops.some((o) => o.t === 'rev');
  const maxAdd = Math.max(0, ...ops.map((o) => (o.t === 'add' ? o.k : 0)));
  const maxSub = Math.max(0, ...ops.map((o) => (o.t === 'sub' ? o.k : 0)));
  const ws = rng.sample(d === 'easy' ? WORDS.filter((w, i) => WORDS.findIndex((x) => x[0] === w[0]) === i) : WORDS, words);
  const pool: number[] = [];
  for (let v = 10 + maxSub; v <= 99 - maxAdd; v++) {
    if (hasRev && (v % 10 === 0 || Math.floor(v / 10) === v % 10)) continue;
    pool.push(v);
  }
  const ns = rng.sample(pool, nums).map(String);
  return rng.shuffle([...ws, ...ns]);
}

const fmtLine = (l: readonly string[]) => l.join('  ');

interface Built {
  facts: InputOutputFacts;
  lines: string[][];
  last: number;
}

function build(rng: Rng, sub: string, d: Difficulty): Built {
  for (let attempt = 0; attempt < 400; attempt++) {
    const { rule, words, nums } = pickRule(rng, sub, d);
    const input = makeInput(rng, words, nums, rule, d);
    const sim = simulate(input, rule);
    if (sim.midNoOp || sim.last < 4) continue;
    if (sim.lines.some((l) => new Set(l).size !== l.length)) continue;
    // lines must be pairwise different (a "which step" line must be unique)
    const keys = sim.lines.map((l) => l.join(' '));
    if (new Set(keys).size !== keys.length) continue;
    const shown = [sim.lines[1], sim.lines[2]];
    const runs = consistentRuns(input, shown);
    if (!sameRuns(runs)) continue;
    return { facts: { input, shown, rule, questions: [] }, lines: sim.lines, last: sim.last };
  }
  throw new Error(`${META.name}: could not build an unambiguous machine`);
}

/* ------------------------------------------------------------------ */
/* Questions                                                           */
/* ------------------------------------------------------------------ */

type Q = { spec: IoQuestion; draft: SetQuestionDraft };

function stepLines(lines: string[][], upTo: number): Rich[] {
  const out: Rich[] = [];
  for (let s = 3; s <= upTo; s++) out.push(`${stepName(s)}: ${fmtLine(lines[s])}`);
  return out;
}

function posFrom(line: readonly string[], el: string, from: 'left' | 'right'): number {
  const i = line.indexOf(el);
  return from === 'left' ? i + 1 : line.length - i;
}

function elementOptions(rng: Rng, correct: string, candidates: string[], line: readonly string[]): { options: Rich[]; answerIndex: number } {
  const ds: string[] = [];
  for (const c of [...candidates, ...rng.shuffle([...line])]) if (c !== correct && !ds.includes(c)) ds.push(c);
  const c = shuffleChoices(rng, correct, ds.slice(0, 4));
  return c;
}

function makeQuestions(rng: Rng, b: Built, rule: IoRule, d: Difficulty): Q[] {
  const { lines, last } = b;
  const rt = ruleText(rule);
  const steps = Array.from({ length: last - 2 }, (_, i) => i + 3); // 3..last
  const kStep = () => rng.pick(steps);
  const builders: Record<string, () => Q | null> = {
    'which-step': () => {
      const k = rng.pick(steps.filter((s) => s >= 3));
      const choices = numericChoices(rng, k, {
        format: (v) => stepName(v),
        mistakes: [
          { value: k - 1, why: 'counted the input as Step I' },
          { value: k + 1, why: 'counted one step too many' },
          { value: last === k ? last - 2 : last, why: 'took the last step' },
        ],
        min: 2,
        step: 1,
      });
      return {
        spec: { t: 'which-step', line: lines[k] },
        draft: {
          prompt: `Which step number is the following output?\n\n${fmtLine(lines[k])}`,
          options: choices.options,
          answerIndex: choices.answerIndex,
          solution: {
            steps: [`Rule: ${rt}`, ...stepLines(lines, k), `The given line is **${stepName(k)}**.`],
            shortcut: 'Count how many elements already sit in their final places at the ends — each step adds one (or two).',
            trap: `${stepName(k - 1)} is the answer only if you count the input as Step I.`,
          },
          tags: ['io:which-step'],
        },
      };
    },
    'last-step': () => {
      const choices = numericChoices(rng, last, {
        format: (v) => stepName(v),
        mistakes: [
          { value: lines[0].length, why: 'one step per element, forgetting the last element needs no move' },
          { value: last + 1, why: 'counted a final step that changes nothing' },
          { value: last - 1, why: 'stopped one step early' },
        ],
        min: 2,
        step: 1,
      });
      return {
        spec: { t: 'last-step' },
        draft: {
          prompt: 'Which step is the last step of the rearrangement?',
          options: choices.options,
          answerIndex: choices.answerIndex,
          solution: {
            steps: [`Rule: ${rt}`, ...stepLines(lines, last), `After ${stepName(last)} every element is arranged, so the last step is **${stepName(last)}**.`],
            shortcut: 'The steps needed = elements that actually have to move; a final element already in place needs no step.',
            trap: `${stepName(lines[0].length)} assumes one step per element — the last remaining element is already in place.`,
          },
          tags: ['io:last-step'],
        },
      };
    },
    position: () => {
      const k = kStep();
      const el = rng.pick(lines[k]);
      const from = rng.pick(['left', 'right'] as const);
      const p = posFrom(lines[k], el, from);
      const other = from === 'left' ? 'right' : 'left';
      const mistakes = [
        { value: posFrom(lines[k], el, other), why: 'counted from the other end' },
        ...(lines[k - 1].includes(el) ? [{ value: posFrom(lines[k - 1], el, from), why: 'used the previous step' }] : []),
        ...(k < last && lines[k + 1].includes(el) ? [{ value: posFrom(lines[k + 1], el, from), why: 'used the next step' }] : []),
      ];
      const choices = numericChoices(rng, p, { format: (v) => `${ordinal(v)} from the ${from} end`, mistakes, step: 1, min: 0 });
      return {
        spec: { t: 'position', step: k, el, from },
        draft: {
          prompt: `What is the position of '${el}' from the ${from} end in ${stepName(k)}?`,
          options: choices.options,
          answerIndex: choices.answerIndex,
          solution: {
            steps: [`Rule: ${rt}`, ...stepLines(lines, k), `In ${stepName(k)}, '${el}' is **${ordinal(p)} from the ${from} end**.`],
            shortcut: `Position from the ${from} = total − position from the ${other} + 1 (total ${lines[k].length}).`,
            trap: `${ordinal(posFrom(lines[k], el, other))} is its position from the ${other} end.`,
          },
          tags: ['io:position'],
        },
      };
    },
    nth: () => {
      const k = kStep();
      const line = lines[k];
      const n = line.length;
      const pos = rng.int(2, Math.min(5, n - 1));
      const from = rng.pick(['left', 'right'] as const);
      const idx = from === 'left' ? pos - 1 : n - pos;
      const correct = line[idx];
      const mirror = from === 'left' ? line[n - pos] : line[pos - 1];
      const prev = lines[k - 1][idx];
      const cands = [mirror, prev, line[idx - 1], line[idx + 1]].filter((x): x is string => !!x);
      const ch = elementOptions(rng, correct, cands, line);
      return {
        spec: { t: 'nth', step: k, k: pos, from },
        draft: {
          prompt: `Which element is ${ordinal(pos)} from the ${from} end in ${stepName(k)}?`,
          options: ch.options,
          answerIndex: ch.answerIndex,
          solution: {
            steps: [`Rule: ${rt}`, ...stepLines(lines, k), `${ordinal(pos)} from the ${from} end of ${stepName(k)}: **${correct}**.`],
            shortcut: 'Write only the step asked, then count from the named end.',
            trap: `'${mirror}' is ${ordinal(pos)} from the ${from === 'left' ? 'right' : 'left'} end.`,
          },
          tags: ['io:nth-from-end'],
        },
      };
    },
    middle: () => {
      const k = kStep();
      const line = lines[k];
      const pairs: [number, number][] = [];
      for (let i = 0; i < line.length; i++) for (let j = i + 4; j < line.length; j += 2) pairs.push([i, j]);
      if (!pairs.length) return null;
      const [i, j] = rng.pick(pairs);
      const m = (i + j) / 2;
      const [a, b] = rng.chance(0.5) ? [line[i], line[j]] : [line[j], line[i]];
      const correct = line[m];
      const cands = [line[m - 1], line[m + 1], lines[k - 1][m], line[i + 1], line[j - 1]].filter((x): x is string => !!x && x !== a && x !== b);
      const ch = elementOptions(rng, correct, cands.length >= 4 ? cands : [...cands, ...line.filter((x) => x !== a && x !== b)], line.filter((x) => x !== a && x !== b));
      return {
        spec: { t: 'middle', step: k, a, b },
        draft: {
          prompt: `In ${stepName(k)}, which element is exactly midway between '${a}' and '${b}'?`,
          options: ch.options,
          answerIndex: ch.answerIndex,
          solution: {
            steps: [
              `Rule: ${rt}`,
              ...stepLines(lines, k),
              `'${line[i]}' is ${ordinal(i + 1)} and '${line[j]}' is ${ordinal(j + 1)} from the left; midway is ${ordinal(m + 1)} from the left: **${correct}**.`,
            ],
            shortcut: 'Midway position = (position of one + position of the other) ÷ 2, counted from the same end.',
            trap: 'Use the asked step — the same two elements sit elsewhere in the neighbouring steps.',
          },
          tags: ['io:midway'],
        },
      };
    },
    'count-between': () => {
      const k = kStep();
      const line = lines[k];
      const i = rng.int(0, line.length - 3);
      const j = rng.int(i + 2, line.length - 1);
      const [a, b] = rng.chance(0.5) ? [line[i], line[j]] : [line[j], line[i]];
      const cnt = j - i - 1;
      const prev = lines[k - 1];
      const mistakes = [
        { value: cnt + 1, why: 'counted one of the two end elements' },
        { value: cnt + 2, why: 'counted both end elements' },
        ...(prev.includes(a) && prev.includes(b) ? [{ value: Math.abs(prev.indexOf(a) - prev.indexOf(b)) - 1, why: 'used the previous step' }] : []),
      ];
      const choices = numericChoices(rng, cnt, { format: (v) => String(v), mistakes, step: 1, allowZero: true });
      return {
        spec: { t: 'count-between', step: k, a, b },
        draft: {
          prompt: `How many elements are there between '${a}' and '${b}' in ${stepName(k)}?`,
          options: choices.options,
          answerIndex: choices.answerIndex,
          solution: {
            steps: [`Rule: ${rt}`, ...stepLines(lines, k), `Between '${line[i]}' (${ordinal(i + 1)}) and '${line[j]}' (${ordinal(j + 1)}): ${j + 1} − ${i + 1} − 1 = **${cnt}**.`],
            shortcut: 'Elements between = difference of positions − 1.',
            trap: `${cnt + 1} counts one of the two named elements.`,
          },
          tags: ['io:count-between'],
        },
      };
    },
    sum: () => {
      const k = kStep();
      const line = lines[k];
      const numIdx = line.map((t, i) => (isNum(t) ? i : -1)).filter((i) => i >= 0);
      if (numIdx.length < 3) return null;
      const [i, j] = rng.sample(numIdx, 2).sort((x, y) => x - y);
      const total = Number(line[i]) + Number(line[j]);
      const prev = lines[k - 1];
      const mistakes = [
        ...(isNum(prev[i]) && isNum(prev[j]) ? [{ value: Number(prev[i]) + Number(prev[j]), why: 'used the previous step' }] : []),
        ...(k < last && isNum(lines[k + 1][i]) && isNum(lines[k + 1][j]) ? [{ value: Number(lines[k + 1][i]) + Number(lines[k + 1][j]), why: 'used the next step' }] : []),
        ...(isNum(line[line.length - 1 - i]) && isNum(line[line.length - 1 - j]) ? [{ value: Number(line[line.length - 1 - i]) + Number(line[line.length - 1 - j]), why: 'counted from the right end' }] : []),
      ];
      const choices = numericChoices(rng, total, { format: (v) => String(v), mistakes, step: rng.pick([2, 3, 5]) });
      return {
        spec: { t: 'sum', step: k, i: i + 1, j: j + 1 },
        draft: {
          prompt: `In ${stepName(k)}, what is the sum of the elements ${ordinal(i + 1)} and ${ordinal(j + 1)} from the left end?`,
          options: choices.options,
          answerIndex: choices.answerIndex,
          solution: {
            steps: [`Rule: ${rt}`, ...stepLines(lines, k), `${ordinal(i + 1)} from the left = ${line[i]}, ${ordinal(j + 1)} from the left = ${line[j]}.`, `${line[i]} + ${line[j]} = **${total}**.`],
            shortcut: 'Work out only the asked step; the arithmetic change applies once, when a number is moved.',
            trap: 'Numbers change only when they are moved — do not apply the change to numbers still waiting.',
          },
          tags: ['io:sum'],
        },
      };
    },
  };
  const hasNums = lines[0].some(isNum);
  const pool = ['which-step', 'last-step', 'position', 'nth', 'middle', 'count-between', ...(hasNums && d !== 'easy' ? ['sum'] : [])];
  const must = ['which-step', 'nth'];
  const order = [...must, ...rng.shuffle(pool.filter((x) => !must.includes(x)))];
  const out: Q[] = [];
  const prompts = new Set<string>();
  for (const t of order) {
    if (out.length === 5) break;
    for (let tries = 0; tries < 6; tries++) {
      const q = builders[t]();
      if (!q || prompts.has(q.draft.prompt)) continue;
      prompts.add(q.draft.prompt);
      out.push(q);
      break;
    }
  }
  if (out.length < 5) throw new Error(`${META.name}: only ${out.length} questions`);
  return rng.shuffle(out);
}

export const generator = defineGenerator<InputOutputFacts>(META, SUBTYPES, ({ meta, seed, difficulty, subtype, rng }) => {
  const b = build(rng, subtype.id, difficulty);
  const qs = makeQuestions(rng, b, b.facts.rule, difficulty);
  const kinds = subtype.id === 'word-arrangement' ? 'word' : subtype.id === 'number-arrangement' ? 'number' : 'word and number';
  const stimulus = [
    `A ${kinds} arrangement machine, when given an input line, rearranges it following a particular rule in each step. The input and the first two steps are given below. The machine keeps applying the same rule until the arrangement is complete (the last step).`,
    `**Input:** ${fmtLine(b.lines[0])}\n**Step I:** ${fmtLine(b.lines[1])}\n**Step II:** ${fmtLine(b.lines[2])}`,
    'Answer the questions based on the rule followed above.',
  ].join('\n\n');
  const item = makeSet(meta, seed, {
    kind: 'input-output',
    subtype: subtype.id,
    difficulty,
    title: 'Input–output',
    stimulus,
    targetSeconds: setTargetSeconds('puzzle-set', difficulty, qs.length),
    questions: qs.map((q) => ({ ...q.draft, tags: [...(q.draft.tags ?? []), `io:${subtype.id}`] })),
  });
  return { item, facts: { ...b.facts, questions: qs.map((q) => q.spec) } };
});
