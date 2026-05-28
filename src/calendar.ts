export interface CalendarEventInput {
  title: string;
  description: string;
  location: string;
  dateStr: string;
  reminderHours: number;
  durationMinutes?: number;
  timezone?: string;
}

function formatDateICS(dateStr: string | Date) {
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (isNaN(d.getTime())) {
    throw new Error("Invalid calendar date");
  }
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function formatDatePartsICS(parts: { year: number; month: number; day: number; hour: number; minute: number; second?: number }) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${parts.year}${pad(parts.month)}${pad(parts.day)}T${pad(parts.hour)}${pad(parts.minute)}${pad(parts.second || 0)}`;
}

function getDateParts(date: Date, timezone?: string) {
  if (!timezone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }

  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(formatted.find((part) => part.type === type)?.value || 0);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function formatLocalDateICS(date: Date, timezone?: string) {
  return formatDatePartsICS(getDateParts(date, timezone));
}

function escapeICSText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function sanitizeCalendarFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_").slice(0, 80) || "calendar-event";
}

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function timezoneFallback(timezone?: string) {
  return timezone && isValidTimezone(timezone) ? timezone : "";
}

function parseLocalDateTime(dateStr: string) {
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  };
}

function timezoneOffsetMs(timezone: string, date: Date) {
  const parts = getDateParts(date, timezone);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
  return localAsUtc - date.getTime();
}

export function calendarDateFromString(dateStr: string, timezone?: string) {
  const normalizedTimezone = timezoneFallback(timezone);
  const hasExplicitZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(dateStr.trim());
  const localParts = parseLocalDateTime(dateStr);

  if (normalizedTimezone && localParts && !hasExplicitZone) {
    const localTimestamp = Date.UTC(
      localParts.year,
      localParts.month - 1,
      localParts.day,
      localParts.hour,
      localParts.minute,
      localParts.second || 0,
    );
    let utcTimestamp = localTimestamp - timezoneOffsetMs(normalizedTimezone, new Date(localTimestamp));
    utcTimestamp = localTimestamp - timezoneOffsetMs(normalizedTimezone, new Date(utcTimestamp));
    const date = new Date(utcTimestamp);
    if (isNaN(date.getTime())) {
      throw new Error("Invalid calendar date");
    }
    return date;
  }

  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    throw new Error("Invalid calendar date");
  }
  return parsed;
}

export function getCalendarEventDates(event: CalendarEventInput) {
  const startDate = calendarDateFromString(event.dateStr, event.timezone);
  const endDate = new Date(startDate.getTime() + (event.durationMinutes || 60) * 60 * 1000);
  return { startDate, endDate };
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
  const timezone = timezoneFallback(eventTimezoneName);
  const startDate = calendarDateFromString(dateStr, timezone);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  const useTimezone = Boolean(timezone);
  const formattedStart = useTimezone ? formatLocalDateICS(startDate, timezone) : formatDateICS(startDate);
  const formattedEnd = useTimezone ? formatLocalDateICS(endDate, timezone) : formatDateICS(endDate);
  const formattedTimestamp = formatDateICS(new Date());
  const startKey = useTimezone ? `DTSTART;TZID=${timezone}` : "DTSTART";
  const endKey = useTimezone ? `DTEND;TZID=${timezone}` : "DTEND";
  const calendarTimezone = useTimezone ? `X-WR-TIMEZONE:${timezone}` : "";
  const uid = `${Date.now()}@mianleme.app`;

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
PRODID:-//MianLeMe//Interview Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
${calendarTimezone}
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
  const timezone = timezoneFallback(event.timezone);
  const { startDate, endDate } = getCalendarEventDates(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: timezone ? `${formatLocalDateICS(startDate, timezone)}/${formatLocalDateICS(endDate, timezone)}` : `${formatDateICS(startDate)}/${formatDateICS(endDate)}`,
    details: event.description,
    location: event.location,
  });
  if (timezone) {
    params.set("ctz", timezone);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function createCalendarEndpointUrl(event: CalendarEventInput, endpoint = "/api/calendar.ics") {
  const params = new URLSearchParams({
    title: event.title,
    description: event.description,
    location: event.location,
    dateStr: event.dateStr,
    reminderHours: String(event.reminderHours || 0),
    durationMinutes: String(event.durationMinutes || 60),
  });

  if (event.timezone) {
    params.set("timezone", event.timezone);
  }

  return `${endpoint}?${params.toString()}`;
}

function textParam(raw: Record<string, unknown>, key: string, fallback = "") {
  const value = raw[key];
  if (Array.isArray(value)) {
    return value.length ? String(value[0] || fallback) : fallback;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return fallback;
  }
  return String(value);
}

function numberParam(raw: Record<string, unknown>, key: string, fallback: number) {
  const parsed = Number(textParam(raw, key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function calendarEventFromQuery(raw: Record<string, unknown>): CalendarEventInput {
  return {
    title: textParam(raw, "title", "Interview"),
    description: textParam(raw, "description"),
    location: textParam(raw, "location"),
    dateStr: textParam(raw, "dateStr"),
    reminderHours: numberParam(raw, "reminderHours", 0),
    durationMinutes: numberParam(raw, "durationMinutes", 60),
    timezone: textParam(raw, "timezone"),
  };
}
