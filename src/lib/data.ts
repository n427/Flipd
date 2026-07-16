// Flipd - mock data (ported from components.jsx)
import type { Category, Listing, Seller } from './types';

export const CURRENT_USER: Seller & { handle: string } = {
  name: 'Alex Park',
  first: 'Alex',
  unit: 'Marshall',
  year: '’26',
  sales: 23,
  handle: '@alex.sc',
};

export const USC_UNITS = ['Marshall', 'Annenberg', 'Viterbi', 'Dornsife', 'SCA', 'Roski', 'Thornton', 'Price'];

export const CATEGORIES: Category[] = [
  { id: 'all', label: 'All', icon: 'grid' },
  { id: 'services', label: 'Services', icon: 'services' },
  { id: 'food', label: 'Food', icon: 'food' },
  { id: 'housing', label: 'Housing', icon: 'housing' },
  { id: 'goods', label: 'Goods', icon: 'goods' },
  { id: 'popup', label: 'Popups', icon: 'event' },
];

export const MOCK_LISTINGS: Listing[] = [
  {
    id: 'l1', category: 'food', categoryLabel: 'Food',
    title: 'Sourdough loaves - Sunday pickup',
    price: 12, priceLabel: '$12',
    seller: { name: 'Maya Mendoza', unit: 'Marshall', year: '’26', sales: 47 },
    meta: '30th & Hoover · Sun 10–2',
    photoTone: 'gold', photoLabel: 'sourdough loaf',
  },
  {
    id: 'l2', category: 'services', categoryLabel: 'Services',
    title: 'Press-on nails, custom sets',
    price: 35, priceLabel: '$35',
    seller: { name: 'Jada Park', unit: 'Annenberg', year: '’25', sales: 112 },
    meta: 'In Cardinal Gardens · 48h turnaround',
    photoTone: 'cardinal', photoLabel: 'nail set',
  },
  {
    id: 'l3', category: 'event', categoryLabel: 'Event',
    title: 'Trousdale Block Party - Friday',
    price: 0, priceLabel: 'Free',
    seller: { name: 'SC Korean Student Assoc.', unit: 'Org', year: '', sales: 9 },
    meta: 'Trousdale Pkwy · Fri 7–11p',
    photoTone: 'cardinal', photoLabel: 'event flyer',
    eventPill: 'NEW POSTING',
  },
  {
    id: 'l4', category: 'goods', categoryLabel: 'Goods',
    title: 'IKEA Markus chair, barely used',
    price: 90, priceLabel: '$90',
    seller: { name: 'Daniel Cho', unit: 'Viterbi', year: '’27', sales: 6 },
    meta: 'USC Village · pickup only',
    photoTone: 'cream', photoLabel: 'office chair',
  },
  {
    id: 'l5', category: 'housing', categoryLabel: 'Housing',
    title: 'Summer sublet - 1bd in The Lorenzo',
    price: 1450, priceLabel: '$1,450/mo',
    seller: { name: 'Priya Shah', unit: 'Dornsife', year: '’25', sales: 2 },
    meta: 'The Lorenzo · Jun 1 – Aug 15',
    photoTone: 'cream', photoLabel: 'apartment shot',
  },
  {
    id: 'l6', category: 'services', categoryLabel: 'Services',
    title: 'GMAT tutoring - 720+ score',
    price: 60, priceLabel: '$60/hr',
    seller: { name: 'Aaron Levin', unit: 'Marshall MBA', year: '’26', sales: 24 },
    meta: 'Marshall · in-person or zoom',
    photoTone: 'ink', photoLabel: 'tutoring',
  },
  {
    id: 'l7', category: 'food', categoryLabel: 'Food',
    title: 'Birria tacos - pre-order by Thurs',
    price: 14, priceLabel: '$14',
    seller: { name: 'Sofia Ramírez', unit: 'Dornsife', year: '’26', sales: 88 },
    meta: 'North University Park · Sat pickup',
    photoTone: 'cardinal', photoLabel: 'birria plate',
  },
  {
    id: 'l8', category: 'goods', categoryLabel: 'Goods',
    title: 'BUAD 304 textbook + study guide',
    price: 25, priceLabel: '$25',
    seller: { name: 'Tyler Nguyen', unit: 'Marshall', year: '’27', sales: 4 },
    meta: 'Doheny · pickup or DPS dropoff',
    photoTone: 'cream', photoLabel: 'textbook',
  },
  {
    id: 'l9', category: 'event', categoryLabel: 'Event',
    title: 'Latinx Honors Mixer @ Tutor',
    price: 5, priceLabel: '$5',
    seller: { name: 'SC Latinx Honors', unit: 'Org', year: '', sales: 22 },
    meta: 'Tutor Campus Ctr · Thu 6p',
    photoTone: 'gold', photoLabel: 'mixer flyer',
  },
  {
    id: 'l10', category: 'services', categoryLabel: 'Services',
    title: 'Senior portrait shoots - grad season',
    price: 120, priceLabel: '$120',
    seller: { name: 'Isabela Reyes', unit: 'SCA', year: '’25', sales: 31 },
    meta: 'On-campus · 1hr session, 30 edits',
    photoTone: 'cream', photoLabel: 'portrait',
  },
  {
    id: 'l11', category: 'goods', categoryLabel: 'Goods',
    title: 'Bike - single speed, 56cm',
    price: 180, priceLabel: '$180',
    seller: { name: 'Marco Bianchi', unit: 'Viterbi', year: '’26', sales: 11 },
    meta: 'Adams + Vermont · negotiable',
    photoTone: 'ink', photoLabel: 'bike',
  },
  {
    id: 'l12', category: 'food', categoryLabel: 'Food',
    title: 'Matcha drinks - Tues & Thurs',
    price: 7, priceLabel: '$7',
    seller: { name: 'Hana Ito', unit: 'Annenberg', year: '’27', sales: 56 },
    meta: 'Outside Leavey · 10a–2p',
    photoTone: 'gold', photoLabel: 'matcha latte',
  },
];
