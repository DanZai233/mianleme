import { Language } from "./types";

const AI_SERVICE_CONSENT_KEY = "mianleme_ai_service_consent_v1";

function consentMessage(lang: Language) {
  if (lang === "zh") {
    return [
      "使用 AI 功能前请确认：",
      "",
      "面了么会把你本次提供的面试邀请文本、截图，或当前面试信息、文档内容、问题和时区发送到面了么服务端，并由服务端转发给火山引擎/豆包模型，用于本次智能识别、准备包、跟进模板或文档对话。",
      "",
      "这些数据不会用于广告追踪。你也可以取消并改为手动录入或编辑。",
      "",
      "是否同意发送给上述 AI 服务？",
    ].join("\n");
  }

  return [
    "Before using AI features, please confirm:",
    "",
    "MianLeMe will send the interview invitation text, screenshot, current interview details, document content, your message, and time zone that you provide for this request to MianLeMe's server. The server forwards it to Volcano Engine/Doubao models for Smart Parse, prep packs, follow-up templates, or document chat.",
    "",
    "This data is not used for ad tracking. You can cancel and enter or edit the information manually.",
    "",
    "Do you agree to send this data to the AI service above?",
  ].join("\n");
}

export function hasAiServiceConsent() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AI_SERVICE_CONSENT_KEY) === "accepted";
}

export function setAiServiceConsent(accepted: boolean) {
  if (typeof window === "undefined") return;
  if (accepted) {
    window.localStorage.setItem(AI_SERVICE_CONSENT_KEY, "accepted");
  } else {
    window.localStorage.removeItem(AI_SERVICE_CONSENT_KEY);
  }
}

export function ensureAiServiceConsent(lang: Language) {
  if (hasAiServiceConsent()) return true;
  const accepted = window.confirm(consentMessage(lang));
  setAiServiceConsent(accepted);
  return accepted;
}
