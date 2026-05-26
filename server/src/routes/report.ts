import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { GoogleGenAI, Type } from '@google/genai';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { computeType, TYPE_PROFILES } from '../lib/personality.js';
import {
  computeMLInsights,
  computeAngles,
  type MLInsights,
  type Angle,
} from '../lib/mlInsights.js';

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
  mlInsights: MLInsights;
  angles: Angle[];
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

  const [moodEntries, tasks, activityLogs, personalityAnswers, aiConvos, aiConvosCount, messages, posts, groupMemberships, userFacts] = await Promise.all([
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
    prisma.aIConversation.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { moodBefore: true, moodAfter: true, durationSec: true, createdAt: true },
    }),
    prisma.aIConversation.count({
      where: { userId, createdAt: { gte: since } },
    }),
    prisma.message.findMany({
      where: { senderId: userId, createdAt: { gte: since } },
      select: { senderId: true, recipientId: true, groupId: true, content: true, isAnonymous: true, createdAt: true },
    }),
    prisma.communityPost.findMany({
      where: { authorId: userId, createdAt: { gte: since } },
      select: { content: true, groupId: true, isAnonymous: true, createdAt: true },
    }),
    prisma.groupMember.count({ where: { userId } }),
    (prisma as any).userFact.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
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

  // ---- ML insights ----
  const mlInputs = {
    userId,
    moods: moodEntries.map((m) => ({ score: m.score, label: m.label, note: m.note, createdAt: m.createdAt })),
    tasks: tasks.map((t) => ({ type: t.type, completed: t.completed, date: t.date })),
    activities: activityLogs.map((a) => ({ activityType: a.activityType, createdAt: a.createdAt })),
    messages: messages.map((m) => ({
      senderId: m.senderId,
      recipientId: m.recipientId,
      groupId: m.groupId,
      content: m.content,
      isAnonymous: m.isAnonymous,
      createdAt: m.createdAt,
    })),
    posts: posts.map((p) => ({ content: p.content, groupId: p.groupId, isAnonymous: p.isAnonymous, createdAt: p.createdAt })),
    aiConvos: aiConvos.map((c) => ({ moodBefore: c.moodBefore, moodAfter: c.moodAfter, durationSec: c.durationSec, createdAt: c.createdAt })),
    personalityType: personalityAnswers.length > 0 ? personalityResult.type : null,
    personalityAxes: personalityResult.axes.map((a) => ({ axis: a.axis, dominant: a.dominant, confidence: a.confidence })),
    groupCount: groupMemberships,
    userFacts: (userFacts as Array<{ category: string; content: string; createdAt: Date }>).map((f) => ({
      category: f.category,
      content: f.content,
      createdAt: f.createdAt,
    })),
  };
  const mlInsights = computeMLInsights(mlInputs);
  const angles = computeAngles(mlInputs);

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
    conversations: { total: aiConvosCount },
    mlInsights,
    angles,
  };
}

