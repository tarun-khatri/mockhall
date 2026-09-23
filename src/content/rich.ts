/**
 * Parser for Rich text (see Rich in ./types.ts). Pure — used by the renderer, content tests and QA.
 *
 * Grammar:
 *  - Blocks: paragraphs split by blank lines; inside a paragraph single newlines are line breaks;
 *    lines starting with "- " form bullet lists.
 *  - Inline: **bold**, *italic*, $tex$ (KaTeX), escapes \$ \* \\.
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b'; c: Inline[] }
  | { t: 'i'; c: Inline[] }
  | { t: 'math'; v: string }
  | { t: 'br' };

export type Block = { t: 'p'; c: Inline[] } | { t: 'ul'; items: Inline[][] };

function findUnescaped(src: string, token: string, from: number): number {
  let i = from;
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2;
      continue;
    }
    if (src.startsWith(token, i)) {
      // a single "*" must not be part of "**"
      if (token === '*' && (src[i + 1] === '*' || (i > 0 && src[i - 1] === '*' && src[i - 2] !== '\\'))) {
        i += 1;
        continue;
      }
      return i;
    }
    i++;
  }
  return -1;
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length && '$*\\'.includes(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '\n') {
      flush();
      out.push({ t: 'br' });
      i++;
      continue;
    }
    if (ch === '$') {
      const end = findUnescaped(src, '$', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: 'math', v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (src.startsWith('**', i)) {
      const end = findUnescaped(src, '**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: 'b', c: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (ch === '*' && src[i + 1] !== '*' && src[i + 1] !== ' ' && i + 1 < src.length) {
      const end = findUnescaped(src, '*', i + 1);
      if (end > i + 1 && src[end - 1] !== ' ') {
        flush();
        out.push({ t: 'i', c: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

export function parseRich(src: string): Block[] {
  const text = src.replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  const blocks: Block[] = [];
  for (const para of text.split(/\n{2,}/)) {
    const lines = para.split('\n');
    let pLines: string[] = [];
    let items: Inline[][] = [];
    const flushP = () => {
      if (pLines.length) blocks.push({ t: 'p', c: parseInline(pLines.join('\n')) });
      pLines = [];
    };
    const flushUl = () => {
      if (items.length) blocks.push({ t: 'ul', items });
      items = [];
    };
    for (const line of lines) {
      if (/^- /.test(line)) {
        flushP();
        items.push(parseInline(line.slice(2)));
      } else {
        flushUl();
        pLines.push(line);
      }
    }
    flushP();
    flushUl();
  }
  return blocks;
}

function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case 'text':
          return n.v;
        case 'math':
          return n.v;
        case 'br':
          return ' ';
        default:
          return inlineText(n.c);
      }
    })
    .join('');
}

/** Formatting stripped (math kept as its TeX source). */
export function plainText(src: string): string {
  return parseRich(src)
    .map((b) => (b.t === 'p' ? inlineText(b.c) : b.items.map(inlineText).join(' ')))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** All $…$ TeX segments, for KaTeX validation. */
export function mathSegments(src: string): string[] {
  const out: string[] = [];
  const walk = (nodes: Inline[]) => {
    for (const n of nodes) {
      if (n.t === 'math') out.push(n.v);
      else if (n.t === 'b' || n.t === 'i') walk(n.c);
    }
  };
  for (const b of parseRich(src)) {
    if (b.t === 'p') walk(b.c);
    else b.items.forEach(walk);
  }
  return out;
}

/**
 * Normalised option text for distinctness checks (SPEC 7.4: trim, case, numeric value).
 * "₹1,20,000" and "120000" normalise to the same key; "12%" stays distinct from "12".
 */
export function normaliseOption(src: string): string {
  const s = plainText(src).toLowerCase().replace(/\s+/g, ' ').trim();
  const compact = s.replace(/[₹,\s]/g, '').replace(/^rs\.?/, '');
  const m = compact.match(/^(-?\d+(?:\.\d+)?)(%|°)?$/);
  if (m) return String(parseFloat(m[1])) + (m[2] ?? '');
  return s;
}
