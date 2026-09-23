/**
 * Averages (SPEC 8.1 Q10). Built backward from clean totals. Core trick taught throughout: work with totals
 * (average × count), or with "each member's share of the change" (deviation method).
 */
import { defineGenerator, type BuildContext, type GenResult, type SubtypeDef } from '../types';
import { attempt, emit as kitEmit, fmtExact, pickPeople, rs, type Mist, type NumAsk } from './averages/kit';

const META = { name: 'quant.averages', version: 1, subject: 'quant', chapter: 'averages' } as const;

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'add-remove-replace', label: 'Adding, removing or replacing a member', weight: 2 },
  { id: 'wrong-entry', label: 'Wrong entry corrected', weight: 1 },
  { id: 'cricket', label: 'Batting & bowling averages', weight: 1.5 },
  { id: 'teacher-joins', label: 'Teacher joins the class', weight: 1 },
  { id: 'consecutive', label: 'Consecutive numbers', weight: 1.5 },
  { id: 'weighted-groups', label: 'Weighted average of groups', weight: 2 },
];

export type AveragesFacts =
  /** n members, average avg; one joins (mode 'join') or leaves ('leave') and the average moves by `change` (signed); asked: that member's value. */
  | { form: 'join-leave'; n: number; avg: number; change: number; mode: 'join' | 'leave'; unit: Unit }
  /** n members; one of value `out` replaced; average moves by `change` (signed); asked: the newcomer's value. */
  | { form: 'replace'; n: number; out: number; change: number; unit: Unit }
  /** n members; two (out1, out2) replaced by two; average moves by `change`; asked: average of the two newcomers. */
  | { form: 'replace-two'; n: number; out: [number, number]; change: number; unit: Unit }
  /** A newcomer is `above` more than the current average; the average rises by `rise`; asked: members now. */
  | { form: 'above-average'; above: number; rise: number }
  /** n values, average avg; `right` misread as `wrong` (pairs); asked: correct average. */
  | { form: 'misread'; n: number; avg: number; pairs: [number, number][] }
  /** A mark entered as `wrong` instead of `right` raised the average by `rise`; asked: number of students. */
  | { form: 'misread-count'; right: number; wrong: number; rise: number }
  /** misread plus one entry `drop` removed; asked: correct average of the rest. */
  | { form: 'misread-drop'; n: number; avg: number; right: number; wrong: number; drop: number }
  /** Average avg after n innings; asked: runs needed next innings to raise the average by `rise`. */
  | { form: 'runs-needed'; n: number; avg: number; rise: number }
  /** Scores `score` in innings n+1 and the average rises by `rise`; asked: new average. */
  | { form: 'innings-rise'; n: number; score: number; rise: number }
  /** n innings avg; highest − lowest = gap; excluding both the average of n−2 is avg2; asked: highest score. */
  | { form: 'high-low'; n: number; avg: number; gap: number; avg2: number }
  /** Bowling: avg (1 dp) runs/wicket; takes w wickets for r runs; average falls by drop (1 dp); asked: wickets before. */
  | { form: 'bowling'; avg: number; w: number; r: number; drop: number }
  /** n students avg; including the teacher the average rises by `rise`; asked: teacher's age. */
  | { form: 'teacher-in'; n: number; avg: number; rise: number }
  /** Average of n students + teacher is avg; excluding the teacher it falls by `fall`; asked: teacher's age. */
  | { form: 'teacher-out'; n: number; avg: number; fall: number }
  /** n students avg; teacher and principal included → average rises by rise; principal is `older` years older; asked: teacher's age. */
  | { form: 'teacher-principal'; n: number; avg: number; rise: number; older: number }
  /** Class average avg; teacher aged `teacher` included → average rises by rise; asked: number of students. */
  | { form: 'teacher-count'; avg: number; teacher: number; rise: number }
  /** k consecutive numbers with step (1, or 2 for odd/even) and average; asked: largest | product of extremes | … */
  | { form: 'consecutive'; k: number; step: 1 | 2; avg: number; ask: 'largest' | 'smallest' | 'product' | 'next-avg' }
  /** Set P: kP consecutive even numbers with average avgP; set Q: kQ consecutive odd numbers starting `gap` after P's largest; asked: Q's average. */
  | { form: 'two-sets'; kP: number; avgP: number; kQ: number; gap: number }
  /** Groups with counts and averages; asked: overall average. */
  | { form: 'groups'; counts: number[]; avgs: number[] }
  /** Overall avg; group 1 (count n1, avg a1); rest avg a2; asked: total count. */
  | { form: 'rest-count'; overall: number; n1: number; a1: number; a2: number }
  /** Boys avg, girls avg, overall avg, number of boys; asked: number of girls. */
  | { form: 'boys-girls'; boysAvg: number; girlsAvg: number; overall: number; boys: number }
  /** Groups; one group's average was recorded `short` too low; asked: corrected overall average. */
  | { form: 'groups-corrected'; counts: number[]; avgs: number[]; which: number; short: number };

type Unit = 'kg' | 'years' | 'rupees' | 'marks';
type Ctx = BuildContext;
type Res = GenResult<AveragesFacts>;

/**
 * Averages answers are plain magnitudes: a distractor more than 2.5× (or under 0.4×) the key, or one with an
 * ugly fraction, is eliminated at a glance, so it is dropped before building options.
 */
function emit(ctx: Ctx, a: NumAsk<AveragesFacts>): Res {
  const ok = (v: number) => v >= a.answer * 0.4 && v <= a.answer * 2.5 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
  return kitEmit(ctx, { ...a, mistakes: a.mistakes.filter((m) => ok(m.value)) });
}

const fmtUnit = (unit: Unit) => (v: number): string => (unit === 'rupees' ? rs(v) : `${fmtExact(v)} ${unit === 'kg' ? 'kg' : unit === 'years' ? 'years' : 'marks'}`);
const plain = (v: number): string => fmtExact(v);
const whole = (v: number): boolean => Math.abs(v - Math.round(v)) < 1e-9;
const twoDp = (v: number): boolean => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const d = (v: number): string => fmtExact(v);

const GROUPS: { unit: Unit; who: string; what: string; lo: number; hi: number }[] = [
  { unit: 'kg', who: 'students in a hostel room group', what: 'weight', lo: 45, hi: 70 },
  { unit: 'years', who: 'members of a yoga club', what: 'age', lo: 25, hi: 45 },
  { unit: 'rupees', who: 'workers in a small workshop', what: 'daily wage', lo: 400, hi: 900 },
  { unit: 'kg', who: 'players in a kabaddi squad', what: 'weight', lo: 55, hi: 80 },
];

