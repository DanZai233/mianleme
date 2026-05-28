export type InterviewStatus = "upcoming" | "completed" | "archived";

export interface Interview {
  id: string;
  company: string;
  role: string;
  date: string; // ISO 8601
  platform: string;
  link: string;
  meetingId: string;
  notes: string;
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
