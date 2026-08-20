import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Anon-key client bound to the request's auth cookies. Used only to read the
// caller's identity and run the auth flows — data access goes through admin.
export async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — middleware handles session refresh.
          }
        },
      },
    },
  );
}

export async function getSessionUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? '' };
}
