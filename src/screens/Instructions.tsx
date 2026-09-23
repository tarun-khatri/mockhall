import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { decodeConfig } from '../exam/configs';
import { prepare } from '../exam/launch';
import { useExam } from '../exam/store';
import type { SectionInput } from '../exam/engine';
import type { TestConfig } from '../content/types';
import { Button, Spinner } from '../components/ui';
import { StatusSwatch, STATUS_LABEL } from '../components/PaletteSheet';
import { loadKatex } from '../lib/katex';

export default function Instructions() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const config = useMemo(() => decodeConfig(params.get('c') ?? ''), [params]);
  const [ready, setReady] = useState<{ config: TestConfig; sections: SectionInput[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!config) return;
    let alive = true;
    void loadKatex();
    setReady(null);
    setError(null);
    prepare(config).then(
      (r) => alive && setReady(r),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [config]);

  if (!config)
    return (
      <main className="px-4 pt-10">
        <h1 className="text-[22px] font-bold">This test link is broken</h1>
        <p className="mt-2 text-ink-2">Ask for the link again, or pick a mock from the Mocks tab.</p>
        <Button variant="primary" className="mt-6" onClick={() => navigate('/mocks')}>
          Go to mocks
        </Button>
      </main>
    );

  const timed = config.kind !== 'practice';
  const total = ready ? ready.sections.reduce((s, x) => s + x.questions.length, 0) : config.sections.reduce((s, x) => s + x.count, 0);
  const secs = ready ? ready.config.sections : config.sections;
  const minutes = secs.reduce((s, x) => s + x.seconds, 0) / 60;

  const start = async () => {
    if (!ready) return;
    setStarting(true);
    const id = await useExam.getState().begin(ready.config, ready.sections);
    navigate(`/test/${id}`, { replace: true });
  };

  return (
    <main className="flex min-h-dvh flex-col px-4 pt-2">
      <button type="button" onClick={() => navigate(-1)} className="-ml-1 flex min-h-11 items-center gap-1 self-start font-semibold text-pen">
        <ChevronLeft size={20} aria-hidden /> Back
      </button>
      <h1 className="text-[24px] font-bold leading-tight">{config.title}</h1>
      <p className="tnum mt-1 text-ink-2">
        {total} questions{minutes ? ` · ${Math.round(minutes)} minutes` : ''}
      </p>

      <div className="mt-4 overflow-hidden rounded-[12px] border border-line bg-surface">
        <table className="tnum w-full text-[15px]">
          <thead>
            <tr className="bg-paper text-left text-[13px] text-ink-2">
              <th scope="col" className="px-3 py-2 font-semibold">Section</th>
              <th scope="col" className="px-3 py-2 font-semibold">Questions</th>
              <th scope="col" className="px-3 py-2 font-semibold">Time</th>
            </tr>
          </thead>
          <tbody>
            {secs.map((s, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-3 py-2">{s.title}</td>
                <td className="px-3 py-2">{ready ? ready.sections[i].questions.length : s.count}</td>
                <td className="px-3 py-2">{s.seconds ? `${Math.round(s.seconds / 60)} min` : 'Untimed'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[15px]">
        <li>Each question has 5 options. +1 for a correct answer, −0.25 for a wrong answer, 0 if you leave it.</li>
        {config.sectionalTiming ? <li>Each section has its own 20-minute timer. When it ends, the next section opens automatically and you cannot go back.</li> : null}
        {timed && config.strictTimer ? <li>The timer keeps running even if you leave the app or lock the phone, like the real exam.</li> : null}
        <li>
          An answer counts only after you tap <strong>Save &amp; next</strong> or <strong>Mark for review &amp; next</strong>. If you move away with the palette or Previous, an unsaved choice is dropped.
        </li>
        <li>Answered &amp; marked for review questions are evaluated.</li>
      </ul>

      <ul className="mt-4 grid grid-cols-2 gap-2 text-[14px]" aria-label="Palette legend">
        {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((st) => (
          <li key={st} className="flex items-center gap-2">
            <StatusSwatch status={st}>1</StatusSwatch>
            <span className="leading-tight">{STATUS_LABEL[st]}</span>
          </li>
        ))}
      </ul>

      <div className="flex-1" />
      <div className="safe-bottom sticky bottom-0 -mx-4 mt-6 border-t border-line bg-paper px-4 pt-3 pb-3">
        {error ? <p className="mb-2 text-[15px] text-not-answered">{error}</p> : null}
        {!ready && !error ? <Spinner label="Preparing your paper" /> : null}
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" className="h-5 w-5 accent-[var(--pen)]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I have read the instructions</span>
        </label>
        <Button variant="primary" className="mt-2 w-full" disabled={!ready || !agreed || starting} onClick={() => void start()}>
          {starting ? 'Starting…' : 'Start test'}
        </Button>
      </div>
    </main>
  );
}
