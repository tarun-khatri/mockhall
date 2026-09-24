import { useNavigate } from 'react-router';
import { useState } from 'react';
import { useAsync } from '../app/useAsync';
import { listAttempts, readLog } from '../lib/storage';
import { chapterStats, mastery, bySubject, byChapter, weakAreas } from '../analytics';
import { CHAPTERS, SUBJECT_TITLE, chapterMeta } from '../content/chapters';
import type { Subject } from '../content/types';
import { plain, shortDuration } from '../lib/format';
import { Button, SectionHeading, Spinner } from '../components/ui';
import { chapterConfig } from '../exam/configs';
import { launch } from '../exam/launch';
import { launchWeakMix } from '../exam/weakMix';
import { useSettings } from '../app/settings';

export default function Progress() {
  const navigate = useNavigate();
  const exam = useSettings((s) => s.settings.targetExam);
  const { data, loading } = useAsync(async () => ({ log: await readLog(), attempts: await listAttempts() }), []);
  const [busy, setBusy] = useState<string | null>(null);
  if (loading || !data) return <Spinner label="Loading progress" />;
  const { log, attempts } = data;

  if (!log.length)
    return (
      <main className="px-4 pt-4">
        <h1 className="text-[24px] font-bold">Progress</h1>
        <p className="mt-3 text-ink-2">Nothing here yet. Finish a mock or a chapter test and your accuracy, speed and weak areas will show up here.</p>
      </main>
    );

  const subjects = bySubject(log);
  const chapters = chapterStats(log);
  const perChapter = byChapter(log);
  const weak = weakAreas(log, 5);
  const mocks = attempts.filter((a) => a.kind === 'full-mock' && a.status === 'submitted' && a.score !== undefined).slice(0, 20);

  const drill = async (chapter: string, subtype: string) => {
    setBusy(`${chapter}|${subtype}`);
    try {
      const id = await launch(chapterConfig({ chapter: chapter as never, exam, count: 10, difficulty: 'medium', mode: 'practice', pace: 'untimed', subtypes: [subtype] }));
      navigate(`/test/${id}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="px-4 pt-4 pb-8">
      <h1 className="text-[24px] font-bold">Progress</h1>

      <SectionHeading>By subject</SectionHeading>
      <ul className="divide-y divide-line">
        {(['quant', 'reasoning', 'english'] as Subject[]).map((s) => {
          const entries = subjects[s];
          const answered = entries.filter((e) => e.outcome !== 'skipped');
          const acc = answered.length ? answered.filter((e) => e.outcome === 'correct').length / answered.length : 0;
          return (
            <li key={s} className="tnum flex min-h-12 items-center justify-between py-2">
              <span className="font-semibold">{SUBJECT_TITLE[s]}</span>
              <span className="text-[14px] text-ink-2">
                {entries.length ? `${entries.length} done · ${Math.round(acc * 100)}% accuracy · mastery ${Math.round(mastery(entries) * 100)}` : 'Not started'}
              </span>
            </li>
          );
        })}
      </ul>

      {weak.length ? (
        <>
          <SectionHeading>Weakest 5 by marks at stake</SectionHeading>
          <Button variant="primary" className="mb-2 w-full" disabled={!!busy} onClick={async () => { setBusy('mix'); try { navigate(`/test/${await launchWeakMix(exam)}`); } finally { setBusy(null); } }}>
            {busy === 'mix' ? 'Preparing…' : 'Practise a weak-area mix'}
          </Button>
          <ul className="divide-y divide-line">
            {weak.map((w) => (
              <li key={`${w.chapter}|${w.subtype}`} className="flex min-h-14 items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{chapterMeta(w.chapter).title}</span>
                  <span className="tnum block text-[13px] text-ink-2">
                    {w.subtype.replace(/-/g, ' ')} · {Math.round(w.stat.accuracy * 100)}% of {w.stat.attempted} attempted
                  </span>
                </span>
                <Button className="min-h-10 px-3 text-[14px]" onClick={() => void drill(w.chapter, w.subtype)} disabled={!!busy}>
                  {busy === `${w.chapter}|${w.subtype}` ? '…' : 'Drill'}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {mocks.length ? (
        <>
          <SectionHeading>Mock scores (latest first)</SectionHeading>
          <ul className="divide-y divide-line">
            {mocks.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => navigate(`/result/${m.id}`)} className="tnum flex min-h-12 w-full items-center justify-between py-2 text-left">
                  <span>
                    <span className="font-semibold">{m.title}</span>
                    <span className="block text-[13px] text-ink-2">{m.sections.map((s) => `${s.title.split(' ')[0]} ${plain(s.score ?? 0)}`).join(' · ')}</span>
                  </span>
                  <span className="font-bold">
                    {plain(m.score ?? 0)}/{m.maxScore}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <SectionHeading>Chapters</SectionHeading>
      <div className="x-scroll rounded-[12px] border border-line bg-surface">
        <table className="tnum w-full min-w-[340px] text-[14px]">
          <thead>
            <tr className="bg-paper text-left text-[13px] text-ink-2">
              <th scope="col" className="px-3 py-2 font-semibold">Chapter</th>
              <th scope="col" className="px-2 py-2 font-semibold">Done</th>
              <th scope="col" className="px-2 py-2 font-semibold">Acc.</th>
              <th scope="col" className="px-2 py-2 font-semibold">Median / target</th>
            </tr>
          </thead>
          <tbody>
            {CHAPTERS.filter((c) => chapters.has(c.id)).map((c) => {
              const s = chapters.get(c.id)!;
              return (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-3 py-2">
                    {c.title}
                    <span className="block text-[12px] text-ink-2">mastery {Math.round(mastery(perChapter.get(c.id) ?? []) * 100)}</span>
                  </td>
                  <td className="px-2 py-2">{s.seen}</td>
                  <td className="px-2 py-2">{s.attempted ? `${Math.round(s.accuracy * 100)}%` : '—'}</td>
                  <td className="px-2 py-2">
                    {shortDuration(s.medianMs / 1000)} / {shortDuration(s.medianTarget)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[13px] text-ink-2">Mastery weights accuracy by difficulty: hard and extreme questions count more.</p>
    </main>
  );
}
