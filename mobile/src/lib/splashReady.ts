export function shouldHideSplash(input: {
  fontsLoaded: boolean;
  sessionLoading: boolean;
  onboarded: 'unknown' | 'yes' | 'no';
  signedIn: boolean;
}) {
  if (!input.fontsLoaded || input.sessionLoading) return false;
  return !input.signedIn || input.onboarded !== 'unknown';
}
