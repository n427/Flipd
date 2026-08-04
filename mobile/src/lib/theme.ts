// Flipd brand tokens — shared across screens so the app reads as one identity
// (and matches the flipdcampus.com web app). USC cardinal + gold on warm cream.
export const T = {
  cardinal: '#990000', // USC cardinal — primary actions, the wordmark dot
  gold: '#FFCC00', // USC gold — sparing accent
  bg: '#FFFFFF', // pure white background
  surface: '#FFFFFF', // cards / inputs
  fieldbg: '#F5F5F5', // subtle input fill on white
  ink: '#1A1613', // primary text
  muted: '#8A8178', // secondary text
  rule: '#EAE6DF', // hairline borders
  danger: '#B4231C', // errors
} as const;

// Screen spacing scale. Reference these instead of repeating literals, so a
// new screen inherits the rhythm rather than inventing its own.
//
// `screenTop` sits INSIDE a SafeAreaView edges={['top']} — it is breathing room
// below the notch inset, never a substitute for it. A hardcoded stand-in (the
// old paddingTop: 56 on Saved) is wrong on any device whose inset isn't 56.
export const S = {
  screenTop: 12, // gap under the safe-area inset before the first element
  screenBottom: 16, // gap after the last element, above the tab bar
  gutter: 16, // horizontal page padding
  gridGutter: 6, // grid screens — ListingCard carries its own margin
} as const;

// Figtree weights (loaded at the root). Use these font families rather than
// fontWeight so the custom face actually renders on device.
export const F = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
  extrabold: 'Figtree_800ExtraBold',
  black: 'Figtree_900Black',
} as const;
