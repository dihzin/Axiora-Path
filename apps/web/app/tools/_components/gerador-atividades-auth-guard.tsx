"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useToolsIdentity } from "@/context/tools-identity-context";

type GeradorAtividadesAuthGuardProps = {
  children: ReactNode;
};

export function GeradorAtividadesAuthGuard({ children }: GeradorAtividadesAuthGuardProps) {
  const router = useRouter();
  const { hasAuthenticatedSession, initializing } = useToolsIdentity();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const canStayOnGenerator = hasAuthenticatedSession;

  useEffect(() => {
    if (!hydrated) return;
    if (!initializing && !canStayOnGenerator) {
      router.replace("/tools/gerador-atividades/login");
    }
  }, [canStayOnGenerator, hydrated, initializing, router]);

  if (!hydrated || initializing) return null;

  return <>{children}</>;
}
