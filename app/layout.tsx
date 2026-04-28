import type { Metadata, Viewport } from 'next'
import { Inter, Montserrat } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/components/auth-context'
import { Toaster } from '@/components/ui/toaster'
import { SITE_LOGO } from '@/lib/branding'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const montserrat = Montserrat({ subsets: ['latin'], variable: '--font-montserrat' })

export const metadata: Metadata = {
  title: 'Billar Pool Santa Marta | Tienda de Accesorios para Billar',
  description: 'Mas de 12 anos al servicio. Venta de tacos de billar, guantes, tizas, estuches, panos, bolas, triangulos, virolas, casquillos y mas. Servicio de torno profesional. Santa Marta, Colombia.',
  keywords: 'billar, pool, tacos, accesorios billar, santa marta, guantes billar, tizas billar, panos billar, estuches, virolas, casquillos',
  icons: {
    icon: SITE_LOGO,
    apple: SITE_LOGO,
  },
}

export const viewport: Viewport = {
  themeColor: '#0a2472',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="scroll-smooth" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${inter.variable} ${montserrat.variable} font-sans antialiased`}>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
