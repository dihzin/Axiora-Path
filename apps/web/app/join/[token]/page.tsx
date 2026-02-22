"use client";

import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, joinMultiplayerSession } from "@/lib/api/client";
import { getAccessToken, getTenantSlug, setTenantSlug } from "@/lib/api/session";

const AVATARS = ["😀", "🤖", "🦊", "🐼", "🦁", "🐙"];

export default function JoinGamePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = useMemo(() => String(params?.token ?? "").trim(), [params]);
  const tenantFromInvite = useMemo(() => String(searchParams?.get("tenant") ?? "").trim(), [searchParams]);

  const onJoin = async () => {
    if (!token) {
      setError("Convite inválido.");
      return;
    }
    if (!name.trim()) {
      setError("Informe seu nome para entrar.");
      return;
    }
    const currentTenant = getTenantSlug();
    if (tenantFromInvite && tenantFromInvite !== currentTenant) {
      setTenantSlug(tenantFromInvite);
    }
    const accessToken = getAccessToken();
    if (!accessToken) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      const tenantQuery = tenantFromInvite ? `?tenant=${encodeURIComponent(tenantFromInvite)}&next=${next}` : `?next=${next}`;
      router.push(`/login${tenantQuery}`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const state = await joinMultiplayerSession({ joinToken: token });
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          `axiora_multiplayer_profile_${state.sessionId}`,
          JSON.stringify({ name: name.trim(), avatar }),
        );
      }
      router.replace(`/child/games/tictactoe?session=${encodeURIComponent(state.sessionId)}&mode=guest`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError("Faça login na mesma organização para entrar na partida.");
        } else if (err.status === 403) {
          setError("Você não tem permissão para entrar nesta partida.");
        } else if (err.status === 404 || err.status === 409) {
          setError("Convite expirado, inválido ou já utilizado.");
        } else {
          setError("Não foi possível entrar agora. Tente novamente.");
        }
      } else {
        setError("Não foi possível entrar agora. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell tone="child" width="content">
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Entrar na partida</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Defina seu nome e avatar para o duelo 1v1.</p>
          {tenantFromInvite ? (
            <p className="rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-muted-foreground">
              Convite da organização: <span className="text-foreground">{tenantFromInvite}</span>
            </p>
          ) : null}
          <input
            className="h-11 w-full rounded-2xl border border-border bg-white px-3 text-sm font-semibold"
            placeholder="Seu nome"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
          />
          <div className="grid grid-cols-6 gap-2">
            {AVATARS.map((item) => (
              <button
                key={item}
                className={`h-10 rounded-xl border text-lg ${avatar === item ? "border-secondary bg-secondary/10" : "border-border bg-card"}`}
                onClick={() => setAvatar(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
          {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
          <Button className="w-full" onClick={onJoin} disabled={loading}>
            {loading ? "Entrando..." : "Entrar na partida"}
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}
