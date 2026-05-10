import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type DbqPrompt,
  type DraftingPhase,
  type Mode,
  type PlanningState,
  type SourceAnnotation,
  type TimeMode,
  emptyPlanning,
} from './types';

export type DbqState = {
  prompt: DbqPrompt;
  mode: Mode;
  setMode: (m: Mode) => void;
  timeMode: TimeMode;
  setTimeMode: (t: TimeMode) => void;
  phase: DraftingPhase;
  setPhase: (p: DraftingPhase) => void;
  essay: string;
  setEssay: (s: string) => void;
  planning: PlanningState;
  setPlanning: (p: PlanningState) => void;
  annotations: SourceAnnotation[];
  addAnnotation: (sourceId: string, text: string) => void;
  removeAnnotation: (id: string) => void;
  // Timer
  readingMsRemaining: number;
  writingMsRemaining: number;
  timerRunning: boolean;
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  // Citation insertion
  editorRef: React.RefObject<HTMLTextAreaElement | null>;
  insertCitation: (label: string) => void;
  submit: () => void;
};

const READING_MS = 15 * 60 * 1000;
const WRITING_MS = 45 * 60 * 1000;

export function useDbqState(prompt: DbqPrompt): DbqState {
  const [mode, setMode] = useState<Mode>('reading');
  const [timeMode, setTimeMode] = useState<TimeMode>('untimed');
  const [phase, setPhase] = useState<DraftingPhase>('source-analysis');
  const [essay, setEssay] = useState('');
  const [planning, setPlanning] = useState<PlanningState>(emptyPlanning);
  const [annotations, setAnnotations] = useState<SourceAnnotation[]>([]);
  const [readingMsRemaining, setReadingMsRemaining] = useState(READING_MS);
  const [writingMsRemaining, setWritingMsRemaining] = useState(WRITING_MS);
  const [timerRunning, setTimerRunning] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  // Tick the timer when running and in timed mode.
  useEffect(() => {
    if (!timerRunning || timeMode !== 'timed') return;
    const interval = window.setInterval(() => {
      if (mode === 'reading') {
        setReadingMsRemaining((ms) => Math.max(0, ms - 1000));
      } else if (mode === 'writing') {
        setWritingMsRemaining((ms) => Math.max(0, ms - 1000));
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning, timeMode, mode]);

  // Auto-transition reading → writing in timed mode when reading clock expires.
  useEffect(() => {
    if (timeMode !== 'timed') return;
    if (mode === 'reading' && readingMsRemaining === 0) {
      setMode('writing');
      setPhase('drafting');
    }
  }, [timeMode, mode, readingMsRemaining]);

  // Auto-submit when writing clock expires.
  useEffect(() => {
    if (timeMode !== 'timed') return;
    if (mode === 'writing' && writingMsRemaining === 0) {
      setMode('submitted');
      setTimerRunning(false);
    }
  }, [timeMode, mode, writingMsRemaining]);

  const addAnnotation = useCallback((sourceId: string, text: string) => {
    if (!text.trim()) return;
    setAnnotations((prev) => [
      ...prev,
      {
        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sourceId,
        text: text.trim(),
        createdAt: Date.now(),
      },
    ]);
  }, []);

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const startTimer = useCallback(() => setTimerRunning(true), []);
  const pauseTimer = useCallback(() => setTimerRunning(false), []);
  const resetTimer = useCallback(() => {
    setReadingMsRemaining(READING_MS);
    setWritingMsRemaining(WRITING_MS);
    setTimerRunning(false);
  }, []);

  const insertCitation = useCallback(
    (label: string) => {
      const token = `[Doc ${label}] `;
      const el = editorRef.current;
      if (!el) {
        setEssay((prev) => `${prev}${token}`);
        return;
      }
      const start = el.selectionStart ?? essay.length;
      const end = el.selectionEnd ?? essay.length;
      const next = `${essay.slice(0, start)}${token}${essay.slice(end)}`;
      setEssay(next);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    },
    [essay]
  );

  const submit = useCallback(() => {
    setMode('submitted');
    setTimerRunning(false);
  }, []);

  return useMemo(
    () => ({
      prompt,
      mode,
      setMode,
      timeMode,
      setTimeMode,
      phase,
      setPhase,
      essay,
      setEssay,
      planning,
      setPlanning,
      annotations,
      addAnnotation,
      removeAnnotation,
      readingMsRemaining,
      writingMsRemaining,
      timerRunning,
      startTimer,
      pauseTimer,
      resetTimer,
      editorRef,
      insertCitation,
      submit,
    }),
    [
      prompt,
      mode,
      timeMode,
      phase,
      essay,
      planning,
      annotations,
      readingMsRemaining,
      writingMsRemaining,
      timerRunning,
      addAnnotation,
      removeAnnotation,
      startTimer,
      pauseTimer,
      resetTimer,
      insertCitation,
      submit,
    ]
  );
}
