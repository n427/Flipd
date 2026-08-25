import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';
import { canonicalizeWantedOfferId } from '@/lib/wanted-offers';

const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const form = await req.formData();
  const files = form.getAll('photos').filter((value): value is File => value instanceof File);
  const mode = form.get('mode');
  const offerId = canonicalizeWantedOfferId(form.get('offer_id'));
  if ((mode !== 'reference' && mode !== 'offer') || files.length < 1 || files.length > 6 || (mode === 'offer' && !offerId)) {
    return NextResponse.json({ error: 'invalid upload request' }, { status: 400 });
  }
  if (files.some((file) => !TYPES.has(file.type) || file.size > MAX_BYTES)) {
    return NextResponse.json({ error: 'photos must be JPG, PNG, WebP, HEIC, or HEIF and at most 10 MB' }, { status: 400 });
  }

  const bucket = mode === 'offer' ? 'wanted-offer-photos' : 'wanted-reference-photos';
  const folder = mode === 'offer' ? `${user.id}/${offerId}` : `${user.id}/${crypto.randomUUID()}`;
  const uploaded: string[] = [];
  for (const [index, file] of files.entries()) {
    const extension = file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? 'jpg';
    const path = `${folder}/${index}-${crypto.randomUUID()}.${extension}`;
    const { error } = await admin.storage.from(bucket).upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type, upsert: false,
    });
    if (error) {
      if (uploaded.length) await admin.storage.from(bucket).remove(uploaded);
      return NextResponse.json({ error: 'unable to upload photos' }, { status: 500 });
    }
    uploaded.push(path);
  }
  if (mode === 'offer') return NextResponse.json({ paths: uploaded });
  return NextResponse.json({
    paths: uploaded,
    urls: uploaded.map((path) => admin.storage.from(bucket).getPublicUrl(path).data.publicUrl),
  });
}

export async function DELETE(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { mode?: unknown; paths?: unknown } | null;
  const mode = body?.mode;
  const paths = Array.isArray(body?.paths) ? body.paths.filter((path): path is string => typeof path === 'string') : [];
  if ((mode !== 'reference' && mode !== 'offer') || paths.length < 1 || paths.length > 6
    || paths.some((path) => !path.startsWith(`${user.id}/`))) {
    return NextResponse.json({ error: 'invalid cleanup request' }, { status: 400 });
  }
  const { error } = await admin.storage.from(mode === 'offer' ? 'wanted-offer-photos' : 'wanted-reference-photos').remove(paths);
  return error ? NextResponse.json({ error: 'unable to remove photos' }, { status: 500 }) : NextResponse.json({ ok: true });
}