/* ------------------------------------------------------------------ */
/* 1. Add / remove / replace                                           */
/* ------------------------------------------------------------------ */

function joinLeave(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('join-leave', 300, () => {
    const g = rng.pick(GROUPS);
    const n = rng.int(6, 20);
    const avg = rng.int(g.lo, g.hi) * (g.unit === 'rupees' ? 1 : 1);
    const mode = rng.pick(['join', 'leave'] as const);
    const step = g.unit === 'rupees' ? 5 : 0.5;
    const change = rng.pick([1, -1]) * step * rng.int(1, 6);
    // join: value = new total − old total = (n + 1)(avg + change) − n·avg ; leave: value = n·avg − (n − 1)(avg + change)
    const value = mode === 'join' ? (n + 1) * (avg + change) - n * avg : n * avg - (n - 1) * (avg + change);
    if (!whole(value * 2) || value < g.lo * 0.6 || value > g.hi * 1.6) return null;
    const f = fmtUnit(g.unit);
    const members = mode === 'join' ? n + 1 : n - 1;
    const naive = avg + change;
    const wrongCount = mode === 'join' ? avg + n * change : avg - n * change;
    return emit(ctx, {
      facts: { form: 'join-leave', n, avg, change, mode, unit: g.unit },
      prompt: `The average ${g.what} of ${n} ${g.who} is ${f(avg)}. When one ${mode === 'join' ? 'more person joins' : 'person leaves'}, the average ${change > 0 ? 'increases' : 'decreases'} by ${f(Math.abs(change))}. What is the ${g.what} of the person who ${mode === 'join' ? 'joined' : 'left'}?`,
      answer: value,
      format: f,
      mistakes: [
        { value: naive, why: 'gave the new average', trap: `${f(naive)} is the new average, not the ${g.what} of the person who ${mode === 'join' ? 'joined' : 'left'}.` },
        { value: wrongCount, why: `multiplied the change by ${n} instead of ${members}` },
        { value: avg + change * (mode === 'join' ? 1 : -1), why: 'added only one change to the old average' },
        { value: mode === 'join' ? avg - (n + 1) * change : avg + (n - 1) * change, why: 'applied the change in the wrong direction' },
      ],
      steps: [
        `Old total = ${n} × ${d(avg)} = ${d(n * avg)}.`,
        `New total = ${members} × ${d(avg + change)} = ${d(members * (avg + change))}.`,
        `${mode === 'join' ? 'Newcomer' : 'Leaver'} = ${mode === 'join' ? `${d(members * (avg + change))} − ${d(n * avg)}` : `${d(n * avg)} − ${d(members * (avg + change))}`} = ${f(value)}.`,
      ],
      shortcut:
        mode === 'join'
          ? `Newcomer = old average ± (new count × change) = ${d(avg)} ${change > 0 ? '+' : '−'} ${n + 1} × ${d(Math.abs(change))}.`
          : `Leaver = old average ∓ (remaining count × change) = ${d(avg)} ${change > 0 ? '−' : '+'} ${n - 1} × ${d(Math.abs(change))}.`,
      trap: `The change is shared by everyone in the ${mode === 'join' ? 'new' : 'remaining'} group of ${members}.`,
      tags: ['avg:add-remove', 'trick:deviation'],
    });
  });
}

function replace(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('replace', 300, () => {
    const g = rng.pick(GROUPS);
    const n = rng.int(5, 16);
    const out = rng.int(g.lo, g.hi);
    const step = g.unit === 'rupees' ? 5 : 0.5;
    const change = rng.pick([1, -1]) * step * rng.int(1, 8);
    const value = out + n * change;
    if (value < g.lo * 0.6 || value > g.hi * 1.6 || !whole(value * 2)) return null;
    const f = fmtUnit(g.unit);
    return emit(ctx, {
      facts: { form: 'replace', n, out, change, unit: g.unit },
      prompt: `The average ${g.what} of ${n} ${g.who} ${change > 0 ? 'increases' : 'decreases'} by ${f(Math.abs(change))} when one of them, whose ${g.what} is ${f(out)}, is replaced by a new person. What is the ${g.what} of the new person?`,
      answer: value,
      format: f,
      mistakes: [
        { value: out + change, why: 'added only the change in average', trap: `${f(out + change)} adds the change once. The average of all ${n} moved by ${f(Math.abs(change))}, so the total moved by ${n} × ${d(Math.abs(change))} = ${d(Math.abs(n * change))}.` },
        { value: out + (n + 1) * change, why: 'multiplied by n + 1' },
        { value: out - n * change, why: 'applied the change in the wrong direction' },
        { value: out + (n - 1) * change, why: 'multiplied by n − 1' },
      ].filter((m) => m.value > 0),
      steps: [`Change in total = ${n} × ${d(change)} = ${d(n * change)}.`, `New person = ${f(out)} ${change > 0 ? '+' : '−'} ${d(Math.abs(n * change))} = ${f(value)}.`],
      shortcut: `Replacement: new = old ± n × change (the count stays ${n}).`,
      trap: `In a replacement the group size stays ${n}; the whole change in total comes from the swap.`,
      tags: ['avg:replace', 'trick:deviation'],
    });
  });
}

function replaceTwo(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('replace-two', 300, () => {
    const n = rng.int(8, 20);
    const out: [number, number] = [rng.int(28, 45), rng.int(28, 45)];
    const change = rng.pick([1, 1.5, 2, 2.5, 3, -1, -2]);
    const sumNew = out[0] + out[1] + n * change;
    const ans = sumNew / 2;
    if (!twoDp(ans) || ans <= 15) return null;
    const f = fmtUnit('years');
    return emit(ctx, {
      facts: { form: 'replace-two', n, out, change, unit: 'years' },
      prompt: `The average age of ${n} men ${change > 0 ? 'increases' : 'decreases'} by ${f(Math.abs(change))} when two of them, aged ${out[0]} and ${out[1]} years, are replaced by two new men. What is the average age of the two new men?`,
      answer: ans,
      format: f,
      mistakes: [
        { value: (out[0] + out[1] + change) / 2, why: 'added the change only once', trap: `${f((out[0] + out[1] + change) / 2)} ignores that all ${n} ages shifted: the total changed by ${n} × ${d(change)}.` },
        { value: sumNew, why: 'gave the sum instead of the average' },
        { value: (out[0] + out[1] + 2 * change) / 2, why: 'multiplied the change by 2 instead of n' },
        { value: (out[0] + out[1] - n * change) / 2, why: 'applied the change in the wrong direction' },
      ].filter((m) => m.value > 0),
      steps: [`Change in total = ${n} × ${d(change)} = ${d(n * change)}.`, `Sum of the new two = ${out[0]} + ${out[1]} ${n * change >= 0 ? '+' : '−'} ${d(Math.abs(n * change))} = ${d(sumNew)}.`, `Their average = ${d(sumNew)} ÷ 2 = ${f(ans)}.`],
      shortcut: `Sum of newcomers = sum of leavers ± n × change.`,
      trap: `The question asks for the average of the two new men, so halve the sum.`,
      tags: ['avg:replace', 'level:multi-step'],
    });
  });
}

