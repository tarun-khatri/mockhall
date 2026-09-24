import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAsync } from '../app/useAsync';
import { loadAttempt } from '../lib/storage';
import * as E from '../exam/engine';
import type { Attempt, ChapterId, Question } from '../content/types';
import { chapterMeta } from '../content/chapters';
import { plain, shortDuration } from '../lib/format';
import { Button, SectionHeading, Spinner } from '../components/ui';
import { encodeConfig, chapterConfig } from '../exam/configs';
import { launch } from '../exam/launch';
import { launchWeakMix } from '../exam/weakMix';
import { useSettings } from '../app/settings';

/** Good attempts reported by coaching analyses (SPEC 3.3) — not official cut-offs. */
const BENCHMARKS = [
  { label: 'SBI Clerk 16 Sep 2026, shift 1', english: [25, 28], quant: [23, 26], reasoning: [26, 29], overall: [74, 83] },
  { label: 'SBI Clerk 27 Sep 2025, shift 2', english: [23, 25], quant: [25, 28], reasoning: [26, 29], overall: [74, 82] },
  { label: 'IBPS Clerk 4 Oct 2025, shift 1', overall: [70, 76] },
] as const;

const OUTCOME_COLOR: Record<E.Outcome, string> = { correct: 'bg-answered', wrong: 'bg-not-answered', skipped: 'bg-not-visited' };

function TimeMap({ attempt, section, onOpen }: { attempt: Attempt; section: number; onOpen: (i: number) => void }) {
  const byId = E.questionById(attempt);
  const ids = attempt.sectionQuestionIds[section];
  const times = ids.map((id) => attempt.responses[id]?.activeMs ?? 0);
  const max = Math.max(1, ...times);
  return (
    <div>
      <div className="flex h-20 items-end gap-[2px]" role="list" aria-label="Time per question">
        {ids.map((id, i) => {
          const q = byId.get(id)!;
          const o = E.outcomeOf(q, attempt.responses[id]);
          const h = Math.max(4, Math.round((times[i] / max) * 80));
          return (
            <button
              key={id}
              type="button"
              role="listitem"
              onClick={() => onOpen(i)}
              aria-label={`Question ${i + 1}: ${o}, ${shortDuration(times[i] / 1000)}`}
              className={`min-w-0 flex-1 rounded-t-[3px] ${OUTCOME_COLOR[o]}`}
              style={{ height: h }}
            />
          );
        })}
      </div>
      <div className="tnum mt-1 flex justify-between text-[12px] text-ink-2">
        <span>Q1</span>
        <span>Q{ids.length}</span>
      </div>
    </div>
  );
}

