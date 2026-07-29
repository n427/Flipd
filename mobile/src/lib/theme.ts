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
