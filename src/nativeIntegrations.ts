import { Capacitor, registerPlugin } from "@capacitor/core";
import { calendarDateFromString } from "./calendar";
import { Interview, Language } from "./types";

type NativeReminderPayload = {
  id: string;
  title: string;
  body: string;
  date: string;
  category?: string;
  company?: string;
  role?: string;
  stage?: string;
  interviewDate?: string;
  meetingId?: string;
  platform?: string;
  link?: string;
  lang?: Language;
};

interface NativeReminderPlugin {
  requestReminderPermissions(): Promise<{ granted: boolean }>;
  sync(options: { notifications: NativeReminderPayload[] }): Promise<{ scheduled: number }>;
}

interface NativeWidgetPlugin {
  updateSnapshot(options: { snapshot: Record<string, unknown> }): Promise<void>;
}

type NativeLiveActivityPayload = {
  interviewId: string;
  company: string;
  role: string;
  stage: string;
  interviewDate: string;
  meetingId: string;
  platform: string;
  link: string;
  lang: Language;
};

interface NativeLiveActivityPlugin {
  sync(options: { activity?: NativeLiveActivityPayload }): Promise<{ active: boolean; reason?: string }>;
  end(): Promise<{ ended: boolean }>;
}

interface NativeSharePlugin {
  getPendingShare(): Promise<{ text?: string; imageBase64?: string }>;
  clearPendingShare(): Promise<void>;
}

const NativeReminder = registerPlugin<NativeReminderPlugin>("NativeReminder");
const NativeWidget = registerPlugin<NativeWidgetPlugin>("NativeWidget");
const NativeLiveActivity = registerPlugin<NativeLiveActivityPlugin>("NativeLiveActivity");
const NativeShare = registerPlugin<NativeSharePlugin>("NativeShare");

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export async function requestNativeReminderPermission() {
  if (!isNativeApp()) return false;
  const result = await NativeReminder.requestReminderPermissions();
  return Boolean(result.granted);
}

export async function syncNativeInterviewReminders(interviews: Interview[], lang: Language, timezone: string) {
  if (!isNativeApp()) return;
  const now = Date.now();
  const notifications: NativeReminderPayload[] = [];

  interviews.forEach((interview) => {
    if (interview.status === "upcoming" && interview.date) {
      const startDate = calendarDateFromString(interview.date, timezone);
      const reminderAt = new Date(startDate.getTime() - (interview.reminderHours || 0) * 60 * 60 * 1000);
      if (reminderAt.getTime() > now) {
        notifications.push({
          id: `mianleme_interview_${interview.id}_${interview.date}_${interview.reminderHours}`,
          title: lang === "zh" ? "面试快开始了" : "Interview coming up",
          body: `${interview.company} - ${interview.role}`,
          date: reminderAt.toISOString(),
          category: "MianlemeInterviewSummary",
          company: interview.company,
          role: interview.role,
          stage: interview.stage,
          interviewDate: startDate.toISOString(),
          meetingId: interview.meetingId,
          platform: interview.platform,
          link: interview.link,
          lang,
        });
      }
    }

    if (interview.status === "completed" && interview.followUpDate && !interview.followUpDone) {
      const followUpAt = calendarDateFromString(interview.followUpDate, timezone);
      if (followUpAt.getTime() > now) {
        notifications.push({
          id: `mianleme_followup_${interview.id}_${interview.followUpDate}`,
          title: lang === "zh" ? "该跟进面试进度了" : "Follow-up due",
          body: `${interview.company} - ${interview.role}`,
          date: followUpAt.toISOString(),
        });
      }
    }
  });

  await NativeReminder.sync({ notifications });
}

export async function syncWidgetSnapshot(interviews: Interview[], timezone: string, lang: Language) {
  if (!isNativeApp()) return;
  const now = Date.now();
  const candidates = interviews
    .filter((interview) => interview.status === "upcoming")
    .map((interview) => {
      try {
        const time = interview.date ? calendarDateFromString(interview.date, timezone).getTime() : NaN;
        return Number.isFinite(time) ? { interview, time, hasValidDate: true } : { interview, time: Number.POSITIVE_INFINITY, hasValidDate: false };
      } catch {
        return { interview, time: Number.POSITIVE_INFINITY, hasValidDate: false };
      }
    });

  const future = candidates
    .filter(({ hasValidDate, time }) => hasValidDate && time > now)
    .sort((a, b) => a.time - b.time)[0];
  const nearestPending = candidates
    .filter(({ hasValidDate }) => hasValidDate)
    .sort((a, b) => Math.abs(a.time - now) - Math.abs(b.time - now))[0];
  const fallbackPending = candidates[0];
  const upcoming = future || nearestPending || fallbackPending;
  const futureItems = candidates
    .filter(({ hasValidDate, time }) => hasValidDate && time > now)
    .sort((a, b) => a.time - b.time)
    .slice(0, 12)
    .map(({ interview, time }) => ({
      company: interview.company,
      role: interview.role,
      stage: interview.stage,
      date: new Date(time).toISOString(),
      timestamp: time,
      meetingId: interview.meetingId,
      lang,
    }));

  const snapshot = upcoming ? {
    hasInterview: true,
    company: upcoming.interview.company,
    role: upcoming.interview.role,
    stage: upcoming.interview.stage,
    date: upcoming.hasValidDate ? new Date(upcoming.time).toISOString() : "",
    timestamp: upcoming.hasValidDate ? upcoming.time : 0,
    meetingId: upcoming.interview.meetingId,
    lang,
    items: futureItems,
    updatedAt: new Date(now).toISOString(),
  } : {
    hasInterview: false,
    company: "",
    role: lang === "zh" ? "暂无待进行面试" : "No upcoming interviews",
    stage: "",
    date: "",
    timestamp: 0,
    meetingId: "",
    lang,
    items: [],
    updatedAt: new Date(now).toISOString(),
  };

  await NativeWidget.updateSnapshot({ snapshot });
}

export async function syncLiveActivity(interviews: Interview[], timezone: string, lang: Language) {
  if (!isNativeApp()) return;
  const now = Date.now();
  const next = interviews
    .filter((interview) => interview.status === "upcoming" && interview.date)
    .map((interview) => {
      try {
        const time = calendarDateFromString(interview.date, timezone).getTime();
        return Number.isFinite(time) ? { interview, time } : null;
      } catch {
        return null;
      }
    })
    .filter((item): item is { interview: Interview; time: number } => Boolean(item) && item.time > now)
    .sort((a, b) => a.time - b.time)[0];

  if (!next) {
    await NativeLiveActivity.end();
    return;
  }

  await NativeLiveActivity.sync({
    activity: {
      interviewId: next.interview.id,
      company: next.interview.company,
      role: next.interview.role,
      stage: next.interview.stage,
      interviewDate: new Date(next.time).toISOString(),
      meetingId: next.interview.meetingId,
      platform: next.interview.platform,
      link: next.interview.link,
      lang,
    },
  });
}

export async function getPendingNativeShare() {
  if (!isNativeApp()) return {};
  return NativeShare.getPendingShare();
}

export async function clearPendingNativeShare() {
  if (!isNativeApp()) return;
  await NativeShare.clearPendingShare();
}
