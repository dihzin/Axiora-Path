import "./globals.css";
import type { Metadata } from "next";
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
  themeColor: "#0f172a",
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

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
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
