import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';

// Upload a profile photo to the avatars bucket and store its URL.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('photo') as File | null;
  if (!file || !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'photo (image) required' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from('avatars')
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: urlData } = admin.storage.from('avatars').getPublicUrl(path);
  const { data, error } = await admin
    .from('profiles')
    .update({ avatar_url: urlData.publicUrl })
    .eq('id', user.id)
    .select('avatar_url')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ avatar_url: data.avatar_url });
}
