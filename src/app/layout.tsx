import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Flipd - An edu-verified marketplace for USC students',
  description:
    'Flipd is a marketplace only for verified @usc.edu students. Buy and sell on campus - services, food, popups, sublets, and goods - without the scams.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
