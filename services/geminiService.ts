
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
  modelName: string,
  signal?: AbortSignal
): Promise<LyricLine[]> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing. Please check your environment configuration.");
  }

  if (signal?.aborted) throw new Error("Aborted");

  const base64Data = await fileToBase64(audioFile);
  
  if (signal?.aborted) throw new Error("Aborted");

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Extremely strict prompt to prevent summarization and ensure synchronization
  const prompt = `
    You are a professional audio transcriber specializing in lyric synchronization. 
    Your goal is to generate a strictly synchronized, line-by-line transcript of the song.

    CRITICAL RULES - READ CAREFULLY:
    1. **NO SUMMARIZATION**: You MUST transcribe EVERY single line. Do not skip repeated choruses, hooks, or background vocals.
    2. **VERBATIM**: If a line is repeated 5 times, output 5 separate JSON entries with the exact time each one is sung.
    3. **SEGMENTATION**: Break text into natural lyric lines (e.g., "Hello / how are you" -> 2 lines if sung with a pause).
    4. **TIMESTAMPS**: 
       - "start": The exact moment the first syllable is audible.
       - "end": The exact moment the line ends or silence begins.
       - Format MUST be "MM:SS.mmm" (e.g. "03:05.123").
    5. **COMPLETENESS**: Verify that the transcript covers the entire duration of the audio provided.

    Output strictly a JSON array of objects.
  `;

  try {
    const responsePromise = ai.models.generateContent({
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
        // Disable thinking for transcription to prevent the model from "reasoning" about the song structure 
        // and summarizing repeated parts. We want raw, mechanical transcription.
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              start: { type: Type.STRING, description: "Start time in 'MM:SS.mmm' format" },
              end: { type: Type.STRING, description: "End time in 'MM:SS.mmm' format" },
              text: { type: Type.STRING, description: "The literal text sung at this timestamp" }
            },
            required: ["start", "end", "text"]
          },
        },
      },
    });

    const response = await Promise.race([
        responsePromise,
        new Promise<never>((_, reject) => {
            if (signal) {
                signal.onabort = () => reject(new Error("Aborted"));
            }
        })
    ]);

    if (signal?.aborted) throw new Error("Aborted");

    let jsonText = response.text || "[]";
    // Clean up potential markdown formatting if the model ignores responseMimeType (rare but possible)
    jsonText = jsonText.replace(/```json|```/g, "").trim();

    if (!jsonText) return [];

    const rawSegments = JSON.parse(jsonText) as any[];

    // Map to LyricLine format (time, endTime, text)
    return rawSegments.map(seg => ({
      time: parseTimestamp(seg.start),
      endTime: parseTimestamp(seg.end),
      text: seg.text || ""
    }));

  } catch (error: any) {
    if (signal?.aborted || error.message === "Aborted") {
        throw new Error("Aborted");
    }
    console.error("Transcription error:", error);
    throw error;
  }
};
