import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ChatMessage,
  type DbqPrompt,
  type DraftingPhase,
  type FailureFlag,
  type PlanningState,
  type SourceAnnotation,
  type TimeMode,
  type View,
  emptyPlanning,
} from './types';
import { phaseTutorIntro } from './coaching';

const TUTOR_ENDPOINT = '/api/prototypes/dbq-tutor';

function promptContext(prompt: DbqPrompt) {
  return {
    prompt: prompt.prompt,
    title: prompt.title,
    era: prompt.era,
    sources: prompt.sources,
  };
}

export type DbqState = {
  prompt: DbqPrompt;
  view: View;
  setView: (v: View) => void;
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
  // Timer (single 60-minute combined clock for DBQ).
  msRemaining: number;
  timerRunning: boolean;
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  // Citation insertion.
  editorRef: React.RefObject<HTMLTextAreaElement | null>;
  insertCitation: (label: string) => void;
  // Chat.
  messages: ChatMessage[];
  askTutor: (text: string) => void;
  tutorPending: boolean;
  submit: () => void;
};

const TOTAL_MS = 60 * 60 * 1000;

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useDbqState(prompt: DbqPrompt): DbqState {
  const [view, setView] = useState<View>('drafting');
  const [timeMode, setTimeMode] = useState<TimeMode>('untimed');
  const [phase, setPhase] = useState<DraftingPhase>('source-analysis');
  const [essay, setEssay] = useState('');
  const [planning, setPlanning] = useState<PlanningState>(emptyPlanning);
  const [annotations, setAnnotations] = useState<SourceAnnotation[]>([]);
  const [msRemaining, setMsRemaining] = useState(TOTAL_MS);
  const [timerRunning, setTimerRunning] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const [tutorPending, setTutorPending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'seed-welcome',
      role: 'tutor',
      origin: 'seed',
      createdAt: Date.now(),
      body:
        "Hi! Take a few minutes to read each document on the left. The prompt asks you to evaluate the *extent* to which Reconstruction's goals were achieved by 1900 — watch for which sources point to legal wins and which point to social or political reversal. I'll check in as you draft. Ask me anything.",
    },
  ]);
  const firedDetectors = useRef<Set<string>>(new Set());
  const seenPhase = useRef<Set<DraftingPhase>>(new Set(['source-analysis']));

  // Timer tick.
  useEffect(() => {
    if (!timerRunning || timeMode !== 'timed') return;
    const interval = window.setInterval(() => {
      setMsRemaining((ms) => Math.max(0, ms - 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning, timeMode]);

  // Auto-submit when the clock expires.
  useEffect(() => {
    if (timeMode === 'timed' && msRemaining === 0 && view === 'drafting') {
      setView('submitted');
      setTimerRunning(false);
    }
  }, [timeMode, msRemaining, view]);

  // Detector → tutor message bridge. Asks the server-side tutor to scan the
  // current draft for failure modes and surface new ones as tutor cards.
  // Debounced so we don't fire on every keystroke.
  const planningRef = useRef(planning);
  planningRef.current = planning;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  useEffect(() => {
    if (!essay.trim()) return;
    if (essay.trim().split(/\s+/).length < 25) return;
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(TUTOR_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'scan',
            essay,
            planning: planningRef.current,
            phase: phaseRef.current,
            alreadyFired: Array.from(firedDetectors.current),
            promptContext: promptContext(prompt),
          }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { flags?: FailureFlag[] };
        const newMessages: ChatMessage[] = [];
        for (const f of json.flags ?? []) {
          if (firedDetectors.current.has(f.id)) continue;
          firedDetectors.current.add(f.id);
          newMessages.push({
            id: makeId('det'),
            role: 'tutor',
            origin: 'detector',
            detectorId: f.id,
            createdAt: Date.now(),
            body: `Heads up — ${f.label.toLowerCase()}. ${f.detail}`,
          });
        }
        if (newMessages.length > 0) {
          setMessages((prev) => [...prev, ...newMessages]);
        }
      } catch {
        // Prototype: swallow network errors silently.
      }
    }, 4000);
    return () => window.clearTimeout(handle);
  }, [essay, prompt]);

  // Phase change → tutor message bridge.
  useEffect(() => {
    if (seenPhase.current.has(phase)) return;
    seenPhase.current.add(phase);
    setMessages((prev) => [
      ...prev,
      {
        id: makeId('phase'),
        role: 'tutor',
        origin: 'phase',
        createdAt: Date.now(),
        body: phaseTutorIntro[phase],
      },
    ]);
  }, [phase]);

  const addAnnotation = useCallback((sourceId: string, text: string) => {
    if (!text.trim()) return;
    setAnnotations((prev) => [
      ...prev,
      {
        id: makeId('ann'),
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
    setMsRemaining(TOTAL_MS);
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

  const askTutor = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const studentMsg: ChatMessage = {
        id: makeId('stu'),
        role: 'student',
        origin: 'reply',
        createdAt: Date.now(),
        body: trimmed,
      };
      // Capture history *before* this turn so the server sees what the
      // student/tutor have already said.
      const priorHistory = messages.map((m) => ({
        role: m.role,
        body: m.body,
      }));
      setMessages((prev) => [...prev, studentMsg]);
      setTutorPending(true);
      try {
        const res = await fetch(TUTOR_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'reply',
            question: trimmed,
            history: priorHistory,
            essay,
            planning: planningRef.current,
            phase: phaseRef.current,
            promptContext: promptContext(prompt),
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          reply?: string;
          error?: string;
        };
        const body =
          (res.ok && json.reply?.trim()) ||
          `(tutor unreachable — ${json.error ?? 'try again in a moment'})`;
        setMessages((prev) => [
          ...prev,
          {
            id: makeId('tut'),
            role: 'tutor',
            origin: 'reply',
            createdAt: Date.now(),
            body,
          },
        ]);
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId('tut'),
            role: 'tutor',
            origin: 'reply',
            createdAt: Date.now(),
            body: `(tutor unreachable — ${
              error instanceof Error ? error.message : 'network error'
            })`,
          },
        ]);
      } finally {
        setTutorPending(false);
      }
    },
    [essay, messages, prompt]
  );

  const submit = useCallback(() => {
    setView('submitted');
    setTimerRunning(false);
  }, []);

  return useMemo(
    () => ({
      prompt,
      view,
      setView,
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
      msRemaining,
      timerRunning,
      startTimer,
      pauseTimer,
      resetTimer,
      editorRef,
      insertCitation,
      messages,
      askTutor,
      tutorPending,
      submit,
    }),
    [
      prompt,
      view,
      timeMode,
      phase,
      essay,
      planning,
      annotations,
      addAnnotation,
      removeAnnotation,
      msRemaining,
      timerRunning,
      startTimer,
      pauseTimer,
      resetTimer,
      insertCitation,
      messages,
      askTutor,
      tutorPending,
      submit,
    ]
  );
}
