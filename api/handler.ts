import express from "express";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// Use JSON payload up to 10MB to accommodate base64 images
app.use(express.json({ limit: "10mb" }));

type AiProvider = "google" | "volcengine" | "openai" | "anthropic";

interface CalendarEventInput {
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

function sanitizeCalendarFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_").slice(0, 80) || "calendar-event";
}

function timezoneFallback(timezone?: string) {
  if (!timezone) return "";

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "";
  }
}

function createICS({
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
  const timezone = timezoneFallback(eventTimezoneName);
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

function calendarEventFromQuery(raw: Record<string, unknown>): CalendarEventInput {
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

function looksLikeUrl(value: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function cleanMeetingId(value: string) {
  const trimmed = value.trim();
  const separatorIndex = trimmed.search(/[:：]/);
  if (separatorIndex >= 0 && separatorIndex <= 30) {
    return trimmed.slice(separatorIndex + 1).trim();
  }
  return trimmed;
}

function normalizeParsedInterviewResult(data: any) {
  if (!data || typeof data !== "object") {
    return data;
  }

  const link = String(data.link || "").trim();
  const meetingId = String(data.meetingId || "").trim();

  if (!meetingId && link && !looksLikeUrl(link)) {
    return {
      ...data,
      link: "",
      meetingId: cleanMeetingId(link),
    };
  }

  return {
    ...data,
    link,
    meetingId,
  };
}

function firstEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function parseJsonResponse(content: string) {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(withoutFence.slice(start, end + 1));
    }
    throw new Error("AI returned non-JSON content");
  }
}

function normalizeTimezone(timezone?: string) {
  const fallback = "UTC";
  if (!timezone) return fallback;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return fallback;
  }
}

function getDatePartsForTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    dateTime: `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`,
    year: value("year"),
  };
}

function getServerAiConfig() {
  const provider = (process.env.MIANLEME_AI_PROVIDER || "volcengine").trim() as AiProvider;
  const envByProvider: Record<AiProvider, { keys: string[]; models: string[]; bases: string[]; defaultBase?: string; defaultModel?: string }> = {
    google: {
      keys: ["MIANLEME_AI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"],
      models: ["MIANLEME_AI_MODEL", "GEMINI_MODEL_NAME", "GOOGLE_MODEL_NAME"],
      bases: [],
      defaultModel: "gemini-2.5-flash",
    },
    volcengine: {
      keys: ["MIANLEME_AI_API_KEY", "VOLCENGINE_API_KEY", "ARK_API_KEY"],
      models: ["MIANLEME_AI_MODEL", "VOLCENGINE_MODEL_NAME", "ARK_MODEL", "ARK_MODEL_ID", "ARK_ENDPOINT_ID"],
      bases: ["MIANLEME_AI_API_BASE", "VOLCENGINE_API_BASE", "ARK_API_BASE"],
      defaultBase: "https://ark.cn-beijing.volces.com/api/v3",
    },
    openai: {
      keys: ["MIANLEME_AI_API_KEY", "OPENAI_API_KEY"],
      models: ["MIANLEME_AI_MODEL", "OPENAI_MODEL_NAME"],
      bases: ["MIANLEME_AI_API_BASE", "OPENAI_API_BASE"],
      defaultBase: "https://api.openai.com/v1",
      defaultModel: "gpt-4o-mini",
    },
    anthropic: {
      keys: ["MIANLEME_AI_API_KEY", "ANTHROPIC_API_KEY"],
      models: ["MIANLEME_AI_MODEL", "ANTHROPIC_MODEL_NAME"],
      bases: ["MIANLEME_AI_API_BASE", "ANTHROPIC_API_BASE"],
      defaultBase: "https://api.anthropic.com",
      defaultModel: "claude-3-5-sonnet-latest",
    },
  };

  const envConfig = envByProvider[provider];
  if (!envConfig) {
    throw new Error("智能识别服务配置错误");
  }

  const apiKey = firstEnv(envConfig.keys);
  const apiBase = firstEnv(envConfig.bases) || envConfig.defaultBase;
  const modelName = firstEnv(envConfig.models) || envConfig.defaultModel || "";

  if (!apiKey) {
    throw new Error("智能识别服务暂未开放");
  }
  if (!modelName) {
    throw new Error("智能识别服务配置错误");
  }

  return { provider, apiKey, modelName, apiBase };
}

