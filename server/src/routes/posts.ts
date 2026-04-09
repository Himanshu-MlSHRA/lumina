import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// Get posts (optionally filtered by group)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.query;

    const posts = await prisma.communityPost.findMany({
      where: groupId ? { groupId: groupId as string } : {},
      include: {
        author: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        group: {
          select: { id: true, name: true },
        },
        _count: { select: { likes: true } },
        likes: {
          where: { userId: req.userId! },
          select: { userId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const result = posts.map(p => ({
      id: p.id,
      content: p.content,
      imageUrl: p.imageUrl,
      isAnonymous: p.isAnonymous,
      createdAt: p.createdAt,
      author: p.isAnonymous
        ? { id: p.authorId, displayName: 'Anonymous Soul', avatarUrl: null }
        : p.author,
      group: p.group,
      likeCount: p._count.likes,
      isLiked: p.likes.length > 0,
    }));

    res.json({ posts: result });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a post
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, content, imageUrl, isAnonymous } = req.body;

    if (!groupId || !content) {
      res.status(400).json({ error: 'groupId and content are required' });
      return;
    }

    const post = await prisma.communityPost.create({
      data: {
        authorId: req.userId!,
        groupId,
        content,
        imageUrl,
        isAnonymous: isAnonymous || false,
      },
      include: {
        author: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        group: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(201).json({ post });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle like on a post
router.post('/:id/like', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id as string;
    const existing = await prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId: req.userId! } },
    });

    if (existing) {
      await prisma.postLike.delete({
        where: { postId_userId: { postId, userId: req.userId! } },
      });
    } else {
      await prisma.postLike.create({
        data: { postId, userId: req.userId! },
      });
    }

    const count = await prisma.postLike.count({ where: { postId } });

    res.json({ liked: !existing, count });
  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
