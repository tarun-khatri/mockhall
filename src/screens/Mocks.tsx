import { Link } from 'react-router';
import { useSettings, type MockPreset } from '../app/settings';
import { useAsync } from '../app/useAsync';
import { listAttempts } from '../lib/storage';
import { encodeConfig, fixedMock, freshMock, sectionalConfig } from '../exam/configs';
import { EXAM_LABEL, MOCK_PRESETS } from '../content/blueprints';
import { SUBJECT_TITLE } from '../content/chapters';
import type { ExamId, Subject } from '../content/types';
import { Divided, ListRow, SectionHeading, SegmentedControl } from '../components/ui';

export default function Mocks() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const { data: attempts = [] } = useAsync(listAttempts, []);
  const best = new Map<string, { score: number; max: number }>();
  for (const a of attempts) {
    if (a.kind !== 'full-mock' || a.status !== 'submitted' || a.score === undefined) continue;
    const prev = best.get(a.title);
    if (!prev || a.score > prev.score) best.set(a.title, { score: a.score, max: a.maxScore ?? 100 });
  }
  const exam = settings.sectionOrder;
  const fresh = freshMock(exam, settings.mockPreset, settings.strictMocks);
  return (
    <main className="px-4 pt-4">
      <h1 className="text-[24px] font-bold">Mocks</h1>
      <p className="text-[14px] text-ink-2">Full mocks follow the prelims pattern: 100 questions, three sections of 20 minutes each, −0.25 per wrong answer.</p>

      <div className="mt-4 space-y-3">
        <div>
          <p className="mb-1.5 text-[14px] font-semibold text-ink-2">Section order</p>
          <SegmentedControl<ExamId>
            label="Section order"
            value={exam}
            onChange={(v) => update({ sectionOrder: v })}
            options={[
              { value: 'sbi-clerk', label: 'SBI (Eng → Num → Rea)' },
              { value: 'ibps-clerk', label: 'IBPS (Num → Eng → Rea)' },
            ]}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[14px] font-semibold text-ink-2">Difficulty</p>
          <SegmentedControl<MockPreset>
            label="Mock difficulty"
            value={settings.mockPreset}
            onChange={(v) => update({ mockPreset: v })}
            options={(Object.keys(MOCK_PRESETS) as MockPreset[]).map((k) => ({ value: k, label: MOCK_PRESETS[k].label }))}
          />
        </div>
      </div>

      <SectionHeading>Full mocks · {EXAM_LABEL[exam]} pattern</SectionHeading>
      <Divided>
        <ListRow to={`/start?c=${encodeConfig(fresh)}`} title="Fresh mock" detail="A new paper every time" />
        {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => {
          const cfg = fixedMock(n, exam, settings.mockPreset, settings.strictMocks);
          const b = best.get(cfg.title);
          const v = cfg.variants!;
          return (
            <ListRow
              key={n}
              to={`/start?c=${encodeConfig(cfg)}`}
              title={cfg.title}
              detail={`Numerical ${v.quant} · Reasoning ${v.reasoning} · English ${v.english}${b ? ` · best ${b.score} / ${b.max}` : ''}`}
            />
          );
        })}
      </Divided>

      <SectionHeading>Sectional mocks</SectionHeading>
      <Divided>
        {(['english', 'quant', 'reasoning'] as Subject[]).map((s) => (
          <ListRow key={s} to={`/start?c=${encodeConfig(sectionalConfig(s, exam, settings.mockPreset, settings.strictMocks))}`} title={SUBJECT_TITLE[s]} detail={`${s === 'english' ? 30 : 35} questions · 20 minutes`} />
        ))}
      </Divided>
      <p className="mt-4 text-[13px] text-ink-2">
        Blueprint variants: Numerical A = simplification + DI + caselet, B = with number series, C = 2024 style. Reasoning A = SBI style, B = IBPS 2025 style with a coding set.{' '}
        <Link to="/settings" className="font-semibold text-pen">
          Timer settings
        </Link>
      </p>
      <div className="h-6" />
    </main>
  );
}
