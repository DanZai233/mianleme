import express from "express";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const app = express();

// Use JSON payload up to 10MB to accommodate base64 images
app.use(express.json({ limit: "10mb" }));

async function callModel(modelConfig: any, prompt: string, text: string, imageBase64?: string) {
  const { provider, apiKey, modelName, apiBase } = modelConfig;
  
  if (!apiKey) {
    throw new Error("API Key is required");
  }

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
      return JSON.parse(response.text);
    }

    case "volcengine":
    case "openai": {
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: apiBase || (provider === "volcengine" ? "https://ark.cn-beijing.volces.com/api/v3" : "https://api.openai.com/v1"),
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
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      if (!content) throw new Error("No response from AI");
      return JSON.parse(content);
    }

    case "anthropic": {
      const anthropic = new Anthropic({
        apiKey: apiKey,
        baseURL: apiBase || "https://api.anthropic.com",
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
      return JSON.parse(content);
    }

    default:
      throw new Error("Unsupported model provider");
  }
}

app.post("/parse-interview", async (req, res) => {
  try {
    const { text, imageBase64, modelConfig } = req.body;

    const prompt = `You are an AI assistant that extracts interview details from text or images.
Extract the following information and return ONLY a valid JSON object:
- company: string (company name)
- role: string (job title/position)
- date: string (ISO 8601 format, e.g., "2026-05-28T14:30:00Z". If no year is specified, assume ${new Date().getFullYear()})
- platform: string (e.g., Zoom, Teams, Google Meet, Tencent Meeting, Phone, On-site, etc.)
- link: string (the meeting link, URL, meeting ID, or meeting number. If no URL is available but a meeting ID is, put it here)
- notes: string (any passcodes, passwords, or additional instructions. Separate points with newlines)
- durationMinutes: number (estimated duration of the interview in minutes. If not specified, default to 60)

Be resilient. If some information is not found, leave it as an empty string. If the platform is clearly an app (like Zoom), write the app name.

Output JSON format strictly:
{
  "company": "",
  "role": "",
  "date": "",
  "platform": "",
  "link": "",
  "notes": "",
  "durationMinutes": 60
}
`;

    const data = await callModel(modelConfig, prompt, text, imageBase64);
    res.json(data);
  } catch (error: any) {
    console.error("AI Error:", error);
    const isQuotaError = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('Quota exceeded') || error?.message?.includes('RESOURCE_EXHAUSTED') || error?.message?.includes('rate limit');
    if (isQuotaError) {
      return res.status(429).json({ error: "Quota Exceeded" });
    }
    res.status(500).json({ error: error.message || "Failed to parse interview details" });
  }
});

export default app;
