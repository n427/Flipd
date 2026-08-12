// Flipd — Feather-style line icons (1.5pt stroke, monochrome)
import React from 'react';

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  stroke?: number;
  style?: React.CSSProperties;
}

const PATHS: Record<string, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></>,
  home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  heart: <><path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z" /></>,
  bookmark: <><path d="M6 4h12v17l-6-4-6 4z" /></>,
  chevronRight: <><path d="m9 6 6 6-6 6" /></>,
  chevronLeft: <><path d="m15 6-6 6 6 6" /></>,
  chevronDown: <><path d="m6 9 6 6 6-6" /></>,
  x: <><path d="M6 6l12 12M18 6 6 18" /></>,
  check: <><path d="m5 12 5 5L20 7" /></>,
  arrowRight: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
  mapPin: <><path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13z" /><circle cx="12" cy="9" r="2.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  camera: <><path d="M4 7h3l2-2h6l2 2h3v12H4z" /><circle cx="12" cy="13" r="4" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m3 18 5-5 5 5 3-3 5 5" /></>,
  star: <><path d="M12 3.5 14.6 9l6 .9-4.3 4.2 1 6L12 17.2 6.7 20l1-6L3.4 9.9 9.4 9z" fill="currentColor" /></>,
  instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /><circle cx="12" cy="12" r="4" /><circle cx="17" cy="7" r="0.8" fill="currentColor" /></>,
  phone: <><path d="M5 4h4l1.5 4-2 2a12 12 0 0 0 5.5 5.5l2-2 4 1.5v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2z" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  shield: <><path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>,
  list: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  chat: <><path d="M4 5h16v11H8l-4 4z" /></>,
  edit: <><path d="m4 20 4-1L19 8l-3-3L5 16zM14 6l4 4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2 2M17.5 17.5l2 2M19.5 4.5l-2 2M6.5 17.5l-2 2" /></>,
  upload: <><path d="M12 16V4M6 10l6-6 6 6M4 20h16" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></>,
  sparkle: <><path d="M12 3v6M12 15v6M3 12h6M15 12h6" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="8" cy="8" r="1.5" /></>,
  activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
  services: <><path d="M7 3v4H3v14h18V7h-4V3z" /><path d="M8 14h8M8 17h5" /></>,
  food: <><path d="M5 9h14l-1 11H6z" /><path d="M9 5c0-1 1-2 3-2s3 1 3 2" /><path d="M5 9c0-1 1-2 3-2h8c2 0 3 1 3 2" /></>,
  event: <><rect x="4" y="6" width="16" height="14" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  housing: <><path d="M3 10 12 3l9 7v11h-6v-7H9v7H3z" /></>,
  goods: <><path d="M3 7h18l-2 13H5z" /><path d="M9 7V5a3 3 0 0 1 6 0v2" /></>,
  pin: <><path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" /></>,
};

export function Icon({ name, size = 18, color = 'currentColor', stroke = 1.5, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {PATHS[name] || null}
    </svg>
  );
}
