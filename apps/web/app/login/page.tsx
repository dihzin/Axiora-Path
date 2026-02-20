"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { login } from "@/lib/api/client";
import { getTenantSlug, setAccessToken, setTenantSlug } from "@/lib/api/session";

function AxionMascot() {
  return (
    <svg viewBox="0 0 96 96" width="112" height="112" fill="none" aria-hidden="true" className="mx-auto overflow-visible">
      <g className="axion-glow">
        <ellipse cx="48" cy="56" rx="40" ry="42" fill="#4DD9C0" fillOpacity="0.22" />
      </g>
      <g className="axion-float">
        <ellipse cx="48" cy="90" rx="22" ry="5" fill="#0D1A2E" fillOpacity="0.28" />
        <path d="M22 62 Q14 76 17 85 Q28 78 34 68" fill="#0F1C30" />
        <path d="M74 62 Q82 76 79 85 Q68 78 62 68" fill="#0F1C30" />
        <path d="M23 58 Q48 66 73 58 L71 66 Q48 74 25 66Z" fill="#1B2A4A" stroke="#4DD9C0" strokeWidth="1.5" strokeOpacity="0.8" />
        <path d="M23 58 Q48 66 73 58" fill="none" stroke="#4DD9C0" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="48" cy="62" rx="28" ry="30" fill="#1B2A4A" stroke="#243F6A" strokeWidth="1.5" />
        <ellipse cx="42" cy="52" rx="9" ry="5" fill="#4DD9C0" fillOpacity="0.1" transform="rotate(-12 42 52)" />
        <path d="M48 54 L52 60 L48 66 L44 60Z" fill="#F5C842" fillOpacity="0.9" stroke="#C8990A" strokeWidth="1" />
        <path d="M48 56 L51 60 L48 64 L45 60Z" fill="#FFE07A" fillOpacity="0.5" />
        <ellipse cx="48" cy="44" rx="26" ry="28" fill="#2D4A7A" stroke="#1B2A4A" strokeWidth="1.5" />
        <ellipse cx="40" cy="34" rx="10" ry="6" fill="white" fillOpacity="0.05" />
        <ellipse cx="22" cy="44" rx="4" ry="5.5" fill="#2D4A7A" stroke="#1B2A4A" strokeWidth="1" />
        <ellipse cx="74" cy="44" rx="4" ry="5.5" fill="#2D4A7A" stroke="#1B2A4A" strokeWidth="1" />
        <ellipse cx="27" cy="50" rx="7" ry="5" fill="#F5C842" fillOpacity="0.16" />
        <ellipse cx="69" cy="50" rx="7" ry="5" fill="#F5C842" fillOpacity="0.16" />
        <path d="M27 33 Q36 28 44 32" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M52 32 Q60 28 69 33" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round" />
        <g className="axion-blink">
          <path d="M29 42 Q36 34 43 42" stroke="#1B2A4A" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M53 42 Q60 34 67 42" stroke="#1B2A4A" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </g>
        <path d="M33 53 Q48 67 63 53" fill="#1B2A4A" stroke="#1B2A4A" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M35 54 Q48 65 61 54" fill="white" />
        <ellipse cx="48" cy="61" rx="8" ry="5" fill="#E8709A" fillOpacity="0.75" />
        <g className="axion-crown">
          <rect x="30" y="18" width="36" height="8" rx="4" fill="#F5C842" stroke="#C8990A" strokeWidth="1" />
          <path d="M33 18 L33 9 L39 15 L48 6 L57 15 L63 9 L63 18Z" fill="#F5C842" stroke="#C8990A" strokeWidth="1" strokeLinejoin="round" />
          <ellipse cx="48" cy="13" rx="3.5" ry="3.5" fill="#4DD9C0" stroke="#2AB09A" strokeWidth="0.75" />
          <ellipse cx="36" cy="17" rx="2.5" ry="2.5" fill="#E8709A" stroke="#B84A78" strokeWidth="0.75" />
          <ellipse cx="60" cy="17" rx="2.5" ry="2.5" fill="#E8709A" stroke="#B84A78" strokeWidth="0.75" />
        </g>
      </g>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlugValue] = useState("");
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tenantFromQuery = params.get("tenant");
    const nextFromQuery = params.get("next");
    if ((tenantFromQuery ?? "").trim().toLowerCase() === "platform-admin") {
      const suffix = nextFromQuery && nextFromQuery.startsWith("/") ? `?next=${encodeURIComponent(nextFromQuery)}` : "";
      router.replace(`/platform-admin/login${suffix}`);
      return;
    }
    if (nextFromQuery && nextFromQuery.startsWith("/")) {
      setNextPath(nextFromQuery);
    }
    if (tenantFromQuery && tenantFromQuery.trim()) {
      setTenantSlugValue(tenantFromQuery.trim());
      return;
    }
    const savedTenantSlug = getTenantSlug();
    if (savedTenantSlug) {
      setTenantSlugValue(savedTenantSlug);
    }
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!tenantSlug.trim()) {
        setError("Informe a organização.");
        return;
      }
      setTenantSlug(tenantSlug);
      const tokens = await login(email, password);
      setAccessToken(tokens.access_token);
      if (nextPath) {
        router.push(nextPath);
      } else {
        router.push("/select-tenant");
      }
    } catch {
      setError("Não foi possível autenticar. Verifique organização, email e senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#f6f6f3] bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/axiora/home/login-background.svg')" }}
    >
      <main className="safe-px safe-pb mx-auto flex min-h-screen w-full max-w-md overflow-x-clip p-4 md:p-6">
        <div className="relative min-h-[calc(100vh-2rem)] w-full md:min-h-[calc(100vh-3rem)]">
          <div className="pointer-events-none absolute left-0 right-0 top-12 md:top-16">
            <AxionMascot />
          </div>
          <Card className="absolute left-1/2 top-[58%] w-full -translate-x-1/2 -translate-y-1/2 border-white/60 bg-white/95 shadow-[0_-4px_40px_rgba(13,25,41,0.25),0_8px_32px_rgba(0,0,0,0.15)]">
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>Use sua organização e credenciais para acessar o MVP.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={onSubmit}>
              <Input placeholder="Organização" value={tenantSlug} onChange={(e) => setTenantSlugValue(e.target.value)} autoComplete="organization" required />
              <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              <Input
                placeholder="Senha"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </CardContent>
          </Card>
        </div>
      </main>
      <style jsx global>{`
        @keyframes axion-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-7px);
          }
        }

        @keyframes axion-glow {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        @keyframes axion-crown-bob {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-3px);
          }
        }

        @keyframes axion-blink {
          0%,
          90%,
          100% {
            transform: scaleY(1);
          }
          95% {
            transform: scaleY(0.06);
          }
        }

        .axion-float {
          animation: axion-float 3s ease-in-out infinite;
          transform-origin: center;
        }

        .axion-glow {
          animation: axion-glow 3s ease-in-out infinite;
        }

        .axion-crown {
          animation: axion-crown-bob 2.5s ease-in-out infinite;
          transform-origin: 48px 14px;
        }

        .axion-blink {
          animation: axion-blink 4s ease-in-out infinite;
          transform-origin: center;
        }

        @media (prefers-reduced-motion: reduce) {
          .axion-float,
          .axion-glow,
          .axion-crown,
          .axion-blink {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
