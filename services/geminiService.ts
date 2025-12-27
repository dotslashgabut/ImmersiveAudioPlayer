
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

/**
 * Robust timestamp parser handling numbers (seconds) or strings (MM:SS.mmm)
 */
const parseTimestamp = (ts: any): number => {
  if (typeof ts === 'number') return ts;
  if (typeof ts !== 'string') return 0;
  
  const cleanTs = ts.replace(',', '.').trim(); // Handle comma as decimal separator
  const parts = cleanTs.split(':');
  
  // Handle HH:MM:SS.mmm
  if (parts.length === 3) {
    return (parseFloat(parts[0]) * 3600) + (parseFloat(parts[1]) * 60) + parseFloat(parts[2]);
  }
  // Handle MM:SS.mmm
  if (parts.length === 2) {
    return (parseFloat(parts[0]) * 60) + parseFloat(parts[1]);
  }
  // Fallback for raw seconds string
  return parseFloat(cleanTs) || 0;
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

  // Prompt engineered to handle the "Same-Start" and "Quote-Drift" issues
  const prompt = `
    TASK: ATOMIC VERBATIM AUDIO-TO-TEXT MAPPING.
    
    CRITICAL INSTRUCTIONS:
    1. **PUNCTUATION & CONTRACTIONS**: The presence of single quotes ('), double quotes ("), or commas MUST NOT affect timing. If a line is "I'm here", the 'start' timestamp must be the exact millisecond the "I" sound begins.
    2. **IDENTICAL LINE STARTING WORDS**: If multiple consecutive lines begin with the same words (e.g., "I...", "I...", "I..."), you MUST perform a high-resolution scan of the audio for EACH separate occurrence. Do not skip or merge these lines.
    3. **JSON CHARACTER ESCAPING**: Ensure all text within the JSON "text" field is properly escaped. Internal single and double quotes must not terminate the JSON string.
    4. **STRICT VERBATIM**: Transcribe every ad-lib, repetition, and background vocal as a unique object.
    5. **TIMESTAMP PRECISION**:
       - "start": Absolute float seconds (3 decimals) when sound begins.
       - "end": Absolute float seconds (3 decimals) when sound ends.
    6. **FULL COVERAGE**: Start transcribing from 0.000 until the audio file ends. Do not summarize the ending.

    REASONING PROCESS:
    - First, transcribe the full verbatim text.
    - Second, use the reasoning budget to pinpoint the exact audio onset for every word.
    - Third, check for drift: ensure that if line A and B are similar, their timestamps are unique and sequential.
    
    Output: JSON array of objects.
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
        // System instruction forces the model to ignore its "summarization" and "linguistic prediction" biases.
        systemInstruction: "You are a specialized low-level signal processing agent. You map audio waves to verbatim text strings with microsecond intent. You ignore song structure, rhymes, or document patterns. You treat every phoneme as an independent event on a timeline. You have no creativity; you are a clock.",
        
        // High thinking budget is required to allow the model to re-examine audio 
        // when it encounters text patterns like repetitive starts or heavy punctuation.
        thinkingConfig: { thinkingBudget: 8192 },
        
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              start: { 
                type: Type.NUMBER, 
                description: "Start time in seconds (float, e.g. 15.005)" 
              },
              end: { 
                type: Type.NUMBER, 
                description: "End time in seconds (float, e.g. 18.250)" 
              },
              text: { 
                type: Type.STRING, 
                description: "Verbatim text including punctuation and case" 
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
    // Clean up any potential markdown formatting if the model ignored the mimeType
    jsonText = jsonText.replace(/```json|```/g, "").trim();

    if (!jsonText) return [];

    const rawSegments = JSON.parse(jsonText) as any[];

    // Parse and map to internal format
    return rawSegments.map(seg => ({
      time: parseTimestamp(seg.start),
      endTime: parseTimestamp(seg.end),
      text: (seg.text || "").trim()
    })).filter(line => line.text.length > 0);

  } catch (error: any) {
    if (signal?.aborted || error.message === "Aborted") {
        throw new Error("Aborted");
    }
    console.error("Transcription service error:", error);
    throw error;
  }
};
