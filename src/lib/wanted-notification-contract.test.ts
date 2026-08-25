import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/044_wanted_notifications.sql', import.meta.url),
  'utf8',
);

describe('Wanted notification transactional contract', () => {
  it('persists offer lifecycle events from the same transaction as every offer mutation', () => {
    expect(migration).toMatch(/create trigger wanted_offer_notification_events[\s\S]*after insert or update of status/i);
    expect(migration).toContain("'wanted:new-offer:' || new.id::text");
    expect(migration).toContain("'wanted:accepted:' || new.id::text");
    expect(migration).toContain("'wanted:declined:' || new.id::text");
    expect(migration).toContain("'wanted:expired:' || new.wanted_post_id::text");
  });

  it('treats only budget, description, meetup area, and needed-by as material edits', () => {
    expect(migration).toMatch(/old\.max_budget is distinct from new\.max_budget/i);
    expect(migration).toMatch(/old\.description is distinct from new\.description/i);
    expect(migration).toMatch(/old\.location is distinct from new\.location/i);
    expect(migration).toMatch(/old\.needed_by is distinct from new\.needed_by/i);

    const materialGuard = migration.match(/-- MATERIAL_EDIT_GUARD_START([\s\S]*?)-- MATERIAL_EDIT_GUARD_END/)?.[1] ?? '';
    expect(materialGuard).not.toMatch(/title|category|photo_urls/i);
  });

  it('uses deterministic per-offer keys for all sellers closed by acceptance or deletion', () => {
    expect(migration).toMatch(/old\.status = 'pending'[\s\S]*new\.status = 'declined'/i);
    expect(migration).toContain("'wanted:declined:' || new.id::text");
    expect(migration).toMatch(/on conflict \(event_key, user_id\) do nothing/i);
  });
});
