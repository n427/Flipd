#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(import.meta.dirname, '..');
const SEED_SQL = resolve(ROOT, 'supabase/seeds/campus_reseed.sql');
const IMAGE_DIR = resolve(ROOT, 'supabase/seeds/campus-images');
const SELLER_ID_PREFIX = 'a1000000-0000-4000-8000-';
const RATING_ID_PREFIX = 'a4000000-0000-4000-8000-';

const avatarFiles = [
  'maya.okonkwo.jpg', 'diego.herrera.jpg', 'priya.raman.jpg', 'jules.kim.jpg',
  'tasha.bright.jpg', 'omar.haddad.jpg', 'lena.vasquez.jpg', 'sam.whitfield.jpg',
];
const listingFiles = [
  'riso-prints.jpg', 'ink-portrait.jpg', 'standing-desk.jpg', 'bike-tuneup.jpg',
  'levis-501.jpg', 'doc-martens.jpg', 'canon-50mm.jpg', 'grad-photos.jpg',
  'comm-textbooks.jpg', 'resume-edit.jpg', 'icon-sublet.jpg', 'moveout-couch.jpg',
  'guitar-lessons.jpg', 'yamaha-p45.jpg', 'mcat-tutoring.jpg', 'single-speed-bike.jpg',
];

async function loadEnvFile(path) {
  const source = await readFile(path, 'utf8');
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function extractValues(sql, table) {
  const start = sql.indexOf(`insert into public.${table}`);
  if (start < 0) throw new Error(`Could not find ${table} insert in ${SEED_SQL}`);
  const valuesStart = sql.indexOf('from (values', start);
  const valuesEnd = sql.indexOf(') as v(', valuesStart);
  if (valuesStart < 0 || valuesEnd < 0) throw new Error(`Could not parse ${table} values`);
  return parseSqlTuples(sql.slice(valuesStart + 'from (values'.length, valuesEnd));
}

function parseSqlTuples(source) {
  const tuples = [];
  let tuple = null;
  let token = '';
  let quoted = false;
  let depth = 0;
  const push = () => {
    const raw = token.trim();
    if (/^null$/i.test(raw)) tuple.push(null);
    else if (/^(true|false)$/i.test(raw)) tuple.push(raw === 'true');
    else if (/^-?\d+(\.\d+)?$/.test(raw)) tuple.push(Number(raw));
    else if (/^interval\s+/i.test(raw)) tuple.push(raw.replace(/^interval\s+/i, ''));
    else if (/^\{.*\}$/.test(raw)) tuple.push(raw.slice(1, -1).split(',').filter(Boolean));
    else tuple.push(raw);
    token = '';
  };
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const next = source[i + 1];
    if (quoted) {
      if (c === "'" && next === "'") { token += "'"; i += 1; }
      else if (c === "'") quoted = false;
      else token += c;
      continue;
    }
    if (c === '-' && next === '-') {
      i = source.indexOf('\n', i);
      if (i < 0) break;
    } else if (c === "'") quoted = true;
    else if (c === '(') {
      depth += 1;
      if (depth === 1) tuple = [];
      else token += c;
    } else if (c === ')') {
      if (depth === 1) { push(); tuples.push(tuple); tuple = null; }
      else token += c;
      depth -= 1;
    } else if (c === ',' && depth === 1) push();
    else if (depth > 0) token += c;
  }
  return tuples;
}

function ago(interval) {
  const [amount, unit] = interval.split(/\s+/);
  const date = new Date();
  const n = Number(amount);
  if (unit.startsWith('month')) date.setUTCMonth(date.getUTCMonth() - n);
  else if (unit.startsWith('day')) date.setUTCDate(date.getUTCDate() - n);
  else throw new Error(`Unsupported interval: ${interval}`);
  return date.toISOString();
}

