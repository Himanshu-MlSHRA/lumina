import { GoogleGenAI, Type } from "@google/genai";

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface DailyTask {
  id: string;
  title: string;
  description: string;
  type: string;
  completed: boolean;
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

const SYSTEM_INSTRUCTION = `
You are Lumina, a compassionate AI mental health companion.
Your goal is to help users release depression, track their moods, and break the cycle of "doomscrolling".
Always be empathetic, gentle, and encouraging.
When asked for tasks, provide small, manageable activities that help ground the user in reality.
Avoid giving professional medical advice, but be a supportive friend.
`;

export const getChatResponse = async (history: Message[], userInput: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        ...history.map(m => ({ parts: [{ text: m.text }], role: m.role })),
        { parts: [{ text: userInput }], role: 'user' }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });
    return response.text || "I'm here for you.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "I'm here for you, but I'm having a little trouble connecting right now. Let's take a deep breath together.";
  }
};

export const generateDailyTasks = async (mood: string): Promise<DailyTask[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate 3 small daily tasks for a user who is feeling "${mood}".
      Tasks should be simple, actionable, and aimed at reducing screen time.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              type: { type: Type.STRING },
            },
            required: ["id", "title", "description", "type"]
          }
        }
      }
    });

    const tasks = JSON.parse(response.text || "[]");
    return tasks.map((t: any) => ({ ...t, completed: false }));
  } catch (error) {
    console.error("Task Generation Error:", error);
    return [
      { id: '1', title: 'Drink Water', description: 'Have a glass of water right now.', completed: false, type: 'mindfulness' },
      { id: '2', title: 'Step Outside', description: 'Look at the sky for 2 minutes.', completed: false, type: 'movement' },
      { id: '3', title: 'Say Hello', description: 'Message a friend or family member.', completed: false, type: 'social' }
    ];
  }
};
