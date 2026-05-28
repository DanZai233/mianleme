import { Capacitor, registerPlugin } from "@capacitor/core";
import { calendarDateFromString } from "./calendar";
import { Interview, Language } from "./types";

type NativeReminderPayload = {
  id: string;
  title: string;
  body: string;
  date: string;
};

interface NativeReminderPlugin {
  requestReminderPermissions(): Promise<{ granted: boolean }>;
  sync(options: { notifications: NativeReminderPayload[] }): Promise<{ scheduled: number }>;
}

interface NativeWidgetPlugin {
  updateSnapshot(options: { snapshot: Record<string, unknown> }): Promise<void>;
}

interface NativeSharePlugin {
  getPendingShare(): Promise<{ text?: string; imageBase64?: string }>;
  clearPendingShare(): Promise<void>;
}

const NativeReminder = registerPlugin<NativeReminderPlugin>("NativeReminder");
const NativeWidget = registerPlugin<NativeWidgetPlugin>("NativeWidget");
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
  const upcoming = interviews
    .filter((interview) => interview.status === "upcoming" && interview.date)
    .map((interview) => ({
      interview,
      time: calendarDateFromString(interview.date, timezone).getTime(),
    }))
    .filter(({ time }) => time > now)
    .sort((a, b) => a.time - b.time)[0];

  const snapshot = upcoming ? {
    company: upcoming.interview.company,
    role: upcoming.interview.role,
    stage: upcoming.interview.stage,
    date: new Date(upcoming.time).toISOString(),
    meetingId: upcoming.interview.meetingId,
    lang,
  } : {
    company: "",
    role: lang === "zh" ? "暂无待进行面试" : "No upcoming interviews",
    stage: "",
    date: "",
    meetingId: "",
    lang,
  };

  await NativeWidget.updateSnapshot({ snapshot });
}

export async function getPendingNativeShare() {
  if (!isNativeApp()) return {};
  return NativeShare.getPendingShare();
}

export async function clearPendingNativeShare() {
  if (!isNativeApp()) return;
  await NativeShare.clearPendingShare();
}
