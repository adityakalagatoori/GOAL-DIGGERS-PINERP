import { create } from 'zustand';
import type { User } from '../types';
import { useRbacStore } from './rbacStore';

// 'idle': never checked yet (app just loaded). 'loading': a session check is
// in flight. 'authenticated'/'unauthenticated': resolved. There is
// deliberately no token here — the session lives entirely in an HttpOnly
// cookie the browser manages, never in JS-reachable storage.
export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: User | null;
  status: AuthStatus;
  login: (user: User) => void;
  setLoading: () => void;
  setUnauthenticated: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'idle',
  login: (user) => {
    // When a user logs in, populate the RBAC store with their role's permissions
    if (user.role) {
      useRbacStore.getState().setRole(user.role);
    } else {
      useRbacStore.getState().setRole(null);
    }
    set({ user, status: 'authenticated' });
  },
  setLoading: () => set({ status: 'loading' }),
  setUnauthenticated: () => {
    useRbacStore.getState().setRole(null);
    set({ user: null, status: 'unauthenticated' });
  },
}));
