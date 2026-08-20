export const CURRENT_TERMS_VERSION = '2026-08-03';
export const CURRENT_PRIVACY_VERSION = '2026-08-03';

export type LegalAcceptanceRow = {
  terms_version: string;
  privacy_version: string;
};

export function hasCurrentLegalAcceptance(row: LegalAcceptanceRow | null): boolean {
  return (
    row?.terms_version === CURRENT_TERMS_VERSION &&
    row.privacy_version === CURRENT_PRIVACY_VERSION
  );
}

export function legalAcceptanceState(
  row: LegalAcceptanceRow | null,
  readFailed: boolean,
): 'yes' | 'no' {
  return !readFailed && hasCurrentLegalAcceptance(row) ? 'yes' : 'no';
}

export async function fetchLegalAcceptance(userId: string): Promise<LegalAcceptanceRow | null> {
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase
    .from('legal_acceptances')
    .select('terms_version, privacy_version')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function acceptCurrentLegalDocuments(userId: string): Promise<void> {
  const { supabase } = await import('./supabase');
  const { error } = await supabase.from('legal_acceptances').upsert(
    {
      user_id: userId,
      terms_version: CURRENT_TERMS_VERSION,
      privacy_version: CURRENT_PRIVACY_VERSION,
    },
    { onConflict: 'user_id' },
  );

  if (error) throw error;
}
