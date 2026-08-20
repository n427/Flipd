export function listingCardAccessibilityLabel(input: {
  title: string;
  price: string;
  seller: string;
}): string {
  return `${input.title}, ${input.price}, ${input.seller}. Open listing`;
}
