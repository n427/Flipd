import { NextRequest, NextResponse } from 'next/server';
import { admin as supabase } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';

const SELLER_JOIN = '*, seller:profiles!listings_seller_id_fkey(id, display_name, handle, school_unit, class_year, is_demo)';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('listings')
    .select(SELLER_JOIN)
    .eq('id', params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (data.archived && data.seller_id !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ listing: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: existing } = await supabase
    .from('listings')
    .select('seller_id')
    .eq('id', params.id)
    .single();
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (existing.seller_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const contentType = req.headers.get('content-type') || '';

  // JSON body: archive/restore (unchanged behavior).
  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({}));
    if (typeof body.archived !== 'boolean') {
      return NextResponse.json({ error: 'archived (boolean) required' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('listings')
      .update({ archived: body.archived })
      .eq('id', params.id)
      .select(SELLER_JOIN)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'not found' }, { status: 404 });
    }
    return NextResponse.json({ listing: data });
  }

  // Multipart body: full edit, same fields as POST. photo_manifest preserves
  // order — existing photos as URLs, '__new__' markers consumed from files.
  const formData = await req.formData();
  const category = formData.get('category') as string;
  const title = formData.get('title') as string;
  const description = formData.get('description') as string | null;
  const price = parseInt((formData.get('price') as string) || '0', 10);
  const negotiable = formData.get('negotiable') === 'true';
  const location = formData.get('location') as string | null;
  const manifest = JSON.parse((formData.get('photo_manifest') as string) || '[]') as string[];
  const photoFocusRaw = formData.getAll('photo_focus') as string[];
  const newFiles = formData.getAll('photos') as File[];

  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  if (manifest.length === 0) {
    return NextResponse.json({ error: 'at least one photo required' }, { status: 400 });
  }

  const photoUrls: string[] = [];
  let fileIdx = 0;
  for (let i = 0; i < manifest.length; i++) {
    if (manifest[i] !== '__new__') {
      photoUrls.push(manifest[i]);
      continue;
    }
    const file = newFiles[fileIdx++];
    if (!file) return NextResponse.json({ error: 'photo manifest mismatch' }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
    const path = `${params.id}/photo-${Date.now()}-${i}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('listing-photos')
      .upload(path, buffer, { contentType: file.type, upsert: true });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
    const { data: urlData } = supabase.storage.from('listing-photos').getPublicUrl(path);
    photoUrls.push(urlData.publicUrl);
  }
  const focusArr = manifest.map((_, i) => photoFocusRaw[i] || '50% 50%');

  const { data, error } = await supabase
    .from('listings')
    .update({
      category,
      title,
      description: description || null,
      price: isNaN(price) ? 0 : price,
      negotiable,
      location: location || null,
      photo_urls: photoUrls,
      photo_focus: focusArr,
    })
    .eq('id', params.id)
    .select(SELLER_JOIN)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'not found' }, { status: 404 });
  }
  return NextResponse.json({ listing: data });
}
