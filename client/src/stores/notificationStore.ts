import { create } from 'zustand';

export interface Notification {
  id: string;
  type: 'dm' | 'group-message' | 'personality';
  title: string;
  preview: string;
  senderId?: string;
  groupId?: string;
  link?: string;
  timestamp: Date;
  read: boolean;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  showPanel: boolean;
  addNotification: (n: Omit<Notification, 'id' | 'read'>) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
  togglePanel: () => void;
  closePanel: () => void;
}

let idCounter = 0;

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  showPanel: false,

  addNotification: (n) => {
    const notification: Notification = {
      ...n,
      id: `notif-${++idCounter}-${Date.now()}`,
      read: false,
    };
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + 1,
    }));
  },

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  markRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - (state.notifications.find(n => n.id === id && !n.read) ? 1 : 0)),
    })),

  clearAll: () => set({ notifications: [], unreadCount: 0 }),

  togglePanel: () => set((state) => ({ showPanel: !state.showPanel })),

  closePanel: () => set({ showPanel: false }),
}));