function aboveAverage(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('above-average', 300, () => {
    const members = rng.int(6, 30);
    const rise = rng.pick([100, 150, 200, 250, 400, 500]);
    const above = members * rise; // newcomer's excess is shared by all members after joining
    if (above > 12000) return null;
    return emit(ctx, {
      facts: { form: 'above-average', above, rise },
      prompt: `A new employee joins a team, and her monthly salary is ${rs(above)} more than the team's average salary before she joined. As a result, the average salary of the team rises by ${rs(rise)}. How many members does the team have now (including her)?`,
      answer: members,
      format: plain,
      mistakes: [
        { value: members - 1, why: 'counted the members before she joined', trap: `${members - 1} is the old team size; her excess ${rs(above)} is spread over everyone after she joins, i.e. ${members} people.` },
        { value: members + 1, why: 'added her twice' },
        { value: above / (2 * rise), why: 'halved the ratio' },
      ].filter((m) => m.value > 0),
      steps: [`Her excess ${rs(above)} is shared equally by all members after she joins.`, `Each member's share = ${rs(rise)} ⇒ members now = ${rs(above)} ÷ ${rs(rise)} = ${members}.`],
      shortcut: `Excess over the old average ÷ rise in average = new count.`,
      trap: `Divide by the rise to get the NEW group size, which already includes the newcomer.`,
      tags: ['avg:add-remove', 'trick:deviation'],
    });
  });
}

function addRemoveReplace(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return joinLeave(ctx);
  if (difficulty === 'medium') return replace(ctx);
  if (difficulty === 'hard') return replaceTwo(ctx);
  return aboveAverage(ctx);
}

/* ------------------------------------------------------------------ */
/* 2. Wrong entry                                                       */
/* ------------------------------------------------------------------ */

function misread(ctx: Ctx, count: 1 | 2): Res {
  const { rng } = ctx;
  return attempt('misread', 300, () => {
    const n = rng.pick([10, 20, 25, 40, 50]);
    const avg = rng.int(30, 80);
    const pairs: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      const right = rng.int(20, 95);
      const digits = String(right).split('').reverse().join('');
      const wrong = rng.chance(0.6) && Number(digits) !== right && Number(digits) >= 10 ? Number(digits) : right + rng.pick([-20, -10, 10, 20, 9, -9]);
      if (wrong <= 0 || wrong === right) return null;
      pairs.push([right, wrong]);
    }
    const delta = pairs.reduce((s, [r, w]) => s + r - w, 0);
    const ans = avg + delta / n;
    if (delta === 0 || !twoDp(ans)) return null;
    const wrongDir = avg - delta / n;
    return emit(ctx, {
      facts: { form: 'misread', n, avg, pairs },
      prompt: `The average of ${n} numbers was found to be ${avg}. Later it was discovered that ${pairs.map(([r, w]) => `${r} was wrongly read as ${w}`).join(' and ')}. What is the correct average?`,
      answer: ans,
      format: plain,
      mistakes: [
        { value: wrongDir, why: 'corrected in the wrong direction', trap: `${d(wrongDir)} moves the average the wrong way: the correct value${count > 1 ? 's are' : ' is'} ${delta > 0 ? 'bigger' : 'smaller'} than what was used, so the average must ${delta > 0 ? 'rise' : 'fall'}.` },
        { value: avg + delta, why: 'added the whole error to the average' },
        { value: avg + delta / (n - 1), why: 'divided by n − 1' },
        { value: avg, why: 'left the average unchanged' },
      ].filter((m) => m.value > 0),
      steps: [
        `Wrong total = ${n} × ${avg} = ${n * avg}.`,
        `Error = ${pairs.map(([r, w]) => `(${r} − ${w})`).join(' + ')} = ${delta}.`,
        `Correct total = ${n * avg} ${delta >= 0 ? '+' : '−'} ${Math.abs(delta)} = ${n * avg + delta}; average = ${n * avg + delta} ÷ ${n} = ${d(ans)}.`,
      ],
      shortcut: `Correct average = ${avg} ${delta >= 0 ? '+' : '−'} ${Math.abs(delta)}/${n} = ${d(ans)}.`,
      trap: `The error in the total is spread over all ${n} numbers.`,
      tags: ['avg:wrong-entry'],
    });
  });
}

function misreadCount(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('misread-count', 300, () => {
    const right = rng.int(20, 70);
    const wrong = Number(String(right).split('').reverse().join(''));
    const diff = wrong - right;
    if (diff <= 0) return null;
    const rise = rng.pick([0.5, 0.25, 1, 1.5, 0.75]);
    const n = diff / rise;
    if (!whole(n) || n < 8 || n > 80) return null;
    return emit(ctx, {
      facts: { form: 'misread-count', right, wrong, rise },
      prompt: `A student's marks were wrongly entered as ${wrong} instead of ${right}. Because of this, the average marks of the class went up by ${d(rise)}. How many students are there in the class?`,
      answer: n,
      format: plain,
      mistakes: [
        { value: diff, why: 'gave the error in the total', trap: `${diff} is the extra marks added to the total; it raised the average by ${d(rise)}, so the class has ${diff} ÷ ${d(rise)} students.` },
        { value: diff * rise, why: 'multiplied instead of dividing' },
        { value: n + 1, why: 'off by one' },
        { value: n - 1, why: 'off by one (excluded the student)' },
      ].filter((m) => m.value > 0 && whole(m.value)),
      steps: [`Extra marks in the total = ${wrong} − ${right} = ${diff}.`, `Rise in average = ${diff} ÷ n = ${d(rise)}.`, `n = ${diff} ÷ ${d(rise)} = ${n}.`],
      shortcut: `Number of students = error ÷ change in average.`,
      trap: `The average rose by ${d(rise)} per student, so divide the total error by ${d(rise)}.`,
      tags: ['avg:wrong-entry'],
    });
  });
}

