import type { Metadata } from "next"
import { Geist, Geist_Mono, Geist_Pixel } from "next/font/google"
import { NuqsAdapter } from "nuqs/adapters/next/app"

import "@workspace/ui/globals.css"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { Toaster } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils"
import { ThemeProvider } from "@/components/theme-provider"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
const geistPixel = Geist_Pixel({ subsets: ["latin"], variable: "--font-geist-pixel", adjustFontFallback: false })

export const metadata: Metadata = {
  metadataBase: new URL("https://wowyoy.com"),
  title: { default: "wowyoy", template: "%s · wowyoy" },
  description: "Your growth, read every Monday. One table, one sentence: what moved, and whether it's real.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn(geist.variable, geistMono.variable, geistPixel.variable)}>
      <body>
        <ThemeProvider>
          <NuqsAdapter>
            <TooltipProvider delayDuration={400} skipDelayDuration={300}>
              {children}
              <Toaster />
            </TooltipProvider>
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  )
}
