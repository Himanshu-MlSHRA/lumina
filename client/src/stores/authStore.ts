import { create } from 'zustand';
import { api } from '../services/api';

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isAnonymous: boolean;
  streak: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('lumina_token'),
  loading: true,
  error: null,

  login: async (email, password) => {
    set({ error: null, loading: true });
    try {
      const data = await api.post('/auth/login', { email, password });
      localStorage.setItem('lumina_token', data.token);
      set({ user: data.user, token: data.token, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  signup: async (email, password, displayName) => {
    set({ error: null, loading: true });
    try {
      const data = await api.post('/auth/signup', { email, password, displayName });
      localStorage.setItem('lumina_token', data.token);
      set({ user: data.user, token: data.token, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('lumina_token');
    set({ user: null, token: null, loading: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('lumina_token');
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const data = await api.get('/auth/me');
      set({ user: data.user, token, loading: false });
    } catch {
      localStorage.removeItem('lumina_token');
      set({ user: null, token: null, loading: false });
    }
  },
}));