function misreadDrop(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('misread-drop', 400, () => {
    const n = rng.pick([11, 16, 21, 26, 31, 41, 51]);
    const avg = rng.int(35, 75);
    const right = rng.int(30, 90);
    const wrong = right + rng.pick([-18, -27, 18, 27, 36, -36, 9, -9]);
    const drop = rng.int(20, 95);
    const total = n * avg - wrong + right - drop;
    const ans = total / (n - 1);
    if (wrong <= 0 || !twoDp(ans)) return null;
    return emit(ctx, {
      facts: { form: 'misread-drop', n, avg, right, wrong, drop },
      prompt: `The average of ${n} observations is ${avg}. It was later found that one observation, ${right}, had been recorded as ${wrong}, and that another observation, ${drop}, should not have been included at all. What is the correct average of the remaining observations?`,
      answer: ans,
      format: plain,
      mistakes: [
        { value: (n * avg - wrong + right - drop) / n, why: 'still divided by the original count', trap: `After removing one observation only ${n - 1} remain, so divide by ${n - 1}.` },
        { value: (n * avg + wrong - right - drop) / (n - 1), why: 'corrected the misread value in the wrong direction' },
        { value: (n * avg - drop) / (n - 1), why: 'ignored the misread value' },
        { value: (n * avg - wrong + right) / n, why: 'forgot to remove the extra observation' },
      ].filter((m) => m.value > 0),
      steps: [`Recorded total = ${n} × ${avg} = ${n * avg}.`, `Correct the misread value: ${n * avg} − ${wrong} + ${right} = ${n * avg - wrong + right}.`, `Remove ${drop}: ${n * avg - wrong + right - drop} over ${n - 1} observations.`, `Average = ${d(ans)}.`],
      shortcut: `Fix the total first, then divide by the new count.`,
      trap: `Two corrections: fix the misread value AND reduce the count to ${n - 1}.`,
      tags: ['avg:wrong-entry', 'level:multi-step'],
    });
  });
}

function wrongEntry(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return misread(ctx, 1);
  if (difficulty === 'medium') return misreadCount(ctx);
  if (difficulty === 'hard') return misread(ctx, 2);
  return misreadDrop(ctx);
}

/* ------------------------------------------------------------------ */
/* 3. Cricket                                                           */
/* ------------------------------------------------------------------ */

function runsNeeded(ctx: Ctx): Res {
  const { rng } = ctx;
  const n = rng.int(10, 30);
  const avg = rng.int(28, 55);
  const rise = rng.int(1, 5);
  const ans = (n + 1) * (avg + rise) - n * avg;
  const [P] = pickPeople(rng, 1);
  return emit(ctx, {
    facts: { form: 'runs-needed', n, avg, rise },
    prompt: `${P.name} has a batting average of ${avg} runs after ${n} innings. How many runs must ${P.g === 'm' ? 'he' : 'she'} score in the next innings to raise the average to ${avg + rise}?`,
    answer: ans,
    format: plain,
    mistakes: [
      { value: avg + rise, why: 'gave the target average', trap: `${avg + rise} runs only keeps up with the new average; to lift all ${n + 1} innings by ${rise}, ${P.name} needs ${avg + rise} + ${n} × ${rise}.` },
      { value: avg + n * rise, why: 'multiplied the rise by n instead of adding it on the new average' },
      { value: avg + (n + 1) * rise, why: 'built the rise on the old average' },
      { value: (n + 1) * (avg + rise), why: 'gave the new total' },
    ],
    steps: [`Runs so far = ${n} × ${avg} = ${n * avg}.`, `Needed total after ${n + 1} innings = ${n + 1} × ${avg + rise} = ${(n + 1) * (avg + rise)}.`, `Runs needed = ${(n + 1) * (avg + rise)} − ${n * avg} = ${ans}.`],
    shortcut: `New average + n × rise = ${avg + rise} + ${n} × ${rise} = ${ans}.`,
    trap: `The next innings must also make up ${rise} run${rise > 1 ? 's' : ''} for each of the previous ${n} innings.`,
    tags: ['avg:cricket', 'trick:deviation'],
  });
}

function inningsRise(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('innings-rise', 200, () => {
    const n = rng.int(10, 25);
    const rise = rng.int(1, 4);
    const newAvg = rng.int(25, 50);
    const score = newAvg + n * rise;
    if (score > 150) return null;
    const [P] = pickPeople(rng, 1);
    return emit(ctx, {
      facts: { form: 'innings-rise', n, score, rise },
      prompt: `In ${P.g === 'm' ? 'his' : 'her'} ${n + 1}th innings, ${P.name} scored ${score} runs and thereby increased ${P.g === 'm' ? 'his' : 'her'} average by ${rise}. What is ${P.g === 'm' ? 'his' : 'her'} average after the ${n + 1}th innings?`,
      answer: newAvg,
      format: plain,
      mistakes: [
        { value: newAvg - rise, why: 'gave the old average', trap: `${newAvg - rise} is the average before this innings; the question asks for the new one.` },
        { value: score - (n + 1) * rise, why: 'multiplied the rise by n + 1' },
        { value: score / (n + 1), why: 'divided the score by the innings count' },
        { value: newAvg + rise, why: 'added the rise twice' },
      ],
      steps: [`Let the old average be x: ${n}x + ${score} = ${n + 1}(x + ${rise}).`, `x = ${score} − ${n + 1} × ${rise} = ${newAvg - rise}.`, `New average = ${newAvg - rise} + ${rise} = ${newAvg}.`],
      shortcut: `New average = score − n × rise = ${score} − ${n} × ${rise} = ${newAvg}.`,
      trap: `Old vs new average: the question asks for the average after the ${n + 1}th innings.`,
      tags: ['avg:cricket', 'trick:deviation'],
    });
  });
}

function highLow(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('high-low', 400, () => {
    const n = rng.int(20, 50);
    const avg = rng.int(40, 65);
    const avg2 = avg - rng.int(1, 4);
    const sumTwo = n * avg - (n - 2) * avg2;
    const gap = rng.int(80, 180);
    const high = (sumTwo + gap) / 2;
    const low = sumTwo - high;
    if (!whole(high) || low < 0 || high > 250) return null;
    const [P] = pickPeople(rng, 1);
    return emit(ctx, {
      facts: { form: 'high-low', n, avg, gap, avg2 },
      prompt: `${P.name}'s batting average in ${n} innings is ${avg} runs. ${P.g === 'm' ? 'His' : 'Her'} highest score exceeds ${P.g === 'm' ? 'his' : 'her'} lowest score by ${gap} runs. If these two innings are excluded, the average of the remaining ${n - 2} innings is ${avg2}. What is ${P.g === 'm' ? 'his' : 'her'} highest score?`,
      answer: high,
      format: plain,
      mistakes: [
        { value: low, why: 'gave the lowest score', trap: `${low} is the lowest score; the highest is ${gap} more.` },
        { value: sumTwo, why: 'gave the sum of the two innings' },
        { value: (n * avg - n * avg2 + gap) / 2, why: 'used n instead of n − 2 for the remaining innings' },
        { value: sumTwo - gap, why: 'subtracted the gap instead of halving' },
      ].filter((m) => m.value > 0),
      steps: [`Total = ${n} × ${avg} = ${n * avg}; remaining ${n - 2} innings = ${n - 2} × ${avg2} = ${(n - 2) * avg2}.`, `Highest + lowest = ${n * avg} − ${(n - 2) * avg2} = ${sumTwo}.`, `Highest = (${sumTwo} + ${gap}) ÷ 2 = ${high}.`],
      shortcut: `Sum and difference ⇒ larger = (sum + difference) ÷ 2.`,
      trap: `The remaining innings number ${n - 2}, not ${n}.`,
      tags: ['avg:cricket', 'level:multi-step'],
    });
  });
}

