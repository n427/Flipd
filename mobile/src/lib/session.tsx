import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { fetchLegalAcceptance, legalAcceptanceState } from './legalAcceptance';

// 'unknown' until the profile row has been read — the gate must not route on a
// guess, or a returning user flashes onboarding before the check lands.
type Onboarded = 'unknown' | 'yes' | 'no';
type GateState = 'unknown' | 'yes' | 'no';

type Ctx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  onboarded: Onboarded;
  profileComplete: GateState;
  legalAccepted: GateState;
  refreshOnboarded: () => Promise<void>;
};
const SessionContext = createContext<Ctx>({
  session: null,
  user: null,
  loading: true,
  onboarded: 'unknown',
  profileComplete: 'unknown',
  legalAccepted: 'unknown',
  refreshOnboarded: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState<Onboarded>('unknown');
  const [profileComplete, setProfileComplete] = useState<GateState>('unknown');
  const [legalAccepted, setLegalAccepted] = useState<GateState>('unknown');

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
      setProfileComplete('unknown');
      setLegalAccepted('unknown');
      return;
    }
    const [profileResult, acceptanceResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('display_name, contact_instagram, contact_email')
        .eq('id', userId)
        .maybeSingle(),
      fetchLegalAcceptance(userId)
        .then((row) => ({ row, failed: false }))
        .catch(() => ({ row: null, failed: true })),
    ]);
    // On a read failure, treat the user as onboarded: a network blip should
    // send someone to the feed, never loop an existing user through setup.
    const hasContact = Boolean(
      profileResult.data?.contact_instagram || profileResult.data?.contact_email,
    );
    // Preserve the old behavior for a transient profile failure, but never
    // infer legal consent from a failed acceptance read.
    const profileState: GateState = profileResult.error
      ? 'yes'
      : profileResult.data?.display_name && hasContact
        ? 'yes'
        : 'no';
    const acceptanceState = legalAcceptanceState(
      acceptanceResult.row,
      acceptanceResult.failed,
    );
    setProfileComplete(profileState);
    setLegalAccepted(acceptanceState);
    setOnboarded(profileState === 'yes' && acceptanceState === 'yes' ? 'yes' : 'no');
  }, [userId]);

  useEffect(() => {
    check();
  }, [check]);

  return (
    <SessionContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        onboarded,
        profileComplete,
        legalAccepted,
        refreshOnboarded: check,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
