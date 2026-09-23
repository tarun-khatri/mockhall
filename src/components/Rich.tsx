import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { parseRich, type Block, type Inline } from '../content/rich';
import { katexReady, loadKatex, onKatexReady, renderTex } from '../lib/katex';

function hasMath(blocks: Block[]): boolean {
  const walk = (nodes: Inline[]): boolean => nodes.some((n) => n.t === 'math' || ((n.t === 'b' || n.t === 'i') && walk(n.c)));
  return blocks.some((b) => (b.t === 'p' ? walk(b.c) : b.items.some(walk)));
}

function renderInline(nodes: Inline[], key = ''): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}${i}`;
    switch (n.t) {
      case 'text':
        return n.v;
      case 'br':
        return <br key={k} />;
      case 'b':
        return <strong key={k} className="font-semibold">{renderInline(n.c, k)}</strong>;
      case 'i':
        return <em key={k}>{renderInline(n.c, k)}</em>;
      case 'math': {
        const html = renderTex(n.v);
        return html ? (
          <span key={k} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span key={k} className="tnum">{n.v.replace(/\\(frac|sqrt|times|div|left|right)/g, ' ')}</span>
        );
      }
    }
  });
}

interface RichProps {
  text: string;
  className?: string;
  /** Render inline (no paragraph wrappers) — for option rows and short labels. */
  inline?: boolean;
}

export const Rich = memo(function Rich({ text, className, inline }: RichProps) {
  const blocks = useMemo(() => parseRich(text), [text]);
  const needsMath = useMemo(() => hasMath(blocks), [blocks]);
  const [, setReady] = useState(katexReady());

  useEffect(() => {
    if (!needsMath || katexReady()) return;
    const off = onKatexReady(() => setReady(true));
    void loadKatex();
    return () => {
      off();
    };
  }, [needsMath]);

  if (inline) {
    const nodes = blocks.flatMap((b, i) => (b.t === 'p' ? [...(i ? [<br key={`sep${i}`} />] : []), ...renderInline(b.c, `${i}-`)] : b.items.flatMap((it, j) => renderInline(it, `${i}-${j}-`))));
    return <span className={className}>{nodes}</span>;
  }
  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.t === 'p' ? (
          <p key={i} className={i ? 'mt-3' : undefined}>
            {renderInline(b.c, `${i}-`)}
          </p>
        ) : (
          <ul key={i} className={`list-disc pl-5 ${i ? 'mt-2' : ''} space-y-1`}>
            {b.items.map((it, j) => (
              <li key={j}>{renderInline(it, `${i}-${j}-`)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
});