async function generateNarrative(stats: Stats, displayName: string): Promise<any> {
  const prompt = `You are Lumina, a warm, perceptive companion writing a personal progress report for ${displayName}.
You have ${stats.periodDays} days of their data. Write as if you've been watching over them.
Be honest but gentle. No medical advice. No fake cheerfulness — if the data looks rough, say so with care.
Use second person ("you"). Keep each section tight — quality over length.

CRITICAL ANTI-HALLUCINATION RULE: For the ML-driven sections (mlFeelings, mlRelaxers, mlCapabilities, mlLikes, mlPeople, mlWhatIfs), you MUST only restate or rephrase facts that are present in the stats.mlInsights block below. Do NOT invent traits, preferences, or capabilities the data doesn't show. If a section's data is null or empty, write a single honest sentence saying there isn't enough data yet.

USER DATA:
${JSON.stringify(stats, null, 2)}

Write a structured report with these sections:
1. snapshot — 2-3 sentences capturing who they look like right now.
2. journey — 3-4 sentences narrating their mood trajectory. Reference real numbers.
3. shifts — 2-3 notable inflection points. One sentence each.
4. patterns — 3-5 bullet points of patterns across mood/tasks/activity.
5. wins — 3-4 specific things they've done well.
6. lessons — 2-3 sentences on what the data suggests they're learning.
7. reflections — 4-5 "if & but" questions for them to sit with.
8. nextSteps — 3 small, specific suggestions.

ML-DRIVEN SECTIONS (use stats.mlInsights — phrase, don't invent):
9. mlFeelings — 2-3 sentences on what they feel, grounded in mlInsights.feelings (dominant tone, top words). If null: one honest sentence about needing more entries.
10. mlRelaxers — 2-3 sentences on what genuinely relaxes them, using mlInsights.relaxers (the task type with highest moodLift). If empty: say so.
11. mlCapabilities — 3-4 bullets of strengths, each tied to a specific item from mlInsights.capabilities (use the evidence field).
12. mlLikes — 2-3 sentences on what they actually like to do. PREFER mlInsights.statedLikes (their own words from chat sessions: hobbies, preferences) when available. Fall back to mlInsights.preferences (top app activities) AND stats.tasks.byType (which task categories they actually finish) AND stats.activity.byType (raw frequencies of in-app actions) when statedLikes is null/empty. Be specific — name the exact task type or activity that shows up most in the data, with the count, e.g. "movement tasks (8 completed in this period)" or "you keep coming back to game_breathing (12 sessions)". Quote stated hobbies verbatim where natural — do not paraphrase the substance, just fit it into a sentence.
13. mlPeople — 2-3 sentences on the kind of people/connections they gravitate to. Combine mlInsights.social (socialMode, dmCount vs groupChatCount, anonymityRate) with mlInsights.statedLikes.relationships if present. If both are null: say so.
14. mlWhatIfs — 3-4 "what if" or "but" reflections, each tied to an item in mlInsights.whatIfs OR a concern in mlInsights.statedLikes.concerns. If empty: ask 2 honest open questions about patterns to watch for next period.

Tone: like a thoughtful friend who's kept notes. Warm, perceptive, never clinical.`;

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
      mlFeelings: { type: Type.STRING },
      mlRelaxers: { type: Type.STRING },
      mlCapabilities: { type: Type.ARRAY, items: { type: Type.STRING } },
      mlLikes: { type: Type.STRING },
      mlPeople: { type: Type.STRING },
      mlWhatIfs: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['snapshot', 'journey', 'shifts', 'patterns', 'wins', 'lessons', 'reflections', 'nextSteps', 'headline',
      'mlFeelings', 'mlRelaxers', 'mlCapabilities', 'mlLikes', 'mlPeople', 'mlWhatIfs'],
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

  const ml = stats.mlInsights;
  const topRelaxer = ml.relaxers[0];
  const topPref = ml.preferences[0];

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
    mlFeelings: ml.feelings
      ? `Across your notes and messages, your tone reads as ${ml.feelings.dominantTone}. The words showing up most: ${ml.feelings.topWords.slice(0, 4).map((w) => w.word).join(', ')}.`
      : 'Not enough written entries yet to read your tone — try adding a note when you log your mood.',
    mlRelaxers: topRelaxer && topRelaxer.moodLift > 0.3
      ? `${topRelaxer.taskType} seems to genuinely help — your mood averages ${topRelaxer.avgWith} on days you do it vs ${topRelaxer.avgWithout} otherwise.`
      : 'No clear pattern between any single task and your mood yet — keep logging.',
    mlCapabilities: ml.capabilities.length
      ? ml.capabilities.map((c) => `${c.name} — ${c.evidence}`)
      : ['Not enough data to map your strengths yet.'],
    mlLikes: (() => {
      const parts: string[] = [];
      if (ml.statedLikes && (ml.statedLikes.hobbies.length || ml.statedLikes.preferences.length)) {
        parts.push(`In your own words: ${[...ml.statedLikes.hobbies.slice(0, 3), ...ml.statedLikes.preferences.slice(0, 2)].join('; ')}.`);
      }
      const sortedTaskTypes = Object.entries(stats.tasks.byType)
        .sort((a, b) => b[1].completed - a[1].completed)
        .filter(([, v]) => v.completed > 0);
      if (sortedTaskTypes.length > 0) {
        const [topType, v] = sortedTaskTypes[0];
        parts.push(`In the app, you lean into ${topType} tasks — ${v.completed} of ${v.total} completed in this window.`);
      }
      if (topPref) {
        parts.push(`Your most-used in-app action is "${topPref.activity.replace(/_/g, ' ')}" (${topPref.frequency} times, last ${topPref.recencyDays} days ago).`);
      }
      if (parts.length === 0) return 'Not enough data to spot a clear preference yet — keep using the app and patterns will emerge.';
      return parts.join(' ');
    })(),
    mlPeople: ml.social
      ? `You lean ${ml.social.socialMode}: ${ml.social.dmCount} DMs, ${ml.social.groupChatCount} group messages, ${ml.social.postsTotal} posts. ${Math.round(ml.social.anonymityRate * 100)}% of what you share is anonymous.${ml.statedLikes && ml.statedLikes.relationships.length ? ` You\'ve mentioned: ${ml.statedLikes.relationships.slice(0, 2).join('; ')}.` : ''}`
      : ml.statedLikes && ml.statedLikes.relationships.length
      ? `From conversations, you\'ve mentioned: ${ml.statedLikes.relationships.slice(0, 3).join('; ')}.`
      : 'You haven\'t engaged socially much yet — your patterns will emerge as you do.',
    mlWhatIfs: ml.whatIfs.length
      ? ml.whatIfs.map((w) => `${w.observation} (${w.evidence})`)
      : ml.statedLikes && ml.statedLikes.concerns.length
      ? ml.statedLikes.concerns.slice(0, 3).map((c) => `What if the worry around "${c}" softened — what would change?`)
      : ['What patterns might show up if you tracked for another two weeks?'],
  };
}

