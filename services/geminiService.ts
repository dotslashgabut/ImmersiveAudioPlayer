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
  // Using numeric timestamps (float seconds) avoids parsing ambiguity.
  const prompt = `
    You are Lyrics Specialist and Subtitle Enthusiast.
    ROLE: High-Fidelity Audio Transcriber.
    
    CRITICAL INSTRUCTION: TRANSCRIBE EVERY SYLLABLE.
    - If the audio contains "eh eh eh eh", you MUST output "eh eh eh eh".
    - If the audio contains "eh eh eh eh" and "Lorem ipsum dolor sit amet", you MUST break to two line.
    - Do NOT summarize repeated words (e.g. never write "x4").
    - Do NOT omit non-lexical vocables (ooh, aah, la la).
    - Capture the exact timing of each phrase.
    
    OUTPUT FORMAT: JSON Array of objects with 'startTime' (float seconds), 'endTime' (float seconds), and 'text'.
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
        // Budget set to 2048 to allow reasoning for repetitive sections without excessive latency.
        // Use 0 if speed is absolute priority, but 2048 helps with 'eh eh eh' constraints.
        thinkingConfig: { thinkingBudget: 2048 }, 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              startTime: {
                type: Type.NUMBER,
                description: "Start time in seconds (e.g. 12.5)"
              },
              endTime: {
                type: Type.NUMBER,
                description: "End time in seconds (e.g. 14.2)"
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
    // Sanitize markdown if present (though responseMimeType should prevent it)
    jsonText = jsonText.replace(/```json|```/gi, "").trim();

    if (!jsonText) return [];

    const rawSegments = JSON.parse(jsonText) as any[];

    return rawSegments
      .map(seg => ({
        time: Number(seg.startTime ?? seg.start ?? 0),
        endTime: Number(seg.endTime ?? seg.end ?? 0),
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
