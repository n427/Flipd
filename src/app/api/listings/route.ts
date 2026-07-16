import { NextRequest, NextResponse } from 'next/server';
import { admin as supabase } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const q = searchParams.get('q');

  let query = supabase
    .from('listings')
    .select('*')
    .eq('archived', false)
    .order('created_at', { ascending: false });

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }
  if (q) {
    query = query.ilike('title', `%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listings: data });
}

export async function POST(req: NextRequest) {
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

  if (!title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  if (photoFiles.length === 0) {
    return NextResponse.json({ error: 'at least one photo required' }, { status: 400 });
  }

  // Generate listing id upfront so we can use it as the storage path prefix
  const listingId = crypto.randomUUID();

  // Upload photos
  const photoUrls: string[] = [];
  for (let i = 0; i < photoFiles.length; i++) {
    const file = photoFiles[i];
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    // Supabase Storage keys reject spaces and many punctuation chars (e.g.
    // "Screenshot 2026-05-30 at 7.17.33 PM.png" → "Invalid key"). Build a safe
    // key ourselves from an index + sanitized extension instead of the raw
    // user filename.
    const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
    const path = `${listingId}/photo-${i}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('listing-photos')
      .upload(path, buffer, { contentType: file.type, upsert: true });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
    const { data: urlData } = supabase.storage.from('listing-photos').getPublicUrl(path);
    photoUrls.push(urlData.publicUrl);
  }

  const focusArr = photoFiles.map((_, i) => photoFocusRaw[i] || '50% 50%');

  const { data, error } = await supabase
    .from('listings')
    .insert({
      id: listingId,
      seller_id: 'user_alex_park',
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
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listing: data }, { status: 201 });
}
