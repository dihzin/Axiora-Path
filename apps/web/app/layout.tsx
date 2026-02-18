import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import { ReactNode } from "react";

import { OfflineBanner } from "@/components/offline-banner";
import { OfflineSyncBootstrap } from "@/components/offline-sync-bootstrap";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { PwaRegister } from "@/components/pwa-register";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "axiora-path",
  description: "Axiora Path MVP",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-192.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Axiora Path",
  },
};

export const viewport: Viewport = {
  themeColor: "#1E2A38",
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
    <html lang="pt-BR">
      <body
        suppressHydrationWarning
        className={`${nunito.variable} ${baloo.variable} min-h-screen bg-background text-foreground font-sans`}
      >
        <ThemeProvider>
          <PwaRegister />
          <OfflineSyncBootstrap />
          <OfflineBanner />
          <PwaInstallPrompt />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
