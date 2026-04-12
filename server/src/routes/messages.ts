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

// Get all DM conversations for the current user
router.get('/conversations', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Find all unique users this user has DM'd with
    const sentMessages = await prisma.message.findMany({
      where: { senderId: req.userId!, groupId: null, recipientId: { not: null } },
      select: { recipientId: true },
      distinct: ['recipientId'],
    });

    const receivedMessages = await prisma.message.findMany({
      where: { recipientId: req.userId!, groupId: null },
      select: { senderId: true },
      distinct: ['senderId'],
    });

    const userIds = new Set<string>();
    sentMessages.forEach(m => { if (m.recipientId) userIds.add(m.recipientId); });
    receivedMessages.forEach(m => userIds.add(m.senderId));

    // Get the latest message for each conversation
    const conversations = await Promise.all(
      Array.from(userIds).map(async (otherUserId) => {
        const lastMessage = await prisma.message.findFirst({
          where: {
            groupId: null,
            OR: [
              { senderId: req.userId!, recipientId: otherUserId },
              { senderId: otherUserId, recipientId: req.userId! },
            ],
          },
          orderBy: { createdAt: 'desc' },
          include: {
            sender: { select: { id: true, displayName: true, avatarUrl: true } },
          },
        });

        const otherUser = await prisma.user.findUnique({
          where: { id: otherUserId },
          select: { id: true, displayName: true, avatarUrl: true },
        });

        return {
          user: otherUser,
          lastMessage: lastMessage ? {
            content: lastMessage.content,
            createdAt: lastMessage.createdAt,
            isFromMe: lastMessage.senderId === req.userId,
          } : null,
        };
      })
    );

    // Sort by most recent message
    conversations.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt?.getTime() || 0;
      const bTime = b.lastMessage?.createdAt?.getTime() || 0;
      return bTime - aTime;
    });

    res.json({ conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