export default function Result() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const exam = useSettings((s) => s.settings.targetExam);
  const { data: attempt, loading } = useAsync(() => loadAttempt(id), [id]);
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => (attempt ? E.scoreAttempt(attempt) : null), [attempt]);

  if (loading) return <Spinner label="Loading result" />;
  if (!attempt || !summary)
    return (
      <main className="px-4 pt-10">
        <h1 className="text-[22px] font-bold">Result not found</h1>
        <Link to="/" className="mt-4 inline-block font-semibold text-pen">
          Go home
        </Link>
      </main>
    );

  const isMock = attempt.config.kind === 'full-mock' || attempt.config.kind === 'sectional';
  const wrong = summary.wrong;
  const withoutWrong = summary.correct;

  // Time sinks: most time relative to target, wrong ones first.
  const sinks = attempt.questions
    .map((q, idx) => ({ q, idx, r: attempt.responses[q.id], o: E.outcomeOf(q, attempt.responses[q.id]) }))
    .filter((x) => (x.r?.activeMs ?? 0) > 0)
    .map((x) => ({ ...x, over: (x.r!.activeMs / 1000) - x.q.targetSeconds }))
    .sort((a, b) => (b.o === 'wrong' ? 1 : 0) - (a.o === 'wrong' ? 1 : 0) || b.over - a.over)
    .filter((x) => x.over > 0)
    .slice(0, 5);

  // Topic table: chapter/subtype rows sorted by marks lost.
  const topics = new Map<string, { chapter: ChapterId; subtype: string; qs: Question[] }>();
  for (const q of attempt.questions) {
    const k = `${q.chapter}|${q.subtype}`;
    const t = topics.get(k) ?? { chapter: q.chapter, subtype: q.subtype, qs: [] };
    t.qs.push(q);
    topics.set(k, t);
  }
  const topicRows = [...topics.values()]
    .map((t) => {
      let correct = 0;
      let wrongN = 0;
      let ms = 0;
      let target = 0;
      for (const q of t.qs) {
        const o = E.outcomeOf(q, attempt.responses[q.id]);
        if (o === 'correct') correct++;
        if (o === 'wrong') wrongN++;
        ms += attempt.responses[q.id]?.activeMs ?? 0;
        target += q.targetSeconds;
      }
      const score = correct - 0.25 * wrongN;
      return { ...t, correct, wrong: wrongN, attempted: correct + wrongN, lost: t.qs.length - score, avgMs: ms / t.qs.length, avgTarget: target / t.qs.length };
    })
    .sort((a, b) => b.lost - a.lost);

  const qIndexInSection = (qid: string) => {
    for (let s = 0; s < attempt.sectionQuestionIds.length; s++) {
      const i = attempt.sectionQuestionIds[s].indexOf(qid);
      if (i >= 0) return { s, i };
    }
    return { s: 0, i: 0 };
  };
  const openSolution = (qid: string) => {
    const flat = attempt.sectionQuestionIds.flat().indexOf(qid);
    navigate(`/solutions/${attempt.id}?i=${flat}`);
  };

  const practiseWeak = async () => {
    if (isMock) {
      setBusy(true);
      try {
        navigate(`/test/${await launchWeakMix(exam)}`);
        return;
      } catch {
        /* not enough history yet — fall back to this paper's weakest topic */
      } finally {
        setBusy(false);
      }
    }
    const weakest = topicRows.find((t) => t.lost > 0) ?? topicRows[0];
    if (!weakest) return;
    setBusy(true);
    try {
      const newId = await launch(chapterConfig({ chapter: weakest.chapter, exam, count: 10, difficulty: 'medium', mode: 'practice', pace: 'untimed', subtypes: [weakest.subtype] }));
      navigate(`/test/${newId}`);
    } catch {
      const newId = await launch(chapterConfig({ chapter: weakest.chapter, exam, count: 10, difficulty: 'medium', mode: 'practice', pace: 'untimed', subtypes: [] }));
      navigate(`/test/${newId}`);
    } finally {
      setBusy(false);
    }
  };

  const shareUrl = `${location.origin}${import.meta.env.BASE_URL}t/${encodeConfig(attempt.config)}`;

  return (
    <main className="px-4 pt-4 pb-10">
      <p className="text-[14px] text-ink-2">{attempt.config.title}</p>
      <h1 className="tnum text-[30px] font-bold leading-tight">
        {plain(summary.score)} <span className="text-[20px] font-semibold text-ink-2">/ {summary.maxScore}</span>
      </h1>
      <p className="tnum mt-1 text-[15px]">
        <span className="font-semibold text-answered">{summary.correct} correct</span> · <span className="font-semibold text-not-answered">{summary.wrong} wrong</span> · {summary.skipped} skipped · {Math.round(summary.accuracy * 100)}% accuracy
      </p>

      {summary.sections.length > 1 || isMock ? (
        <div className="mt-4 overflow-hidden rounded-[12px] border border-line bg-surface">
          <table className="tnum w-full text-[14px]">
            <thead>
              <tr className="bg-paper text-left text-[13px] text-ink-2">
                <th scope="col" className="px-3 py-2 font-semibold">Section</th>
                <th scope="col" className="px-2 py-2 font-semibold">Score</th>
                <th scope="col" className="px-2 py-2 font-semibold">Attempted</th>
                <th scope="col" className="px-2 py-2 font-semibold">Time</th>
              </tr>
            </thead>
            <tbody>
              {summary.sections.map((s) => (
                <tr key={s.index} className="border-t border-line">
                  <td className="px-3 py-2">{s.title}</td>
                  <td className="px-2 py-2 font-semibold">
                    {plain(s.score)}/{s.maxScore}
                  </td>
                  <td className="px-2 py-2">
                    {s.attempted} ({s.correct}✓ {s.wrong}✗)
                  </td>
                  <td className="px-2 py-2">{shortDuration(s.timeUsedMs / 1000)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {isMock && !Object.values(attempt.config.variants ?? {}).some((v) => v?.endsWith('-M')) ? (
        <>
          <SectionHeading>Attempts vs good attempts</SectionHeading>
          <div className="rounded-[12px] border border-line bg-surface p-3 text-[14px]">
            <p className="tnum">
              Your attempts: <strong>{summary.attempted}</strong>
              {summary.sections.length > 1 ? ` (${summary.sections.map((s) => `${s.title.split(' ')[0]} ${s.attempted}`).join(', ')})` : ''}
            </p>
            <ul className="tnum mt-2 space-y-1 text-ink-2">
              {BENCHMARKS.map((b) => {
                const sec = summary.sections.length === 1 ? summary.sections[0].subject : null;
                const range = sec ? (b as unknown as Record<string, readonly [number, number] | undefined>)[sec] : b.overall;
                if (!range) return null;
                return (
                  <li key={b.label}>
                    {b.label}: {range[0]}–{range[1]}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[13px] text-ink-2">Good attempts reported by coaching analyses — not official cut-offs. Cut-offs vary by state and category.</p>
          </div>
        </>
      ) : null}

      <SectionHeading>Negative marking</SectionHeading>
      <div className="rounded-[12px] border border-line bg-surface p-3 text-[15px]">
        {wrong ? (
          <p>
            Wrong answers cost you <strong className="tnum">{plain(summary.negativeMarks)}</strong> marks. Skipping your {wrong} wrong answer{wrong === 1 ? '' : 's'} would have scored <strong className="tnum">{withoutWrong}</strong>.
          </p>
        ) : (
          <p>No marks lost to negative marking.</p>
        )}
        {summary.attempted ? (
          <p className="tnum mt-2 text-ink-2">
            {[0.6, 0.7].map((f, k) => {
              const target = Math.round(summary.maxScore * f);
              const acc = E.accuracyNeeded(target, summary.attempted);
              return (
                <span key={f} className="block">
                  {k === 0 ? 'At' : 'At'} {summary.attempted} attempts, reaching {target} needs {acc === null ? 'more attempts' : `${Math.ceil(acc * 100)}% accuracy`}.
                </span>
              );
            })}
          </p>
        ) : null}
      </div>

      <SectionHeading>Time map</SectionHeading>
      <p className="mb-2 text-[13px] text-ink-2">One bar per question: height is time spent. Green correct, red wrong, grey skipped. Tap a bar for its solution.</p>
      <div className="space-y-4">
        {attempt.sectionQuestionIds.map((_, s) => (
          <div key={s}>
            {attempt.sectionQuestionIds.length > 1 ? <p className="mb-1 text-[14px] font-semibold">{attempt.config.sections[s].title}</p> : null}
            <TimeMap attempt={attempt} section={s} onOpen={(i) => openSolution(attempt.sectionQuestionIds[s][i])} />
          </div>
        ))}
      </div>

      {sinks.length ? (
        <>
          <SectionHeading>Time sinks</SectionHeading>
          <ul className="divide-y divide-line">
            {sinks.map(({ q, r, o }) => {
              const pos = qIndexInSection(q.id);
              return (
                <li key={q.id}>
                  <button type="button" onClick={() => openSolution(q.id)} className="flex min-h-12 w-full items-center gap-2 py-2 text-left text-[15px]">
                    <span className="tnum font-semibold">Q{pos.i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{chapterMeta(q.chapter).title}</span>
                    <span className="tnum text-ink-2">
                      {shortDuration(r!.activeMs / 1000)} vs {shortDuration(q.targetSeconds)}
                    </span>
                    <span className={`text-[13px] font-semibold ${o === 'wrong' ? 'text-not-answered' : o === 'correct' ? 'text-answered' : 'text-ink-2'}`}>{o}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <SectionHeading>Topics</SectionHeading>
      <div className="x-scroll rounded-[12px] border border-line bg-surface">
        <table className="tnum w-full min-w-[340px] text-[14px]">
          <thead>
            <tr className="bg-paper text-left text-[13px] text-ink-2">
              <th scope="col" className="px-3 py-2 font-semibold">Topic</th>
              <th scope="col" className="px-2 py-2 font-semibold">Done</th>
              <th scope="col" className="px-2 py-2 font-semibold">Acc.</th>
              <th scope="col" className="px-2 py-2 font-semibold">Avg / target</th>
            </tr>
          </thead>
          <tbody>
            {topicRows.map((t) => (
              <tr key={`${t.chapter}|${t.subtype}`} className="border-t border-line">
                <td className="px-3 py-2">
                  {chapterMeta(t.chapter).title}
                  <span className="block text-[12px] text-ink-2">{t.subtype.replace(/-/g, ' ')}</span>
                </td>
                <td className="px-2 py-2">
                  {t.attempted}/{t.qs.length}
                </td>
                <td className="px-2 py-2">{t.attempted ? `${Math.round((t.correct / t.attempted) * 100)}%` : '—'}</td>
                <td className="px-2 py-2">
                  {shortDuration(t.avgMs / 1000)} / {shortDuration(t.avgTarget)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-2">
        <Button variant="primary" onClick={() => navigate(`/solutions/${attempt.id}`)}>
          View solutions
        </Button>
        <Button onClick={() => navigate(`/start?c=${encodeConfig(attempt.config)}`)}>Reattempt</Button>
        <Button onClick={() => void practiseWeak()} disabled={busy}>
          {busy ? 'Preparing…' : 'Practise weak topics'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (navigator.share) void navigator.share({ title: attempt.config.title, url: shareUrl }).catch(() => undefined);
            else void navigator.clipboard?.writeText(shareUrl);
          }}
        >
          Share this paper
        </Button>
        <Link to="/" className="flex min-h-12 items-center justify-center font-semibold text-pen">
          Home
        </Link>
      </div>
    </main>
  );
}
