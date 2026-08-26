import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../supabase/migrations/047_reposting.sql', import.meta.url), 'utf8');

describe('reposting migration contract', () => {
  it('stores original creation time while indexing the effective feed time', () => {
    expect(sql).toContain('reposted_at timestamptz');
    expect(sql).toContain('feed_at timestamptz generated always as (coalesce(reposted_at, created_at)) stored');
    expect(sql).toContain('listings_repost_feed_idx');
    expect(sql).toContain('wanted_posts_repost_feed_idx');
  });

  it('serializes owner-only reposts with a seven-day cooldown', () => {
    expect(sql).toContain('create or replace function public.repost_listing');
    expect(sql).toContain('create or replace function public.repost_wanted_post');
    expect(sql).toMatch(/target\.seller_id = p_user_id[\s\S]*interval '7 days'/);
    expect(sql).toMatch(/target\.buyer_id = p_user_id[\s\S]*interval '7 days'/);
    expect(sql).toContain("raise exception using errcode = 'P0001', message = 'repost cooldown active'");
    expect(sql).toContain('grant execute on function public.repost_listing(uuid, uuid) to service_role');
    expect(sql).toContain('grant execute on function public.repost_wanted_post(uuid, uuid) to service_role');
  });

  it('blocks authenticated clients from writing repost timestamps directly', () => {
    expect(sql).toContain('create or replace function public.guard_reposted_at()');
    expect(sql).toContain("current_user not in ('postgres', 'service_role')");
    expect(sql).toContain('create trigger listings_guard_reposted_at');
    expect(sql).toContain('create trigger wanted_posts_guard_reposted_at');
  });
});
