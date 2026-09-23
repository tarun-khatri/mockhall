/** KaTeX is lazy-loaded (≈75 KB gz) so the home screen stays inside the initial-JS budget. */
type Katex = typeof import('katex').default;

let mod: Katex | null = null;
let loading: Promise<Katex> | null = null;
const cache = new Map<string, string>();
const listeners = new Set<() => void>();

export function loadKatex(): Promise<Katex> {
  if (!loading) {
    loading = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => {
      mod = (m as unknown as { default: Katex }).default ?? (m as unknown as Katex);
      listeners.forEach((l) => l());
      return mod;
    });
    loading.catch(() => (loading = null));
  }
  return loading;
}

export function katexReady(): boolean {
  return mod !== null;
}

export function onKatexReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function renderTex(tex: string): string | null {
  if (!mod) return null;
  let html = cache.get(tex);
  if (html === undefined) {
    html = mod.renderToString(tex, { throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' });
    cache.set(tex, html);
  }
  return html;
}