function bowling(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('bowling', 600, () => {
    // Work in tenths: avg10 = 10 × average; drop10 = 10 × drop.
    const W = rng.int(40, 120);
    const avg10 = rng.int(110, 250);
    const drop10 = rng.int(2, 8);
    const w = rng.int(3, 7);
    // (avg W + r) = (avg − drop)(W + w) ⇒ r = (avg − drop)(W + w) − avg W
    const r10 = (avg10 - drop10) * (W + w) - avg10 * W;
    if (r10 % 10 !== 0) return null;
    const r = r10 / 10;
    if (r <= 5 || r > 60) return null;
    const [P] = pickPeople(rng, 1, ['m']);
    const avg = avg10 / 10;
    const drop = drop10 / 10;
    return emit(ctx, {
      facts: { form: 'bowling', avg, w, r, drop },
      prompt: `${P.name}'s bowling average is ${d(avg)} runs per wicket. In his next match he takes ${w} wickets for ${r} runs, and his average falls by ${d(drop)}. How many wickets had he taken before this match?`,
      answer: W,
      format: plain,
      mistakes: [
        { value: W + w, why: 'gave the total after the match', trap: `${W + w} includes the ${w} wickets from this match; the question asks for the wickets before it.` },
        { value: W - w, why: 'subtracted the new wickets' },
        { value: Math.round((((avg - drop) * w - r) / drop) * 10) / 10 + w, why: 'counted the new wickets twice' },
      ].filter((m) => m.value > 0),
      steps: [
        `Let the earlier wickets be x: runs = ${d(avg)}x.`,
        `After the match: (${d(avg)}x + ${r}) ÷ (x + ${w}) = ${d(avg - drop)}.`,
        `${d(avg)}x + ${r} = ${d(avg - drop)}x + ${d((avg - drop) * w)} ⇒ ${d(drop)}x = ${d((avg - drop) * w - r)}.`,
        `x = ${W}.`,
      ],
      shortcut: `x = (new average × new wickets − runs) ÷ fall = (${d(avg - drop)} × ${w} − ${r}) ÷ ${d(drop)}.`,
      trap: `A bowling average falls when the new match is cheaper than the average — set up the new total over the new wicket count.`,
      tags: ['avg:cricket', 'avg:bowling', 'level:multi-step'],
    });
  });
}

function cricket(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return runsNeeded(ctx);
  if (difficulty === 'medium') return inningsRise(ctx);
  if (difficulty === 'hard') return highLow(ctx);
  return bowling(ctx);
}

/* ------------------------------------------------------------------ */
/* 4. Teacher joins                                                     */
/* ------------------------------------------------------------------ */

function teacherIn(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('teacher-in', 200, () => {
    const n = rng.int(15, 40);
    const avg = rng.int(10, 16);
    const rise = rng.pick([0.5, 1, 1.5]);
    const teacher = avg + (n + 1) * rise;
    if (!whole(teacher) || teacher < 25 || teacher > 60) return null;
    return emit(ctx, {
      facts: { form: 'teacher-in', n, avg, rise },
      prompt: `The average age of ${n} students in a class is ${yrs(avg)}. When the teacher's age is included, the average increases by ${yrs(rise)}. What is the teacher's age?`,
      answer: teacher,
      format: fmtUnit('years'),
      mistakes: [
        { value: avg + n * rise, why: 'multiplied the rise by n instead of n + 1', trap: `${avg + n * rise} years spreads the rise over ${n} people; after the teacher joins there are ${n + 1}.` },
        { value: avg + rise, why: 'gave the new average' },
        { value: (n + 1) * (avg + rise), why: 'gave the new total' },
        { value: avg + (n - 1) * rise, why: 'multiplied the rise by n − 1' },
      ],
      steps: [`Total of students = ${n} × ${avg} = ${n * avg}.`, `Total with teacher = ${n + 1} × ${d(avg + rise)} = ${d((n + 1) * (avg + rise))}.`, `Teacher = ${d((n + 1) * (avg + rise))} − ${n * avg} = ${teacher} years.`],
      shortcut: `Teacher = old average + (new count × rise) = ${avg} + ${n + 1} × ${d(rise)}.`,
      trap: `After including the teacher there are ${n + 1} people sharing the rise.`,
      tags: ['avg:teacher', 'trick:deviation'],
    });
  });
}

const yrs = (v: number): string => `${fmtExact(v)} year${v === 1 ? '' : 's'}`;

function teacherOut(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('teacher-out', 200, () => {
    const n = rng.int(15, 40);
    const avg = rng.int(12, 18);
    const fall = rng.pick([0.5, 1, 1.5]);
    const teacher = avg + n * fall;
    if (!whole(teacher) || teacher < 25 || teacher > 60) return null;
    return emit(ctx, {
      facts: { form: 'teacher-out', n, avg, fall },
      prompt: `The average age of ${n} students and their class teacher is ${yrs(avg)}. If the teacher's age is excluded, the average falls by ${yrs(fall)}. What is the teacher's age?`,
      answer: teacher,
      format: fmtUnit('years'),
      mistakes: [
        { value: avg + (n + 1) * fall, why: 'multiplied the fall by n + 1', trap: `${d(avg + (n + 1) * fall)} years spreads the fall over ${n + 1}; after removing the teacher only ${n} students remain.` },
        { value: avg - fall, why: 'gave the students\' average' },
        { value: avg + fall, why: 'added the fall once' },
        { value: avg + (n - 1) * fall, why: 'multiplied the fall by n − 1' },
      ],
      steps: [`Total with teacher = ${n + 1} × ${avg} = ${(n + 1) * avg}.`, `Students' total = ${n} × ${d(avg - fall)} = ${d(n * (avg - fall))}.`, `Teacher = ${(n + 1) * avg} − ${d(n * (avg - fall))} = ${teacher} years.`],
      shortcut: `Teacher = average with teacher + (students × fall) = ${avg} + ${n} × ${d(fall)}.`,
      trap: `After excluding the teacher, ${n} students remain — multiply the fall by ${n}.`,
      tags: ['avg:teacher', 'trick:deviation'],
    });
  });
}

