import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import fetch from "node-fetch";

// Polyfill fetch for node environments below 18 if needed, but we are assuming node 18+
// In which case we could just use global fetch, but we'll import it or rely on genai handling it.

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON payload up to 10MB to accommodate base64 images
  app.use(express.json({ limit: "10mb" }));

  // API Route for extracting interview details
  app.post("/api/parse-interview", async (req, res) => {
    try {
      const { text, imageBase64 } = req.body;

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
      let contents = [];
      if (text) {
        contents.push(text);
      }
      if (imageBase64) {
        const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          contents.push({
            inlineData: {
              data: matches[2],
              mimeType: matches[1]
            }
          });
        }
      }
      contents.push(prompt);

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents,
        config: {
          responseMimeType: "application/json",
        }
      });

      if (!response.text) throw new Error("No response from AI");
      const data = JSON.parse(response.text);
      res.json(data);
    } catch (error: any) {
      console.error("Gemini Error:", error);
      const isQuotaError = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('Quota exceeded') || error?.message?.includes('RESOURCE_EXHAUSTED');
      if (isQuotaError) {
        return res.status(429).json({ error: "Quota Exceeded" });
      }
      res.status(500).json({ error: "Failed to parse interview details" });
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