async function callModel(prompt: string, text: string, imageBase64?: string) {
  const { provider, apiKey, modelName, apiBase } = getServerAiConfig();

  // Prepare contents
  let contents: any[] = [];
  if (text) {
    contents.push(text);
  }
  if (imageBase64) {
    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const mimeType = matches[1];
      const base64Data = matches[2];
      contents.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      });
    }
  }
  contents.push(prompt);

  switch (provider) {
    case "google": {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: modelName || "gemini-2.5-flash",
        contents: contents,
        config: {
          responseMimeType: "application/json",
        }
      });
      if (!response.text) throw new Error("No response from AI");
      return parseJsonResponse(response.text);
    }

    case "volcengine":
    case "openai": {
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: apiBase,
      });

      // Convert to OpenAI message format
      const messages: any[] = [
        {
          role: "user",
          content: []
        }
      ];

      for (const item of contents) {
        if (typeof item === "string") {
          messages[0].content.push({
            type: "text",
            text: item
          });
        } else if (item.inlineData) {
          messages[0].content.push({
            type: "image_url",
            image_url: {
              url: `data:${item.inlineData.mimeType};base64,${item.inlineData.data}`
            }
          });
        }
      }

      const response = await openai.chat.completions.create({
        model: modelName,
        messages: messages,
        temperature: 0,
        ...(provider === "openai" ? { response_format: { type: "json_object" as const } } : {}),
      });

      const content = response.choices[0].message.content;
      if (!content) throw new Error("No response from AI");
      return parseJsonResponse(content);
    }

    case "anthropic": {
      const anthropic = new Anthropic({
        apiKey: apiKey,
        baseURL: apiBase,
      });

      // Convert to Anthropic message format
      const messages: any[] = [
        {
          role: "user",
          content: []
        }
      ];

      for (const item of contents) {
        if (typeof item === "string") {
          messages[0].content.push({
            type: "text",
            text: item
          });
        } else if (item.inlineData) {
          messages[0].content.push({
            type: "image",
            source: {
              type: "base64",
              media_type: item.inlineData.mimeType,
              data: item.inlineData.data
            }
          });
        }
      }

      const response = await anthropic.messages.create({
        model: modelName,
        max_tokens: 1024,
        temperature: 0,
        messages: messages,
      });

      const content = response.content[0].type === 'text' ? response.content[0].text : '';
      if (!content) throw new Error("No response from AI");
      return parseJsonResponse(content);
    }

    default:
      throw new Error("Unsupported model provider");
  }
}

const parseInterview = async (req: express.Request, res: express.Response) => {
  try {
    const { text, imageBase64 } = req.body;
    const timezone = normalizeTimezone(req.body?.timezone);
    const timezoneToday = getDatePartsForTimezone(timezone);

    const prompt = `You are an AI assistant that extracts interview details from text or images.
User timezone: ${timezone}
Current date in user's timezone: ${timezoneToday.date}
Current datetime in user's timezone: ${timezoneToday.dateTime}

Extract the following information and return ONLY a valid JSON object:
- company: string (company name)
- role: string (job title/position)
- date: string (local datetime in the user's timezone, format "YYYY-MM-DDTHH:mm", no seconds, no timezone suffix. If no year is specified, assume ${timezoneToday.year}. If the source explicitly mentions another timezone, convert it to ${timezone}. If no timezone is mentioned, assume ${timezone})
- platform: string (e.g., Zoom, Teams, Google Meet, Tencent Meeting, Phone, On-site, etc.)
- link: string (meeting URL only. If no URL is available, leave it empty; do not put meeting IDs here)
- meetingId: string (conference or meeting number only, such as Zoom Meeting ID or Tencent Meeting number. Preserve useful spaces or dashes. Do not include passcodes/passwords)
- notes: string (any passcodes, passwords, dial-in details, or additional instructions. Separate points with newlines)
- durationMinutes: number (estimated duration of the interview in minutes. If not specified, default to 60)

Be resilient. If some information is not found, leave it as an empty string. If the platform is clearly an app (like Zoom), write the app name.

Output JSON format strictly:
{
  "company": "",
  "role": "",
  "date": "",
  "platform": "",
  "link": "",
  "meetingId": "",
  "notes": "",
  "durationMinutes": 60
}
`;

    const data = await callModel(prompt, text, imageBase64);
    res.json(normalizeParsedInterviewResult(data));
  } catch (error: any) {
    console.error("AI Error:", error);
    const isQuotaError = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('Quota exceeded') || error?.message?.includes('RESOURCE_EXHAUSTED') || error?.message?.includes('rate limit');
    if (isQuotaError) {
      return res.status(429).json({ error: "Quota Exceeded" });
    }
    const message = error?.message || "智能识别服务暂时不可用，请稍后重试";
    res.status(500).json({ error: message });
  }
};

const calendarInvite = (req: express.Request, res: express.Response) => {
  try {
    const event = calendarEventFromQuery(req.query as Record<string, unknown>);
    const ics = createICS(event);
    const filename = sanitizeCalendarFileName(event.title);

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${filename}.ics"`);
    res.status(200).send(ics);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Invalid calendar event" });
  }
};

app.post(["/parse-interview", "/api/parse-interview"], parseInterview);
app.get(["/calendar.ics", "/api/calendar.ics"], calendarInvite);

export default app;
