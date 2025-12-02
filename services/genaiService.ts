import { GoogleGenAI } from "@google/genai";
import { Mission } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateMission = async (): Promise<Mission> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Erstelle eine kurze, spannende Mission für Chase von Paw Patrol in der Abenteuerbucht. Gib mir einen Titel und eine Beschreibung (max 2 Sätze). Antworte im JSON Format.",
      config: {
        responseMimeType: "application/json",
        systemInstruction: "Du bist Ryder, der Anführer der Paw Patrol. Sei enthusiastisch und ermutigend.",
        responseSchema: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            description: { type: "STRING" }
          },
          required: ["title", "description"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Keine Antwort erhalten");
    
    return JSON.parse(text) as Mission;
  } catch (error) {
    console.error("Mission generation failed:", error);
    return {
      title: "Routine-Patrouille",
      description: "Bürgermeister Besserwisser treibt wieder sein Unwesen! Halte die Stadt sicher."
    };
  }
};
