export type InterviewStatus = "upcoming" | "completed" | "archived";
export type InterviewResult = "unknown" | "waiting" | "offer" | "rejected" | "withdrawn";
export type InterviewStage = "applied" | "hr" | "technical1" | "technical2" | "final" | "offerTalk" | "closed";

export interface PrepChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface InterviewPrepPack {
  generatedAt: string;
  possibleQuestions: string[];
  starStories: string[];
  questionsToAsk: string[];
  quickBrief: string[];
}

export interface FollowUpTemplates {
  generatedAt: string;
  thankYou: string;
  progressCheck: string;
  addendum: string;
  englishFollowUp: string;
}

export interface InterviewMarkdownDocument {
  generatedAt: string;
  updatedAt: string;
  title: string;
  content: string;
}

export interface Interview {
  id: string;
  company: string;
  role: string;
  date: string; // ISO 8601
  platform: string;
  link: string;
  meetingId: string;
  notes: string;
  review: string;
  result: InterviewResult;
  stage: InterviewStage;
  prepChecklist: PrepChecklistItem[];
  prepPack: InterviewPrepPack | null;
  prepPackMarkdown: InterviewMarkdownDocument | null;
  followUpTemplates: FollowUpTemplates | null;
  followUpTemplatesMarkdown: InterviewMarkdownDocument | null;
  followUpDate: string;
  followUpDone: boolean;
  status: InterviewStatus;
  reminderHours: number; // e.g., 1 for 1 hour before
  durationMinutes: number; // e.g., 60 for 1 hour
}

export type Language = "en" | "zh";

export interface AppState {
  interviews: Interview[];
  language: Language;
  timezone: string;
  darkMode: boolean;
  notificationsEnabled: boolean;
}
