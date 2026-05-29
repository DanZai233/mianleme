import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  CalendarEventInput,
  createCalendarEndpointUrl,
  createGoogleCalendarUrl,
  createICS,
  getCalendarEventDates,
} from "./calendar";
import { apiUrl } from "./api";

export { createGoogleCalendarUrl, createICS };
export type { CalendarEventInput };

type CalendarAddResult = "native" | "native-canceled" | "browser";

interface NativeCalendarEvent {
  title: string;
  notes: string;
  location: string;
  startDate: string;
  endDate: string;
  timezone: string;
  reminderMinutes: number;
}

interface NativeCalendarPlugin {
  addEvent(options: NativeCalendarEvent): Promise<{ eventIdentifier?: string; action?: "saved" | "canceled" | "deleted" | "unknown" }>;
}

const NativeCalendar = registerPlugin<NativeCalendarPlugin>("NativeCalendar");

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

export async function addToSystemCalendar(event: CalendarEventInput): Promise<CalendarAddResult> {
  const { startDate, endDate } = getCalendarEventDates(event);

  if (Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform()) {
    try {
      const result = await NativeCalendar.addEvent({
        title: event.title,
        notes: event.description,
        location: event.location,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        timezone: event.timezone || "",
        reminderMinutes: Math.max(0, Math.round((event.reminderHours || 0) * 60)),
      });
      if (result.action && result.action !== "saved") {
        return "native-canceled";
      }
      return "native";
    } catch (error: any) {
      const message = String(error?.message || error || "");
      console.warn("Native calendar add failed", message);
      if (message.includes("permission") || message.includes("denied")) {
        throw new Error("calendar-permission-denied");
      }
      if (message.includes("invalid-date")) {
        throw new Error("invalid-calendar-date");
      }
      throw new Error("calendar-unavailable");
    }
  }

  const calendarUrl = apiUrl(createCalendarEndpointUrl(event));

  if (typeof window !== "undefined") {
    window.location.assign(calendarUrl);
    return "browser";
  }

  throw new Error("calendar-unavailable");
}
