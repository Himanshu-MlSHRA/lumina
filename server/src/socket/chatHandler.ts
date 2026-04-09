import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuthSocket extends Socket {
  userId?: string;
  displayName?: string;
}

// Track online users: userId -> Set<socketId>
const onlineUsers = new Map<string, Set<string>>();

export function setupSocketHandlers(io: Server) {
  // Authenticate socket connections via JWT
  io.use(async (socket: AuthSocket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      socket.userId = decoded.userId;

      // Fetch display name for notifications
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { displayName: true },
      });
      socket.displayName = user?.displayName || 'User';
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthSocket) => {
    const userId = socket.userId!;
    console.log(`User connected: ${userId} (${socket.displayName})`);

    // Track online status
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    // Join personal room for receiving DMs and notifications
    socket.join(`user:${userId}`);

    // Broadcast online status
    io.emit('user-online', { userId, online: true });

    // ── Group Chat ──────────────────────────────────────────────

    socket.on('join-group', ({ groupId }: { groupId: string }) => {
      socket.join(`group:${groupId}`);
    });

    socket.on('leave-group', ({ groupId }: { groupId: string }) => {
      socket.leave(`group:${groupId}`);
    });

    socket.on('group-message', async ({ groupId, content, isAnonymous }: {
      groupId: string;
      content: string;
      isAnonymous: boolean;
    }) => {
      try {
        const message = await prisma.message.create({
          data: {
            senderId: userId,
            groupId,
            content,
            isAnonymous: isAnonymous || false,
          },
          include: {
            sender: {
              select: { id: true, displayName: true, avatarUrl: true },
            },
          },
        });

        const payload = {
          ...message,
          sender: isAnonymous
            ? { id: message.senderId, displayName: 'Anonymous Soul', avatarUrl: null }
            : message.sender,
        };

        // Emit to all in the group room (includes sender)
        io.to(`group:${groupId}`).emit('new-group-message', { message: payload });

        // Send notification to group members NOT in the room
        const groupMembers = await prisma.groupMember.findMany({
          where: { groupId },
          select: { userId: true },
        });

        const group = await prisma.group.findUnique({
          where: { id: groupId },
          select: { name: true },
        });

        for (const member of groupMembers) {
          if (member.userId === userId) continue; // skip sender
          // Check if user's sockets are in the group room
          const userSockets = await io.in(`user:${member.userId}`).fetchSockets();
          for (const s of userSockets) {
            const rooms = s.rooms;
            if (!rooms.has(`group:${groupId}`)) {
              s.emit('notification', {
                type: 'group-message',
                groupId,
                groupName: group?.name || 'Group',
                senderName: isAnonymous ? 'Anonymous' : socket.displayName,
                preview: content.substring(0, 80),
                timestamp: message.createdAt,
              });
            }
          }
        }
      } catch (error) {
        console.error('Group message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ── Direct Messages ─────────────────────────────────────────

    socket.on('join-dm', ({ otherUserId }: { otherUserId: string }) => {
      const roomKey = [userId, otherUserId].sort().join(':');
      socket.join(`dm:${roomKey}`);
    });

    socket.on('leave-dm', ({ otherUserId }: { otherUserId: string }) => {
      const roomKey = [userId, otherUserId].sort().join(':');
      socket.leave(`dm:${roomKey}`);
    });

    socket.on('direct-message', async ({ recipientId, content }: {
      recipientId: string;
      content: string;
    }) => {
      try {
        const message = await prisma.message.create({
          data: {
            senderId: userId,
            recipientId,
            content,
          },
          include: {
            sender: {
              select: { id: true, displayName: true, avatarUrl: true },
            },
          },
        });

        const roomKey = [userId, recipientId].sort().join(':');

        // Emit to the DM room (both users if they have the DM page open)
        io.to(`dm:${roomKey}`).emit('new-dm', { message });

        // ALSO emit directly to sender's personal room (in case they're not in dm room yet)
        io.to(`user:${userId}`).emit('new-dm', { message });

        // Emit to recipient's personal room (always — they might not have DM page open)
        io.to(`user:${recipientId}`).emit('new-dm', { message });

        // Send notification to recipient
        io.to(`user:${recipientId}`).emit('notification', {
          type: 'dm',
          senderId: userId,
          senderName: socket.displayName,
          preview: content.substring(0, 80),
          timestamp: message.createdAt,
        });
      } catch (error) {
        console.error('DM error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ── Typing Indicators ───────────────────────────────────────

    socket.on('typing', ({ groupId, recipientId }: { groupId?: string; recipientId?: string }) => {
      if (groupId) {
        socket.to(`group:${groupId}`).emit('user-typing', {
          userId,
          displayName: socket.displayName,
          groupId,
        });
      } else if (recipientId) {
        io.to(`user:${recipientId}`).emit('user-typing', {
          userId,
          displayName: socket.displayName,
        });
      }
    });

    socket.on('stop-typing', ({ groupId, recipientId }: { groupId?: string; recipientId?: string }) => {
      if (groupId) {
        socket.to(`group:${groupId}`).emit('user-stop-typing', {
          userId,
          groupId,
        });
      } else if (recipientId) {
        io.to(`user:${recipientId}`).emit('user-stop-typing', { userId });
      }
    });

    // ── WebRTC Signaling for Calls ──────────────────────────────

    socket.on('call-initiate', ({ recipientId, callType, offer }: {
      recipientId: string;
      callType: 'audio' | 'video';
      offer: RTCSessionDescriptionInit;
    }) => {
      io.to(`user:${recipientId}`).emit('call-incoming', {
        callerId: userId,
        callerName: socket.displayName,
        callType,
        offer,
      });
    });

    socket.on('call-accept', ({ callerId, answer }: {
      callerId: string;
      answer: RTCSessionDescriptionInit;
    }) => {
      io.to(`user:${callerId}`).emit('call-accepted', {
        recipientId: userId,
        answer,
      });
    });

    socket.on('call-reject', ({ callerId }: { callerId: string }) => {
      io.to(`user:${callerId}`).emit('call-rejected', {
        recipientId: userId,
      });
    });

    socket.on('call-end', ({ otherUserId }: { otherUserId: string }) => {
      io.to(`user:${otherUserId}`).emit('call-ended', {
        userId,
      });
    });

    socket.on('ice-candidate', ({ targetUserId, candidate }: {
      targetUserId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      io.to(`user:${targetUserId}`).emit('ice-candidate', {
        userId,
        candidate,
      });
    });

    // ── Disconnect ──────────────────────────────────────────────

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${userId}`);
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit('user-online', { userId, online: false });
        }
      }
    });
  });
}
