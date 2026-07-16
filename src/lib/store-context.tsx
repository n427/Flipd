'use client';

// Shares a single useFlipdStore() instance across all app routes so navigating
// between pages (feed, listing, profile…) doesn't re-create the store or
// re-fetch listings/saves.
import React from 'react';
import { useFlipdStore, type FlipdStore } from './store';

const Ctx = React.createContext<FlipdStore | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const store = useFlipdStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): FlipdStore {
  const s = React.useContext(Ctx);
  if (!s) throw new Error('useStore must be used within StoreProvider');
  return s;
}
