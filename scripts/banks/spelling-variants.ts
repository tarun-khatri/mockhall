/**
 * Build src/content/generators/english/spelling/variants.json — plausible misspellings of every curated word.
 *
 *   npx tsx scripts/banks/spelling-variants.ts            # write variants.json
 *   npx tsx scripts/banks/spelling-variants.ts --print    # also print every word with its variants
 *
 * For each word, only the rule families it is tagged with are applied (plus any authored classic forms in `x`).
 * A candidate is kept only if it is NOT a word in the dev dictionary (an-array-of-english-words, ~275k words,
 * which also lists accepted variants such as judgment, benefitted, supercede), NOT another curated word, and NOT
 * an accepted variant spelling of the word (-ise/-ize, -our/-or, -re/-er, ae/e, oe/e, -ll-/-l-, -mme, -gue,
 * -ence/-ense, practice/practise, judgement/judgment…). The runtime ships only the vetted table, never the dictionary.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const DICT_WORDS: string[] = require('an-array-of-english-words');

const DIR = join(import.meta.dirname, '..', '..', 'src', 'content', 'generators', 'english', 'spelling');
const TIERS = ['easy', 'medium', 'hard', 'extreme'] as const;

export type Family = 'dbl' | 'ie' | 'ance' | 'able' | 'sil' | 'vow' | 'sede' | 'e' | 'cs' | 'ord';
export interface WordEntry {
  w: string;
  f: Family[];
  h?: string;
  x?: Record<string, Family>;
}
interface Cand {
  form: string;
  fam: Family;
  score: number;
  /** Produced by a family the word is not tagged with (used only to reach two variants). */
  fallback?: boolean;
}

const VOWELS = 'aeiou';
const isVowel = (c: string | undefined) => !!c && VOWELS.includes(c);
const isCons = (c: string | undefined) => !!c && /[a-z]/.test(c) && !VOWELS.includes(c);
const del = (w: string, i: number, n = 1) => w.slice(0, i) + w.slice(i + n);
const ins = (w: string, i: number, s: string) => w.slice(0, i) + s + w.slice(i);
const rep = (w: string, i: number, n: number, s: string) => w.slice(0, i) + s + w.slice(i + n);

