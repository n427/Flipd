import { describe, expect, it } from 'vitest';
import { shouldHideSplash } from './splashReady';

describe('shouldHideSplash', () => {
  it('keeps the native splash visible until fonts and session routing are ready', () => {
    expect(shouldHideSplash({ fontsLoaded: false, sessionLoading: false, onboarded: 'yes', signedIn: true })).toBe(false);
    expect(shouldHideSplash({ fontsLoaded: true, sessionLoading: true, onboarded: 'yes', signedIn: true })).toBe(false);
    expect(shouldHideSplash({ fontsLoaded: true, sessionLoading: false, onboarded: 'unknown', signedIn: true })).toBe(false);
  });

  it('hides once a signed-out or fully resolved signed-in route is ready', () => {
    expect(shouldHideSplash({ fontsLoaded: true, sessionLoading: false, onboarded: 'unknown', signedIn: false })).toBe(true);
    expect(shouldHideSplash({ fontsLoaded: true, sessionLoading: false, onboarded: 'yes', signedIn: true })).toBe(true);
  });
});
