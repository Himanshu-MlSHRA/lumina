import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfTomorrow() {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

// Check whether the user has already logged a mood today
router.get('/today', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const entry = await prisma.moodEntry.findFirst({
      where: {
        userId: req.userId!,
        createdAt: { gte: startOfToday(), lt: startOfTomorrow() },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ entry, logged: !!entry });
  } catch (error) {
    console.error('Get today mood error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get mood entries for the last N days
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const entries = await prisma.moodEntry.findMany({
      where: {
        userId: req.userId!,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ entries });
  } catch (error) {
    console.error('Get mood error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Log a mood entry. One entry per day — replaces today's entry if it already exists.
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { score, label, note, source } = req.body;

    if (typeof score !== 'number' || !label) {
      res.status(400).json({ error: 'Score and label are required' });
      return;
    }

    const existing = await prisma.moodEntry.findFirst({
      where: {
        userId: req.userId!,
        createdAt: { gte: startOfToday(), lt: startOfTomorrow() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const updated = await prisma.moodEntry.update({
        where: { id: existing.id },
        data: {
          score,
          label,
          note: note ?? existing.note,
          source: source || existing.source,
        },
      });
      res.json({ entry: updated, replaced: true });
      return;
    }

    const entry = await prisma.moodEntry.create({
      data: {
        userId: req.userId!,
        score,
        label,
        note,
        source: source || 'manual',
      },
    });

    res.status(201).json({ entry, replaced: false });
  } catch (error) {
    console.error('Create mood error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
