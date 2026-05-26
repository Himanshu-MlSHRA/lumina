import { create } from 'zustand';

type PendingNav = {
  path: string;
  resolve: (value: 'continue' | 'end') => void;
};

interface LuminaState {
  isActive: boolean;
  setActive: (v: boolean) => void;
  pending: PendingNav | null;
  requestNavigation: (path: string) => Promise<'continue' | 'end'>;
  resolvePending: (decision: 'continue' | 'end') => void;
  endSessionHandler: (() => void) | null;
  registerEndHandler: (fn: (() => void) | null) => void;
}

export const useLuminaStore = create<LuminaState>((set, get) => ({
  isActive: false,
  setActive: (v) => set({ isActive: v }),
  pending: null,
  requestNavigation: (path) => {
    return new Promise((resolve) => {
      set({ pending: { path, resolve } });
    });
  },
  resolvePending: (decision) => {
    const { pending, endSessionHandler } = get();
    if (pending) {
      pending.resolve(decision);
      set({ pending: null });
      if (decision === 'end' && endSessionHandler) {
        endSessionHandler();
      }
    }
  },
  endSessionHandler: null,
  registerEndHandler: (fn) => set({ endSessionHandler: fn }),
}));
