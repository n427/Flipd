import { NextRequest, NextResponse } from 'next/server';
import { admin as supabase } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { parseCoords, parseEventWindow } from '@/lib/validation';

const SELLER_JOIN = '*, seller:profiles!listings_seller_id_fkey(id, display_name, handle, school_unit, class_year, is_demo, avatar_url)';

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
  if (includeArchived) {
    query = query.or(`archived.eq.false,seller_id.eq.${user.id}`);
  } else {
    query = query.eq('archived', false);
  }
  if (category && category !== 'all') query = query.eq('category', category);
  if (q) query = query.ilike('title', `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Blocked sellers disappear from the blocker's feed (one direction only).
  const { data: myBlocks } = await supabase
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', user.id);
  const blockedIds = new Set((myBlocks ?? []).map((b) => b.blocked_id));

  // Buyer-facing "spoken for": listings with an active (pending/approved) request.
  const { data: activeReqs } = await supabase
    .from('reveal_requests')
    .select('listing_id')
    .in('status', ['pending', 'approved']);
  const spoken = new Set((activeReqs ?? []).map((r) => r.listing_id));
  const listings = (data ?? [])
    .filter((row) => !blockedIds.has(row.seller_id))
    .map((row) => ({ ...row, spoken_for: spoken.has(row.id) }));
  return NextResponse.json({ listings });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const categoriesRaw = JSON.parse((formData.get('categories') as string) || '[]') as string[];
  const categories = categoriesRaw.length ? categoriesRaw : [formData.get('category') as string].filter(Boolean);
  const category = categories[0] || 'goods';
  const title = formData.get('title') as string;
  const description = formData.get('description') as string | null;
  const price = parseInt((formData.get('price') as string) || '0', 10);
  const negotiable = formData.get('negotiable') === 'true';
  const location = formData.get('location') as string | null;
  const coords = parseCoords(formData.get('lat'), formData.get('lng'));
  const placeName = ((formData.get('place_name') as string | null) || '').trim() || null;
  const isPopup = categories.includes('event');
  const eventStart = (formData.get('event_start') as string | null) || null;
  const eventEnd = (formData.get('event_end') as string | null) || null;
  if (isPopup && !parseEventWindow(
    eventStart ? eventStart.slice(0, 10) : '',
    eventStart ? new Date(eventStart).toTimeString().slice(0, 5) : '',
    eventEnd ? new Date(eventEnd).toTimeString().slice(0, 5) : '',
  )) {
    return NextResponse.json({ error: 'event date/time required' }, { status: 400 });
  }
  // Contact selection is per-listing (chips), intersected with the methods the
  // profile actually has a value for. Falls back to all-filled if none sent.
  const { data: sellerProfile } = await supabase
    .from('profiles')
    .select('contact_instagram, contact_phone, contact_email')
    .eq('id', user.id)
    .single();
  const filled = (['instagram', 'phone', 'email'] as const).filter((k) => {
    const col = k === 'instagram' ? 'contact_instagram' : k === 'phone' ? 'contact_phone' : 'contact_email';
    return sellerProfile?.[col as keyof typeof sellerProfile];
  });
  const submitted = JSON.parse((formData.get('contact_methods') as string) || '[]') as string[];
  const chosen = submitted.filter((m) => filled.includes(m as typeof filled[number]));
  const contact = chosen.length ? chosen : filled;
  const photoFocusRaw = formData.getAll('photo_focus') as string[];
  const photoZoomRaw = formData.getAll('photo_zoom') as string[];
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
  const zoomArr = photoFiles.map((_, i) => photoZoomRaw[i] || '1');

  const { data, error } = await supabase
    .from('listings')
    .insert({
      id: listingId,
      seller_id: user.id,
      category,
      categories,
      title,
      description: description || null,
      price: isPopup ? 0 : (isNaN(price) ? 0 : price),
      negotiable,
      location: location || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      place_name: placeName,
      contact,
      photo_urls: photoUrls,
      photo_focus: focusArr,
      photo_zoom: zoomArr,
      event_start: isPopup ? eventStart : null,
      event_end: isPopup ? eventEnd : null,
    })
    .select(SELLER_JOIN)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listing: data }, { status: 201 });
}
