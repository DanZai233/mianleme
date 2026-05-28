import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  CalendarEventInput,
  createCalendarEndpointUrl,
  createGoogleCalendarUrl,
  createICS,
} from "./calendar";

export { createGoogleCalendarUrl, createICS };
export type { CalendarEventInput };

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

export async function addToSystemCalendar(event: CalendarEventInput) {
  const calendarUrl = createCalendarEndpointUrl(event);

  if (typeof window !== "undefined") {
    window.location.assign(calendarUrl);
    return "opened";
  }

  throw new Error("System calendar is unavailable outside the browser");
}
