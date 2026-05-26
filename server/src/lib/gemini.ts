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

export interface BehaviourProfile {
  mood: string;
  recentMoodAvg?: number | null;
  recentMoodLabels?: string[];
  completedTaskTypes?: { type: string; count: number }[];
  skippedTaskTypes?: { type: string; count: number }[];
  topActivities?: { activity: string; count: number }[];
  hobbies?: string[];
  concerns?: string[];
  goals?: string[];
  preferences?: string[];
}

export const generateDailyTasks = async (
  moodOrBehaviour: string | BehaviourProfile
): Promise<DailyTask[]> => {
  try {
    const b: BehaviourProfile = typeof moodOrBehaviour === 'string'
      ? { mood: moodOrBehaviour }
      : moodOrBehaviour;

    const lines: string[] = [];
    lines.push(`Current mood: ${b.mood || 'unknown'}.`);
    if (typeof b.recentMoodAvg === 'number') {
      lines.push(`Average mood over the last week: ${b.recentMoodAvg.toFixed(1)} / 10.`);
    }
    if (b.recentMoodLabels && b.recentMoodLabels.length) {
      lines.push(`Recent mood labels: ${b.recentMoodLabels.slice(0, 5).join(', ')}.`);
    }
    if (b.completedTaskTypes && b.completedTaskTypes.length) {
      lines.push(
        `Task types they actually finish (most → least): ${b.completedTaskTypes
          .map((t) => `${t.type} ×${t.count}`)
          .join(', ')}.`
      );
    }
    if (b.skippedTaskTypes && b.skippedTaskTypes.length) {
      lines.push(
        `Task types they tend to skip: ${b.skippedTaskTypes
          .map((t) => `${t.type} ×${t.count}`)
          .join(', ')}.`
      );
    }
    if (b.topActivities && b.topActivities.length) {
      lines.push(
        `Most-frequent in-app actions: ${b.topActivities
          .map((a) => `${a.activity} ×${a.count}`)
          .join(', ')}.`
      );
    }
    if (b.hobbies && b.hobbies.length) {
      lines.push(`Hobbies the user has shared: ${b.hobbies.slice(0, 4).join('; ')}.`);
    }
    if (b.concerns && b.concerns.length) {
      lines.push(`Recent concerns the user mentioned: ${b.concerns.slice(0, 3).join('; ')}.`);
    }
    if (b.goals && b.goals.length) {
      lines.push(`Goals the user mentioned: ${b.goals.slice(0, 3).join('; ')}.`);
    }
    if (b.preferences && b.preferences.length) {
      lines.push(`Stated preferences: ${b.preferences.slice(0, 3).join('; ')}.`);
    }

    const behaviourBlock = lines.join('\n');

    const prompt = `You are designing today's three small wellness tasks for one specific person.
Use the behaviour profile below to make the tasks feel personal — lean into the task TYPES they actually
complete, weave in their hobbies and stated likes when natural, and gently introduce variety if they only
ever do one type. Tasks must be tiny, actionable in under 20 minutes, and low-friction. Each "type" must
be exactly one of: movement, mindfulness, social, creative.

Return EXACTLY 3 tasks. Avoid repeating yesterday's vibe — pick a healthy mix unless the data clearly
points to one strength worth reinforcing today. If the user is low / struggling, prefer gentle mindfulness
and tiny movement; if energetic / good, push slightly into social or creative.

BEHAVIOUR PROFILE:
${behaviourBlock}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
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
