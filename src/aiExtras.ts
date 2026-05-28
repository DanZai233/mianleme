import { FollowUpTemplates, InterviewPrepPack } from "./types";

function asTextArray(value: unknown, fallback: string[] = []) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(/\n+/).map((item) => item.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean).slice(0, 8);
  }
  return fallback;
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizePrepPack(data: any): InterviewPrepPack {
  return {
    generatedAt: new Date().toISOString(),
    possibleQuestions: asTextArray(data?.possibleQuestions),
    starStories: asTextArray(data?.starStories),
    questionsToAsk: asTextArray(data?.questionsToAsk),
    quickBrief: asTextArray(data?.quickBrief),
  };
}

export function normalizeFollowUpTemplates(data: any): FollowUpTemplates {
  return {
    generatedAt: new Date().toISOString(),
    thankYou: asText(data?.thankYou),
    progressCheck: asText(data?.progressCheck),
    addendum: asText(data?.addendum),
    englishFollowUp: asText(data?.englishFollowUp),
  };
}
