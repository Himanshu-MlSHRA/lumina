import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { GoogleGenAI, Type } from '@google/genai';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { getChatResponse, generateDailyTasks } from '../lib/gemini.js';
import { computeType, TYPE_PROFILES } from '../lib/personality.js';
import { QUESTION_BANK } from '../lib/personality.js';

const router = Router();
const prisma = new PrismaClient();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Text chat with Gemini
router.post('/chat', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { history, userInput } = req.body;

    if (!userInput) {
      res.status(400).json({ error: 'userInput is required' });
      return;
    }

    const text = await getChatResponse(history || [], userInput);
    res.json({ text });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

// Generate daily tasks based on mood + recent user behaviour
router.post('/tasks', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { mood } = req.body;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const [recentMoods, recentTasks, recentActivities, facts] = await Promise.all([
      prisma.moodEntry.findMany({
        where: { userId, createdAt: { gte: sevenDaysAgo } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.dailyTask.findMany({
        where: { userId, date: { gte: fourteenDaysAgo } },
      }),
      prisma.activityLog.findMany({
        where: { userId, createdAt: { gte: sevenDaysAgo } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      (prisma as any).userFact.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
    ]);

    const moodLabel: string =
      mood ||
      recentMoods[0]?.label ||
      'neutral';
    const recentMoodAvg = recentMoods.length
      ? recentMoods.reduce((a, m) => a + m.score, 0) / recentMoods.length
      : null;
    const recentMoodLabels = recentMoods.map((m) => m.label);

    const completedCounts = new Map<string, number>();
    const skippedCounts = new Map<string, number>();
    for (const t of recentTasks) {
      if (t.completed) completedCounts.set(t.type, (completedCounts.get(t.type) || 0) + 1);
      else skippedCounts.set(t.type, (skippedCounts.get(t.type) || 0) + 1);
    }
    const completedTaskTypes = [...completedCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));
    const skippedTaskTypes = [...skippedCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));

    const activityCounts = new Map<string, number>();
    for (const a of recentActivities) {
      activityCounts.set(a.activityType, (activityCounts.get(a.activityType) || 0) + 1);
    }
    const topActivities = [...activityCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([activity, count]) => ({ activity, count }));

    const buckets: Record<string, string[]> = { hobby: [], concern: [], goal: [], preference: [] };
    for (const f of facts as Array<{ category: string; content: string }>) {
      if (f.category in buckets && buckets[f.category].length < 6) {
        buckets[f.category].push(f.content);
      }
    }

    const tasks = await generateDailyTasks({
      mood: moodLabel,
      recentMoodAvg: recentMoodAvg !== null ? Math.round(recentMoodAvg * 10) / 10 : null,
      recentMoodLabels,
      completedTaskTypes,
      skippedTaskTypes,
      topActivities,
      hobbies: buckets.hobby,
      concerns: buckets.concern,
      goals: buckets.goal,
      preferences: buckets.preference,
    });
    res.json({ tasks });
  } catch (error) {
    console.error('AI tasks error:', error);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

/**
 * GET /api/ai/context
 * Returns personalization context for the main Lumina session:
 *   - displayName
 *   - personality type + axes + today's answered question(s)
 *   - last few mood entries
 *   - top relaxer task type (if any)
 *   - stored UserFacts (hobbies, preferences, etc.)
 */
router.get('/context', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [user, personalityAnswers, todaysAnswers, recentMoods, recentTasks, facts] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }),
      prisma.personalityAnswer.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      prisma.personalityAnswer.findMany({
        where: { userId, createdAt: { gte: startOfDay } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.moodEntry.findMany({
        where: { userId, createdAt: { gte: sevenDaysAgo } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.dailyTask.findMany({
        where: { userId, date: { gte: sevenDaysAgo } },
        orderBy: { date: 'desc' },
        take: 10,
      }),
      (prisma as any).userFact.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    const personalityResult = computeType(
      personalityAnswers.map((a) => ({ axis: a.axis, direction: a.direction, score: a.score }))
    );
    const profile = personalityAnswers.length > 0 ? TYPE_PROFILES[personalityResult.type] : null;

    const todaysQA = todaysAnswers.map((a) => {
      const q = QUESTION_BANK.find((qq) => qq.id === a.questionId);
      return q ? { question: q.text, score: a.score, axis: a.axis } : null;
    }).filter(Boolean);

    const factsByCategory: Record<string, string[]> = {};
    for (const f of facts as Array<{ category: string; content: string }>) {
      if (!factsByCategory[f.category]) factsByCategory[f.category] = [];
      factsByCategory[f.category].push(f.content);
    }

    res.json({
      displayName: user?.displayName || 'friend',
      personality: personalityAnswers.length > 0 ? {
        type: personalityResult.type,
        profileName: profile?.name || null,
        profileTagline: profile?.tagline || null,
        axes: personalityResult.axes.map((a) => ({
          axis: a.axis,
          dominant: a.dominant,
          confidence: a.confidence,
        })),
      } : null,
      todaysAnswers: todaysQA,
      recentMoods: recentMoods.map((m) => ({
        score: m.score,
        label: m.label,
        note: m.note,
        date: m.createdAt.toISOString(),
      })),
      recentTasks: recentTasks.map((t) => ({
        title: t.title,
        type: t.type,
        completed: t.completed,
      })),
      facts: factsByCategory,
    });
  } catch (err) {
    console.error('context error:', err);
    res.status(500).json({ error: 'Failed to load context' });
  }
});

/**
 * POST /api/ai/extract-facts
 * Body: { transcript: string, sessionType?: string, durationSec?: number, moodBefore?: number, moodAfter?: number }
 * Sends transcript to Gemini, extracts structured facts, persists them as UserFacts and an AIConversation summary.
 */
router.post('/extract-facts', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { transcript, sessionType = 'voice', durationSec, moodBefore, moodAfter } = req.body;

    if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 30) {
      res.json({ saved: 0, summary: null });
      return;
    }

    const prompt = `You are extracting structured personal facts AND today's mood signal from a transcript of a wellness conversation between Lumina and the user.
Only extract facts the USER explicitly stated about themselves. Do NOT infer, do NOT invent. If the user did not state something clearly, do not include it.

Categories:
- hobby: things the user enjoys doing (e.g. "playing guitar", "reading sci-fi")
- preference: things the user likes/dislikes (e.g. "prefers quiet evenings", "hates crowded places")
- relationship: people and their role (e.g. "best friend Sara", "mom is supportive")
- goal: things the user wants (e.g. "wants to start jogging", "wants to journal more")
- concern: ongoing worries (e.g. "stressed about exams", "trouble sleeping")
- general: other notable self-disclosures

MOOD SIGNAL EXTRACTION:
Lumina asked the user about their mood at the start of the session. Read the transcript and determine the user's mood as a number 1-10:
- 1-2: Very Low (devastated, hopeless, panicking)
- 3-4: Struggling (sad, anxious, tired, frustrated, low)
- 5-6: Okay (neutral, mid, alright, "fine", in-between)
- 7-8: Good (calm, relaxed, content, positive, happy)
- 9-10: Radiant (excited, joyful, energized, on top of things)

If the user explicitly gave a number (e.g. "around a 6"), use it. Otherwise infer from their words and tone.
Pick a short label (one or two words) that matches what they said: e.g. "Anxious", "Tired", "Okay", "Calm", "Happy", "Stressed", "Content".
Set detected=true ONLY if the user actually expressed how they were feeling. If they dodged the question or only talked about events, set detected=false.

Also write a 1-2 sentence neutral summary of the session.

TRANSCRIPT:
${transcript.slice(0, 8000)}

Return JSON only.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        facts: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              content: { type: Type.STRING },
            },
            required: ['category', 'content'],
          },
        },
        moodSignal: {
          type: Type.OBJECT,
          properties: {
            detected: { type: Type.BOOLEAN },
            score: { type: Type.NUMBER },
            label: { type: Type.STRING },
            note: { type: Type.STRING },
          },
          required: ['detected'],
        },
      },
      required: ['summary', 'facts', 'moodSignal'],
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: schema },
    });

    const parsed = JSON.parse(response.text || '{}');
    const facts: { category: string; content: string }[] = Array.isArray(parsed.facts) ? parsed.facts : [];
    const summary: string = parsed.summary || '';

    const validCategories = new Set(['hobby', 'preference', 'relationship', 'goal', 'concern', 'general']);
    const cleaned = facts
      .filter((f) => f && validCategories.has(f.category) && typeof f.content === 'string' && f.content.trim().length > 2 && f.content.length < 500)
      .slice(0, 20);

    if (cleaned.length > 0) {
      await (prisma as any).userFact.createMany({
        data: cleaned.map((f) => ({
          userId,
          category: f.category,
          content: f.content.trim(),
          source: sessionType,
        })),
      });
    }

    // Persist any detected mood signal as today's MoodEntry (upsert).
    let moodLogged: { score: number; label: string } | null = null;
    const moodSignal = parsed.moodSignal;
    if (
      moodSignal &&
      moodSignal.detected === true &&
      typeof moodSignal.score === 'number' &&
      moodSignal.score >= 1 &&
      moodSignal.score <= 10
    ) {
      const score = Math.round(moodSignal.score);
      const label = (typeof moodSignal.label === 'string' && moodSignal.label.trim()) || 'Okay';
      const note = typeof moodSignal.note === 'string' ? moodSignal.note.slice(0, 500) : undefined;

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay.getTime() + 86400000);

      const existing = await prisma.moodEntry.findFirst({
        where: { userId, createdAt: { gte: startOfDay, lt: endOfDay } },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        // Only override an entry that came from a previous Lumina session — never
        // overwrite a manual log the user already chose for today.
        if (existing.source !== 'manual') {
          await prisma.moodEntry.update({
            where: { id: existing.id },
            data: { score, label, note: note ?? existing.note, source: 'lumina' },
          });
          moodLogged = { score, label };
        }
      } else {
        await prisma.moodEntry.create({
          data: { userId, score, label, note, source: 'lumina' },
        });
        moodLogged = { score, label };
      }
    }

    await prisma.aIConversation.create({
      data: {
        userId,
        sessionType,
        summary: summary || null,
        moodBefore: typeof moodBefore === 'number' ? moodBefore : null,
        moodAfter:
          typeof moodAfter === 'number'
            ? moodAfter
            : moodLogged
            ? moodLogged.score
            : null,
        durationSec: typeof durationSec === 'number' ? durationSec : null,
      },
    });

    res.json({ saved: cleaned.length, summary, moodLogged });
  } catch (err) {
    console.error('extract-facts error:', err);
    res.status(500).json({ error: 'Failed to extract facts' });
  }
});

// Provide session key for voice sessions (authenticated users only)
router.get('/session-key', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      res.status(500).json({ error: 'Gemini API key not configured' });
      return;
    }
    res.json({ key });
  } catch (error) {
    console.error('Session key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
