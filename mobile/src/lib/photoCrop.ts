// How a listing photo should be framed, from the crop the seller chose.
//
// A crop is stored as metadata rather than baked into the file: photo_focus is
// an object-position string like "20% 80%" and photo_zoom a scale factor, one
// entry per photo. The web app has always honoured both; mobile rendered every
// photo centre-cropped, so a seller could frame a photo carefully and see the
// original framing on a phone.
//
// Pure, so it is testable under the repo-root vitest, and deliberately mirrors
// the clamping in photoCropStyle on the web — the two must agree or the same
// listing looks different on each platform.

export type PhotoCrop = {
  /** expo-image contentPosition. */
  contentPosition: { left: string; top: string };
  /** 1 = no zoom. Applied as a transform on the image. */
  scale: number;
};

const CENTRE: PhotoCrop = { contentPosition: { left: '50%', top: '50%' }, scale: 1 };
const MAX_ZOOM = 3; // matches the web clamp

export function photoCrop(focus?: string | null, zoom?: string | null): PhotoCrop {
  const z = Number(zoom);
  // Below 1 would shrink the photo inside its frame and expose the background;
  // the web clamps the same way.
  const scale = Number.isFinite(z) && z > 1 ? Math.min(z, MAX_ZOOM) : 1;

  const parts = (focus ?? '').trim().split(/\s+/);
  const valid = parts.length === 2 && parts.every((p) => /^-?\d+(\.\d+)?%$/.test(p));
  if (!valid) return { ...CENTRE, scale };

  return { contentPosition: { left: parts[0], top: parts[1] }, scale };
}
