import { create } from 'zustand';

import type { ConsoleMe, ConsoleSessionActor } from '@1flowbase/api-client';

export interface AuthSnapshot {
  csrfToken: string;
  actor: ConsoleSessionActor;
  me: ConsoleMe | null;
}

interface AuthState {
  sessionStatus: 'unknown' | 'authenticated' | 'anonymous';
  csrfToken: string | null;
  actor: ConsoleSessionActor | null;
  me: ConsoleMe | null;
  setAuthenticated: (payload: AuthSnapshot) => void;
  setAnonymous: () => void;
  setMe: (me: ConsoleMe) => void;
}

const initialState = {
  sessionStatus: 'unknown' as const,
  csrfToken: null,
  actor: null,
  me: null
};

export const useAuthStore = create<AuthState>((set) => ({
  ...initialState,
  setAuthenticated: ({ csrfToken, actor, me }) =>
    set({
      sessionStatus: 'authenticated',
      csrfToken,
      actor,
      me
    }),
  setAnonymous: () =>
    set({
      sessionStatus: 'anonymous',
      csrfToken: null,
      actor: null,
      me: null
    }),
  setMe: (me) =>
    set((state) => ({
      me,
      sessionStatus: state.actor ? 'authenticated' : state.sessionStatus
    }))
}));

export function resetAuthStore() {
  useAuthStore.setState(initialState);
}
