import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";

import { OfflineSyncBootstrap } from "@/components/offline-sync-bootstrap";

export const metadata: Metadata = {
  title: "axiora-path",
  description: "Axiora Path MVP",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <OfflineSyncBootstrap />
        {children}
      </body>
    </html>
  );
}
