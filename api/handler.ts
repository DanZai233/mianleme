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

function normalizeMarkdownDocumentOutput(data: any, fallbackTitle: string) {
  const content = typeof data === "string" ? data : String(data?.content || "");
  return {
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: String(data?.title || fallbackTitle),
    content: content.trim(),
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
  const maxOutputTokens = 3000;

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
        max_tokens: maxOutputTokens,
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
        max_tokens: maxOutputTokens,
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

const generatePrepPack = async (req: express.Request, res: express.Response) => {
  try {
    const interview = req.body?.interview || {};
    const lang = req.body?.lang === "en" ? "en" : "zh";
    const timezone = normalizeTimezone(req.body?.timezone);
    const prompt = lang === "zh"
      ? `你是一个严谨、具体、可执行的求职面试教练。请根据面试信息生成一份详细但精炼的 Markdown 准备包，只返回 JSON。

准备包必须包含这些 Markdown 章节：
# 面试准备包
## 1. 面试信息摘要
## 2. 岗位能力画像
## 3. 公司/业务理解框架
## 4. 高频问题与答题要点（10 个）
## 5. 技术/业务深挖问题（8 个）
## 6. STAR 案例库（5 个，每个包含背景、行动、结果、可量化亮点）
## 7. 可反问面试官的问题（8 个，按 HR/技术/业务/团队分类）
## 8. 面试前 30 分钟检查清单
## 9. 风险点与补救话术
## 10. 会议/链接/备注核对

要求：
- 内容要具体、可直接照着准备，移动端阅读友好。
- 不要编造公司不存在的事实；缺信息时写“需要确认”并给出确认方法。
- 深度结合公司、岗位、阶段、备注、岗位 JD、简历片段、公司研究、面试官信息、会议平台、面试时间和时区。
- 把简历片段转成可讲述的 STAR 素材，并标出最适合回答哪些问题。
- 如果 JD 或公司研究里出现明确技能/业务关键词，必须在能力画像和问题列表中覆盖。
- 每条问题的答题要点控制在 2-3 个短 bullet，每个 STAR 案例控制在 4 行内。
- 总长度控制在 1800-2600 个中文字符，优先保留最关键、最贴合这场面试的内容。
- 输出 JSON only，不要 Markdown 代码块。

输出格式：
{
  "title": "xxx 面试准备包",
  "content": "# 面试准备包\\n..."
}`
      : `You are a rigorous, specific, actionable interview coach. Generate a detailed but concise Markdown prep pack from the interview data and return JSON only.

The Markdown must include:
# Interview Prep Pack
## 1. Interview Summary
## 2. Role Competency Map
## 3. Company / Business Understanding Framework
## 4. Likely Questions and Answer Angles (10)
## 5. Deep-Dive Technical / Business Questions (8)
## 6. STAR Story Bank (5, each with situation, action, result, measurable proof)
## 7. Questions to Ask the Interviewer (8, grouped by HR/technical/business/team)
## 8. 30-Minute Pre-Interview Checklist
## 9. Risks and Recovery Talking Points
## 10. Meeting / Link / Notes Verification

Requirements:
- Be specific, practical, and mobile-friendly.
- Do not invent company facts; mark unknowns as "to confirm" and explain how to confirm.
- Deeply use company, role, stage, notes, job description, resume snapshot, company research, interviewer info, platform, meeting time, and timezone.
- Turn resume snippets into usable STAR material and label which questions each story can answer.
- If the JD or company research contains explicit skill/business keywords, cover them in the competency map and question list.
- Keep each question's answer angle to 2-3 short bullets and each STAR story within 4 lines.
- Keep the full document around 1,200-1,800 English words, prioritizing the most relevant details.
- Return JSON only. Do not wrap it in a Markdown fence.

Output:
{
  "title": "xxx Interview Prep Pack",
  "content": "# Interview Prep Pack\\n..."
}`;

    const data = await callModel(prompt, JSON.stringify({ timezone, interview }, null, 2));
    res.json(normalizeMarkdownDocumentOutput(data, lang === "zh" ? "面试准备包" : "Interview Prep Pack"));
  } catch (error: any) {
    console.error("Prep Pack Error:", error);
    res.status(500).json({ error: error?.message || "生成准备包失败" });
  }
};

const generateFollowUpMessage = async (req: express.Request, res: express.Response) => {
  try {
    const interview = req.body?.interview || {};
    const lang = req.body?.lang === "en" ? "en" : "zh";
    const prompt = lang === "zh"
      ? `你是一个专业、自然、不油腻的求职沟通助手。根据面试信息、结果和面后评论，生成可复制的 Markdown 跟进模板文档，只返回 JSON。

要求：
- thankYou: 面试后 24 小时内发送的感谢消息，简洁真诚。
- progressCheck: 过了跟进时间后询问进度的消息，礼貌不催促。
- addendum: 用于补充材料或补充回答的消息。
- englishFollowUp: 英文跟进消息，语气专业。
- 不要出现占位符，信息不足时写得通用一些。
- Markdown 文档需要包含每个模板的适用场景、发送时机、正文。
- 尽量结合公司、岗位、面试阶段、面后复盘、JD、简历片段和公司研究，让内容不像通用套话。

输出格式：
{
  "title": "xxx 跟进模板",
  "content": "# 感谢/跟进模板\\n..."
}`
      : `You are a professional job-search communication assistant. Generate a copy-ready Markdown follow-up template document from the interview data, result, and review. Return JSON only.

Requirements:
- thankYou: a concise thank-you note within 24 hours after the interview.
- progressCheck: a polite status check after the follow-up date.
- addendum: a note for sharing additional material or clarifying an answer.
- englishFollowUp: a polished English follow-up note.
- Do not use placeholders; keep it useful when details are missing.
- The Markdown must include use case, timing, and body for each template.
- Use company, role, stage, post-interview notes, JD, resume snapshot, and company research whenever available so the messages do not feel generic.

Output:
{
  "title": "xxx Follow-up Templates",
  "content": "# Follow-up Templates\\n..."
}`;

    const data = await callModel(prompt, JSON.stringify({ interview }, null, 2));
    res.json(normalizeMarkdownDocumentOutput(data, lang === "zh" ? "感谢/跟进模板" : "Follow-up Templates"));
  } catch (error: any) {
    console.error("Follow-up Template Error:", error);
    res.status(500).json({ error: error?.message || "生成跟进模板失败" });
  }
};

const chatDocument = async (req: express.Request, res: express.Response) => {
  try {
    const interview = req.body?.interview || {};
    const document = req.body?.document || {};
    const message = String(req.body?.message || "").trim();
    const lang = req.body?.lang === "en" ? "en" : "zh";
    const timezone = normalizeTimezone(req.body?.timezone);
    const documentType = req.body?.documentType === "followUp" ? "followUp" : "prep";
    if (!message) {
      return res.status(400).json({ error: lang === "zh" ? "请输入修改要求" : "Please enter a request" });
    }

    const prompt = lang === "zh"
      ? `你是面试文档编辑助手。请根据用户要求回答问题，并在有必要时修改当前 Markdown 文档。

规则：
- 如果用户只是提问，reply 回答，content 可以保持原文。
- 如果用户要求修改/补充/润色，请直接返回完整更新后的 Markdown 文档。
- 准备包文档要尽可能详细、具体、可执行。
- 不要编造公司事实；不确定处标记“需要确认”。
- 参考并延续历史对话，不要让用户重复说明。
- 优先利用这场面试绑定的 JD、简历片段、公司研究和面试官信息。
- 只返回 JSON。

输出格式：
{
  "reply": "给用户的简短说明",
  "title": "文档标题",
  "content": "完整 Markdown 文档"
}`
      : `You are an interview document editing assistant. Answer the user's request and update the current Markdown document when useful.

Rules:
- If the user only asks a question, answer in reply and keep content unchanged.
- If the user asks to edit, expand, or polish, return the complete updated Markdown document.
- Prep documents should be detailed, specific, and actionable.
- Do not invent company facts; mark uncertain facts as "to confirm".
- Use and continue the chat history so the user does not need to repeat context.
- Prioritize the interview's attached JD, resume snapshot, company research, and interviewer info.
- Return JSON only.

Output:
{
  "reply": "short response to the user",
  "title": "document title",
  "content": "complete Markdown document"
}`;

    const data = await callModel(prompt, JSON.stringify({
      timezone,
      documentType,
      interview,
      document,
      chatMessages: req.body?.chatMessages || document.chatMessages || [],
      userRequest: message,
    }, null, 2));

    const normalized = normalizeMarkdownDocumentOutput(data, document.title || (documentType === "prep" ? "Interview Prep Pack" : "Follow-up Templates"));
    res.json({
      reply: String(data?.reply || (lang === "zh" ? "已更新文档" : "Document updated")),
      document: {
        ...normalized,
        generatedAt: String(document.generatedAt || normalized.generatedAt),
      },
    });
  } catch (error: any) {
    console.error("Document Chat Error:", error);
    res.status(500).json({ error: error?.message || "AI 文档处理失败" });
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
app.post(["/generate-prep-pack", "/api/generate-prep-pack"], generatePrepPack);
app.post(["/generate-followup-message", "/api/generate-followup-message"], generateFollowUpMessage);
app.post(["/chat-document", "/api/chat-document"], chatDocument);
app.get(["/calendar.ics", "/api/calendar.ics"], calendarInvite);

export default app;
