import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { calendarEventFromQuery, createICS, sanitizeCalendarFileName } from "./src/calendar";
import { normalizeFollowUpTemplates, normalizePrepPack } from "./src/aiExtras";
import { normalizeParsedInterviewResult } from "./src/parseResult";

type AiProvider = "google" | "volcengine" | "openai" | "anthropic";

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

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // Use JSON payload up to 10MB to accommodate base64 images
  app.use(express.json({ limit: "10mb" }));

  // API Route for extracting interview details
  app.post("/api/parse-interview", async (req, res) => {
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
  });

  app.post("/api/generate-prep-pack", async (req, res) => {
    try {
      const interview = req.body?.interview || {};
      const lang = req.body?.lang === "en" ? "en" : "zh";
      const timezone = normalizeTimezone(req.body?.timezone);
      const prompt = lang === "zh"
        ? `你是一个严谨的求职面试教练。请根据面试信息生成移动端可直接阅读的准备包，只返回 JSON。

要求：
- possibleQuestions: 5-8 个最可能被问到的问题，贴合公司、岗位、备注和会议信息。
- starStories: 3-5 个 STAR 回答准备点，每条包含场景、行动、结果方向。
- questionsToAsk: 3-5 个适合反问面试官的问题。
- quickBrief: 4-6 条面试前 5 分钟速览要点。
- 不要编造公司不存在的事实；缺信息时用通用但有帮助的建议。

输出格式：
{
  "possibleQuestions": [],
  "starStories": [],
  "questionsToAsk": [],
  "quickBrief": []
}`
        : `You are a concise interview coach. Generate a mobile-friendly prep pack from the interview data and return JSON only.

Requirements:
- possibleQuestions: 5-8 likely questions tailored to company, role, notes, and meeting context.
- starStories: 3-5 STAR story prompts with situation/action/result direction.
- questionsToAsk: 3-5 good questions for the interviewer.
- quickBrief: 4-6 five-minute pre-interview reminders.
- Do not invent company-specific facts; use useful generic advice when information is missing.

Output:
{
  "possibleQuestions": [],
  "starStories": [],
  "questionsToAsk": [],
  "quickBrief": []
}`;

      const data = await callModel(prompt, JSON.stringify({ timezone, interview }, null, 2));
      res.json(normalizePrepPack(data));
    } catch (error: any) {
      console.error("Prep Pack Error:", error);
      res.status(500).json({ error: error?.message || "生成准备包失败" });
    }
  });

  app.post("/api/generate-followup-message", async (req, res) => {
    try {
      const interview = req.body?.interview || {};
      const lang = req.body?.lang === "en" ? "en" : "zh";
      const prompt = lang === "zh"
        ? `你是一个专业、自然、不油腻的求职沟通助手。根据面试信息、结果和面后评论，生成可复制的跟进模板，只返回 JSON。

要求：
- thankYou: 面试后 24 小时内发送的感谢消息，简洁真诚。
- progressCheck: 过了跟进时间后询问进度的消息，礼貌不催促。
- addendum: 用于补充材料或补充回答的消息。
- englishFollowUp: 英文跟进消息，语气专业。
- 不要出现占位符，信息不足时写得通用一些。

输出格式：
{
  "thankYou": "",
  "progressCheck": "",
  "addendum": "",
  "englishFollowUp": ""
}`
        : `You are a professional job-search communication assistant. Generate copy-ready follow-up templates from the interview data, result, and review. Return JSON only.

Requirements:
- thankYou: a concise thank-you note within 24 hours after the interview.
- progressCheck: a polite status check after the follow-up date.
- addendum: a note for sharing additional material or clarifying an answer.
- englishFollowUp: a polished English follow-up note.
- Do not use placeholders; keep it useful when details are missing.

Output:
{
  "thankYou": "",
  "progressCheck": "",
  "addendum": "",
  "englishFollowUp": ""
}`;

      const data = await callModel(prompt, JSON.stringify({ interview }, null, 2));
      res.json(normalizeFollowUpTemplates(data));
    } catch (error: any) {
      console.error("Follow-up Template Error:", error);
      res.status(500).json({ error: error?.message || "生成跟进模板失败" });
    }
  });

  app.get("/api/calendar.ics", (req, res) => {
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
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
