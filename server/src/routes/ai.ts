import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { getChatResponse, generateDailyTasks } from '../lib/gemini.js';

const router = Router();

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

// Generate daily tasks based on mood
router.post('/tasks', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { mood } = req.body;

    if (!mood) {
      res.status(400).json({ error: 'mood is required' });
      return;
    }

    const tasks = await generateDailyTasks(mood);
    res.json({ tasks });
  } catch (error) {
    console.error('AI tasks error:', error);
    res.status(500).json({ error: 'AI service unavailable' });
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
