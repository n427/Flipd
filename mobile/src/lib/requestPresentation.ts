export function conversationThumbnail(
  listingPhoto: string | null | undefined,
  counterpartAvatar: string | null | undefined,
): string | null {
  return listingPhoto || counterpartAvatar || null;
}
