import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { Toaster } from 'sonner'

import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' })

export const metadata: Metadata = {
  title: 'OSPF Topology Visualizer',
  description: 'Interactive network topology visualization from OSPF LSA packet data',
}

export const viewport: Viewport = {
  themeColor: '#0f1318',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "hsl(220 18% 10%)",
              border: "1px solid hsl(220 14% 18%)",
              color: "hsl(210 20% 92%)",
            },
          }}
        />
      </body>
    </html>
  )
}
