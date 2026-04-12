import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { GoogleGenAI, Type } from '@google/genai';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { computeType, TYPE_PROFILES } from '../lib/personality.js';

const router = Router();
const prisma = new PrismaClient();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Simple in-memory cache: userId → { generatedAt, payload }. 6-hour TTL.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const reportCache = new Map<string, { generatedAt: number; payload: any }>();

interface Stats {
  periodDays: number;
  mood: {
    count: number;
    avg: number;
    min: number;
    max: number;
    slope: number; // per-day linear trend
    trend: 'rising' | 'falling' | 'steady';
    recentLabels: string[];
    firstScore: number | null;
    lastScore: number | null;
    weeklyAverages: { week: string; avg: number }[];
    lowestDay: { date: string; score: number; label: string } | null;
    highestDay: { date: string; score: number; label: string } | null;
  };
  tasks: {
    total: number;
    completed: number;
    completionRate: number;
    byType: Record<string, { total: number; completed: number }>;
    favoriteType: string | null;
  };
  activity: {
    totalEntries: number;
    activeDays: number;
    streak: number;
    byType: Record<string, number>;
  };
  personality: {
    type: string | null;
    profile: { name: string; tagline: string } | null;
    totalAnswers: number;
    axes: { axis: string; dominant: string; confidence: number }[];
    answeredAcrossDays: number;
  };
  conversations: {
    total: number;
  };
}