// ---------- Load-more insight endpoint ----------
async function phraseAngle(angle: Angle, displayName: string): Promise<{ question: string; answer: string }> {
  const prompt = `You are Lumina, a warm, perceptive companion. Phrase ONE insight for ${displayName} based STRICTLY on the precomputed fact below.

Question: "${angle.question}"
Computed fact (do not invent anything beyond this): "${angle.fact}"
Numbers: ${JSON.stringify(angle.numbers)}

Output:
- question: Lightly rephrase the question to feel personal (keep the meaning).
- answer: 2-3 warm, conversational sentences that restate the fact in plain language. You may add gentle observation but no new numbers, no new claims. End with a soft prompt or question.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      question: { type: Type.STRING },
      answer: { type: Type.STRING },
    },
    required: ['question', 'answer'],
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: schema },
    });
    const parsed = JSON.parse(response.text || '{}');
    return {
      question: parsed.question || angle.question,
      answer: parsed.answer || angle.fact,
    };
  } catch (err) {
    console.error('phraseAngle failed, using fallback:', err);
    return { question: angle.question, answer: angle.fact };
  }
}

/**
 * POST /api/report/insight
 * Body: { days?: number, exclude?: string[] }
 * Returns one ML-grounded Q&A drawn from the angle pool, excluding any keys already shown.
 */
router.post('/insight', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const days = Math.max(7, Math.min(180, parseInt((req.body?.days as string) || '30', 10)));
    const exclude: string[] = Array.isArray(req.body?.exclude) ? req.body.exclude : [];

    const stats = await gatherStats(userId, days);
    const remaining = stats.angles.filter((a) => !exclude.includes(a.key));

    if (remaining.length === 0) {
      res.json({ done: true });
      return;
    }

    const angle = remaining[Math.floor(Math.random() * remaining.length)];
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    const phrased = await phraseAngle(angle, user?.displayName || 'friend');

    res.json({
      key: angle.key,
      question: phrased.question,
      answer: phrased.answer,
      evidence: angle.fact,
      numbers: angle.numbers,
      remaining: remaining.length - 1,
    });
  } catch (err) {
    console.error('insight error:', err);
    res.status(500).json({ error: 'Failed to generate insight' });
  }
});

export default router;
