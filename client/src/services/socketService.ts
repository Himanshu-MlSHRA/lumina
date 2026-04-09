import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let connectionPromise: Promise<Socket> | null = null;

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;

  // Disconnect stale socket
  if (socket) {
    socket.disconnect();
  }

  socket = io('http://localhost:3001', {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  connectionPromise = new Promise<Socket>((resolve) => {
    if (socket!.connected) {
      resolve(socket!);
    } else {
      socket!.once('connect', () => {
        resolve(socket!);
      });
    }
  });

  return socket;
}

/** Wait until socket is actually connected before emitting */
export async function waitForSocket(): Promise<Socket | null> {
  if (socket?.connected) return socket;
  if (connectionPromise) return connectionPromise;
  return null;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  connectionPromise = null;
}

export function getSocket(): Socket | null {
  return socket;
}

/** Subscribe to notifications globally */
export function onNotification(callback: (data: any) => void): () => void {
  if (!socket) return () => {};
  socket.on('notification', callback);
  return () => {
    socket?.off('notification', callback);
  };
}
