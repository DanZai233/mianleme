import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CalendarEventInput {
  title: string;
  description: string;
  location: string;
  dateStr: string;
  reminderHours: number;
  durationMinutes?: number;
}

// Format Date as yyyyMMddTHHmmssZ for ICS and calendar URLs.
function formatDateICS(dateStr: string | Date) {
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (isNaN(d.getTime())) {
    throw new Error("Invalid calendar date");
  }
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeICSText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_").slice(0, 80) || "calendar-event";
}

export function createICS({
  title,
  description,
  location,
  dateStr,
  reminderHours,
  durationMinutes = 60,
}: CalendarEventInput) {
  const startDate = new Date(dateStr);
  if (isNaN(startDate.getTime())) {
    throw new Error("Invalid calendar date");
  }

  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  
  const formattedStart = formatDateICS(startDate);
  const formattedEnd = formatDateICS(endDate);
  
  const uid = Date.now().toString() + "@interviewtracker.local";

  // Reminder trigger definition
  let alarmStr = "";
  if (reminderHours > 0) {
    alarmStr = `
BEGIN:VALARM
TRIGGER:-PT${reminderHours}H
ACTION:DISPLAY
DESCRIPTION:${escapeICSText(`Reminder: ${title}`)}
END:VALARM`;
  }

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//InterviewTracker//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${formattedStart}
DTSTART:${formattedStart}
DTEND:${formattedEnd}
SUMMARY:${escapeICSText(title)}
DESCRIPTION:${escapeICSText(description)}
LOCATION:${escapeICSText(location)}
${alarmStr.trim()}
END:VEVENT
END:VCALENDAR`;
}

export function createGoogleCalendarUrl(event: CalendarEventInput) {
  const startDate = new Date(event.dateStr);
  if (isNaN(startDate.getTime())) {
    throw new Error("Invalid calendar date");
  }

  const endDate = new Date(startDate.getTime() + (event.durationMinutes || 60) * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatDateICS(startDate)}/${formatDateICS(endDate)}`,
    details: event.description,
    location: event.location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadICS(event: CalendarEventInput) {
  const icsStr = createICS(event);

  const blob = new Blob([icsStr], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${sanitizeFileName(event.title)}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function addToSystemCalendar(event: CalendarEventInput) {
  const icsStr = createICS(event);
  const file = new File([icsStr], `${sanitizeFileName(event.title)}.ics`, { type: "text/calendar" });

  try {
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({
        files: [file],
        title: event.title,
      });
      return "shared";
    }
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return "cancelled";
    }
  }

  downloadICS(event);
  return "downloaded";
}
