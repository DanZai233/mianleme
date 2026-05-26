import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format Date as yyyyMMddTHHmmssZ for ICS
function formatDateICS(dateStr: string) {
  const d = new Date(dateStr);
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function generateICS(
  title: string,
  description: string,
  location: string,
  dateStr: string,
  reminderHours: number,
  durationMinutes: number = 60
) {
  const startDate = new Date(dateStr);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  
  const formattedStart = formatDateICS(startDate.toISOString());
  const formattedEnd = formatDateICS(endDate.toISOString());
  
  const uid = Date.now().toString() + "@interviewtracker.local";

  // Reminder trigger definition
  let alarmStr = "";
  if (reminderHours > 0) {
    alarmStr = `
BEGIN:VALARM
TRIGGER:-PT${reminderHours}H
ACTION:DISPLAY
DESCRIPTION:Reminder: ${title}
END:VALARM`;
  }

  const icsStr = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//InterviewTracker//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${formattedStart}
DTSTART:${formattedStart}
DTEND:${formattedEnd}
SUMMARY:${title}
DESCRIPTION:${description.replace(/\n/g, '\\n')}
LOCATION:${location}
${alarmStr.trim()}
END:VEVENT
END:VCALENDAR`;

  const blob = new Blob([icsStr], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${title.replace(/\s+/g, '_')}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
