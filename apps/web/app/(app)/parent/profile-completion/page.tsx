"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

export default function ParentProfileCompletionPage() {
  const searchParams = useSearchParams();
  const childId = searchParams.get("childId");
  const target = childId ? `/parent?childId=${encodeURIComponent(childId)}` : "/parent";

  return (
    <PageShell tone="parent" width="content">
      <div className="mx-auto max-w-xl rounded-2xl border border-[#D6E1F0] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-black text-[#1F3558]">Completar perfil da criança</h1>
        <p className="mt-3 text-sm text-[#4A5F80]">
          Precisamos da sua data de nascimento para personalizar seu aprendizado.
        </p>
        <div className="mt-5">
          <Button asChild>
            <Link href={target}>Ir para Área dos Pais</Link>
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
