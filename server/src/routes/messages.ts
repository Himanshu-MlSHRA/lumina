import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// Get group messages (paginated)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, limit, before } = req.query;

    if (!groupId) {
      res.status(400).json({ error: 'groupId is required' });
      return;
    }

    // Verify user is a member
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: groupId as string, userId: req.userId! } },
    });

    if (!member) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    const messages = await prisma.message.findMany({
      where: {
        groupId: groupId as string,
        ...(before ? { createdAt: { lt: new Date(before as string) } } : {}),
      },
      include: {
        sender: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string) || 50,
    });

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get DM conversation (paginated)
router.get('/dm/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { limit, before } = req.query;
    const otherUserId = req.params.userId as string;

    const messages = await prisma.message.findMany({
      where: {
        groupId: null,
        OR: [
          { senderId: req.userId!, recipientId: otherUserId },
          { senderId: otherUserId, recipientId: req.userId! },
        ],
        ...(before ? { createdAt: { lt: new Date(before as string) } } : {}),
      },
      include: {
        sender: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string) || 50,
    });

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Get DMs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
