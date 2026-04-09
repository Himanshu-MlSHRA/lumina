import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// Get tasks for a specific date
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const dateStr = req.query.date as string;
    const date = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 86400000);

    const tasks = await prisma.dailyTask.findMany({
      where: {
        userId: req.userId!,
        date: { gte: startOfDay, lt: endOfDay },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ tasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a task
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, type, aiGenerated } = req.body;

    const task = await prisma.dailyTask.create({
      data: {
        userId: req.userId!,
        title,
        description,
        type,
        aiGenerated: aiGenerated || false,
      },
    });

    res.status(201).json({ task });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Batch create tasks (for AI-generated tasks)
router.post('/batch', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { tasks } = req.body;

    const created = await prisma.dailyTask.createManyAndReturn({
      data: tasks.map((t: any) => ({
        userId: req.userId!,
        title: t.title,
        description: t.description,
        type: t.type,
        aiGenerated: true,
      })),
    });

    res.status(201).json({ tasks: created });
  } catch (error) {
    console.error('Batch create tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle task completion
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { completed } = req.body;

    const taskId = req.params.id as string;
    const task = await prisma.dailyTask.updateMany({
      where: { id: taskId, userId: req.userId! },
      data: { completed },
    });

    if (task.count === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const updated = await prisma.dailyTask.findUnique({ where: { id: taskId } });
    res.json({ task: updated });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
