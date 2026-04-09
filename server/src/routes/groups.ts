import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// Get all groups with member count and joined status
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const groups = await prisma.group.findMany({
      include: {
        _count: { select: { members: true } },
        members: {
          where: { userId: req.userId! },
          select: { userId: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const result = groups.map(g => ({
      id: g.id,
      name: g.name,
      description: g.description,
      icon: g.icon,
      color: g.color,
      isDefault: g.isDefault,
      memberCount: g._count.members,
      isJoined: g.members.length > 0,
      createdAt: g.createdAt,
    }));

    res.json({ groups: result });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a group
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, icon, color } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Group name is required' });
      return;
    }

    const group = await prisma.group.create({
      data: {
        name,
        description,
        icon,
        color,
        createdById: req.userId!,
        members: {
          create: { userId: req.userId!, role: 'admin' },
        },
      },
    });

    res.status(201).json({ group });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Join a group
router.post('/:id/join', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;
    const existing = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: req.userId! } },
    });

    if (existing) {
      res.status(409).json({ error: 'Already a member' });
      return;
    }

    await prisma.groupMember.create({
      data: { groupId, userId: req.userId! },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Join group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Leave a group
router.post('/:id/leave', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;
    await prisma.groupMember.delete({
      where: { groupId_userId: { groupId, userId: req.userId! } },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get members of a group
router.get('/:id/members', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: {
          select: { id: true, displayName: true, avatarUrl: true, isAnonymous: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    res.json({ members: members.map(m => ({ ...m.user, role: m.role, joinedAt: m.joinedAt })) });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
