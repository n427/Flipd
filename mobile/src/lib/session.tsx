import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

// 'unknown' until the profile row has been read — the gate must not route on a
// guess, or a returning user flashes onboarding before the check lands.
type Onboarded = 'unknown' | 'yes' | 'no';

type Ctx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  onboarded: Onboarded;
  refreshOnboarded: () => Promise<void>;
};
const SessionContext = createContext<Ctx>({
  session: null,
  user: null,
  loading: true,
  onboarded: 'unknown',
  refreshOnboarded: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState<Onboarded>('unknown');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;

  // Onboarding is complete when there's a display name and at least one way to
  // reach the person — the same pair the web app checks before /feed.
  const check = useCallback(async () => {
    if (!userId) {
      setOnboarded('unknown');
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, contact_instagram, contact_phone, contact_email')
      .eq('id', userId)
      .maybeSingle();
    // On a read failure, treat the user as onboarded: a network blip should
    // send someone to the feed, never loop an existing user through setup.
    if (error) {
      setOnboarded('yes');
      return;
    }
    const hasContact = Boolean(data?.contact_instagram || data?.contact_phone || data?.contact_email);
    setOnboarded(data?.display_name && hasContact ? 'yes' : 'no');
  }, [userId]);

  useEffect(() => {
    check();
  }, [check]);

  return (
    <SessionContext.Provider
      value={{ session, user: session?.user ?? null, loading, onboarded, refreshOnboarded: check }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
