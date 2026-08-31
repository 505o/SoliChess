import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SoliChess — نادي الشطرنج داخل ديسكورد',
  description: 'مراجعة مباريات، ألغاز تنافسية، تصنيفات موثقة، وكل ما يحتاجه مجتمع الشطرنج داخل ديسكورد.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'SoliChess — العب، راجع، وتقدّم',
    description: 'رفيق الشطرنج العربي داخل ديسكورد.',
    type: 'website',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
