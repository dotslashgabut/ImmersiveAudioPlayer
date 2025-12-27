
import { GoogleGenAI, Type } from "@google/genai";
import { LyricLine } from "../types";

export const fileToBase64 = (file: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
  });
};

const parseTimestamp = (ts: string | number): number => {
  if (typeof ts === 'number') return ts;
  if (!ts || typeof ts !== 'string') return 0;
  
  const parts = ts.split(':');
  // Handle HH:MM:SS.mmm
  if (parts.length === 3) {
    return (parseFloat(parts[0]) * 3600) + (parseFloat(parts[1]) * 60) + parseFloat(parts[2]);
  }
  // Handle MM:SS.mmm
  if (parts.length === 2) {
    return (parseFloat(parts[0]) * 60) + parseFloat(parts[1]);
  }
  // Fallback for raw seconds string
  return parseFloat(ts) || 0;
};

export const transcribeAudio = async (
  audioFile: File,
  modelName: string
): Promise<LyricLine[]> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing. Please check your environment configuration.");
  }

  const base64Data = await fileToBase64(audioFile);
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Stricter prompt to ensure precision, adapted from sample_geminiService.ts
  const prompt = `
    Act as a professional audio transcriber and lyric synchronizer. 
    Analyze the provided audio and generate highly accurate subtitles/lyrics.

    TIMESTAMP PRECISION RULES:
    1. **FORMAT**: Timestamps MUST be strings in "MM:SS.mmm" format (e.g., "00:04.250").
    2. **SYNC**: The "start" timestamp must align exactly with the very first audible syllable or sound of the phrase.
    3. **DURATION**: The "end" timestamp must mark exactly when the phrase or vocal line concludes.
    4. **CONSISTENCY**: Timestamps must be absolute and strictly chronological.

    BEHAVIOR:
    - If it's a song, capture lyrics.
    - If it's speech, capture the spoken words.
    - Ensure no overlapping segments.
    
    OUTPUT: Return a JSON array of objects with keys: "start", "end", "text".
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioFile.type,
              data: base64Data,
            },
          },
          { text: prompt }
        ]
      },
      config: {
        // Thinking budget helps models reason about the timeline correctly (supported on 2.5 and 3)
        thinkingConfig: { thinkingBudget: 4096 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              start: { type: Type.STRING, description: "Start time 'MM:SS.mmm'" },
              end: { type: Type.STRING, description: "End time 'MM:SS.mmm'" },
              text: { type: Type.STRING, description: "The content text" }
            },
            required: ["start", "end", "text"]
          },
        },
      },
    });

    let jsonText = response.text || "[]";
    // Clean up potential markdown formatting
    jsonText = jsonText.replace(/```json|```/g, "").trim();

    if (!jsonText) return [];

    const rawSegments = JSON.parse(jsonText) as any[];

    // Map to LyricLine format (time, endTime, text)
    return rawSegments.map(seg => ({
      time: parseTimestamp(seg.start),
      endTime: parseTimestamp(seg.end),
      text: seg.text || ""
    }));

  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
};
