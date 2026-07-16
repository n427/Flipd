import { NextRequest, NextResponse } from 'next/server';
import { admin as supabase } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';

const SELLER_JOIN = '*, seller:profiles!listings_seller_id_fkey(id, display_name, handle, school_unit, class_year, is_demo)';

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const q = searchParams.get('q');
  const mine = searchParams.get('mine') === '1';
  const includeArchived = searchParams.get('include_archived') === '1';

  let query = supabase
    .from('listings')
    .select(SELLER_JOIN)
    .order('created_at', { ascending: false });

  if (mine) query = query.eq('seller_id', user.id);
  if (!includeArchived) query = query.eq('archived', false);
  if (category && category !== 'all') query = query.eq('category', category);
  if (q) query = query.ilike('title', `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listings: data });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const category = formData.get('category') as string;
  const title = formData.get('title') as string;
  const description = formData.get('description') as string | null;
  const price = parseInt((formData.get('price') as string) || '0', 10);
  const negotiable = formData.get('negotiable') === 'true';
  const location = formData.get('location') as string | null;
  const contact = JSON.parse((formData.get('contact') as string) || '[]') as string[];
  const photoFocusRaw = formData.getAll('photo_focus') as string[];
  const photoFiles = formData.getAll('photos') as File[];

  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  if (photoFiles.length === 0) {
    return NextResponse.json({ error: 'at least one photo required' }, { status: 400 });
  }

  const listingId = crypto.randomUUID();
  const photoUrls: string[] = [];
  for (let i = 0; i < photoFiles.length; i++) {
    const file = photoFiles[i];
    const buffer = Buffer.from(await file.arrayBuffer());
    const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
    const path = `${listingId}/photo-${i}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('listing-photos')
      .upload(path, buffer, { contentType: file.type, upsert: true });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
    const { data: urlData } = supabase.storage.from('listing-photos').getPublicUrl(path);
    photoUrls.push(urlData.publicUrl);
  }

  const focusArr = photoFiles.map((_, i) => photoFocusRaw[i] || '50% 50%');

  const { data, error } = await supabase
    .from('listings')
    .insert({
      id: listingId,
      seller_id: user.id,
      category,
      title,
      description: description || null,
      price: isNaN(price) ? 0 : price,
      negotiable,
      location: location || null,
      contact,
      photo_urls: photoUrls,
      photo_focus: focusArr,
    })
    .select(SELLER_JOIN)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listing: data }, { status: 201 });
}
