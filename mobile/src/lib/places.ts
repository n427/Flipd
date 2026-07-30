// Google Places lookup for the location picker. Uses the web-service
// endpoints (not the JS SDK), which work fine from a native fetch. Biased to
// the USC area so nearby spots surface first.
//
// NOTE: the Places web API rejects HTTP-referrer-restricted keys, so this uses
// a DEDICATED key (EXPO_PUBLIC_GOOGLE_PLACES_KEY) that has Places API enabled
// with no referrer restriction. If it's unset, place search is disabled (the
// campus chips + static map still work off the maps key).
const KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
const USC = { lat: 34.0224, lng: -118.2851 };

export type PlaceHit = { placeId: string; label: string };

// Autocomplete a query → a few place suggestions.
export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  if (!KEY || query.trim().length < 3) return [];
  const url =
    `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
    `?input=${encodeURIComponent(query)}` +
    `&location=${USC.lat},${USC.lng}&radius=8000` +
    `&key=${KEY}`;
  try {
    const res = await fetch(url);
    const body = await res.json();
    if (body.status !== 'OK' && body.status !== 'ZERO_RESULTS') return [];
    return (body.predictions ?? []).slice(0, 5).map((p: { place_id: string; description: string }) => ({
      placeId: p.place_id,
      label: p.description,
    }));
  } catch {
    return [];
  }
}

// Resolve a picked place → its name + coordinates.
export async function placeDetails(placeId: string): Promise<{ name: string; lat: number; lng: number } | null> {
  if (!KEY) return null;
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=name,geometry` +
    `&key=${KEY}`;
  try {
    const res = await fetch(url);
    const body = await res.json();
    if (body.status !== 'OK' || !body.result?.geometry?.location) return null;
    const loc = body.result.geometry.location;
    return { name: body.result.name as string, lat: loc.lat as number, lng: loc.lng as number };
  } catch {
    return null;
  }
}
