'use client';
import { useEffect, useState } from 'react';

type Status = 'unconfigured' | 'loading' | 'ready' | 'error';
const SRC_ID = 'gmaps-js';

export function useGoogleMaps(): Status {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [status, setStatus] = useState<Status>(key ? 'loading' : 'unconfigured');

  useEffect(() => {
    if (!key) { setStatus('unconfigured'); return; }
    // Already loaded.
    if (typeof window !== 'undefined' && (window as unknown as { google?: { maps?: unknown } }).google?.maps) {
      setStatus('ready');
      return;
    }
    let script = document.getElementById(SRC_ID) as HTMLScriptElement | null;
    const onLoad = () => setStatus('ready');
    const onErr = () => setStatus('error');
    if (!script) {
      script = document.createElement('script');
      script.id = SRC_ID;
      script.async = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
      script.addEventListener('load', onLoad);
      script.addEventListener('error', onErr);
      document.head.appendChild(script);
    } else {
      script.addEventListener('load', onLoad);
      script.addEventListener('error', onErr);
      if ((window as unknown as { google?: { maps?: unknown } }).google?.maps) setStatus('ready');
    }
    return () => {
      script?.removeEventListener('load', onLoad);
      script?.removeEventListener('error', onErr);
    };
  }, [key]);

  return status;
}
