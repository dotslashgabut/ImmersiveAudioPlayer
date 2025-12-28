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

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Strictly enforce verbatim transcription including repetitions.
  // Using string timestamps (MM:SS.mmm) avoids float precision ambiguity and is standard for lyrics.
  const prompt = `
    You are Lyrics Specialist and Subtitle Enthusiast.
    ROLE: High-Fidelity Audio Transcriber.
    
    CRITICAL INSTRUCTION: TRANSCRIBE EVERY SYLLABLE.
    - If the audio contains "eh eh eh eh", you MUST output "eh eh eh eh".
    - If the audio contains "eh eh eh eh" and "Lorem ipsum dolor sit amet", you MUST break to two line.
    - Do NOT summarize repeated words (e.g. never write "x4").
    - Do NOT omit non-lexical vocables (ooh, aah, la la).
    - Capture the exact timing of each phrase.
    - DO NOT SKIP vocals.
    - DO NOT inform music / song / instrument on transcibed text.
    
    OUTPUT FORMAT: JSON Array of objects with 'startTime' (string "MM:SS.mmm"), 'endTime' (string "MM:SS.mmm"), and 'text'.
    Example timestamp: "00:41.520"
    NO MARKDOWN. NO COMMENTS.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioFile.type || "audio/mpeg",
              data: base64Data,
            },
          },
          { text: prompt }
        ]
      },
      config: {
        // Disable thinking budget (set to 0) to improve generation speed and prevent timeouts/truncation on long audio.
        // Transcription is primarily a perception task.
        thinkingConfig: { thinkingBudget: 0 }, 
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              startTime: {
                type: Type.STRING,
                description: "Start time in MM:SS.mmm format (e.g. 00:41.520)"
              },
              endTime: {
                type: Type.STRING,
                description: "End time in MM:SS.mmm format (e.g. 00:45.080)"
              },
              text: {
                type: Type.STRING,
                description: "Verbatim text"
              }
            },
            required: ["startTime", "endTime", "text"]
          },
        },
      },
    });

    if (signal?.aborted) throw new Error("Aborted");

    let jsonText = response.text || "[]";
    
    // Robust JSON extraction: Find the outer brackets to ignore markdown or preamble
    const firstBracket = jsonText.indexOf('[');
    const lastBracket = jsonText.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1) {
        jsonText = jsonText.substring(firstBracket, lastBracket + 1);
    } else {
        // Fallback cleanup
        jsonText = jsonText.replace(/```json|```/gi, "").trim();
    }

    if (!jsonText || jsonText === "[]") return [];

    let rawSegments: any[] = [];
    try {
        rawSegments = JSON.parse(jsonText);
    } catch (parseError) {
        console.error("JSON Parse failed, attempting to recover:", parseError);
        // Last ditch attempt: if it's truncated, add closing bracket
        if (jsonText.trim().endsWith(',')) {
             try {
                rawSegments = JSON.parse(jsonText.trim().slice(0, -1) + ']');
             } catch (e) {
                console.error("Recovery failed", e);
                throw parseError;
             }
        } else {
             throw parseError;
        }
    }

    return rawSegments
      .map(seg => ({
        time: parseTimestamp(seg.startTime),
        endTime: parseTimestamp(seg.endTime),
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