function teacherPrincipal(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('teacher-principal', 300, () => {
    const n = rng.int(20, 40);
    const avg = rng.int(10, 15);
    const rise = rng.pick([1, 1.5, 2]);
    const both = 2 * avg + (n + 2) * rise; // teacher + principal
    const older = rng.int(6, 20);
    const teacher = (both - older) / 2;
    if (!whole(teacher) || teacher < 25 || teacher + older > 62) return null;
    return emit(ctx, {
      facts: { form: 'teacher-principal', n, avg, rise, older },
      prompt: `The average age of ${n} students is ${yrs(avg)}. When the ages of the class teacher and the principal are included, the average increases by ${yrs(rise)}. If the principal is ${yrs(older)} older than the class teacher, what is the class teacher's age?`,
      answer: teacher,
      format: fmtUnit('years'),
      mistakes: [
        { value: (2 * avg + n * rise - older) / 2, why: 'multiplied the rise by n instead of n + 2', trap: `That value spreads the rise over ${n}; with the teacher and the principal there are ${n + 2} people.` },
        { value: teacher + older, why: "gave the principal's age" },
        { value: both / 2, why: 'ignored the age gap' },
        { value: (2 * avg + (n + 1) * rise - older) / 2, why: 'multiplied the rise by n + 1' },
      ].filter((m) => m.value > 0),
      steps: [
        `New total = ${n + 2} × ${d(avg + rise)} = ${d((n + 2) * (avg + rise))}; old total = ${n * avg}.`,
        `Teacher + principal = ${d((n + 2) * (avg + rise))} − ${n * avg} = ${both}.`,
        `Teacher = (${both} − ${older}) ÷ 2 = ${teacher} years.`,
      ],
      shortcut: `Sum of the two newcomers = 2 × old average + (new count × rise).`,
      trap: `Two people joined, so the new count is ${n + 2}.`,
      tags: ['avg:teacher', 'level:multi-step'],
    });
  });
}

function teacherCount(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('teacher-count', 300, () => {
    const n = rng.int(15, 45);
    const avg = rng.int(10, 16);
    const rise = rng.pick([0.5, 1, 1.5]);
    const teacher = avg + (n + 1) * rise;
    if (!whole(teacher) || teacher < 25 || teacher > 60) return null;
    return emit(ctx, {
      facts: { form: 'teacher-count', avg, teacher, rise },
      prompt: `The average age of the students of a class is ${yrs(avg)}. When their ${teacher}-year-old teacher is included, the average age becomes ${yrs(avg + rise)}. How many students are there in the class?`,
      answer: n,
      format: plain,
      mistakes: [
        { value: n + 1, why: 'counted the teacher as a student', trap: `${n + 1} is the number of people after the teacher joins; the class has ${n} students.` },
        { value: (teacher - avg) / rise, why: 'forgot to subtract the new average' },
        { value: n - 1, why: 'off by one' },
      ].filter((m) => m.value > 0 && whole(m.value)),
      steps: [`Teacher's excess over the old average = ${teacher} − ${avg} = ${teacher - avg}.`, `This excess is spread over (n + 1) people: ${teacher - avg} ÷ (n + 1) = ${d(rise)} ⇒ n + 1 = ${n + 1}.`, `Students = ${n}.`],
      shortcut: `n = (teacher − new average) ÷ rise = (${teacher} − ${d(avg + rise)}) ÷ ${d(rise)}.`,
      trap: `The rise is shared by n + 1 people, so subtract one to count the students.`,
      tags: ['avg:teacher', 'level:multi-step'],
    });
  });
}

function teacherJoins(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return teacherIn(ctx);
  if (difficulty === 'medium') return teacherOut(ctx);
  if (difficulty === 'hard') return teacherPrincipal(ctx);
  return teacherCount(ctx);
}

/* ------------------------------------------------------------------ */
/* 5. Consecutive numbers                                               */
/* ------------------------------------------------------------------ */

function consecutive(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'extreme') return twoSets(ctx);
  return attempt('consecutive', 300, () => {
    const step: 1 | 2 = difficulty === 'medium' ? 1 : 2;
    const k = rng.int(4, 9);
    const first = step === 2 ? rng.int(5, 60) * 2 + (rng.chance(0.5) ? 1 : 0) : rng.int(10, 80);
    const nums = Array.from({ length: k }, (_, i) => first + i * step);
    const avg = nums.reduce((s, x) => s + x, 0) / k;
    const kind = step === 1 ? 'consecutive natural numbers' : first % 2 ? 'consecutive odd numbers' : 'consecutive even numbers';
    const ask = difficulty === 'easy' ? rng.pick(['largest', 'smallest'] as const) : difficulty === 'medium' ? 'product' : 'next-avg';
    let answer: number;
    let q: string;
    let mistakes: Mist[];
    const last = nums[k - 1];
    if (ask === 'largest' || ask === 'smallest') {
      answer = ask === 'largest' ? last : first;
      q = `What is the ${ask} number?`;
      mistakes = [
        { value: ask === 'largest' ? avg + (k - 1) : avg - (k - 1), why: 'moved by k − 1 from the average instead of (k − 1)·step/2', trap: `The ${ask} number is ${(k - 1) / 2} steps of ${step} from the average, i.e. ${d(((k - 1) * step) / 2)}.` },
        { value: ask === 'largest' ? first : last, why: 'gave the other end' },
        { value: ask === 'largest' ? avg + k : avg - k, why: 'moved by k from the average' },
        { value: ask === 'largest' ? last + step : first - step, why: 'went one step too far' },
      ];
    } else if (ask === 'product') {
      answer = first * last;
      q = `What is the product of the smallest and the largest of these numbers?`;
      mistakes = [
        { value: (first + 1) * (last + 1), why: 'shifted both ends by one', trap: `Check the ends: with an average of ${d(avg)} and ${k} numbers, they run from ${first} to ${last}.` },
        { value: (first - 1) * (last - 1), why: 'shifted both ends down by one' },
        { value: avg * avg, why: 'squared the average' },
        { value: first * (last - 1), why: 'off by one at the top' },
      ];
    } else {
      answer = avg + k * step;
      q = `What is the average of the next ${k} ${kind}?`;
      mistakes = [
        { value: avg + k, why: 'moved by k instead of k × step', trap: `Each of the next ${k} numbers is ${k} steps of ${step} beyond its partner, so the average rises by ${k * step}.` },
        { value: avg + step, why: 'moved by one step' },
        { value: last + step, why: 'gave the next number' },
        { value: avg + (k - 1) * step, why: 'moved by k − 1 steps' },
      ];
    }
    return emit(ctx, {
      facts: { form: 'consecutive', k, step, avg, ask },
      prompt: `The average of ${k} ${kind} is ${d(avg)}. ${q}`,
      answer,
      format: plain,
      mistakes: mistakes.filter((m) => m.value > 0),
      steps: [
        `For consecutive ${step === 1 ? 'numbers' : 'odd/even numbers'} the average is the middle value.`,
        `The ${k} numbers run from ${d(avg)} − ${d(((k - 1) * step) / 2)} = ${first} to ${d(avg)} + ${d(((k - 1) * step) / 2)} = ${last}.`,
        ask === 'product' ? `Product = ${first} × ${last} = ${answer}.` : ask === 'next-avg' ? `The next ${k} are each ${k * step} more: average = ${d(avg)} + ${k * step} = ${d(answer)}.` : `The ${ask} number = ${answer}.`,
      ],
      shortcut: `Average = middle term; ends = average ± (k − 1)·step/2.`,
      trap: `Odd/even numbers go up in steps of 2 — count steps, not terms.`,
      tags: ['avg:consecutive'],
    });
  });
}

