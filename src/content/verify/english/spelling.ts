/**
 * Independent verifier for english.spelling.
 *
 * Method: look only at what the candidate sees (the bold words in the prompt / the listed options) and check
 * each word against the curated list of CORRECT spellings. It never consults the misspelling table the
 * generator draws from: an option is misspelt iff it is not a correct word. Exactly one misspelt option
 * → that option is the key; none → "All correct"; more than one → the item is broken (throws).
 *
 * Imports only pure data (the word-list JSON) and the rich-text parser — no generator code.
 */
import type { GenResult } from '../../generators/types';
import type { SpellingFacts } from '../../generators/english/spelling';
import { parseRich, type Inline } from '../../rich';
import easy from '../../generators/english/spelling/words-easy.json';
import medium from '../../generators/english/spelling/words-medium.json';
import hard from '../../generators/english/spelling/words-hard.json';
import extreme from '../../generators/english/spelling/words-extreme.json';

const CORRECT: ReadonlySet<string> = new Set([...easy, ...medium, ...hard, ...extreme].map((e: { w: string }) => e.w));
const ALL_CORRECT = 'All correct';

function boldTexts(src: string): string[] {
  const out: string[] = [];
  const text = (nodes: Inline[]): string =>
    nodes.map((n) => (n.t === 'text' ? n.v : n.t === 'b' || n.t === 'i' ? text(n.c) : n.t === 'math' ? n.v : ' ')).join('');
  const walk = (nodes: Inline[]) => {
    for (const n of nodes) {
      if (n.t === 'b') out.push(text(n.c));
      else if (n.t === 'i') walk(n.c);
    }
  };
  for (const b of parseRich(src)) {
    if (b.t === 'p') walk(b.c);
    else b.items.forEach(walk);
  }
  return out;
}

export function verify(res: GenResult<SpellingFacts>): (number | string)[] {
  return res.item.questions.map((q) => {
    if (q.options[4] !== ALL_CORRECT) throw new Error(`option E must be "${ALL_CORRECT}", got "${q.options[4]}"`);
    const shown = q.options.slice(0, 4).map((o) => o.trim());
    for (const w of shown) if (!/^[a-z]+$/.test(w)) throw new Error(`option "${w}" is not a single lowercase word`);
    if (shown.join('|') !== res.facts.shown.join('|')) throw new Error('options disagree with facts.shown');

    if (res.facts.frameId !== null) {
      // bold-in-sentence: the options must be exactly the bold words, in sentence order
      const bold = boldTexts(q.prompt).map((b) => b.trim());
      if (bold.length !== 4) throw new Error(`expected 4 bold words, found ${bold.length}`);
      if (bold.join('|') !== shown.join('|')) throw new Error(`bold words ${bold.join(',')} differ from options ${shown.join(',')}`);
    }

    const misspelt = shown.filter((w) => !CORRECT.has(w));
    if (misspelt.length > 1) throw new Error(`more than one misspelt option: ${misspelt.join(', ')}`);
    return misspelt.length === 1 ? misspelt[0] : ALL_CORRECT;
  });
}
