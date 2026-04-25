"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AxioraHeaderLogo } from "@/components/brand/axiora-header-logo";

type ToolsHeaderLogoTriggerProps = {
  refreshCurrentPage?: boolean;
};

export function ToolsHeaderLogoTrigger({ refreshCurrentPage = false }: ToolsHeaderLogoTriggerProps) {
  const router = useRouter();

  if (refreshCurrentPage) {
    return (
      <button type="button" onClick={() => router.refresh()} className="flex shrink-0 items-center" aria-label="Recarregar página">
        <AxioraHeaderLogo className="w-[168px] sm:w-[196px]" priority />
      </button>
    );
  }

  return (
    <Link href="/tools" className="flex shrink-0 items-center">
      <AxioraHeaderLogo className="w-[168px] sm:w-[196px]" priority />
    </Link>
  );
}
