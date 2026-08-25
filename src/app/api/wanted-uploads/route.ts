import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';
import { canonicalizeWantedOfferId } from '@/lib/wanted-offers';
import { validateWantedCleanupPaths } from '@/lib/wanted-upload-cleanup';
import { rollbackRemovalCandidates } from '@/lib/wanted-upload-rollback';

const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_BYTES = 10 * 1024 * 1024;

async function rollbackUploads(bucket: string, userId: string, uploaded: string[]) {
  if (!uploaded.length) return;
  // Every path reaches `uploaded` immediately before register_wanted_upload is
  // attempted. A missing lookup after an ambiguous RPC failure is not proof
  // that transaction cannot still commit, so only a confirmed claim permits
  // removal. Claims are attempted individually so one ambiguous path cannot
  // prevent rollback of another path whose tombstone commits successfully.
  const registrationAttempted = new Set(uploaded);
  const confirmedClaimed = new Set<string>();
  for (const path of uploaded) {
    const claim = await admin.rpc('claim_wanted_upload_cleanup', {
      upload_paths: [path], target_bucket: bucket, actor_id: userId,
    });
    if (!claim.error && Array.isArray(claim.data)) claim.data.forEach((path) => confirmedClaimed.add(String(path)));
  }
  const removable = rollbackRemovalCandidates({ uploaded, registrationAttempted, confirmedClaimed });
  if (removable.length) await admin.storage.from(bucket).remove(removable);
}

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
      await rollbackUploads(bucket, user.id, uploaded);
      return NextResponse.json({ error: 'unable to upload photos' }, { status: 500 });
    }
    uploaded.push(path);
    const publicUrl = mode === 'reference' ? admin.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;
    const { error: registerError } = await admin.rpc('register_wanted_upload', {
      upload_path: path, upload_bucket: bucket, actor_id: user.id, upload_public_url: publicUrl,
    });
    if (registerError) {
      await rollbackUploads(bucket, user.id, uploaded);
      return NextResponse.json({ error: 'unable to register photos' }, { status: 500 });
    }
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
  if ((mode !== 'reference' && mode !== 'offer') || paths.length < 1 || paths.length > 6) {
    return NextResponse.json({ error: 'invalid cleanup request' }, { status: 400 });
  }
  const removable = validateWantedCleanupPaths(paths, user.id, new Set(), null);
  if (!removable) return NextResponse.json({ error: 'invalid cleanup ownership' }, { status: 400 });
  const bucket = mode === 'offer' ? 'wanted-offer-photos' : 'wanted-reference-photos';
  const { data: claimed, error: claimError } = await admin.rpc('claim_wanted_upload_cleanup', {
    upload_paths: removable, target_bucket: bucket, actor_id: user.id,
  });
  if (claimError || !claimed) return NextResponse.json({ error: 'photos are attached or unavailable' }, { status: 409 });
  // The committed cleanup_claimed tombstone is deliberately retained whether
  // Storage succeeds or fails. A retry may remove the object; no later attach
  // can resurrect or reference it after successful deletion.
  const { error } = await admin.storage.from(bucket).remove(claimed as string[]);
  return error ? NextResponse.json({ error: 'unable to remove photos' }, { status: 500 }) : NextResponse.json({ ok: true });
}
