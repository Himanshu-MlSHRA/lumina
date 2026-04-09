import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// Get mood entries for the last N days
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

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

// Log a mood entry
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { score, label, note, source } = req.body;

    if (!score || !label) {
      res.status(400).json({ error: 'Score and label are required' });
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

    res.status(201).json({ entry });
  } catch (error) {
    console.error('Create mood error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
