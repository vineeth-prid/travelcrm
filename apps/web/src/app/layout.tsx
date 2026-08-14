import type { Metadata } from 'next';
import { Inter, Poppins } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';
import { Providers } from './providers';

/** Body, tables, forms and metadata. */
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

/** Headings and titles only — the brand allows no third typeface. */
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Tour De India Holidays',
    template: '%s · Tour De India Holidays',
  },
  description: 'Sales workspace for Tour De India Holidays.',
  icons: { icon: '/brand/tour-de-india-logo-transparent.png' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable}`}>
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
