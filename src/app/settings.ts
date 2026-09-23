import { create } from 'zustand';
import type { ChapterId, Difficulty, ExamId, Pace } from '../content/types';
import { KEY, readKey, writeKey } from '../lib/storage';

export type ThemePref = 'system' | 'light' | 'dark';
export type MockPreset = 'exam' | 'tough' | 'extreme';

export interface ChapterPref {
  difficulty: Difficulty | 'mixed';
  count: number;
  mode: 'practice' | 'test';
  pace: Pace;
  subtypes: string[];
}

export interface Settings {
  targetExam: ExamId;
  /** ISO date (yyyy-mm-dd) of the target prelims. */
  targetDate: string;
  sectionOrder: ExamId;
  theme: ThemePref;
  /** Question text size in px (15–21). */
  fontSize: number;
  strictMocks: boolean;
  vibration: boolean;
  stopwatch: boolean;
  mockPreset: MockPreset;
  /** Remove a mistake after answering it correctly twice in a row. */
  pruneMistakes: boolean;
  chapterPrefs: Partial<Record<ChapterId, ChapterPref>>;
}

export const DEFAULT_SETTINGS: Settings = {
  targetExam: 'sbi-clerk',
  targetDate: '2026-09-26',
  sectionOrder: 'sbi-clerk',
  theme: 'system',
  fontSize: 17,
  strictMocks: true,
  vibration: false,
  stopwatch: true,
  mockPreset: 'exam',
  pruneMistakes: true,
  chapterPrefs: {},
};

export const EXAM_DATES: Record<ExamId, { label: string; date: string }> = {
  'sbi-clerk': { label: 'SBI Clerk prelims', date: '2026-09-26' },
  'ibps-clerk': { label: 'IBPS Clerk prelims', date: '2026-10-10' },
};

const THEME_KEY = 'mockhall:theme';
const FONT_KEY = 'mockhall:font';

export function applyTheme(theme: ThemePref): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#10182A' : '#F5F7FA');
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function applyFontSize(px: number): void {
  document.documentElement.style.setProperty('--q-size', `${px}px`);
  try {
    localStorage.setItem(FONT_KEY, String(px));
  } catch {
    /* ignore */
  }
}

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load(): Promise<void>;
  update(patch: Partial<Settings>): void;
  setChapterPref(chapter: ChapterId, pref: ChapterPref): void;
}

export const useSettings = create<SettingsState>((setState, getState) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    const stored = await readKey<Partial<Settings>>(KEY.settings).catch(() => undefined);
    const settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
    applyTheme(settings.theme);
    applyFontSize(settings.fontSize);
    setState({ settings, loaded: true });
  },
  update(patch) {
    const settings = { ...getState().settings, ...patch };
    if (patch.theme) applyTheme(settings.theme);
    if (patch.fontSize) applyFontSize(settings.fontSize);
    setState({ settings });
    void writeKey(KEY.settings, settings).catch(() => undefined);
  },
  setChapterPref(chapter, pref) {
    const settings = { ...getState().settings, chapterPrefs: { ...getState().settings.chapterPrefs, [chapter]: pref } };
    setState({ settings });
    void writeKey(KEY.settings, settings).catch(() => undefined);
  },
}));

/** Whole days from today (local) to the ISO date; negative when past. */
export function daysUntil(isoDate: string, now = new Date()): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}