function plusHours(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

function assertNoError(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function uploadImages(supabase) {
  const jobs = [
    ...avatarFiles.map((file) => ({ bucket: 'avatars', file })),
    ...listingFiles.map((file) => ({ bucket: 'listing-photos', file })),
  ];
  const buffers = await Promise.all(jobs.map(async (job) => {
    const path = resolve(IMAGE_DIR, job.file);
    const body = await readFile(path);
    if (body.length === 0 || body.length > 1_000_000) {
      throw new Error(`${basename(path)} must be non-empty and under 1 MB (got ${body.length} bytes)`);
    }
    return { ...job, body };
  }));
  for (const job of buffers) {
    const result = await supabase.storage.from(job.bucket).upload(`seed/${job.file}`, job.body, {
      contentType: 'image/jpeg', cacheControl: '3600', upsert: true,
    });
    assertNoError(result, `Upload ${job.bucket}/seed/${job.file}`);
  }
  console.log(`Uploaded and validated ${buffers.length} images.`);
}

async function preserveListingReports(supabase) {
  const reports = assertNoError(
    await supabase.from('reports').select('id,target_listing_id,target_user_id').not('target_listing_id', 'is', null),
    'Read listing reports',
  );
  const listingOnly = reports.filter((report) => !report.target_user_id);
  if (listingOnly.length === 0) return;
  const ids = [...new Set(listingOnly.map((report) => report.target_listing_id))];
  const listings = assertNoError(
    await supabase.from('listings').select('id,seller_id').in('id', ids),
    'Read sellers for listing reports',
  );
  const sellerByListing = new Map(listings.map((listing) => [listing.id, listing.seller_id]));
  for (const report of listingOnly) {
    const target_user_id = sellerByListing.get(report.target_listing_id);
    if (!target_user_id) throw new Error(`Cannot preserve report ${report.id}: listing seller not found`);
    assertNoError(
      await supabase.from('reports').update({ target_user_id }).eq('id', report.id),
      `Preserve report ${report.id}`,
    );
  }
  console.log(`Preserved ${listingOnly.length} listing-only reports by retaining their seller target.`);
}

async function main() {
  await loadEnvFile(resolve(ROOT, '.env.local'));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const sql = await readFile(SEED_SQL, 'utf8');

  const profileRows = extractValues(sql, 'profiles');
  const listingRows = extractValues(sql, 'listings');
  const requestRows = extractValues(sql, 'reveal_requests');
  const ratingRows = extractValues(sql, 'ratings');
  if (profileRows.length !== 8 || listingRows.length !== 16 || requestRows.length !== 19 || ratingRows.length !== 19) {
    throw new Error(`Unexpected seed counts: ${profileRows.length} profiles, ${listingRows.length} listings, ${requestRows.length} requests, ${ratingRows.length} ratings`);
  }

  if (process.argv.includes('--validate-only')) {
    const files = [...avatarFiles, ...listingFiles];
    const sizes = await Promise.all(files.map(async (file) => (await readFile(resolve(IMAGE_DIR, file))).length));
    if (sizes.some((size) => size === 0 || size > 1_000_000)) throw new Error('Every image must be non-empty and under 1 MB');
    console.log(`Validated seed parser and ${files.length} local images; no remote changes made.`);
    return;
  }

  // The safety gate: every local image is read and every upload succeeds before any row is deleted.
  await uploadImages(supabase);

  const requestedHandles = profileRows.map((row) => row[2]);
  const existing = assertNoError(await supabase.from('profiles').select('id,handle').in('handle', requestedHandles), 'Check handle collisions');
  const occupied = new Map(existing.map((row) => [row.handle, row.id]));
  const used = new Set(existing.map((row) => row.handle));
  const resolvedHandle = new Map();
  for (const [id, , handle] of profileRows) {
    let candidate = handle;
    if (occupied.has(handle) && occupied.get(handle) !== id) {
      let suffix = 1;
      candidate = `${handle}.seed`;
      while (used.has(candidate)) candidate = `${handle}.seed${suffix++}`;
      console.warn(`Handle @${handle} belongs to an existing account; using @${candidate} for the seeded seller.`);
    }
    used.add(candidate);
    resolvedHandle.set(id, candidate);
  }

  const avatarsBase = `${url}/storage/v1/object/public/avatars/seed/`;
  const photosBase = `${url}/storage/v1/object/public/listing-photos/seed/`;
  const profiles = profileRows.map(([id, display_name, originalHandle, school_unit, class_year, bio, contact_method, contact_instagram, contact_email, age]) => ({
    id, display_name, handle: resolvedHandle.get(id), school_unit, class_year, bio,
    avatar_url: `${avatarsBase}${originalHandle}.jpg`, contact_method, contact_instagram,
    contact_email, is_demo: false, created_at: ago(age),
  }));
  const listings = listingRows.map(([id, seller_id, category, title, description, price, negotiable, location, contact, photo, age]) => ({
    id, seller_id, category, title, description, price, negotiable, location, contact,
    photo_urls: [`${photosBase}${photo}.jpg`], photo_focus: ['50% 50%'], photo_zoom: [1],
    archived: false, created_at: ago(age),
  }));
  const listingById = new Map(listings.map((row) => [row.id, row]));
  const requests = requestRows.map(([id, listing_id, buyer_id, offer, intro_message, age]) => {
    const listing = listingById.get(listing_id);
    const created_at = ago(age);
    return { id, listing_id, listing_title: listing.title, buyer_id, seller_id: listing.seller_id,
      status: 'completed', offer, intro_message, created_at, expires_at: plusHours(created_at, 72), resolved_at: plusHours(created_at, 6) };
  });
  const requestById = new Map(requests.map((row) => [row.id, row]));
  const ratings = ratingRows.map(([id, request_id, score, text]) => {
    const request = requestById.get(request_id);
    return { id, request_id, rater_id: request.buyer_id, ratee_id: request.seller_id,
      score, text, created_at: plusHours(request.resolved_at, 24) };
  });

  await preserveListingReports(supabase);
  assertNoError(await supabase.from('saves').delete().not('listing_id', 'is', null), 'Delete saves');
  assertNoError(await supabase.from('popup_reminders').delete().not('listing_id', 'is', null), 'Delete popup reminders');
  assertNoError(await supabase.from('listings').delete().not('id', 'is', null), 'Delete listings');
  assertNoError(await supabase.from('profiles').upsert(profiles, { onConflict: 'id' }), 'Upsert profiles');
  assertNoError(await supabase.from('listings').upsert(listings, { onConflict: 'id' }), 'Upsert listings');
  assertNoError(await supabase.from('reveal_requests').upsert(requests, { onConflict: 'id' }), 'Upsert completed requests');
  assertNoError(await supabase.from('ratings').upsert(ratings, { onConflict: 'id' }), 'Upsert ratings');

  const listingResult = await supabase.from('listings').select('*', { count: 'exact', head: true });
  if (listingResult.error) throw new Error(`Count listings: ${listingResult.error.message}`);
  const sellerIds = profiles.map((profile) => profile.id);
  const ratingIds = ratings.map((rating) => rating.id);
  const sellers = assertNoError(await supabase.from('profiles').select('id,display_name,handle').in('id', sellerIds), 'Read seeded sellers');
  const seededRatings = assertNoError(await supabase.from('ratings').select('ratee_id,score').in('id', ratingIds), 'Read seeded ratings');
  const eventResult = await supabase.from('listings').select('*', { count: 'exact', head: true }).eq('category', 'event');
  if (eventResult.error) throw new Error(`Count events: ${eventResult.error.message}`);
  const summary = sellers.map((seller) => {
    const scores = seededRatings.filter((rating) => rating.ratee_id === seller.id).map((rating) => rating.score);
    return { seller: seller.display_name, handle: seller.handle, reviews: scores.length,
      stars: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : null };
  });
  console.log(`Listings: ${listingResult.count}`);
  console.log(`Sellers: ${sellers.length}`);
  console.table(summary);
  console.log(`Event listings: ${eventResult.count}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
