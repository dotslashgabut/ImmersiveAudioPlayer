import { GoogleGenAI, Type } from "@google/genai";
import { SubtitleSegment, GeminiModel } from "../types";

export const transcribeAudio = async (
    audioFile: Blob,
    modelName: GeminiModel,
    signal?: AbortSignal
): Promise<SubtitleSegment[]> => {
    if (signal?.aborted) {
        throw new Error("Aborted");
    }

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        throw new Error("API Key is missing. Please check your environment configuration.");
    }

    const ai = new GoogleGenAI({ apiKey });
    const base64Data = await fileToBase64(audioFile);

    // STRICT TIMING POLICY: Use raw float seconds to avoid the "00:05:30" (5.3s) hallucination.
    const prompt = `
        TASK: Professional Audio Transcriber & Lyric Synchronizer.
        
        STRICT TIMING RULES:
        1. Use TOTAL SECONDS as a raw float number for both "startTime" and "endTime".
        2. NEVER use colons (:) or HH:MM:SS format.
        3. 5.3 seconds must be 5.3, NOT 330.0 or 00:05:30.
        4. "startTime" is when the vocal starts.
        5. "endTime" is when the vocal ends.
        
        OUTPUT: Return a JSON array of objects with keys "startTime", "endTime", and "text".
    `;

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: audioFile.type || "audio/mpeg",
                            data: base64Data
                        }
                    },
                    { text: prompt }
                ]
            },
            config: {
                thinkingConfig: { thinkingBudget: 4096 },
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            startTime: {
                                type: Type.NUMBER,
                                description: "Start time in total seconds (e.g. 8.1)"
                            },
                            endTime: {
                                type: Type.NUMBER,
                                description: "End time in total seconds (e.g. 10.1)"
                            },
                            text: {
                                type: Type.STRING,
                                description: "Verbatim text"
                            }
                        },
                        required: ["startTime", "endTime", "text"]
                    }
                }
            }
        });

        const jsonText = response.text || "[]";
        const rawSegments = JSON.parse(jsonText.replace(/```json|```/g, "").trim()) as any[];

        return rawSegments.map(seg => ({
            start: Number(seg.startTime) || 0,
            end: Number(seg.endTime) || 0,
            text: (seg.text || "").trim()
        })).filter(s => s.text.length > 0).sort((a, b) => a.start - b.start);

    } catch (error: any) {
        if (signal?.aborted || error.message === "Aborted") {
            throw new Error("Aborted");
        }
        console.error("Transcription error:", error);
        throw error;
    }
};

export const fileToBase64 = (file: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
    });
};