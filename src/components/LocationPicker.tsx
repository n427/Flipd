'use client';
import React from 'react';
import { useGoogleMaps } from '@/lib/useGoogleMaps';
import { CAMPUS_SPOTS } from '@/lib/validation';

const USC = { lat: 34.0224, lng: -118.2851 };

type Value = { name: string; lat: number | null; lng: number | null };

export function LocationPicker({ value, onChange }: { value: Value; onChange: (v: Value) => void }) {
  const status = useGoogleMaps();
  const mapRef = React.useRef<HTMLDivElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const gmap = React.useRef<google.maps.Map | null>(null);
  const marker = React.useRef<google.maps.Marker | null>(null);
  const geocoder = React.useRef<google.maps.Geocoder | null>(null);

  // Keep the latest onChange without re-running the map init effect.
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const reverseGeocode = React.useCallback((lat: number, lng: number) => {
    if (!geocoder.current) return;
    geocoder.current.geocode({ location: { lat, lng } }, (results, gStatus) => {
      const name = gStatus === 'OK' && results && results[0]
        ? (results[0].address_components?.find((c) => c.types.includes('point_of_interest'))?.long_name
           || results[0].formatted_address)
        : '';
      onChangeRef.current({ name: name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
    });
  }, []);

  const placePin = React.useCallback((lat: number, lng: number) => {
    if (!gmap.current) return;
    if (!marker.current) {
      marker.current = new google.maps.Marker({ map: gmap.current, draggable: true, position: { lat, lng } });
      marker.current.addListener('dragend', () => {
        const p = marker.current!.getPosition();
        if (p) reverseGeocode(p.lat(), p.lng());
      });
    } else {
      marker.current.setPosition({ lat, lng });
    }
    gmap.current.panTo({ lat, lng });
  }, [reverseGeocode]);

  // Initialize map + autocomplete once ready.
  React.useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return;
    geocoder.current = new google.maps.Geocoder();
    const center = value.lat != null && value.lng != null ? { lat: value.lat, lng: value.lng } : USC;
    gmap.current = new google.maps.Map(mapRef.current, { center, zoom: 15, disableDefaultUI: true, zoomControl: true });
    gmap.current.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) { placePin(e.latLng.lat(), e.latLng.lng()); reverseGeocode(e.latLng.lat(), e.latLng.lng()); }
    });
    if (value.lat != null && value.lng != null) placePin(value.lat, value.lng);

    if (searchRef.current) {
      const ac = new google.maps.places.Autocomplete(searchRef.current, { fields: ['geometry', 'name', 'formatted_address'] });
      ac.bindTo('bounds', gmap.current);
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        const loc = place.geometry?.location;
        if (loc) {
          placePin(loc.lat(), loc.lng());
          onChangeRef.current({ name: place.name || place.formatted_address || '', lat: loc.lat(), lng: loc.lng() });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const pickChip = (spot: { name: string; lat: number; lng: number }) => {
    if (status === 'ready') placePin(spot.lat, spot.lng);
    onChange({ name: spot.name, lat: spot.lat, lng: spot.lng });
  };

  // Fallback: no key / load error → chips + plain text (today's behavior).
  if (status === 'unconfigured' || status === 'error') {
    return (
      <div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {CAMPUS_SPOTS.map((s) => (
            <button key={s.name} type="button" onClick={() => onChange({ name: s.name, lat: s.lat, lng: s.lng })}
              style={chipStyle(value.name === s.name)}>{s.name}</button>
          ))}
        </div>
        <input value={value.name} onChange={(e) => onChange({ name: e.target.value, lat: null, lng: null })}
          placeholder="Type a spot on or near campus" className="field" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {CAMPUS_SPOTS.map((s) => (
          <button key={s.name} type="button" onClick={() => pickChip(s)} style={chipStyle(value.name === s.name)}>{s.name}</button>
        ))}
      </div>
      <input ref={searchRef} placeholder="Search a place (e.g. Trader Joe's)" className="field" style={{ marginBottom: 10 }} />
      <div ref={mapRef} style={{ width: '100%', height: 220, borderRadius: 12, overflow: 'hidden', background: 'var(--surface)', marginBottom: 10 }} />
      <input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })}
        placeholder="Place name" className="field" />
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '7px 14px', borderRadius: 'var(--r-pill)',
    border: '1px solid ' + (active ? 'var(--ink)' : 'var(--rule)'),
    background: active ? 'var(--ink)' : '#fff', color: active ? '#fff' : 'var(--ink-2)',
    fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}
