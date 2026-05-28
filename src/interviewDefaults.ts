import { InterviewStage, Language, PrepChecklistItem } from "./types";

export const INTERVIEW_STAGE_VALUES: InterviewStage[] = [
  "applied",
  "hr",
  "technical1",
  "technical2",
  "final",
  "offerTalk",
  "closed",
];

export function createPrepChecklist(lang: Language): PrepChecklistItem[] {
  const items = lang === "zh"
    ? [
        "确认面试时间、平台、会议号和备用联系方式",
        "准备 60 秒自我介绍",
        "挑 2 个最能匹配岗位的项目案例",
        "整理 STAR 故事：挑战、行动、结果、复盘",
        "准备 3 个反问面试官的问题",
        "提前 10 分钟打开会议链接并测试麦克风/摄像头",
      ]
    : [
        "Confirm time, platform, meeting ID, and backup contact",
        "Prepare a 60-second intro",
        "Pick 2 role-matching project stories",
        "Shape STAR stories: situation, action, result, reflection",
        "Prepare 3 questions for the interviewer",
        "Open the meeting link 10 minutes early and test audio/video",
      ];

  return items.map((text, index) => ({
    id: `prep-${Date.now()}-${index}`,
    text,
    done: false,
  }));
}
