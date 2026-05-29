import { useState, useEffect } from "react";
import { AppState, FollowUpTemplates, Interview, InterviewMarkdownDocument, InterviewPrepPack, InterviewStage, Language, PrepChecklistItem } from "./types";
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
  const prepPack = normalizePrepPack(interview.prepPack);
  const followUpTemplates = normalizeFollowUpTemplates(interview.followUpTemplates);

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
    prepPack,
    prepPackMarkdown: normalizeMarkdownDocument(interview.prepPackMarkdown) || prepPackToMarkdown(prepPack, interview),
    followUpTemplates,
    followUpTemplatesMarkdown: normalizeMarkdownDocument(interview.followUpTemplatesMarkdown) || followUpTemplatesToMarkdown(followUpTemplates, interview),
    followUpDate: String(interview.followUpDate || ""),
    followUpDone: Boolean(interview.followUpDone),
    status: interview.status || "upcoming",
    reminderHours: Number.isFinite(Number(interview.reminderHours)) ? Number(interview.reminderHours) : 1,
    durationMinutes: Number.isFinite(Number(interview.durationMinutes)) ? Number(interview.durationMinutes) : 60,
  };
}

function normalizeMarkdownDocument(value: unknown): InterviewMarkdownDocument | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as Partial<InterviewMarkdownDocument>;
  const content = String(doc.content || "");
  if (!content.trim()) return null;
  const generatedAt = String(doc.generatedAt || new Date().toISOString());
  return {
    generatedAt,
    updatedAt: String(doc.updatedAt || generatedAt),
    title: String(doc.title || "Interview document"),
    content,
  };
}

function prepPackToMarkdown(pack: InterviewPrepPack | null, interview: Partial<Interview>): InterviewMarkdownDocument | null {
  if (!pack) return null;
  const title = `${interview.company || interview.role || "Interview"} Prep Pack`;
  const section = (heading: string, items: string[]) => items.length ? `\n## ${heading}\n${items.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n` : "";
  const content = [
    `# ${title}`,
    section("5-minute brief", pack.quickBrief),
    section("Likely questions", pack.possibleQuestions),
    section("STAR stories", pack.starStories),
    section("Questions to ask", pack.questionsToAsk),
  ].join("\n").trim();
  return content ? {
    generatedAt: pack.generatedAt,
    updatedAt: pack.generatedAt,
    title,
    content,
  } : null;
}

function followUpTemplatesToMarkdown(templates: FollowUpTemplates | null, interview: Partial<Interview>): InterviewMarkdownDocument | null {
  if (!templates) return null;
  const title = `${interview.company || interview.role || "Interview"} Follow-up Templates`;
  const blocks = [
    ["Thank-you note", templates.thankYou],
    ["Progress check", templates.progressCheck],
    ["Addendum", templates.addendum],
    ["English follow-up", templates.englishFollowUp],
  ].filter(([, text]) => text);
  const content = [`# ${title}`, ...blocks.map(([heading, text]) => `\n## ${heading}\n${text}`)].join("\n").trim();
  return content ? {
    generatedAt: templates.generatedAt,
    updatedAt: templates.generatedAt,
    title,
    content,
  } : null;
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
