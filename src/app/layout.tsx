import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3001'),
  title: { default: 'Clientlane — Keep client projects moving', template: '%s | Clientlane' },
  description:
    'Manage client requests, deliveries, revisions, and approvals in one simple workspace for freelancers and small agencies.',
  openGraph: {
    title: 'Clientlane — Keep client projects moving',
    description:
      'A clearer way to collect client inputs, review work, and agree on what happens next.',
    type: 'website',
    siteName: 'Clientlane',
  },
  twitter: { card: 'summary_large_image' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
