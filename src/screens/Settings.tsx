import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { useSettings, EXAM_DATES, type ThemePref } from '../app/settings';
import type { ExamId } from '../content/types';
import { exportAll, importAll, resetAll, EXPORT_VERSION, type ExportFile } from '../lib/storage';
import { loadBankIndex, loadBankFile } from '../content/providers';
import { BottomSheet } from '../components/BottomSheet';
import { Button, SectionHeading, SegmentedControl } from '../components/ui';

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 py-1">
      <span>
        {label}
        {hint ? <span className="block text-[13px] text-ink-2">{hint}</span> : null}
      </span>
      <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--pen)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<ExportFile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [download, setDownload] = useState<string | null>(null);

  const doExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mockhall-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Progress exported. Keep the file somewhere safe, or import it on your new phone.');
  };

  const onFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as ExportFile;
      if (parsed.app !== 'mockhall' || !Array.isArray(parsed.entries) || parsed.version > EXPORT_VERSION) throw new Error('bad');
      setPendingImport(parsed);
    } catch {
      setMessage('That file is not a MockHall export. Pick the .json file made by "Export progress".');
    }
  };

  const doImport = async (mode: 'merge' | 'replace') => {
    if (!pendingImport) return;
    await importAll(pendingImport, mode);
    setPendingImport(null);
    await useSettings.getState().load();
    setMessage(mode === 'merge' ? 'Imported and merged with this phone’s history.' : 'Imported. This phone now has the history from the file.');
  };

  const downloadAll = async () => {
    try {
      const index = await loadBankIndex();
      const total = index.files.reduce((s, f) => s + f.bytes, 0);
      let done = 0;
      for (const f of index.files) {
        await loadBankFile(f.file);
        done++;
        setDownload(`Downloading ${done} of ${index.files.length} (${(total / 1_048_576).toFixed(1)} MB total)…`);
      }
      setDownload(`Everything is on this phone (${(total / 1_048_576).toFixed(1)} MB of puzzle banks). All chapters now work offline.`);
    } catch (e) {
      setDownload((e as Error).message);
    }
  };

  return (
    <main className="px-4 pt-2 pb-10">
      <button type="button" onClick={() => navigate(-1)} className="-ml-1 flex min-h-11 items-center gap-1 font-semibold text-pen">
        <ChevronLeft size={20} aria-hidden /> Back
      </button>
      <h1 className="text-[24px] font-bold">Settings</h1>
      {message ? (
        <p role="status" className="mt-3 rounded-[12px] bg-pen/10 p-3 text-[15px]">
          {message}
        </p>
      ) : null}

      <SectionHeading>Target exam</SectionHeading>
      <SegmentedControl<ExamId>
        label="Target exam"
        value={settings.targetExam}
        onChange={(v) => update({ targetExam: v, targetDate: EXAM_DATES[v].date, sectionOrder: v })}
        options={[
          { value: 'sbi-clerk', label: 'SBI Clerk' },
          { value: 'ibps-clerk', label: 'IBPS Clerk' },
        ]}
      />
      <label className="mt-3 flex min-h-12 items-center justify-between gap-3">
        <span>Exam date</span>
        <input type="date" value={settings.targetDate} onChange={(e) => update({ targetDate: e.target.value })} className="min-h-11 rounded-[10px] border border-line bg-surface px-2" />
      </label>

      <SectionHeading>Mocks</SectionHeading>
      <p className="mb-1.5 text-[14px] text-ink-2">Default section order</p>
      <SegmentedControl<ExamId>
        label="Default section order"
        value={settings.sectionOrder}
        onChange={(v) => update({ sectionOrder: v })}
        options={[
          { value: 'sbi-clerk', label: 'SBI order' },
          { value: 'ibps-clerk', label: 'IBPS order' },
        ]}
      />
      <Toggle label="Strict timer for mocks" hint="Keeps running when you leave the app, like the real exam" checked={settings.strictMocks} onChange={(v) => update({ strictMocks: v })} />
      <Toggle label="Vibrate on timer warnings" checked={settings.vibration} onChange={(v) => update({ vibration: v })} />
      <Toggle label="Per-question stopwatch" checked={settings.stopwatch} onChange={(v) => update({ stopwatch: v })} />
      <Toggle label="Remove a mistake after two correct answers in a row" checked={settings.pruneMistakes} onChange={(v) => update({ pruneMistakes: v })} />

      <SectionHeading>Display</SectionHeading>
      <SegmentedControl<ThemePref>
        label="Theme"
        value={settings.theme}
        onChange={(theme) => update({ theme })}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
      <div className="mt-3 flex items-center justify-between">
        <span>Question text size</span>
        <span className="flex items-center gap-2">
          <Button onClick={() => update({ fontSize: Math.max(15, settings.fontSize - 1) })} aria-label="Smaller text">
            A−
          </Button>
          <span className="tnum w-12 text-center">{settings.fontSize}px</span>
          <Button onClick={() => update({ fontSize: Math.min(21, settings.fontSize + 1) })} aria-label="Larger text">
            A+
          </Button>
        </span>
      </div>

      <SectionHeading>Offline</SectionHeading>
      <p className="text-[14px] text-ink-2">The app and all generated chapters already work offline. Puzzle and seating banks download when first used — or get them all now.</p>
      <Button className="mt-2 w-full" onClick={() => void downloadAll()}>
        Download everything for offline
      </Button>
      {download ? <p className="mt-2 text-[14px]">{download}</p> : null}

      <SectionHeading>Your data</SectionHeading>
      <div className="grid gap-2">
        <Button onClick={() => void doExport()}>Export progress</Button>
        <Button onClick={() => fileInput.current?.click()}>Import progress</Button>
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        <Button variant="danger" onClick={() => setConfirmReset(true)}>
          Reset all data
        </Button>
      </div>

      <SectionHeading>About</SectionHeading>
      <div className="space-y-2 text-[14px] text-ink-2">
        <p>MockHall is free, with no login, no ads and no trackers. Your tests and progress stay on this phone.</p>
        <p>
          How answer keys are checked: every Numerical and most Reasoning questions are generated by code that computes the answer, and a second, independently written program re-computes it for hundreds of thousands of samples before release. Puzzles ship only when a solver proves exactly one arrangement fits the clues. English questions are solved blind by a separate reviewer; any disagreement or ambiguity sends the question back for rewriting.
        </p>
        <p>Good-attempt ranges come from coaching-institute analyses, not official cut-offs.</p>
      </div>

      <BottomSheet
        open={!!pendingImport}
        onClose={() => setPendingImport(null)}
        title="Import progress"
        footer={
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => void doImport('merge')}>
              Merge
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => void doImport('replace')}>
              Replace
            </Button>
          </div>
        }
      >
        <p className="text-ink-2">Merge keeps this phone’s history and adds the file’s. Replace wipes this phone’s history first.</p>
      </BottomSheet>

      <BottomSheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset all data?"
        footer={
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setConfirmReset(false)} data-autofocus>
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={async () => {
                await resetAll();
                setConfirmReset(false);
                await useSettings.getState().load();
                setMessage('All data on this phone was deleted.');
              }}
            >
              Delete everything
            </Button>
          </div>
        }
      >
        <p className="text-ink-2">This deletes every test, score, mistake and setting on this phone. Export first if you want a copy.</p>
      </BottomSheet>
    </main>
  );
}