function twoSets(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('two-sets', 300, () => {
    const kP = rng.int(4, 7);
    const firstP = rng.int(10, 40) * 2;
    const P = Array.from({ length: kP }, (_, i) => firstP + 2 * i);
    const avgP = P.reduce((s, x) => s + x, 0) / kP;
    const gap = rng.pick([3, 5, 7, 9, 11]);
    const kQ = rng.int(4, 8);
    const firstQ = P[kP - 1] + gap; // odd because even + odd
    const Q = Array.from({ length: kQ }, (_, i) => firstQ + 2 * i);
    const avgQ = Q.reduce((s, x) => s + x, 0) / kQ;
    return emit(ctx, {
      facts: { form: 'two-sets', kP, avgP, kQ, gap },
      prompt: `The average of ${kP} consecutive even numbers in set P is ${d(avgP)}. Set Q contains ${kQ} consecutive odd numbers, and the smallest number of Q is ${gap} more than the largest number of P. What is the average of the numbers in set Q?`,
      answer: avgQ,
      format: plain,
      mistakes: [
        { value: avgP + gap + (kQ - 1), why: 'used steps of 1 instead of 2 in set Q', trap: `Odd numbers climb in steps of 2: Q's average is its smallest + ${kQ - 1}, which is ${firstQ} + ${kQ - 1}.` },
        { value: avgP + gap, why: 'shifted P\'s average by the gap' },
        { value: firstQ, why: "gave Q's smallest number" },
        { value: firstQ + 2 * (kQ - 1), why: "gave Q's largest number" },
      ].filter((m) => m.value > 0 && m.value !== avgQ),
      steps: [
        `Largest of P = ${d(avgP)} + ${kP - 1} = ${P[kP - 1]}.`,
        `Smallest of Q = ${P[kP - 1]} + ${gap} = ${firstQ}; largest of Q = ${firstQ} + 2 × ${kQ - 1} = ${Q[kQ - 1]}.`,
        `Average of Q = (${firstQ} + ${Q[kQ - 1]}) ÷ 2 = ${d(avgQ)}.`,
      ],
      shortcut: `Average of an evenly spaced set = (first + last) ÷ 2.`,
      trap: `Find the boundary terms first; the two sets have different sizes, so their averages are not simply shifted by the gap.`,
      tags: ['avg:consecutive', 'level:multi-step'],
    });
  });
}

/* ------------------------------------------------------------------ */
/* 6. Weighted groups                                                   */
/* ------------------------------------------------------------------ */

function groups(ctx: Ctx, n: 2 | 3): Res {
  const { rng } = ctx;
  return attempt('groups', 300, () => {
    const counts = Array.from({ length: n }, () => rng.int(2, 12) * 5);
    const avgs = Array.from({ length: n }, () => rng.int(40, 90));
    const total = counts.reduce((s, c, i) => s + c * avgs[i], 0);
    const N = counts.reduce((s, c) => s + c, 0);
    const ans = total / N;
    if (!twoDp(ans) || new Set(avgs).size < n) return null;
    const simple = avgs.reduce((s, a) => s + a, 0) / n;
    if (Math.abs(simple - ans) < 0.5) return null;
    const labels = ['A', 'B', 'C'];
    return emit(ctx, {
      facts: { form: 'groups', counts, avgs },
      prompt: `In a school, ${counts.map((c, i) => `section ${labels[i]} has ${c} students with an average score of ${avgs[i]}`).join(', ').replace(/, ([^,]*)$/, ' and $1')}. What is the average score of all the students together?`,
      answer: ans,
      format: plain,
      mistakes: [
        { value: simple, why: 'averaged the section averages without weights', trap: `${d(simple)} treats every section equally. Section sizes differ (${counts.join(', ')}), so weight each average by its count.` },
        { value: total / (N - counts[0]), why: 'left one section out of the count' },
        { value: (avgs[0] * counts[1] + avgs[1] * counts[0] + (n === 3 ? avgs[2] * counts[2] : 0)) / N, why: 'paired the averages with the wrong counts' },
      ].filter((m) => m.value > 0 && twoDp(m.value)),
      steps: [`Total score = ${counts.map((c, i) => `${c} × ${avgs[i]}`).join(' + ')} = ${total}.`, `Students = ${counts.join(' + ')} = ${N}.`, `Average = ${total} ÷ ${N} = ${d(ans)}.`],
      shortcut: `Weighted average = Σ(count × average) ÷ Σ count.`,
      trap: `Never average the averages when the groups have different sizes.`,
      tags: ['avg:weighted'],
    });
  });
}

