import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('mobile Wanted route contract', () => {
  it('registers the five approved tabs and hides Notifications', () => {
    const layout = source('../app/(tabs)/_layout.tsx');
    const names = [...layout.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((match) => match[1]);
    expect(names.slice(0, 5)).toEqual(['feed', 'wanted', 'post', 'requests', 'profile']);
    expect(layout).toMatch(/name="notifications" options=\{\{ href: null/);
  });

  it('keeps the chooser destinations backed by registered files', () => {
    const chooser = source('../app/(tabs)/post.tsx');
    expect(chooser).toContain("router.push('/sell/post')");
    expect(chooser).toContain("router.push('/wanted/post')");
    expect(source('../app/(tabs)/wanted.tsx')).toContain('HeaderNotificationButton');
    expect(source('../app/wanted/post.tsx')).toContain('WantedPostPlaceholder');
  });
});
