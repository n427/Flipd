export const landingTiles = [
  { price: '$12', title: 'Sourdough loaves', img: '/landing/market-bread.svg' },
  { price: '$35', title: 'Press-on nails', img: '/landing/market-nails.svg' },
  { price: '$90', title: 'IKEA Markus chair', img: '/landing/market-chair.svg' },
  { price: '$7', title: 'Matcha drinks', img: '/landing/market-matcha.svg' },
] as const;

// Release-critical content must be visible in server HTML. Motion is decorative
// and must never be able to hide sections when hydration or observers fail.
export function revealStyle(delay = 0) {
  return {
    opacity: 1,
    transform: 'translateY(0)',
    transition: `opacity 300ms ease ${delay}ms, transform 300ms ease ${delay}ms`,
  } as const;
}
