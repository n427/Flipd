import { NextRequest, NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/server';
import { admin } from '@/lib/supabase/admin';

// Magic-link landing: exchange the code for a session cookie, then route to
// onboarding until the profile has a display name.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const origin = req.nextUrl.origin;
  if (!code) return NextResponse.redirect(`${origin}/?auth=error`);

  const supabase = createSessionClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/?auth=error`);

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, contact_method')
    .eq('id', data.user.id)
    .single();

  return NextResponse.redirect(
    profile?.display_name && profile?.contact_method ? `${origin}/feed` : `${origin}/onboarding`,
  );
}
