
import { GoogleGenAI, Type } from "@google/genai";
import { LyricLine } from "../types";
import { parseTimestamp } from "../utils/timeUtils";

export const fileToBase64 = (file: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
  });
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

  // Base prompt logic inspired by sample-lyricflow-ai-subtitle-generator
  let prompt = `
    Act as a professional audio transcriber and lyric synchronizer. 
    Analyze the provided audio and generate highly accurate subtitles/lyrics.

    TIMESTAMP PRECISION RULES:
    1. **FORMAT**: Timestamps MUST be strings in "MM:SS.mmm" format (e.g., "00:04.250").
    2. **SYNC**: The "start" timestamp must align exactly with the very first audible syllable.
    3. **DURATION**: The "end" timestamp must mark exactly when the phrase concludes.
    
    OUTPUT: Return a JSON array of objects with keys: "start", "end", "text".
  `;

  // Specialized Anti-Drift Prompt for Gemini 3 Flash / Preview
  if (modelName === 'gemini-3-flash-preview' || modelName.includes('gemini-3')) {
    prompt = `
      You are an expert **Lyric Synchronizer**. 
      Your goal is to segment the audio into **natural, full lyrical lines** while maintaining robotic precision for timestamps.

      ### SEGMENTATION STRATEGY (IMPORTANT)
      1. **Full Lines, Not Fragments**: Do NOT break sentences into tiny chunks. Output complete lines of verse or chorus.
      2. **Natural Phrasing**: Follow the musical phrasing.
      3. **Exceptions**: Short segments are allowed only for distinct interjections (e.g., "Yeah!", "Go!") or very short meaningful pauses.

      ### CRITICAL: TIMING & DRIFT PREVENTION
      1. **Anchor the Start**: The 'start' timestamp must correspond to the *first syllable* of the phrase.
      2. **Anchor the End**: The 'end' timestamp must correspond to the *last syllable* of the phrase.
      3. **Handle Repetitions**: If the singer repeats "Hello" three times, output three separate segments with distinct timestamps.
      4. **No Prediction**: Do not guess timing based on text. Listen to the audio signal.

      ### TEXT FIDELITY
      - Keep all single quotes (don't, it's, 'cause).
      - Transcribe exactly what is sung.

      ### FORMAT
      - Output: Pure JSON Array.
      - Timestamp: "MM:SS.mmm" (e.g. "00:04.250").
    `;
  }

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
        // Disabled thinking budget to minimize creative/hallucinatory reasoning unless strictly needed
        thinkingConfig: modelName.includes('gemini-3') ? { thinkingBudget: 4096 } : undefined,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              start: {
                type: Type.STRING,
                description: "Start time in 'MM:SS.mmm' format (ensure 3 decimal places)"
              },
              end: {
                type: Type.STRING,
                description: "End time in 'MM:SS.mmm' format (ensure 3 decimal places)"
              },
              text: {
                type: Type.STRING,
                description: "Verbatim transcribed text, preserving all quotes and punctuation"
              }
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
    jsonText = jsonText.replace(/```json|```/g, "").trim();

    if (!jsonText) return [];

    const rawSegments = JSON.parse(jsonText) as any[];

    return rawSegments
      .map(seg => ({
        time: parseTimestamp(seg.start || seg.startTime),
        endTime: parseTimestamp(seg.end || seg.endTime),
        text: (seg.text || "").trim()
      }))
      .filter(line => line.text.length > 0)
      .sort((a, b) => a.time - b.time);

  } catch (error: any) {
    if (signal?.aborted || error.message === "Aborted") {
      throw new Error("Aborted");
    }
    console.error("Transcription service error:", error);
    throw error;
  }
};
