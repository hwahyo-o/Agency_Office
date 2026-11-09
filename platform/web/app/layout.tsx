import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agency Office',
  description: 'Role-based AI employees in one collaborative workspace.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
