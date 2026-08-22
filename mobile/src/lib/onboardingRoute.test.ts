import { describe, expect, it } from 'vitest';
import { routeAllowedDuringOnboarding } from './onboardingRoute';

describe('routeAllowedDuringOnboarding', () => {
  it('keeps Terms and Privacy reachable before legal acceptance', () => {
    expect(routeAllowedDuringOnboarding('/terms')).toBe(true);
    expect(routeAllowedDuringOnboarding('/privacy')).toBe(true);
  });

  it('does not let an unfinished profile enter the main app', () => {
    expect(routeAllowedDuringOnboarding('/(tabs)/feed')).toBe(false);
  });
});
