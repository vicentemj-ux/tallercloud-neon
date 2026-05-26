import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const inter = Inter({ subsets: ["latin"], display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'TallerCloud - Gestion de Talleres en la Nube',
    template: '%s | TallerCloud',
  },
  description: 'Gestiona folios, estatus por QR y sucursales desde cualquier dispositivo. La plataforma en la nube para talleres de reparacion.',
  metadataBase: new URL('https://tallercloud.net'),
  keywords: ['taller', 'reparacion', 'celulares', 'laptops', 'consolas', 'gestion', 'software', 'saas'],
  authors: [{ name: 'Vicente Munguia' }],
  creator: 'Vicente Munguia',
  publisher: 'TallerCloud',
  openGraph: {
    type: 'website',
    locale: 'es_MX',
    url: 'https://tallercloud.net',
    siteName: 'TallerCloud',
    title: 'TallerCloud - Gestion de Talleres en la Nube',
    description: 'La plataforma en la nube para talleres de reparacion.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TallerCloud',
    description: 'La plataforma en la nube para talleres de reparacion.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning={true}>
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://utgitflefsybbreqcnpq.supabase.co" />
        <link rel="dns-prefetch" href="https://vitals.vercel-insights.com" />
        <link rel="preload" href="/images/logo.png" as="image" type="image/png" fetchPriority="high" />
      </head>
      <body className={`${inter.className} font-sans antialiased`} suppressHydrationWarning={true}>
        {children}
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
