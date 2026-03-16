import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import { ReactNode } from "react";

import { OfflineBanner } from "@/components/offline-banner";
import { OfflineSyncBootstrap } from "@/components/offline-sync-bootstrap";
import { PwaRegister } from "@/components/pwa-register";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: { default: "Axiora Path", template: "%s · Axiora Path" },
  description: "Aprendizagem gamificada para crianças — missões, XP e trilha personalizada.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/favicon-axion.svg",
    shortcut: "/icons/favicon-axion.svg",
    apple: "/axiora/mascot/axiora-mascot-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Axiora Path",
  },
};

export const viewport: Viewport = {
  themeColor: "#18312E",
};

type RootLayoutProps = {
  children: ReactNode;
};

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-ui",
});

const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
});

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="pt-BR" className="bg-[#18312E]">
      <body
        suppressHydrationWarning
        className={`${nunito.variable} ${baloo.variable} relative min-h-screen bg-[#18312E] text-foreground font-sans [background-image:none]`}
      >
        <ThemeProvider>
          <div className="relative z-10">
            <PwaRegister />
            <OfflineSyncBootstrap />
            <OfflineBanner />
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
