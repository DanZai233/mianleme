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

function eventTimezone(timezone: string) {
  return timezone;
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
