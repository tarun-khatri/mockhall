import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router';
import { Bookmark, BookmarkCheck, ChevronLeft, Grid3x3, MoreVertical, Pause, PencilLine, Play } from 'lucide-react';
import { RoughPad } from '../components/RoughPad';
import { useExam } from '../exam/store';
import * as E from '../exam/engine';
import { OptionRow, type OptionState } from '../components/OptionRow';
import { Rich } from '../components/Rich';
import { StimulusPanel } from '../components/StimulusPanel';
import { TimerPill } from '../components/TimerPill';
import { PaletteSheet, STATUS_LABEL, StatusSwatch } from '../components/PaletteSheet';
import { BottomSheet } from '../components/BottomSheet';
import { SolutionBlock } from '../components/SolutionBlock';
import { Button, SegmentedControl, Spinner, Toast } from '../components/ui';
import { useSettings, type ThemePref } from '../app/settings';
import { addReport } from '../lib/storage';
import { clock } from '../lib/format';
import { loadKatex } from '../lib/katex';

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch {
        /* denied or unsupported */
      }
      if (cancelled) void lock?.release();
    };
    void request();
    const onVis = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, [active]);
}

export default function Exam() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const attempt = useExam((s) => s.attempt);
  const error = useExam((s) => s.error);
  const interstitial = useExam((s) => s.interstitial);
  const toast = useExam((s) => s.toast);
  const activeFrom = useExam((s) => s.activeFrom);
  const pulseAt = useExam((s) => s.pulseAt);
  const actions = useExam.getState();
  const settings = useSettings((s) => s.settings);
  const updateSettings = useSettings((s) => s.update);

  const [now, setNow] = useState(() => Date.now());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [endSectionOpen, setEndSectionOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [padOpen, setPadOpen] = useState(false);
  const questionTop = useRef<HTMLDivElement>(null);
  const loaded = attempt?.id === id;
  const inProgress = loaded && attempt!.status === 'in-progress';

  // Load (or resume) the attempt.
  useEffect(() => {
    void loadKatex();
    void useExam.getState().open(id);
  }, [id]);

  // When submitted (by the user or the clock), go to the result.
  useEffect(() => {
    if (loaded && attempt!.status === 'submitted') navigate(`/result/${id}`, { replace: true });
  }, [loaded, attempt?.status, id, navigate, attempt]);

  // Clock: deadlines are recomputed from Date.now() every tick, never decremented.
  useEffect(() => {
    if (!inProgress) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      useExam.getState().tick(n);
    }, 250);
    return () => clearInterval(t);
  }, [inProgress]);

  // Visibility, reload and screen-lock safety.
  useEffect(() => {
    if (!inProgress) return;
    const onVis = () => (document.visibilityState === 'hidden' ? useExam.getState().hidden() : useExam.getState().shown());
    const onShow = () => useExam.getState().shown();
    const onHide = () => useExam.getState().hidden();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      useExam.getState().hidden();
      e.preventDefault();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onShow);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onShow);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [inProgress]);

  useWakeLock(inProgress);

  // Android back / in-app navigation during a test → confirm.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => inProgress && currentLocation.pathname !== nextLocation.pathname && !nextLocation.pathname.startsWith('/result/'));

  const byId = useMemo(() => (attempt ? E.questionById(attempt) : new Map()), [attempt?.questions]); // eslint-disable-line react-hooks/exhaustive-deps
  const setsById = useMemo(() => new Map((attempt?.sets ?? []).map((s) => [s.id, s])), [attempt?.sets]);

  const qid = loaded ? E.currentQuestionId(attempt!) : '';
  useEffect(() => {
    // New question: show it from the top, with the shared stimulus (chart/clues/passage) fully in view.
    const scroller = questionTop.current?.closest('main');
    if (scroller) scroller.scrollTop = 0;
  }, [qid]);

  const onSelect = useCallback((i: number) => useExam.getState().select(i), []);

  if (error && !loaded)
    return (
      <main className="px-4 pt-10">
        <h1 className="text-[22px] font-bold">Test not found</h1>
        <p className="mt-2 text-ink-2">{error}</p>
        <Button variant="primary" className="mt-6" onClick={() => navigate('/')}>
          Go home
        </Button>
      </main>
    );
  if (!loaded) return <Spinner label="Opening your test" />;

  const a = attempt!;
  const q = byId.get(qid)!;
  const set = q.setId ? setsById.get(q.setId) : undefined;
  const sectionIds = a.sectionQuestionIds[a.currentSection];
  const sectionCfg = a.config.sections[a.currentSection];
  const response = a.responses[qid];
  const draft = E.draftSelection(a);
  const practice = a.config.instantFeedback;
  const locked = !!response?.locked;
  const remaining = E.remainingMs(a, now);
  const elapsed = E.elapsedMs(a, now);
  const qTime = (response?.activeMs ?? 0) + (activeFrom !== null ? Math.max(0, now - activeFrom) : 0);
  const bookmarked = (a.bookmarks ?? []).includes(qid);
  const lastInSection = a.currentIndex === sectionIds.length - 1;
  // Last question of the last (or only) section: the primary action saves and opens the submit summary.
  const lastQuestionOfTest = lastInSection && a.currentSection === a.config.sections.length - 1;
  const multi = a.config.sections.length > 1;
  const canPause = !a.config.strictTimer;

  const optionState = (i: number): OptionState => {
    if (practice && locked) {
      if (i === q.answerIndex) return 'correct';
      if (i === response.selected) return 'wrong';
      return 'idle';
    }
    return draft === i ? 'selected' : 'idle';
  };

  const setPos = set ? set.questionIds.indexOf(qid) + 1 : 0;
  const counts = a.config.sections.map((_, i) => E.paletteCounts(a, i));

  const doSubmit = async () => {
    setSubmitOpen(false);
    setPaletteOpen(false);
    await useExam.getState().submit();
  };

  return (
    <div className="flex h-dvh flex-col bg-paper">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
        <button type="button" onClick={() => setPaletteOpen(true)} className="flex min-h-11 min-w-0 flex-1 items-center px-2 text-left" aria-label={`${sectionCfg.title}. Open question palette`}>
          <span className="truncate text-[16px] font-bold">{sectionCfg.title}</span>
          {multi ? <span className="tnum ml-1.5 shrink-0 text-[13px] text-ink-2">({a.currentSection + 1}/{a.config.sections.length})</span> : null}
        </button>
        <TimerPill remainingMs={remaining} elapsedMs={elapsed} pulseKey={pulseAt} paused={a.pausedAt !== undefined} />
        <button type="button" onClick={() => setPaletteOpen(true)} className="flex min-h-11 min-w-11 items-center justify-center rounded-[10px]" aria-label="Question palette">
          <Grid3x3 size={22} aria-hidden />
        </button>
        <button type="button" onClick={() => setMenuOpen(true)} className="flex min-h-11 min-w-9 items-center justify-center rounded-[10px]" aria-label="Test menu">
          <MoreVertical size={22} aria-hidden />
        </button>
      </header>

      {/* Info strip */}
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 text-[14px]">
        <button type="button" onClick={() => actions.prev()} className="flex min-h-10 items-center pr-1 font-semibold text-pen" aria-label="Previous question">
          <ChevronLeft size={20} aria-hidden />
          Prev
        </button>
        <span className="tnum font-semibold">
          Q {a.currentIndex + 1} of {sectionIds.length}
        </span>
        <span className="tnum text-ink-2">+{sectionCfg.marks ?? 1} / −{(sectionCfg.marks ?? 1) / 4}</span>
        <span className="flex-1" />
        {settings.stopwatch ? (
          <span className="tnum text-ink-2" aria-label="Time on this question">
            {clock(qTime / 1000)}
          </span>
        ) : null}
        <button type="button" onClick={() => setPadOpen(true)} className="flex min-h-10 min-w-10 items-center justify-center" aria-label="Open rough pad">
          <PencilLine size={21} aria-hidden />
        </button>
        <button type="button" onClick={() => actions.toggleBookmark()} className="flex min-h-10 min-w-10 items-center justify-center" aria-pressed={bookmarked} aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this question'}>
          {bookmarked ? <BookmarkCheck size={21} className="text-pen" aria-hidden /> : <Bookmark size={21} aria-hidden />}
        </button>
      </div>

      {/* Question area */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        {set ? <StimulusPanel set={set} scope={a.id} position={setPos} total={set.questionIds.length} /> : null}
        <div ref={questionTop} className="scroll-mt-2 px-4 pt-4 pb-6">
          <Rich text={q.prompt} className="q-text" />
          <div role="radiogroup" aria-label="Options" className="mt-4 space-y-2.5">
            {q.options.map((opt: string, i: number) => (
              <OptionRow
                key={`${qid}-${i}`}
                index={i}
                text={opt}
                state={optionState(i)}
                disabled={practice && locked}
                note={practice && locked ? (i === q.answerIndex ? 'Correct answer' : i === response.selected ? 'Your answer' : undefined) : undefined}
                onSelect={onSelect}
              />
            ))}
          </div>
          {practice && locked ? <SolutionBlock question={q} timeMs={response.activeMs + (activeFrom !== null ? 0 : 0)} /> : null}
        </div>
      </main>

      {/* Action bar */}
      <footer className="safe-bottom shrink-0 border-t border-line bg-surface px-3 pt-2 pb-2">
        {practice ? (
          <div className="flex gap-2">
            {!locked ? (
              <Button className="flex-1" onClick={() => actions.saveNext()}>
                Skip
              </Button>
            ) : null}
            <Button variant="primary" className="flex-[1.4]" onClick={() => (lastInSection && locked ? setSubmitOpen(true) : actions.saveNext())} disabled={!locked && false}>
              {lastInSection && locked ? 'Finish' : 'Next'}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[1.15fr_0.85fr_1fr] gap-2">
            <button type="button" onClick={() => actions.markNext()} className="min-h-12 rounded-[12px] border border-marked px-1.5 text-[14px] leading-tight font-semibold text-marked">
              Mark for review &amp; next
            </button>
            <button type="button" onClick={() => actions.clear()} className="min-h-12 rounded-[12px] border border-line px-1.5 text-[14px] leading-tight font-semibold text-ink">
              Clear response
            </button>
            <button
              type="button"
              onClick={() => {
                if (lastQuestionOfTest) {
                  actions.saveOnly();
                  setSubmitOpen(true);
                } else actions.saveNext();
              }}
              className="min-h-12 rounded-[12px] bg-pen px-1.5 text-[15px] leading-tight font-semibold text-on-status"
            >
              {lastQuestionOfTest ? 'Save & submit' : 'Save & next'}
            </button>
          </div>
        )}
      </footer>

      <PaletteSheet
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        attempt={a}
        onJump={(s, i) => {
          actions.goTo(s, i);
          setPaletteOpen(false);
        }}
        onSubmit={() => {
          setPaletteOpen(false);
          setSubmitOpen(true);
        }}
        onEndSection={() => {
          setPaletteOpen(false);
          setEndSectionOpen(true);
        }}
      />

      <BottomSheet
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title="Submit test?"
        footer={
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setSubmitOpen(false)} data-autofocus>
              Keep going
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => void doSubmit()}>
              Submit test
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-ink-2">
          {remaining !== null ? `${clock(remaining / 1000)} left in this section. ` : ''}After submitting you can't change answers.
        </p>
        <div className="space-y-3">
          {a.config.sections.map((sec, i) => (
            <div key={i} className="rounded-[12px] border border-line p-3">
              <p className="font-semibold">
                {sec.title} <span className="tnum font-normal text-ink-2">· {a.sectionQuestionIds[i].length} questions</span>
              </p>
              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[14px]">
                {(['answered', 'not-answered', 'marked', 'answered-marked', 'not-visited'] as const).map((st) => (
                  <li key={st} className="flex items-center gap-2">
                    <StatusSwatch status={st}>{counts[i][st]}</StatusSwatch>
                    <span className="leading-tight">{STATUS_LABEL[st]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet
        open={endSectionOpen}
        onClose={() => setEndSectionOpen(false)}
        title="End this section now?"
        footer={
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setEndSectionOpen(false)} data-autofocus>
              Keep going
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => { setEndSectionOpen(false); actions.endSection(); }}>
              End section
            </Button>
          </div>
        }
      >
        <p className="text-ink-2">You can't come back to {sectionCfg.title} after this. In the real exam you would wait for the section timer; ending early just saves you the wait.</p>
      </BottomSheet>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Test menu">
        <div className="space-y-5 pt-1">
          <div>
            <p className="mb-2 text-[14px] font-semibold text-ink-2">Question text size</p>
            <div className="flex items-center gap-3">
              <Button onClick={() => updateSettings({ fontSize: Math.max(15, settings.fontSize - 1) })} aria-label="Smaller text">
                A−
              </Button>
              <span className="tnum w-12 text-center">{settings.fontSize}px</span>
              <Button onClick={() => updateSettings({ fontSize: Math.min(21, settings.fontSize + 1) })} aria-label="Larger text">
                A+
              </Button>
            </div>
          </div>
          <div>
            <p className="mb-2 text-[14px] font-semibold text-ink-2">Theme</p>
            <SegmentedControl<ThemePref>
              label="Theme"
              value={settings.theme}
              onChange={(theme) => updateSettings({ theme })}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>
          <label className="flex min-h-12 items-center justify-between gap-3">
            <span>Per-question stopwatch</span>
            <input type="checkbox" className="h-5 w-5 accent-[var(--pen)]" checked={settings.stopwatch} onChange={(e) => updateSettings({ stopwatch: e.target.checked })} />
          </label>
          {canPause ? (
            <Button className="w-full" onClick={() => (a.pausedAt !== undefined ? actions.resume() : actions.pause())}>
              <span className="inline-flex items-center gap-2">
                {a.pausedAt !== undefined ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
                {a.pausedAt !== undefined ? 'Resume timer' : 'Pause timer'}
              </span>
            </Button>
          ) : (
            <p className="text-[14px] text-ink-2">Mocks use a strict timer: it keeps running like the real exam, even if you leave the app.</p>
          )}
          <div className="rounded-[12px] bg-paper p-3 text-[14px] text-ink-2">
            <p className="font-semibold text-ink">Instructions</p>
            <p className="mt-1">+1 for a correct answer, −0.25 for a wrong one, 0 if left. An answer counts only after <strong>Save &amp; next</strong> or <strong>Mark for review &amp; next</strong>. Answered &amp; marked questions are evaluated.</p>
          </div>
          <Button className="w-full" onClick={() => { setMenuOpen(false); setReportOpen(true); }}>
            Report a problem with this question
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report a problem"
        footer={
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              void addReport({ qid, attemptId: a.id, note: reportText.trim(), at: Date.now(), question: q });
              setReportText('');
              setReportOpen(false);
              actions.showToast('Saved to your reports. It is included when you export your progress.');
            }}
          >
            Save report
          </Button>
        }
      >
        <label className="block text-[14px] text-ink-2" htmlFor="report">
          What looks wrong? (key, wording, typo…)
        </label>
        <textarea id="report" value={reportText} onChange={(e) => setReportText(e.target.value)} rows={4} className="mt-2 w-full rounded-[12px] border border-line bg-paper p-3 text-[16px]" />
      </BottomSheet>

      {interstitial && now < interstitial.until ? (
        <div role="alertdialog" aria-live="assertive" className="fixed inset-0 z-[70] mx-auto flex max-w-[480px] flex-col items-center justify-center bg-paper px-8 text-center">
          <p className="text-[22px] font-bold">{interstitial.ended} time is over.</p>
          {interstitial.next ? <p className="mt-2 text-[18px] text-ink-2">{interstitial.next} starts now.</p> : null}
        </div>
      ) : null}

      <BottomSheet
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Leave the test?"
        footer={
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => blocker.reset?.()} data-autofocus>
              Stay
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => {
                useExam.getState().hidden();
                void useExam.getState().flush();
                blocker.proceed?.();
              }}
            >
              Leave
            </Button>
          </div>
        }
      >
        <p className="text-ink-2">Your progress is saved. {a.config.strictTimer ? 'The timer keeps running while you are away, like the real exam.' : 'The timer pauses until you come back.'}</p>
      </BottomSheet>

      {padOpen ? <RoughPad padKey={`${a.id}:${qid}`} prompt={q.prompt} onClose={() => setPadOpen(false)} /> : null}

      {toast ? <Toast key={toast.id} id={toast.id} text={toast.text} tone={toast.tone} onDone={() => useExam.setState({ toast: null })} /> : null}
    </div>
  );
}
