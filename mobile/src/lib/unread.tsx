import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useSession } from './session';
import { fetchUnreadCount } from './listings';

type Ctx = { count: number; refresh: () => void };
const UnreadContext = createContext<Ctx>({ count: 0, refresh: () => {} });

const POLL_MS = 60_000;

// Tracks the unread-reveals count for the Requests tab badge. Polls on a timer,
// on app-foreground, and on demand via refresh() (called after approve/decline
// or when the Requests screen loads and marks things seen).
export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const [count, setCount] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setCount(0);
      return;
    }
    setCount(await fetchUnreadCount());
  }, [user]);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => {
      if (timer.current) clearInterval(timer.current);
      sub.remove();
    };
  }, [refresh]);

  return <UnreadContext.Provider value={{ count, refresh }}>{children}</UnreadContext.Provider>;
}

export const useUnread = () => useContext(UnreadContext);
