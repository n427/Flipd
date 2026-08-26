import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = readFileSync(new URL('../app/api/wanted/[id]/offers/route.ts', import.meta.url), 'utf8');
const seed = readFileSync(new URL('../../supabase/seeds/screenshot_wanted.sql', import.meta.url), 'utf8');

describe('Task 11 route and screenshot contracts', () => {
  it('uses the centralized policy for private reads and submissions with uniform absence', () => {
    expect(route).toMatch(/wantedPermissions/);
    expect(route).toMatch(/\.viewOffer/);
    expect(route).toMatch(/\.submit/);
    expect(route).toMatch(/wantedOfferSubmitRpcErrorStatus/);
    expect(route).not.toMatch(/error: 'forbidden'/);
  });

  it('seeds exactly three active public posts, two received, two sent, and one accepted conversation', () => {
    expect(seed.match(/ACTIVE_PUBLIC_FIXTURE/g)).toHaveLength(3);
    expect(seed.match(/RECEIVED_FIXTURE/g)).toHaveLength(2);
    expect(seed.match(/SENT_FIXTURE/g)).toHaveLength(2);
    expect(seed.match(/ACCEPTED_CONVERSATION_FIXTURE/g)).toHaveLength(1);
  });
});
