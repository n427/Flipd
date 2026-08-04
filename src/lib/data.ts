// Flipd - shared static data (categories, USC units)
import type { Category } from './types';

export const USC_UNITS = ['Marshall', 'Annenberg', 'Viterbi', 'Dornsife', 'SCA', 'Roski', 'Thornton', 'Price'];

export const CATEGORIES: Category[] = [
  { id: 'all', label: 'All', icon: 'grid' },
  { id: 'services', label: 'Services', icon: 'services' },
  { id: 'event', label: 'Popups', icon: 'event' },
  { id: 'goods', label: 'Goods', icon: 'goods' },
  { id: 'housing', label: 'Housing', icon: 'housing' },
];
