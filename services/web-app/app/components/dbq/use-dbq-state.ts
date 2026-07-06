import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ChatMessage,
  type DbqPrompt,
  type DraftingPhase,
  type PlanningState,
  type SourceAnnotation,
  type TimeMode,
  type View,
  emptyPlanning,
} from './types';
import { cannedTutorReply, detectFailureFlags, phaseTutorIntro } from './coaching';

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
  editorRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  insertCitation: (label: string) => void;
  // Chat.
  messages: ChatMessage[];
  askTutor: (text: string) => void;
  submit: () => void;
};

const TOTAL_MS = 60 * 60 * 1000;

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useDbqState(prompt: DbqPrompt, initialTimeMode?: TimeMode): DbqState {
  const [view, setView] = useState<View>('drafting');
  const [timeMode, setTimeMode] = useState<TimeMode>(initialTimeMode ?? 'untimed');
  const [phase, setPhase] = useState<DraftingPhase>('source-analysis');
  const [essay, setEssay] = useState('');
  const [planning, setPlanning] = useState<PlanningState>(emptyPlanning);
  const [annotations, setAnnotations] = useState<SourceAnnotation[]>([]);
  const [msRemaining, setMsRemaining] = useState(TOTAL_MS);
  const [timerRunning, setTimerRunning] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

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

  // Detector → tutor message bridge: whenever a new flag appears, post a tutor card.
  useEffect(() => {
    const flags = detectFailureFlags(essay, prompt);
    const newMessages: ChatMessage[] = [];
    for (const f of flags) {
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

  const askTutor = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const studentMsg: ChatMessage = {
      id: makeId('stu'),
      role: 'student',
      origin: 'reply',
      createdAt: Date.now(),
      body: trimmed,
    };
    const tutorMsg: ChatMessage = {
      id: makeId('tut'),
      role: 'tutor',
      origin: 'reply',
      createdAt: Date.now() + 1,
      body: cannedTutorReply(trimmed),
    };
    setMessages((prev) => [...prev, studentMsg, tutorMsg]);
  }, []);

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
      submit,
    ]
  );
}
