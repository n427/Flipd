import { NextRequest } from 'next/server';
import { getSessionUser } from './server';
import { admin } from './admin';

// Authenticate a request from EITHER the web (cookie session) OR a native
// client (Authorization: Bearer <supabase access token>). Returns the user
// id + email, or null. Lets one API route serve both the web app and the
// mobile app without duplicating logic.
export async function getRequestUser(
  req: NextRequest,
): Promise<{ id: string; email: string } | null> {
  // 1. Cookie session (web).
  const cookieUser = await getSessionUser();
  if (cookieUser) return cookieUser;

  // 2. Bearer token (mobile).
  const authz = req.headers.get('authorization') || '';
  const token = authz.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : '';
  if (!token) return null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? '' };
  } catch {
    return null;
  }
}