function linearSlope(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0;
  const n = points.length;
  const sumX = points.reduce((a, p) => a + p.x, 0);
  const sumY = points.reduce((a, p) => a + p.y, 0);
  const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
  const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekKey(d: Date): string {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

async function gatherStats(userId: string, periodDays: number): Promise<Stats> {
  const since = new Date();
  since.setDate(since.getDate() - periodDays);

  const [moodEntries, tasks, activityLogs, personalityAnswers, aiConvos] = await Promise.all([
    prisma.moodEntry.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.dailyTask.findMany({
      where: { userId, date: { gte: since } },
    }),
    prisma.activityLog.findMany({
      where: { userId, createdAt: { gte: since } },
    }),
    prisma.personalityAnswer.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.aIConversation.count({
      where: { userId, createdAt: { gte: since } },
    }),
  ]);

  // ---- Mood stats ----
  const moodPoints = moodEntries.map((m, i) => ({ x: i, y: m.score }));
  const slope = linearSlope(moodPoints);
  const scores = moodEntries.map((m) => m.score);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const trend: 'rising' | 'falling' | 'steady' =
    Math.abs(slope) < 0.02 ? 'steady' : slope > 0 ? 'rising' : 'falling';

  const weeklyBuckets = new Map<string, number[]>();
  for (const e of moodEntries) {
    const k = weekKey(e.createdAt);
    if (!weeklyBuckets.has(k)) weeklyBuckets.set(k, []);
    weeklyBuckets.get(k)!.push(e.score);
  }
  const weeklyAverages = Array.from(weeklyBuckets.entries()).map(([week, arr]) => ({
    week,
    avg: Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10,
  }));

  let lowestDay: Stats['mood']['lowestDay'] = null;
  let highestDay: Stats['mood']['highestDay'] = null;
  for (const e of moodEntries) {
    if (!lowestDay || e.score < lowestDay.score) {
      lowestDay = { date: dayKey(e.createdAt), score: e.score, label: e.label };
    }
    if (!highestDay || e.score > highestDay.score) {
      highestDay = { date: dayKey(e.createdAt), score: e.score, label: e.label };
    }
  }

  // ---- Task stats ----
  const byType: Record<string, { total: number; completed: number }> = {};
  for (const t of tasks) {
    if (!byType[t.type]) byType[t.type] = { total: 0, completed: 0 };
    byType[t.type].total++;
    if (t.completed) byType[t.type].completed++;
  }
  const favoriteType =
    Object.entries(byType).sort((a, b) => b[1].completed - a[1].completed)[0]?.[0] || null;
  const completedTasks = tasks.filter((t) => t.completed).length;

  // ---- Activity stats ----
  const activityByType: Record<string, number> = {};
  const activeDaySet = new Set<string>();
  for (const log of activityLogs) {
    activityByType[log.activityType] = (activityByType[log.activityType] || 0) + 1;
    activeDaySet.add(dayKey(log.createdAt));
  }

  // Compute streak from activeDaySet ending today
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    if (activeDaySet.has(dayKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      if (i === 0) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }
  }

  // ---- Personality ----
  const personalityResult = computeType(
    personalityAnswers.map((a) => ({ axis: a.axis, direction: a.direction, score: a.score }))
  );
  const personalityProfile = TYPE_PROFILES[personalityResult.type] || null;
  const personalityDaySet = new Set(personalityAnswers.map((a) => dayKey(a.createdAt)));

  return {
    periodDays,
    mood: {
      count: moodEntries.length,
      avg: Math.round(avg * 10) / 10,
      min: scores.length ? Math.min(...scores) : 0,
      max: scores.length ? Math.max(...scores) : 0,
      slope: Math.round(slope * 1000) / 1000,
      trend,
      recentLabels: moodEntries.slice(-10).map((m) => m.label),
      firstScore: scores[0] ?? null,
      lastScore: scores[scores.length - 1] ?? null,
      weeklyAverages,
      lowestDay,
      highestDay,
    },
    tasks: {
      total: tasks.length,
      completed: completedTasks,
      completionRate: tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0,
      byType,
      favoriteType,
    },
    activity: {
      totalEntries: activityLogs.length,
      activeDays: activeDaySet.size,
      streak,
      byType: activityByType,
    },
    personality: {
      type: personalityAnswers.length > 0 ? personalityResult.type : null,
      profile: personalityProfile ? { name: personalityProfile.name, tagline: personalityProfile.tagline } : null,
      totalAnswers: personalityAnswers.length,
      axes: personalityResult.axes.map((a) => ({
        axis: a.axis,
        dominant: a.dominant,
        confidence: a.confidence,
      })),
      answeredAcrossDays: personalityDaySet.size,
    },
    conversations: { total: aiConvos },
  };
}

async function generateNarrative(stats: Stats, displayName: string): Promise<any> {
  const prompt = `You are Lumina, a warm, perceptive companion writing a personal progress report for ${displayName}.
You have ${stats.periodDays} days of their data. Write as if you've been watching over them.
Be honest but gentle. No medical advice. No fake cheerfulness — if the data looks rough, say so with care.
Use second person ("you"). Keep each section tight — quality over length.

USER DATA:
${JSON.stringify(stats, null, 2)}

Write a structured report with these sections:
1. snapshot — 2-3 sentences capturing who they look like right now.
2. journey — 3-4 sentences narrating their mood trajectory over this period. Reference real numbers.
3. shifts — 2-3 notable inflection points or changes you spotted. Each as one sentence.
4. patterns — 3-5 bullet points of patterns you see across mood/tasks/activity.
5. wins — 3-4 things they've done well. Specific, not generic.
6. lessons — 2-3 sentences on what the data suggests they're learning about themselves.
7. reflections — 4-5 "if & but" questions for them to sit with. Real questions, not rhetorical fluff.
8. nextSteps — 3 small, specific, achievable suggestions.

Tone: like a thoughtful friend who's kept notes. Warm, perceptive, sometimes a little playful, never clinical.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      snapshot: { type: Type.STRING },
      journey: { type: Type.STRING },
      shifts: { type: Type.ARRAY, items: { type: Type.STRING } },
      patterns: { type: Type.ARRAY, items: { type: Type.STRING } },
      wins: { type: Type.ARRAY, items: { type: Type.STRING } },
      lessons: { type: Type.STRING },
      reflections: { type: Type.ARRAY, items: { type: Type.STRING } },
      nextSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
      headline: { type: Type.STRING },
    },
    required: ['snapshot', 'journey', 'shifts', 'patterns', 'wins', 'lessons', 'reflections', 'nextSteps', 'headline'],
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });

  return JSON.parse(response.text || '{}');
}

/**
 * GET /api/report
 * Query: ?days=30 (default 30, min 7, max 180)
 * Query: ?force=1 to skip cache
 * Returns: { stats, narrative, generatedAt }
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const days = Math.max(7, Math.min(180, parseInt((req.query.days as string) || '30', 10)));
    const force = req.query.force === '1';
    const cacheKey = `${userId}:${days}`;

    if (!force) {
      const cached = reportCache.get(cacheKey);
      if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
        res.json({ ...cached.payload, cached: true });
        return;
      }
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    const stats = await gatherStats(userId, days);

    let narrative: any;
    try {
      narrative = await generateNarrative(stats, user?.displayName || 'friend');
    } catch (err) {
      console.error('Narrative generation failed, using fallback:', err);
      narrative = buildFallbackNarrative(stats);
    }

    const payload = {
      stats,
      narrative,
      generatedAt: new Date().toISOString(),
      cached: false,
    };
    reportCache.set(cacheKey, { generatedAt: Date.now(), payload });

    res.json(payload);
  } catch (err) {
    console.error('report error:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

function buildFallbackNarrative(stats: Stats) {
  const moodTrend =
    stats.mood.trend === 'rising'
      ? 'trending gently upward'
      : stats.mood.trend === 'falling'
      ? 'running a little lower than before'
      : 'holding fairly steady';
  return {
    headline: 'Your progress so far',
    snapshot: `Over the last ${stats.periodDays} days, you've logged ${stats.mood.count} moods, completed ${stats.tasks.completed} of ${stats.tasks.total} tasks, and shown up on ${stats.activity.activeDays} days.`,
    journey: `Your mood has been ${moodTrend}, averaging ${stats.mood.avg}/10. It reached ${stats.mood.max} at its best and ${stats.mood.min} at its lowest.`,
    shifts: [
      stats.mood.highestDay ? `Your brightest moment was on ${stats.mood.highestDay.date}.` : 'No notable highs yet.',
      stats.mood.lowestDay ? `Your heaviest moment was on ${stats.mood.lowestDay.date}.` : 'No notable lows yet.',
    ],
    patterns: [
      `Completion rate: ${stats.tasks.completionRate}%`,
      stats.tasks.favoriteType ? `You lean toward ${stats.tasks.favoriteType} tasks.` : 'No clear task preference yet.',
      `${stats.activity.streak} day current streak.`,
    ],
    wins: [
      `${stats.tasks.completed} tasks completed`,
      `${stats.activity.activeDays} days of showing up`,
      `${stats.conversations.total} sessions with Lumina`,
    ],
    lessons: 'You\'re building a practice of noticing yourself — that matters more than any single number.',
    reflections: [
      'What does a "good" day look like for you right now?',
      'If you could change one small thing about your daily rhythm, what would it be?',
      'What did you learn about yourself this month?',
      'Who or what helped you most when things got heavy?',
    ],
    nextSteps: [
      'Keep logging mood daily, even in one word.',
      'Try one task outside your favorite category.',
      'Revisit your personality mirror this week.',
    ],
  };
}

export default router;
