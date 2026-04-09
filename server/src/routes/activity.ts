import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// Log an activity
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { activityType, metadata } = req.body;

    if (!activityType) {
      res.status(400).json({ error: 'activityType is required' });
      return;
    }

    const log = await prisma.activityLog.create({
      data: {
        userId: req.userId!,
        activityType,
        metadata,
      },
    });

    // Update user's lastActive
    await prisma.user.update({
      where: { id: req.userId! },
      data: { lastActive: new Date() },
    });

    res.status(201).json({ log });
  } catch (error) {
    console.error('Log activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get activity for the last N days (for heatmap)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 28;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = await prisma.activityLog.findMany({
      where: {
        userId: req.userId!,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ logs });
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
