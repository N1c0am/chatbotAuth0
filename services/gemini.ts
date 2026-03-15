import { GoogleGenAI } from "@google/genai";
import type { AIService, ChatMessage } from "../types";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

export const geminiService: AIService = {
    name: "Gemini",
    async chat(messages: ChatMessage[]) {

        const tools = [
            {
                googleSearch: {
                }
            },
        ];

        //"assistant": "model"
        const contents = messages.map(msg => ({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }]
        }));

        const config = {
            thinkingConfig: {
                thinkingBudget: 1024,
            },
            tools,
        };

        //model: "gemini-2.5-flash-lite",
        const model = "gemini-2.5-flash";
        //const model = "gemini-2.5-pro";  //cuota excedida

        const response = await ai.models.generateContentStream({
            model,
            config,
            contents,
        });
        let fileIndex = 0;
         return (async function* () {
            for await (const chunk of response) {
                yield chunk.text ?? "";
            }
        })();
    }
}