function restCount(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('rest-count', 400, () => {
    const n1 = rng.int(3, 12);
    const a1 = rng.int(20, 40) * 1000;
    const a2 = rng.int(8, 18) * 1000;
    const n2 = rng.int(5, 40);
    const overallNum = n1 * a1 + n2 * a2;
    const N = n1 + n2;
    const overall = overallNum / N;
    if (!whole(overall) || overall % 100 !== 0) return null;
    return emit(ctx, {
      facts: { form: 'rest-count', overall, n1, a1, a2 },
      prompt: `The average monthly salary of all the workers in a factory is ${rs(overall)}. The average salary of the ${n1} technicians is ${rs(a1)} and that of the rest is ${rs(a2)}. How many workers are there in the factory?`,
      answer: N,
      format: plain,
      mistakes: [
        { value: n2, why: 'gave only the non-technicians', trap: `${n2} is the number of the other workers; add the ${n1} technicians.` },
        { value: N + n1, why: 'counted the technicians twice' },
        { value: Math.round((n1 * a1) / overall), why: 'ignored the other workers\' salary' },
      ].filter((m) => m.value > 0),
      steps: [
        `Technicians are ${rs(a1 - overall)} above the average: excess = ${n1} × ${rs(a1 - overall)} = ${rs(n1 * (a1 - overall))}.`,
        `Each other worker is ${rs(overall - a2)} below the average, so there are ${rs(n1 * (a1 - overall))} ÷ ${rs(overall - a2)} = ${n2} of them.`,
        `Total = ${n1} + ${n2} = ${N}.`,
      ],
      shortcut: `Deviation balance (alligation): ${n1} × (${a1} − ${overall}) = rest × (${overall} − ${a2}).`,
      trap: `The deviation method gives the other workers — add the technicians for the total.`,
      tags: ['avg:weighted', 'trick:alligation'],
    });
  });
}

function boysGirls(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('boys-girls', 400, () => {
    const boysAvg = rng.int(50, 80);
    const girlsAvg = rng.int(50, 85);
    if (boysAvg === girlsAvg) return null;
    const boys = rng.int(10, 40);
    const girls = rng.int(10, 40);
    const overall = (boys * boysAvg + girls * girlsAvg) / (boys + girls);
    if (!twoDp(overall) || (overall * 10) % 1 !== 0) return null;
    return emit(ctx, {
      facts: { form: 'boys-girls', boysAvg, girlsAvg, overall, boys },
      prompt: `In a class, the average marks of the boys are ${boysAvg} and of the girls are ${girlsAvg}. The average marks of the whole class are ${d(overall)}. If there are ${boys} boys, how many girls are there?`,
      answer: girls,
      format: plain,
      mistakes: [
        { value: (boys * (girlsAvg - overall)) / (overall - boysAvg), why: 'reversed the alligation ratio', trap: `Boys : girls = (girls' avg − overall) : (overall − boys' avg) = ${d(Math.abs(girlsAvg - overall))} : ${d(Math.abs(overall - boysAvg))} — the distances cross over.` },
        { value: boys + girls, why: 'gave the class strength' },
        { value: boys, why: 'assumed equal numbers' },
      ].filter((m) => m.value > 0 && whole(m.value)),
      steps: [
        `Boys are ${d(Math.abs(overall - boysAvg))} ${boysAvg < overall ? 'below' : 'above'} the average; girls are ${d(Math.abs(girlsAvg - overall))} ${girlsAvg < overall ? 'below' : 'above'}.`,
        `Boys : girls = ${d(Math.abs(girlsAvg - overall))} : ${d(Math.abs(overall - boysAvg))}.`,
        `Girls = ${boys} × ${d(Math.abs(overall - boysAvg))} ÷ ${d(Math.abs(girlsAvg - overall))} = ${girls}.`,
      ],
      shortcut: `Alligation: each group's count is proportional to the OTHER group's distance from the mean.`,
      trap: `The distances cross over in the ratio.`,
      tags: ['avg:weighted', 'trick:alligation'],
    });
  });
}

function groupsCorrected(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('groups-corrected', 400, () => {
    const counts = [rng.int(4, 10) * 5, rng.int(4, 10) * 5, rng.int(4, 10) * 5];
    const avgs = [rng.int(45, 80), rng.int(45, 80), rng.int(45, 80)];
    const which = rng.int(0, 2);
    const short = rng.int(2, 8);
    const N = counts[0] + counts[1] + counts[2];
    const total = counts.reduce((s, c, i) => s + c * avgs[i], 0) + counts[which] * short;
    const ans = total / N;
    if (!twoDp(ans)) return null;
    const labels = ['A', 'B', 'C'];
    const wrongAvg = (total - counts[which] * short) / N;
    return emit(ctx, {
      facts: { form: 'groups-corrected', counts, avgs, which, short },
      prompt: `Sections A, B and C of a school have ${counts.join(', ').replace(/, (\d+)$/, ' and $1')} students with average marks ${avgs.join(', ').replace(/, (\d+)$/, ' and $1')} respectively. It was later found that section ${labels[which]}'s average had been recorded ${short} marks less than its true value. What is the correct average of all the students?`,
      answer: ans,
      format: plain,
      mistakes: [
        { value: wrongAvg + short / 3, why: 'spread the correction over three sections equally', trap: `The correction adds ${short} marks to each of the ${counts[which]} students of section ${labels[which]}: +${counts[which] * short} to the total, over ${N} students.` },
        { value: wrongAvg, why: 'used the recorded (wrong) averages' },
        { value: wrongAvg + short, why: 'added the whole correction to the overall average' },
        { value: (avgs.reduce((s, a) => s + a, 0) + short) / 3, why: 'averaged the section averages without weights' },
      ].filter((m) => m.value > 0),
      steps: [
        `Recorded total = ${counts.map((c, i) => `${c} × ${avgs[i]}`).join(' + ')} = ${total - counts[which] * short}.`,
        `Correction = ${counts[which]} × ${short} = ${counts[which] * short}; true total = ${total}.`,
        `Correct average = ${total} ÷ ${N} = ${d(ans)}.`,
      ],
      shortcut: `Overall average rises by (${counts[which]} × ${short}) ÷ ${N}.`,
      trap: `A section average that is off by ${short} changes the total by ${short} × (its size), not by ${short}.`,
      tags: ['avg:weighted', 'avg:wrong-entry', 'level:multi-step'],
    });
  });
}

function weightedGroups(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'easy') return groups(ctx, 2);
  if (difficulty === 'medium') return restCount(ctx);
  if (difficulty === 'hard') return rng.chance(0.5) ? boysGirls(ctx) : groups(ctx, 3);
  return groupsCorrected(ctx);
}

/* ------------------------------------------------------------------ */

const BUILDERS: Record<string, (ctx: Ctx) => Res> = {
  'add-remove-replace': addRemoveReplace,
  'wrong-entry': wrongEntry,
  cricket,
  'teacher-joins': teacherJoins,
  consecutive,
  'weighted-groups': weightedGroups,
};

export const generator = defineGenerator<AveragesFacts>(META, SUBTYPES, (ctx) => {
  const build = BUILDERS[ctx.subtype.id];
  if (!build) throw new Error(`quant.averages: no builder for ${ctx.subtype.id}`);
  return build(ctx);
});
