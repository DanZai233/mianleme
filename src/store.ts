import { useState, useEffect } from "react";
import { AppState, FollowUpTemplates, Interview, InterviewPrepPack, InterviewStage, Language, PrepChecklistItem } from "./types";
import { getBrowserTimezone } from "./utils";
import { INTERVIEW_STAGE_VALUES } from "./interviewDefaults";

const STORAGE_KEY = "interview_tracker_data";
const INTERVIEW_RESULTS = new Set(["unknown", "waiting", "offer", "rejected", "withdrawn"]);
const INTERVIEW_STAGES = new Set<InterviewStage>(INTERVIEW_STAGE_VALUES);

const defaultState: AppState = {
  interviews: [],
  language: "zh",
  timezone: getBrowserTimezone(),
  darkMode: window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches,
  notificationsEnabled: false,
};

function normalizeInterview(interview: Partial<Interview>): Interview {
  const result = typeof interview.result === "string" && INTERVIEW_RESULTS.has(interview.result) ? interview.result : "unknown";
  const stage = typeof interview.stage === "string" && INTERVIEW_STAGES.has(interview.stage as InterviewStage) ? interview.stage as InterviewStage : "applied";

  return {
    id: String(interview.id || `${Date.now()}-${Math.random()}`),
    company: String(interview.company || ""),
    role: String(interview.role || ""),
    date: String(interview.date || ""),
    platform: String(interview.platform || ""),
    link: String(interview.link || ""),
    meetingId: String(interview.meetingId || ""),
    notes: String(interview.notes || ""),
    review: String(interview.review || ""),
    result: result as Interview["result"],
    stage,
    prepChecklist: normalizePrepChecklist(interview.prepChecklist),
    prepPack: normalizePrepPack(interview.prepPack),
    followUpTemplates: normalizeFollowUpTemplates(interview.followUpTemplates),
    followUpDate: String(interview.followUpDate || ""),
    followUpDone: Boolean(interview.followUpDone),
    status: interview.status || "upcoming",
    reminderHours: Number.isFinite(Number(interview.reminderHours)) ? Number(interview.reminderHours) : 1,
    durationMinutes: Number.isFinite(Number(interview.durationMinutes)) ? Number(interview.durationMinutes) : 60,
  };
}

function normalizePrepChecklist(value: unknown): PrepChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any, index) => ({
      id: String(item?.id || `prep-${index}`),
      text: String(item?.text || "").trim(),
      done: Boolean(item?.done),
    }))
    .filter((item) => item.text);
}

function normalizeTextList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8);
}

function normalizePrepPack(value: unknown): InterviewPrepPack | null {
  if (!value || typeof value !== "object") return null;
  const pack = value as Partial<InterviewPrepPack>;
  return {
    generatedAt: String(pack.generatedAt || new Date().toISOString()),
    possibleQuestions: normalizeTextList(pack.possibleQuestions),
    starStories: normalizeTextList(pack.starStories),
    questionsToAsk: normalizeTextList(pack.questionsToAsk),
    quickBrief: normalizeTextList(pack.quickBrief),
  };
}

function normalizeFollowUpTemplates(value: unknown): FollowUpTemplates | null {
  if (!value || typeof value !== "object") return null;
  const templates = value as Partial<FollowUpTemplates>;
  return {
    generatedAt: String(templates.generatedAt || new Date().toISOString()),
    thankYou: String(templates.thankYou || ""),
    progressCheck: String(templates.progressCheck || ""),
    addendum: String(templates.addendum || ""),
    englishFollowUp: String(templates.englishFollowUp || ""),
  };
}

function normalizeState(data: Partial<AppState>): AppState {
  return {
    ...defaultState,
    ...data,
    interviews: Array.isArray(data.interviews) ? data.interviews.map(normalizeInterview) : [],
  };
}

export function useAppState() {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return normalizeState(parsed);
      } catch (e) {
        console.error("Local storage decode error", e);
        return defaultState;
      }
    }
    return defaultState;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const addInterview = (interview: Interview) => {
    setState((s) => ({ ...s, interviews: [...s.interviews, interview] }));
  };

  const updateInterview = (id: string, updates: Partial<Interview>) => {
    setState((s) => ({
      ...s,
      interviews: s.interviews.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    }));
  };

  const deleteInterview = (id: string) => {
    setState((s) => ({
      ...s,
      interviews: s.interviews.filter((i) => i.id !== id),
    }));
  };

  const setLanguage = (lang: Language) => {
    setState((s) => ({ ...s, language: lang }));
  };

  const setTimezone = (timezone: string) => {
    setState((s) => ({ ...s, timezone }));
  };

  const setDarkMode = (darkMode: boolean) => {
    setState((s) => ({ ...s, darkMode }));
  };

  const setNotificationsEnabled = (enabled: boolean) => {
    setState((s) => ({ ...s, notificationsEnabled: enabled }));
  };

  const importData = (data: AppState) => {
    setState(normalizeState(data));
  };

  return {
    state,
    addInterview,
    updateInterview,
    deleteInterview,
    setLanguage,
    setTimezone,
    setDarkMode,
    setNotificationsEnabled,
    importData,
  };
}
