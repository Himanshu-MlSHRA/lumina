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

    if (!title || !description) {
      res.status(400).json({ error: 'Title and description are required' });
      return;
    }

    const validTypes = ['movement', 'mindfulness', 'social', 'creative'];
    const taskType = validTypes.includes(type) ? type : 'mindfulness';

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const task = await prisma.dailyTask.create({
      data: {
        userId: req.userId!,
        title,
        description,
        type: taskType,
        date: today,
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

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      res.status(400).json({ error: 'tasks array is required' });
      return;
    }

    const validTypes = ['movement', 'mindfulness', 'social', 'creative'];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Create tasks one by one to get IDs back (SQLite doesn't support createManyAndReturn well)
    const created = await Promise.all(
      tasks.map((t: any) =>
        prisma.dailyTask.create({
          data: {
            userId: req.userId!,
            title: t.title || 'Untitled Task',
            description: t.description || '',
            type: validTypes.includes(t.type) ? t.type : 'mindfulness',
            date: today,
            aiGenerated: true,
          },
        })
      )
    );

    res.status(201).json({ tasks: created });
  } catch (error) {
    console.error('Batch create tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a task (used when refreshing AI tasks based on new behaviour signal)
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const result = await prisma.dailyTask.deleteMany({
      where: { id: taskId, userId: req.userId! },
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ deleted: true });
  } catch (error) {
    console.error('Delete task error:', error);
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
