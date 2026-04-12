import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import {
  QUESTION_BANK,
  selectDailyQuestions,
  computeType,
  dateKey,
  TYPE_PROFILES,
} from '../lib/personality.js';

const router = Router();
const prisma = new PrismaClient();

const DAILY_QUESTION_COUNT = 10;

function dayBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start.getTime() + 86400000);
  return { start, end };
}

/**
 * GET /api/personality/today
 * Returns today's 10 questions for the user (balanced across axes,
 * deterministic per user+day), plus how many they've already answered today.
 */
router.get('/today', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { start, end } = dayBounds();

    const answeredToday = await prisma.personalityAnswer.findMany({
      where: { userId, createdAt: { gte: start, lt: end } },
      select: { questionId: true },
    });
    const answeredSet = new Set(answeredToday.map((a) => a.questionId));

    const dk = dateKey();
    const selected = selectDailyQuestions(userId, dk, new Set(), DAILY_QUESTION_COUNT);

    const questions = selected.map((q) => ({
      id: q.id,
      text: q.text,
      axis: q.axis,
      direction: q.direction,
      answered: answeredSet.has(q.id),
    }));

    res.json({
      date: dk,
      questions,
      answeredCount: answeredSet.size,
      total: DAILY_QUESTION_COUNT,
      completed: answeredSet.size >= DAILY_QUESTION_COUNT,
    });
  } catch (err) {
    console.error('personality/today error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/personality/answer
 * Body: { questionId, score (0-5), sessionId? }
 * Records a single Likert answer. Returns the running type snapshot so the UI
 * can show live "Lumina" reactions.
 */
router.post('/answer', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { questionId, score, sessionId } = req.body as {
      questionId: string;
      score: number;
      sessionId?: string;
    };

    const question = QUESTION_BANK.find((q) => q.id === questionId);
    if (!question) {
      res.status(400).json({ error: 'Unknown question id' });
      return;
    }
    if (typeof score !== 'number' || score < 0 || score > 5) {
      res.status(400).json({ error: 'Score must be 0-5' });
      return;
    }

    let session = sessionId
      ? await prisma.personalitySession.findUnique({ where: { id: sessionId } })
      : null;

    if (!session || session.userId !== userId) {
      session = await prisma.personalitySession.create({
        data: { userId, questionCount: 0 },
      });
    }

    await prisma.personalityAnswer.create({
      data: {
        userId,
        questionId,
        axis: question.axis,
        direction: question.direction,
        score: Math.round(score),
        weight: 1.0,
        sessionId: session.id,
      },
    });

    const updatedSession = await prisma.personalitySession.update({
      where: { id: session.id },
      data: { questionCount: { increment: 1 } },
    });

    const allAnswers = await prisma.personalityAnswer.findMany({
      where: { userId },
      select: { axis: true, direction: true, score: true },
    });
    const result = computeType(allAnswers);

    const completed = updatedSession.questionCount >= DAILY_QUESTION_COUNT;
    if (completed && !updatedSession.completed) {
      await prisma.personalitySession.update({
        where: { id: session.id },
        data: {
          completed: true,
          completedAt: new Date(),
          typeSnapshot: result.type,
        },
      });
      await prisma.activityLog.create({
        data: {
          userId,
          activityType: 'personality_session',
          metadata: { type: result.type, answered: updatedSession.questionCount },
        },
      });
    }

    res.json({
      sessionId: session.id,
      sessionCount: updatedSession.questionCount,
      sessionComplete: completed,
      result,
      profile: TYPE_PROFILES[result.type] || null,
    });
  } catch (err) {
    console.error('personality/answer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/personality/result
 * Returns the user's current personality snapshot + streak + missed-day info.
 */
router.get('/result', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const allAnswers = await prisma.personalityAnswer.findMany({
      where: { userId },
      select: { axis: true, direction: true, score: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const result = computeType(allAnswers);
    const profile = TYPE_PROFILES[result.type] || null;

    // Streak: consecutive days ending today with >= DAILY_QUESTION_COUNT answers.
    const byDay = new Map<string, number>();
    for (const a of allAnswers) {
      const k = dateKey(a.createdAt);
      byDay.set(k, (byDay.get(k) || 0) + 1);
    }

    let streak = 0;
    const cursor = new Date();
    for (let i = 0; i < 365; i++) {
      const k = dateKey(cursor);
      const count = byDay.get(k) || 0;
      if (i === 0) {
        if (count >= DAILY_QUESTION_COUNT) streak++;
        else if (count > 0) break;
        else {
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
      } else {
        if (count >= DAILY_QUESTION_COUNT) streak++;
        else break;
      }
      cursor.setDate(cursor.getDate() - 1);
    }

    const lastSession = await prisma.personalitySession.findFirst({
      where: { userId, completed: true },
      orderBy: { completedAt: 'desc' },
    });

    let missedYesterday = false;
    if (lastSession?.completedAt) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yKey = dateKey(yesterday);
      const lastKey = dateKey(lastSession.completedAt);
      const todayKey = dateKey();
      missedYesterday = lastKey !== yKey && lastKey !== todayKey;
    }

    res.json({
      result,
      profile,
      streak,
      totalAnswers: allAnswers.length,
      lastSessionAt: lastSession?.completedAt || null,
      missedYesterday,
    });
  } catch (err) {
    console.error('personality/result error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/personality/ask-lumina
 * Text-only helper (the "Ask Lumina" bubble). Used for cheap text responses
 * when the user hasn't opened the full live-audio overlay.
 * Body: { questionText, action: 'simplify' | 'explain' | 'example' }
 */
router.post('/ask-lumina', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { questionText, action } = req.body as { questionText: string; action: string };
    if (!questionText) {
      res.status(400).json({ error: 'questionText required' });
      return;
    }

    const { getChatResponse } = await import('../lib/gemini.js');
    const prompt =
      action === 'simplify'
        ? `Rewrite this personality-test statement in simpler, everyday language in one short sentence. Do not add explanations.\n\nStatement: "${questionText}"`
        : action === 'example'
        ? `Give one concrete everyday example of what this personality-test statement means. One or two short sentences, warm and conversational.\n\nStatement: "${questionText}"`
        : `Briefly explain what this personality-test statement is really asking about. Two short sentences, warm tone, no jargon.\n\nStatement: "${questionText}"`;

    const text = await getChatResponse([], prompt);
    res.json({ text });
  } catch (err) {
    console.error('personality/ask-lumina error:', err);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

export default router;