function allMatches(w: string, re: RegExp): RegExpExecArray[] {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  const out: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(w))) {
    out.push(m);
    if (m[0].length === 0) g.lastIndex++;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Rule families                                                        */
/* ------------------------------------------------------------------ */

function doubleConsonant(w: string): Cand[] {
  const out: Cand[] = [];
  const doubles = allMatches(w, /([b-df-hj-np-tv-z])\1/).length;
  for (let i = 1; i < w.length; i++) {
    if (w[i] === w[i - 1] && isCons(w[i])) out.push({ form: del(w, i), fam: 'dbl', score: doubles > 1 ? 10 : 9 });
  }
  for (let i = 1; i < w.length; i++) {
    const c = w[i];
    if (!'cflmnprst'.includes(c) || w[i - 1] === c || w[i + 1] === c) continue;
    // only after a single short vowel (not after a digraph such as 'eo', 'ua', 'ai')
    if (!isVowel(w[i - 1]) || isVowel(w[i - 2])) continue;
    const next = w[i + 1];
    const atEnd = i === w.length - 1;
    if (atEnd ? c !== 'l' : !(isVowel(next) || next === 'l' || next === 'r')) continue;
    // "-atte", "-itte" before a final silent 'e' look nothing like real slips
    if (i === w.length - 2 && next === 'e') continue;
    out.push({ form: ins(w, i, c), fam: 'dbl', score: doubles > 0 ? 8 : 6 });
  }
  return out;
}

function ieEi(w: string): Cand[] {
  const out: Cand[] = [];
  for (const m of allMatches(w, /ie|ei/)) {
    out.push({ form: rep(w, m.index, 2, m[0] === 'ie' ? 'ei' : 'ie'), fam: 'ie', score: 9 });
    // collapse the digraph: believe → belive, receive → recive (not word-initially, not before 'gh')
    if (m.index > 0 && w[m.index + 2] !== 'g') out.push({ form: rep(w, m.index, 2, 'i'), fam: 'ie', score: 7 });
  }
  return out;
}

function anceEnce(w: string): Cand[] {
  const m = w.match(/([ae])(nce|nces|nt|nts|ncy|ntly|ntial|ntially)$/);
  if (!m || m.index === undefined) return [];
  return [{ form: rep(w, m.index, 1, m[1] === 'a' ? 'e' : 'a'), fam: 'ance', score: 9 }];
}

function ableIble(w: string): Cand[] {
  const m = w.match(/([ai])(ble|bly|bility|bilities)$/);
  if (!m || m.index === undefined) return [];
  return [{ form: rep(w, m.index, 1, m[1] === 'a' ? 'i' : 'a'), fam: 'able', score: 9 }];
}

function sedeCeedCede(w: string): Cand[] {
  const m = w.match(/(sede|ceed|cede)(s|d|ing)?$/);
  if (!m || m.index === undefined) return [];
  const alts: Record<string, [string, number][]> = {
    sede: [['cede', 10], ['ceed', 7]],
    ceed: [['cede', 10], ['ceede', 5]],
    cede: [['ceed', 10], ['sede', 8]],
  };
  return alts[m[1]].map(([s, score]) => ({ form: rep(w, m.index!, 4, s), fam: 'sede' as Family, score }));
}

/** Silent letters: [pattern, offset of the letter(s) to drop inside the match, count, score]. */
const SILENT: [RegExp, number, number, number][] = [
  [/nm/, 0, 1, 9], // government, environment
  [/mn$/, 1, 1, 9], // column, condemn
  [/^mn/, 0, 1, 7], // mnemonic
  [/gn/, 0, 1, 9], // foreign, campaign, sovereign, poignant
  [/gm$/, 0, 1, 8], // phlegm
  [/^kn/, 0, 1, 6], // knowledge
  [/ckn/, 1, 1, 8], // acknowledge
  [/wr/, 0, 1, 9], // playwright
  [/mb$/, 1, 1, 8],
  [/bt/, 0, 1, 9], // subtle
  [/^ps/, 0, 1, 6], // psychology
  [/^pn/, 0, 1, 6], // pneumonia
  [/rh/, 1, 1, 9], // rhythm, catarrh, haemorrhage
  [/xh/, 1, 1, 9], // exhaust, exhibition, exhilarate
  [/dg/, 0, 1, 9], // knowledge
  [/sc(?=[eiy])/, 1, 1, 9], // discipline, science, fascinate, descend, adolescent
  [/sc(?=[eiy])/, 0, 1, 6], // dicipline
  [/st(?=en$|le$)/, 1, 1, 8], // listen
  [/cq/, 0, 1, 9], // acquire, acquaintance
  [/(?<=[sye])ch/, 1, 1, 7], // schedule, technique, psychology
  [/^ch(?=r|ara)/, 1, 1, 8], // character, chrysanthemum
  [/phth/, 1, 1, 8], // diphtheria, ophthalmology
  [/d(?=[kw])/, 0, 1, 8], // handkerchief, sandwich
  [/pb/, 0, 1, 8], // cupboard
  [/ipt$/, 1, 1, 8], // receipt
  [/tg/, 0, 1, 9], // mortgage
  [/^isl/, 1, 1, 8], // island
  [/(?<=ns)w/, 0, 1, 9], // answer
  [/lh|kh/, 1, 1, 9], // silhouette, khaki
  [/(?<=[jl])eo/, 1, 1, 8], // jeopardy, leopard
  [/cui/, 1, 1, 8], // biscuit
  [/g(?=u[aei])/, 1, 1, 8], // guarantee, guard, guidance
  [/zv/, 0, 1, 8], // rendezvous
  [/(?<=u)r(?=p)/, 0, 1, 9], // surprise
  [/ngth/, 1, 1, 9], // strength
  [/lfth/, 1, 1, 9], // twelfth
  [/hth$/, 0, 1, 8], // eighth
  [/gh(?=t$|ter)/, 0, 2, 6], // daughter, height
  [/bs(?=c)/, 0, 1, 6],
  [/ae/, 0, 1, 7], // anaesthetic → anesthetic is caught by the variant guard; haemo → hemo too
  [/rrh/, 1, 1, 7],
];

function silentLetter(w: string): Cand[] {
  const out: Cand[] = [];
  for (const [re, off, n, score] of SILENT) {
    for (const m of allMatches(w, re)) out.push({ form: del(w, m.index + off, n), fam: 'sil', score });
  }
  return out;
}

/** First vowel group = the (usually stressed) first syllable: never touched by vowel rules. */
function firstSyllableEnd(w: string): number {
  let i = 0;
  while (i < w.length && !isVowel(w[i])) i++;
  while (i < w.length && isVowel(w[i])) i++;
  return i;
}

function unstressedVowel(w: string): Cand[] {
  const out: Cand[] = [];
  const start = firstSyllableEnd(w);
  const swaps: Record<string, string[]> = { a: ['e', 'i'], e: ['a', 'i'], i: ['e', 'a'], o: ['a', 'e'], u: ['a'] };
  for (let i = start; i < w.length - 1; i++) {
    const c = w[i];
    if (!isVowel(c) || isVowel(w[i - 1]) || isVowel(w[i + 1])) continue;
    const middle = i > 1 && i < w.length - 2;
    for (const r of swaps[c]) {
      let score = 6;
      if ((c === 'o' || c === 'u') && r !== 'a') score -= 1;
      if (c === 'u') score -= 1;
      if ((c === 'i' && r === 'a') || (c === 'a' && r === 'i')) score -= 1;
      // a vowel before r + consonant is usually stressed or r-coloured (govern, interest): swapping it looks odd
      if (w[i + 1] === 'r' && isCons(w[i + 2])) score -= 1;
      if (!middle) score -= 1;
      out.push({ form: rep(w, i, 1, r), fam: 'vow', score });
    }
    // drop an unstressed vowel between consonants (interest → intrest, chocolate → choclate)
    if (isCons(w[i - 1]) && isCons(w[i + 1]) && i < w.length - 2) {
      const cluster = (w[i - 2] && isCons(w[i - 2]) ? 1 : 0) + (isCons(w[i + 2]) ? 1 : 0);
      if (cluster === 0 || 'lr'.includes(w[i + 1]) || 'lr'.includes(w[i - 1])) out.push({ form: del(w, i), fam: 'vow', score: 5 });
    }
  }
  return out;
}

const DICT = new Set(DICT_WORDS);

function silentE(w: string): Cand[] {
  const out: Cand[] = [];
  // drop an 'e' that must stay (noticeable, courageous, achievement, completely, ninety, lonely)
  for (let i = 3; i < w.length - 1; i++) {
    if (w[i] !== 'e' || !isCons(w[i - 1])) continue;
    const rest = w.slice(i + 1);
    if (/^(able|ably|ous|ment|ments|ly|ty|ful|ness|ance|ing|dom)$/.test(rest)) out.push({ form: del(w, i), fam: 'e', score: 9 });
  }
  // insert an 'e' that the base word had but the derived word drops (argument, truly, ninth, desirable, coming)
  const m = w.match(/(able|ably|ible|ment|ly|ing|ous|ance|th)$/);
  if (m && m.index !== undefined) {
    const stem = w.slice(0, m.index);
    if (stem.length >= 3 && !stem.endsWith('e') && DICT.has(stem + 'e')) out.push({ form: stem + 'e' + m[1], fam: 'e', score: 9 });
    // wholly → wholely (stem ends in a doubled letter)
    const s2 = stem.replace(/(.)\1$/, '$1');
    if (s2 !== stem && DICT.has(s2 + 'e')) out.push({ form: s2 + 'e' + m[1], fam: 'e', score: 8 });
  }
  return out;
}

function cSConfusion(w: string): Cand[] {
  const out: Cand[] = [];
  for (let i = 2; i < w.length - 1; i++) {
    const next = w[i + 1];
    if (!'eiy'.includes(next)) continue;
    if (w[i] === 'c' && w[i - 1] !== 's' && w[i - 1] !== 'c') out.push({ form: rep(w, i, 1, 's'), fam: 'cs', score: 7 });
    // s → c only in the classic endings: -asy/-isy (ecstasy, hypocrisy, idiosyncrasy), -sensus (consensus)
    if (w[i] === 's' && w[i - 1] !== 's' && /^(sy|sensus)$/.test(w.slice(i)))
      out.push({ form: rep(w, i, 1, 'c'), fam: 'cs', score: 7 });
  }
  return out;
}

function letterOrder(w: string): Cand[] {
  const out: Cand[] = [];
  for (let i = 1; i < w.length - 1; i++) {
    const a = w[i];
    const b = w[i + 1];
    if (isVowel(a) && isVowel(b) && a !== b && !((a === 'i' && b === 'e') || (a === 'e' && b === 'i')) && !(a === 'e' && b === 'a')) {
      const inFirst = i + 1 < firstSyllableEnd(w) && !(w[i - 1] === 'g' && a === 'u'); // gaurd/gaurantee are real slips
      const atEnd = i + 2 >= w.length;
      out.push({ form: rep(w, i, 2, b + a), fam: 'ord', score: 7 - (inFirst ? 2 : 0) - (atEnd ? 2 : 0) });
    }
  }
  for (const [re, to, score] of [
    [/ght$/, 'gth', 8],
    [/gth$/, 'ght', 8],
    [/hth$/, 'th', 0],
    [/cht$/, 'tch', 8],
  ] as [RegExp, string, number][]) {
    const m = w.match(re);
    if (m && m.index !== undefined && score > 0) out.push({ form: rep(w, m.index, m[0].length, to), fam: 'ord', score });
  }
  // eighth → eigth
  if (/ghth$/.test(w)) out.push({ form: w.replace(/ghth$/, 'gth'), fam: 'ord', score: 8 });
  return out;
}

const RULES: Record<Family, (w: string) => Cand[]> = {
  dbl: doubleConsonant,
  ie: ieEi,
  ance: anceEnce,
  able: ableIble,
  sil: silentLetter,
  vow: unstressedVowel,
  sede: sedeCeedCede,
  e: silentE,
  cs: cSConfusion,
  ord: letterOrder,
};

/* ------------------------------------------------------------------ */
/* Guards                                                               */
/* ------------------------------------------------------------------ */

/**
 * Collapse accepted British/American/variant alternations so that two spellings differing ONLY by them compare
 * equal. Such a pair is never used as "the error".
 */
export function canonical(w: string): string {
  return w
    .replace(/tice$/, 'tise')
    .replace(/is(e|ed|es|ing|er|ers|ation|ations|able|ably)$/, 'iz$1')
    .replace(/isation/g, 'ization')
    .replace(/ys(e|ed|es|ing)$/, 'yz$1')
    .replace(/our/g, 'or')
    .replace(/([bcdgtv])re(s|d)?$/, '$1er$2')
    .replace(/tre/g, 'ter')
    .replace(/ae/g, 'e')
    .replace(/oe/g, 'e')
    .replace(/dgement/g, 'dgment')
    .replace(/ll(ed|ing|er|ers|or|ors|ment|ments|ful|fully)$/, 'l$1')
    .replace(/lful/g, 'llful')
    .replace(/(fil|rol|stil|thral|pal)l$/, '$1')
    .replace(/mme(s)?$/, 'm$1')
    .replace(/gue(s)?$/, 'g$1')
    .replace(/ence(s)?$/, 'ense$1')
    .replace(/eing$/, 'ing')
    .replace(/ogue/g, 'og')
    .replace(/eable$/, 'able');
}

function badShape(form: string): boolean {
  if (!/^[a-z]+$/.test(form)) return true;
  if (/(.)\1\1/.test(form)) return true; // triple letters
  if (/(hh|jj|kk|qq|vv|ww|xx|yy|aa|ii|uu)/.test(form)) return true; // doubles English never uses
  if (/[^aeiouy]{5,}/.test(form)) return true; // unpronounceable cluster
  return false;
}

/* ------------------------------------------------------------------ */
/* Main                                                                 */
/* ------------------------------------------------------------------ */

export function loadWords(): (WordEntry & { d: (typeof TIERS)[number] })[] {
  return TIERS.flatMap((d) => (JSON.parse(readFileSync(join(DIR, `words-${d}.json`), 'utf8')) as WordEntry[]).map((e) => ({ ...e, d })));
}

function main() {
  const print = process.argv.includes('--print');
  const words = loadWords();
  const listSet = new Set(words.map((e) => e.w));
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of words) {
    if (seen.has(e.w)) problems.push(`duplicate word: ${e.w}`);
    seen.add(e.w);
    if (!/^[a-z]+$/.test(e.w)) problems.push(`not lowercase a–z: ${e.w}`);
    if (!DICT.has(e.w)) problems.push(`not in the dev dictionary: ${e.w}`);
  }

  const variants: Record<string, [string, Family][]> = {};
  const dropped: string[] = [];
  for (const e of words) {
    const cands: Cand[] = [];
    for (const [form, fam] of Object.entries(e.x ?? {})) cands.push({ form, fam, score: 11 });
    for (const fam of e.f) cands.push(...RULES[fam](e.w));
    // Untagged families rank one point lower; they only fill a word up to two variants.
    for (const fam of Object.keys(RULES) as Family[]) {
      if (!e.f.includes(fam)) cands.push(...RULES[fam](e.w).map((c) => ({ ...c, score: c.score - 1, fallback: true })));
    }
    const canonWord = canonical(e.w);
    const ok = new Map<string, Cand>();
    for (const c of cands) {
      if (c.form === e.w || badShape(c.form) || DICT.has(c.form) || listSet.has(c.form)) continue;
      if (canonical(c.form) === canonWord) continue;
      // first letter stays, except dropping an initial silent letter (psychology, pneumonia, mnemonic)
      if (c.form[0] !== e.w[0] && !(c.fam === 'sil' && /^(ps|pn|mn)/.test(e.w) && e.w.slice(1) === c.form)) continue;
      if (Math.abs(c.form.length - e.w.length) > 2) continue;
      const prev = ok.get(c.form);
      if (!prev || prev.score < c.score) ok.set(c.form, c);
    }
    const ranked = [...ok.values()].sort((a, b) => b.score - a.score || a.form.localeCompare(b.form));
    const chosen: Cand[] = [];
    const famUsed = new Set<Family>();
    for (const c of ranked) {
      if (chosen.length >= 4) break;
      if (c.fallback || famUsed.has(c.fam) || c.score < 6) continue;
      chosen.push(c);
      famUsed.add(c.fam);
    }
    for (const c of ranked) {
      if (chosen.length >= 4) break;
      if (c.fallback || chosen.includes(c) || c.score < 7) continue;
      chosen.push(c);
    }
    if (chosen.length < 2) {
      for (const c of ranked) if (chosen.length < 2 && !chosen.includes(c) && c.score >= 5) chosen.push(c);
    }
    chosen.sort((a, b) => b.score - a.score || a.form.localeCompare(b.form));
    if (chosen.length < 2) {
      dropped.push(`${e.w} (${chosen.map((c) => c.form).join(', ') || 'none'})`);
      continue;
    }
    variants[e.w] = chosen.map((c) => [c.form, c.fam]);
    if (print) console.log(`${e.d.padEnd(7)} ${e.w.padEnd(18)} ${chosen.map((c) => `${c.form}[${c.fam}${c.score}]`).join('  ')}`);
  }

  const lines = Object.keys(variants)
    .sort()
    .map((w) => `    ${JSON.stringify(w)}: ${JSON.stringify(variants[w])}`);
  const json =
    '{\n' +
    '  "generatedBy": "scripts/banks/spelling-variants.ts",\n' +
    '  "dictionary": "an-array-of-english-words@2.0.0 (MIT, derived from the Letterpress word list)",\n' +
    '  "variants": {\n' +
    lines.join(',\n') +
    '\n  }\n}\n';
  writeFileSync(join(DIR, 'variants.json'), json);

  const total = Object.values(variants).reduce((s, v) => s + v.length, 0);
  const byTier = TIERS.map((d) => `${d}: ${words.filter((e) => e.d === d && variants[e.w]).length}/${words.filter((e) => e.d === d).length}`);
  console.log(`\nwords with variants: ${Object.keys(variants).length}/${words.length} (${byTier.join(', ')}); variants: ${total}`);
  if (dropped.length) console.log(`dropped (< 2 vetted variants): ${dropped.join('; ')}`);
  if (problems.length) {
    console.log(`PROBLEMS:\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
  }
}

// Run only as a script (tests import `canonical` and `loadWords` from this module).
if (/spelling-variants\.ts$/.test(process.argv[1] ?? '')) main();
