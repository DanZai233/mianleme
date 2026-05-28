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
  timezone?: string;
}

// Format Date as yyyyMMddTHHmmssZ for ICS and calendar URLs.
function formatDateICS(dateStr: string | Date) {
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (isNaN(d.getTime())) {
    throw new Error("Invalid calendar date");
  }
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezone(timezone?: string) {
  return timezone && isValidTimezone(timezone) ? timezone : getBrowserTimezone();
}

export function formatDateTimeForTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";

  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

export function normalizeExtractedDate(dateValue: unknown, timezone: string) {
  if (!dateValue) return "";
  const value = String(dateValue).trim();
  if (!value) return "";

  const localDateTime = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  const hasExplicitZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);

  if (localDateTime && !hasExplicitZone) {
    return `${localDateTime[1]}T${localDateTime[2]}`;
  }

  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) {
    return formatDateTimeForTimezone(parsed, timezone);
  }

  return "";
}

function formatLocalDateICS(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
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
  timezone: eventTimezoneName,
}: CalendarEventInput) {
  const startDate = new Date(dateStr);
  if (isNaN(startDate.getTime())) {
    throw new Error("Invalid calendar date");
  }

  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  
  const timezone = eventTimezone(timezoneFallback(eventTimezoneName));
  const useTimezone = Boolean(timezone);
  const formattedStart = useTimezone ? formatLocalDateICS(startDate) : formatDateICS(startDate);
  const formattedEnd = useTimezone ? formatLocalDateICS(endDate) : formatDateICS(endDate);
  const formattedTimestamp = formatDateICS(new Date());
  const startKey = useTimezone ? `DTSTART;TZID=${timezone}` : "DTSTART";
  const endKey = useTimezone ? `DTEND;TZID=${timezone}` : "DTEND";
  
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
DTSTAMP:${formattedTimestamp}
${startKey}:${formattedStart}
${endKey}:${formattedEnd}
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
  const timezone = eventTimezone(timezoneFallback(event.timezone));
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: timezone ? `${formatLocalDateICS(startDate)}/${formatLocalDateICS(endDate)}` : `${formatDateICS(startDate)}/${formatDateICS(endDate)}`,
    details: event.description,
    location: event.location,
  });
  if (timezone) {
    params.set("ctz", timezone);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function timezoneFallback(timezone?: string) {
  return timezone && isValidTimezone(timezone) ? timezone : "";
}

function eventTimezone(timezone: string) {
  return timezone;
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
