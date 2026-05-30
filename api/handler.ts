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

function compactText(value: unknown, fallback: string, maxLength = 360) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return fallback;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function extractKeywords(interview: any, lang: "zh" | "en") {
  const text = [
    interview?.role,
    interview?.stage,
    interview?.notes,
    interview?.jobDescription,
    interview?.resumeSnapshot,
    interview?.companyResearch,
    interview?.interviewerInfo,
  ].filter(Boolean).join(" ");
  const stopWords = new Set([
    "负责", "要求", "经验", "岗位", "公司", "业务", "项目", "能力", "面试", "团队", "相关",
    "the", "and", "for", "with", "role", "team", "work", "project", "experience",
  ]);
  const matches = text.match(/[A-Za-z][A-Za-z0-9+#./-]{1,}|[\u4e00-\u9fa5]{2,8}/g) || [];
  return Array.from(new Set(matches.map((item) => item.trim()).filter((item) => item.length > 1 && !stopWords.has(item.toLowerCase())))).slice(0, 8);
}

function buildPrepPackDraft(interview: any, lang: "zh" | "en", timezone: string) {
  const company = compactText(interview?.company, lang === "zh" ? "待确认公司" : "Company to confirm", 80);
  const role = compactText(interview?.role, lang === "zh" ? "待确认岗位" : "Role to confirm", 80);
  const stage = compactText(interview?.stage, lang === "zh" ? "待确认阶段" : "Stage to confirm", 80);
  const date = compactText(interview?.date, lang === "zh" ? "待确认时间" : "Time to confirm", 80);
  const platform = compactText(interview?.platform, lang === "zh" ? "待确认平台" : "Platform to confirm", 80);
  const notes = compactText(interview?.notes, lang === "zh" ? "暂无备注" : "No notes yet");
  const jd = compactText(interview?.jobDescription, lang === "zh" ? "未填写 JD：建议补充职责、技术栈、业务目标和任职要求。" : "No JD yet: add responsibilities, stack, business goals, and requirements.");
  const resume = compactText(interview?.resumeSnapshot, lang === "zh" ? "未填写简历片段：建议补充 2-3 个最匹配项目和量化结果。" : "No resume snapshot yet: add 2-3 matching projects and measurable results.");
  const research = compactText(interview?.companyResearch, lang === "zh" ? "未填写公司研究：建议补充产品、客户、商业模式、近期动态。" : "No company research yet: add product, customer, business model, and recent updates.");
  const interviewer = compactText(interview?.interviewerInfo, lang === "zh" ? "未填写面试官信息。" : "No interviewer info yet.");
  const keywords = extractKeywords(interview, lang);
  const keywordText = keywords.length ? keywords.join(" / ") : (lang === "zh" ? "需要从 JD 中确认" : "to confirm from JD");
  const title = lang === "zh" ? `${company} ${role} 面试准备包` : `${company} ${role} Interview Prep Pack`;

  if (lang === "en") {
    return {
      title,
      content: `# Interview Prep Pack

## 1. Interview Summary
- Company: ${company}
- Role: ${role}
- Stage: ${stage}
- Time / timezone: ${date} (${timezone})
- Platform: ${platform}
- Notes: ${notes}
- Keywords to cover: ${keywordText}

## 2. Role Competency Map
- Core match: connect the JD requirements to your strongest resume proof.
- JD: ${jd}
- Resume proof: ${resume}
- Prepare one clear metric for every important skill keyword.

## 3. Company / Business Understanding Framework
- Current understanding: ${research}
- Explain the likely user, product value, monetization, and operational bottleneck.
- Mark unknown facts as "to confirm" and verify them from the website, product pages, and recruiter messages.

## 4. Likely Questions and Answer Angles
1. Tell me about yourself. Focus on ${role}, ${keywordText}, and one measurable result.
2. Why this company? Tie ${company}'s business context to your motivation.
3. Why this role? Map JD needs to your resume proof.
4. Walk me through your most relevant project. Use situation, responsibility, decisions, result.
5. What was the hardest technical/business tradeoff? Explain options and why you chose one.
6. How do you measure success? Pick metrics that match the JD and business.
7. Describe a failure or conflict. Show ownership and what changed afterward.
8. How would you start in the first 30/60/90 days? Learn context, ship a focused win, then scale.
9. What are your strengths and gaps? Keep strengths role-specific and gaps manageable.
10. What questions do you have for us? Ask about team goals, success metrics, and constraints.

## 5. Deep-Dive Technical / Business Questions
1. Which parts of the JD have you used in production? Prepare examples for ${keywordText}.
2. How did you design reusable components or systems under changing requirements?
3. How did you improve performance, quality, or delivery speed? Use before/after metrics.
4. How do you debug a hard production issue from symptom to root cause?
5. How do you balance product speed with maintainability?
6. How do you collaborate with product/design/business stakeholders?
7. What would you inspect first in ${company}'s product or workflow?
8. What risk would you watch if joining this team?

## 6. STAR Story Bank
1. Relevant project: use ${resume}; emphasize your action and measurable impact.
2. Performance/quality improvement: describe baseline, bottleneck, fix, and result.
3. Cross-functional delivery: show how you aligned priorities and managed scope.
4. Difficult problem: explain investigation path and what you learned.
5. Fast learning: connect a new skill to a delivered business outcome.

## 7. Questions to Ask the Interviewer
- HR: What does success look like in probation?
- HR: What is the hiring timeline after this round?
- Technical: What are the current engineering quality priorities?
- Technical: Which systems or modules need the most improvement?
- Business: What user or revenue metric matters most this quarter?
- Business: What makes this team different from competitors?
- Team: Who would I work with most closely?
- Team: What would the first high-impact project likely be?

## 8. 30-Minute Pre-Interview Checklist
- Reopen resume, JD, meeting link, and this prep pack.
- Prepare 2 STAR stories and 2 questions you must ask.
- Test camera, mic, network, screen sharing, and charger.
- Turn off notifications and keep water nearby.
- Join 3-5 minutes early.

## 9. Risks and Recovery Talking Points
- Missing company facts: "I still need to confirm that detail, but my current understanding is..."
- Unknown technical detail: reason from first principles and explain how you would verify.
- Weak resume match: bridge from adjacent experience and state your ramp-up plan.
- Nervous pause: ask for 10 seconds to structure the answer.

## 10. Meeting / Link / Notes Verification
- Platform: ${platform}
- Interviewer: ${interviewer}
- Link / meeting ID: ${compactText(interview?.link || interview?.meetingId, "to confirm", 120)}
- Final note: ${notes}`,
    };
  }

  return {
    title,
    content: `# 面试准备包

## 1. 面试信息摘要
- 公司：${company}
- 岗位：${role}
- 阶段：${stage}
- 时间/时区：${date}（${timezone}）
- 平台：${platform}
- 备注：${notes}
- 本场关键词：${keywordText}

## 2. 岗位能力画像
- 核心匹配：把 JD 要求和你最强的项目证据一一对应。
- JD 摘要：${jd}
- 简历证据：${resume}
- 准备原则：每个重要技能关键词都准备一个项目、一个动作、一个量化结果。

## 3. 公司/业务理解框架
- 当前研究：${research}
- 面试前补齐：产品/客户是谁、解决什么问题、怎么赚钱、当前增长或效率瓶颈在哪里。
- 不确定信息统一标记“需要确认”，可从官网、招聘 JD、产品页面、HR 消息里核对。

## 4. 高频问题与答题要点
1. 请做自我介绍：用「岗位匹配 + 关键词 ${keywordText} + 量化成果」讲 2 分钟。
2. 为什么选择 ${company}：结合业务理解和你能解决的问题，不讲空泛喜欢。
3. 为什么适合 ${role}：按 JD 要求逐条映射项目经历。
4. 介绍一个最相关项目：说清背景、你的职责、关键决策、结果。
5. 最难的技术/业务取舍：讲候选方案、选择原因、复盘。
6. 如何衡量工作成功：用和业务/JD 对齐的指标回答。
7. 遇到冲突或失败怎么办：强调 ownership、沟通和改进。
8. 入职 30/60/90 天计划：先理解业务，再交付小胜利，最后沉淀机制。
9. 优势和短板：优势贴岗位，短板要可控且有改进动作。
10. 你有什么问题：围绕团队目标、成功标准、当前挑战反问。

## 5. 技术/业务深挖问题
1. JD 里的 ${keywordText}，你哪些在生产项目里真正做过？
2. 你如何设计可复用组件/模块，面对需求变化怎么保持可维护？
3. 你做过哪些性能、质量或效率优化？准备优化前后指标。
4. 线上问题从现象到根因，你的排查路径是什么？
5. 如何平衡交付速度和长期工程质量？
6. 和产品/设计/业务方意见不一致时怎么推进？
7. 如果接手 ${company} 的相关业务，你会先看哪些数据或流程？
8. 你认为这个岗位最大的风险是什么，怎么提前降低？

## 6. STAR 案例库
1. 最相关项目：基于「${resume}」讲背景、你的动作、量化结果，适合回答项目深挖。
2. 性能/质量优化：讲基线、瓶颈、方案、结果，适合回答 ${keywordText}。
3. 跨部门协作：讲目标冲突、对齐方法、最终交付，适合回答沟通题。
4. 复杂问题排查：讲定位路径和复盘机制，适合回答抗压和解决问题。
5. 快速学习落地：讲新技术/新业务如何转成结果，适合回答成长性。

## 7. 可反问面试官的问题
- HR：试用期成功标准是什么？
- HR：后续面试和反馈节奏是怎样的？
- 技术：团队当前最关注的工程质量问题是什么？
- 技术：哪些模块最需要重构或性能优化？
- 业务：这个岗位今年最重要的业务指标是什么？
- 业务：当前业务增长或交付最大的瓶颈在哪里？
- 团队：入职后主要合作对象是谁？
- 团队：前三个月最可能负责的高影响项目是什么？

## 8. 面试前 30 分钟检查清单
- 打开简历、JD、会议链接和这份准备包。
- 选定 2 个必须讲好的 STAR 案例和 2 个必须反问的问题。
- 测试摄像头、麦克风、网络、屏幕共享和电量。
- 关闭通知，准备水和纸笔。
- 提前 3-5 分钟进入会议。

## 9. 风险点与补救话术
- 公司事实不确定：“这点我还需要确认，我目前的理解是……也想请教您实际情况。”
- 技术细节不会：“我没有直接做过，但我会从……路径排查/验证。”
- 经验不完全匹配：用相邻项目证明迁移能力，并给出上手计划。
- 临场卡顿：“我整理 10 秒再回答，避免漏掉关键点。”

## 10. 会议/链接/备注核对
- 平台：${platform}
- 面试官：${interviewer}
- 链接/会议号：${compactText(interview?.link || interview?.meetingId, "需要确认", 120)}
- 最后提醒：${notes}`,
  };
}

function buildFollowUpDraft(interview: any, lang: "zh" | "en") {
  const company = compactText(interview?.company, lang === "zh" ? "贵司" : "your team", 80);
  const role = compactText(interview?.role, lang === "zh" ? "相关岗位" : "the role", 80);
  const review = compactText(interview?.review || interview?.notes, lang === "zh" ? "今天交流的岗位职责、团队目标和后续安排" : "the role responsibilities, team goals, and next steps");
  const jd = compactText(interview?.jobDescription, lang === "zh" ? "岗位要求" : "role requirements", 160);
  const resume = compactText(interview?.resumeSnapshot, lang === "zh" ? "我的相关项目经历" : "my relevant project experience", 160);
  const title = lang === "zh" ? `${company} ${role} 跟进模板` : `${company} ${role} Follow-up Templates`;

  if (lang === "en") {
    return {
      title,
      content: `# Follow-up Templates

## Thank-you Note
**When to send:** within 24 hours after the interview.

Hi, thank you again for taking the time to speak with me about ${role}. I appreciated learning more about ${review}. The conversation made me more interested in ${company}, especially because the role connects strongly with ${jd}. My experience with ${resume} feels relevant to the problems your team is working on. Please let me know if I can share any additional material.

## Progress Check
**When to send:** after the expected feedback date or 3-5 business days.

Hi, I hope you are doing well. I wanted to politely check whether there is any update on the ${role} interview process. I remain very interested in the opportunity at ${company}. If there is anything else I can provide, I would be happy to send it over.

## Addendum
**When to send:** when you want to clarify an answer or share supporting material.

Hi, after reflecting on our conversation, I wanted to add one point related to ${jd}. In my previous work, ${resume}, which may be useful context for evaluating my fit. I am happy to provide more detail if helpful.

## English Follow-up
Use the thank-you or progress-check version above depending on timing. Keep it concise, specific, and tied to ${company}'s role needs.`,
    };
  }

  return {
    title,
    content: `# 感谢/跟进模板

## 感谢面试官
**发送时机：** 面试后 24 小时内。

您好，感谢您今天抽时间和我交流 ${role}。今天聊到的「${review}」让我对 ${company} 和这个岗位有了更具体的理解。结合岗位要求「${jd}」，我也觉得自己过往「${resume}」的经历和团队需要解决的问题比较匹配。如果后续需要我补充项目材料、作品集或更详细的案例说明，我可以随时整理发送。再次感谢，祝工作顺利！

## 询问进度
**发送时机：** 超过约定反馈时间，或面试后 3-5 个工作日仍未收到消息。

您好，打扰您。我想礼貌跟进一下 ${company} ${role} 的面试进展。目前我依然对这个机会非常感兴趣，也愿意继续补充任何有助于评估的材料。辛苦您，有更新时麻烦告知我，谢谢！

## 补充材料/补充回答
**发送时机：** 面试后想到更完整的回答，或需要补充项目证据时。

您好，我复盘今天的交流后，想补充一点和「${jd}」相关的内容：我之前在「${resume}」中积累过相近经验，尤其可以支持岗位里提到的关键要求。如果您方便，我也可以进一步补充项目过程、指标变化和我的具体负责部分，供您参考。

## 英文跟进
Dear Hiring Team, thank you again for speaking with me about the ${role} opportunity at ${company}. I enjoyed learning more about the team and the role expectations. My experience with ${resume} aligns well with ${jd}, and I would be happy to provide any additional information if helpful. Best regards.`,
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

    res.json(normalizeMarkdownDocumentOutput(buildPrepPackDraft(interview, lang, timezone), lang === "zh" ? "面试准备包" : "Interview Prep Pack"));
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

    res.json(normalizeMarkdownDocumentOutput(buildFollowUpDraft(interview, lang), lang === "zh" ? "感谢/跟进模板" : "Follow-up Templates"));
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
