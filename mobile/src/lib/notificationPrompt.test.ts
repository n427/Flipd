import { describe, expect, it } from 'vitest';
import { shouldExplainNotifications } from './notificationPrompt';

describe('shouldExplainNotifications', () => {
  it.each([
    [{ physicalDevice: true, platform: 'ios', permission: 'undetermined', dismissed: false }, true],
    [{ physicalDevice: true, platform: 'android', permission: 'undetermined', dismissed: false }, true],
    [{ physicalDevice: false, platform: 'ios', permission: 'undetermined', dismissed: false }, false],
    [{ physicalDevice: true, platform: 'web', permission: 'undetermined', dismissed: false }, false],
    [{ physicalDevice: true, platform: 'ios', permission: 'granted', dismissed: false }, false],
    [{ physicalDevice: true, platform: 'ios', permission: 'denied', dismissed: false }, false],
    [{ physicalDevice: true, platform: 'ios', permission: 'undetermined', dismissed: true }, false],
  ] as const)('returns %s for %o', (input, expected) => {
    expect(shouldExplainNotifications(input)).toBe(expected);
  });
});
