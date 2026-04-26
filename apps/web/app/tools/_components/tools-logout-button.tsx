"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";

import { getToolsSession, logout } from "@/lib/api/client";
import { clearTenantSlug, clearTokens, clearUserDisplayName, getUserDisplayName, setUserDisplayName } from "@/lib/api/session";

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function ToolsLogoutButton() {
  const [userLabel, setUserLabel] = useState("");

  useEffect(() => {
    const savedValue = getUserDisplayName() ?? "";
    if (savedValue && isEmail(savedValue)) {
      setUserLabel(savedValue);
    }

    void getToolsSession()
      .then((session) => {
        setUserLabel(session.email);
        setUserDisplayName(session.email);
      })
      .catch(() => undefined);
  }, []);

  const handleLogout = async () => {
    await logout().catch(() => undefined);
    clearTokens();
    clearTenantSlug();
    clearUserDisplayName();
    document.cookie = "ax_tools_auth=; Path=/tools; Max-Age=0; SameSite=Lax";
    window.location.replace("/tools/gerador-atividades/login");
  };

  return (
    <div className="flex items-center gap-3">
      {userLabel ? <span className="text-sm font-semibold text-white/60">{userLabel}</span> : null}
      <button
        type="button"
        onClick={handleLogout}
        aria-label="Sair"
        title="Sair"
        className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/15 bg-[rgba(255,255,255,0.06)] text-white/80 shadow-[0_4px_12px_rgba(4,12,20,0.2)] transition hover:border-[rgba(238,135,72,0.35)] hover:bg-[rgba(238,135,72,0.12)] hover:text-[#fde68a]"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
