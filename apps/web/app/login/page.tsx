"use client";

import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage, getLegalStatus, googleLogin, listMemberships, loginPrimary, type PrimaryLoginResponse, selectTenant } from "@/lib/api/client";
import { clearTenantSlug, clearTokens, setAccessToken, setTenantSlug } from "@/lib/api/session";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, string | number | boolean>,
          ) => void;
        };
      };
    };
  }
}


export default function LoginPage() {
  const router = useRouter();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleCredentialHandlerRef = useRef<(credential?: string) => Promise<void>>(async () => {});
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleScriptReady, setGoogleScriptReady] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousHtmlGutter = root.style.scrollbarGutter;
    const previousBodyGutter = body.style.scrollbarGutter;
    const previousBodyBg = body.style.backgroundColor;

    root.style.scrollbarGutter = "auto";
    body.style.scrollbarGutter = "auto";
    body.style.backgroundColor = "transparent";

    return () => {
      root.style.scrollbarGutter = previousHtmlGutter;
      body.style.scrollbarGutter = previousBodyGutter;
      body.style.backgroundColor = previousBodyBg;
    };
  }, []);

  useEffect(() => {
    if (GOOGLE_CLIENT_ID && window.google) {
      setGoogleScriptReady(true);
    }
  }, []);

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
  }, [router]);

  const finishPrimaryLogin = async (loginResponse: PrimaryLoginResponse) => {
    setAccessToken(loginResponse.access_token);

    if (loginResponse.memberships.length === 0) {
      router.push("/onboarding");
      return;
    }

    if (loginResponse.memberships.length > 1) {
      router.push("/select-tenant");
      return;
    }

    const membership = loginResponse.memberships[0];
    setTenantSlug(membership.tenant_slug);
    const tenantResponse = await selectTenant(membership.tenant_slug);
    setAccessToken(tenantResponse.access_token);

    const memberships = await listMemberships();
    const activeMembership = memberships.find((item) => item.tenant_slug === membership.tenant_slug);
    if (!activeMembership) {
      throw new Error("Membership not found after tenant activation");
    }

    if (activeMembership.tenant_type === "FAMILY") {
      const legal = await getLegalStatus();
      if (legal.consent_required) {
        router.push("/onboarding");
        return;
      }
    }

    if (!activeMembership.onboarding_completed) {
      router.push("/onboarding");
      return;
    }

    router.push(nextPath ?? "/select-child");
  };

  const handleEmailLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      clearTenantSlug();
      const loginResponse = await loginPrimary(email, password);
      await finishPrimaryLogin(loginResponse);
    } catch (err) {
      clearTokens();
      clearTenantSlug();
      setError(getApiErrorMessage(err, "Não foi possível autenticar. Verifique email e senha."));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleCredential = async (credential?: string) => {
    if (!credential) {
      setError("O Google não retornou uma credencial válida.");
      return;
    }

    setError(null);
    setGoogleLoading(true);
    try {
      clearTenantSlug();
      const loginResponse = await googleLogin(credential);
      await finishPrimaryLogin(loginResponse);
    } catch (err) {
      clearTokens();
      clearTenantSlug();
      setError(getApiErrorMessage(err, "Não foi possível autenticar com Google agora."));
    } finally {
      setGoogleLoading(false);
    }
  };

  googleCredentialHandlerRef.current = handleGoogleCredential;

  useEffect(() => {
    if (!googleScriptReady || !GOOGLE_CLIENT_ID || !googleButtonRef.current || !window.google) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        void googleCredentialHandlerRef.current(response.credential);
      },
    });

    googleButtonRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
      width: Math.min(360, googleButtonRef.current.offsetWidth || 360),
      logo_alignment: "left",
    });
  }, [googleScriptReady]);

  return (
    <div className="axiora-brand-page relative isolate">
      {GOOGLE_CLIENT_ID ? (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={() => setGoogleScriptReady(true)}
          onReady={() => setGoogleScriptReady(true)}
        />
      ) : null}

      <div
        className="pointer-events-none fixed left-[-12px] top-[-12px] z-0 h-[calc(100vh+24px)] w-[calc(100vw+24px)] bg-cover bg-[58%_center] bg-no-repeat"
        style={{ backgroundImage: "url('/axiora/auth/wallpaper.jpg')" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed left-[-12px] top-[-12px] z-0 h-[calc(100vh+24px)] w-[calc(100vw+24px)] bg-[linear-gradient(90deg,rgba(6,14,22,0.82)_0%,rgba(10,22,32,0.52)_38%,rgba(16,28,32,0.18)_100%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed left-[-12px] top-[-12px] z-0 h-[calc(100vh+24px)] w-[calc(100vw+24px)] bg-[radial-gradient(circle_at_14%_20%,rgba(255,224,154,0.13),transparent_20%),radial-gradient(circle_at_82%_16%,rgba(150,234,221,0.1),transparent_22%),radial-gradient(circle_at_50%_100%,rgba(7,20,17,0.4),transparent_44%)]"
        aria-hidden="true"
      />

      <main className="axiora-brand-content relative z-10 min-h-screen w-full overflow-hidden">
        <section className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1480px] items-center gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-10">
          <div className="axiora-login-hero flex min-h-[44vh] flex-col justify-center gap-8 rounded-[2rem] border border-white/8 bg-[rgba(8,18,28,0.16)] p-5 backdrop-blur-[1px] sm:p-8 lg:min-h-[78vh] lg:border-transparent lg:bg-transparent lg:justify-start lg:p-8 lg:pt-16 lg:backdrop-blur-0">
            <div className="max-w-[36rem] space-y-6 text-white">
              {/* Mascot — prominent above tagline */}
              <div className="mb-2">
                <Image
                  src="/axiora/mascot/axiora-mascot.png"
                  alt="Mascote Axiora"
                  width={172}
                  height={172}
                  priority
                />
              </div>

              <div className="space-y-4">
                <h1 className="max-w-[10ch] text-4xl font-black uppercase leading-[0.81] tracking-[-0.045em] sm:text-5xl lg:text-[5.1rem]">
                  <span className="block text-[#fffaf4] drop-shadow-[0_10px_22px_rgba(7,20,17,0.28)]">Abrir</span>
                  <span className="block bg-[linear-gradient(180deg,#fff1cf_0%,#f4ca97_44%,#de9b79_100%)] bg-clip-text text-transparent drop-shadow-[0_10px_26px_rgba(87,40,24,0.18)]">
                    caminhos.
                  </span>
                  <span className="block text-[#f4f6fb] drop-shadow-[0_10px_22px_rgba(7,20,17,0.28)]">Cultivar</span>
                  <span className="block bg-[linear-gradient(180deg,#f2f7f5_0%,#bddfd7_45%,#f6e8c8_100%)] bg-clip-text text-transparent drop-shadow-[0_10px_28px_rgba(13,49,52,0.14)]">
                    conquistas.
                  </span>
                </h1>
                <p className="max-w-[33rem] text-base font-semibold leading-7 text-white/82 lg:text-[1.01rem]">
                  A experiência Axiora para acompanhar aprendizagem, rotina e evolução com mais clareza, segurança e presença no dia a dia.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {/* Famílias */}
                <div className="axiora-login-info-card relative overflow-hidden rounded-[1.7rem] border border-[rgba(241,197,107,0.28)] bg-[linear-gradient(160deg,rgba(20,36,28,0.78),rgba(14,28,22,0.72))] px-4 py-5 shadow-[0_16px_36px_rgba(4,12,8,0.36)] backdrop-blur-md">
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(90deg,#f6dfb7,#e8b97c)]" aria-hidden="true" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(246,223,183,0.10),transparent_52%)]" aria-hidden="true" />
                  <div className="relative">
                    <p className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#f6c870]">Famílias</p>
                    <p className="mt-2 text-sm font-bold leading-[1.7] text-white/88">Progresso, rotina e consentimento com mais tranquilidade.</p>
                  </div>
                </div>
                {/* Crianças */}
                <div className="axiora-login-info-card relative overflow-hidden rounded-[1.7rem] border border-[rgba(110,231,183,0.24)] bg-[linear-gradient(160deg,rgba(14,38,34,0.78),rgba(10,28,25,0.72))] px-4 py-5 shadow-[0_16px_36px_rgba(4,12,8,0.36)] backdrop-blur-md">
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(90deg,#7fd8c5,#4fb8a8)]" aria-hidden="true" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(110,231,183,0.08),transparent_52%)]" aria-hidden="true" />
                  <div className="relative">
                    <p className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#6ee7b7]">Crianças</p>
                    <p className="mt-2 text-sm font-bold leading-[1.7] text-white/88">Perfil, trilha e conquistas com mais autonomia.</p>
                  </div>
                </div>
                {/* Escolas */}
                <div className="axiora-login-info-card relative overflow-hidden rounded-[1.7rem] border border-[rgba(255,163,94,0.24)] bg-[linear-gradient(160deg,rgba(28,24,18,0.78),rgba(20,18,14,0.72))] px-4 py-5 shadow-[0_16px_36px_rgba(4,12,8,0.36)] backdrop-blur-md">
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(90deg,#f6a878,#e8845a)]" aria-hidden="true" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,163,94,0.08),transparent_52%)]" aria-hidden="true" />
                  <div className="relative">
                    <p className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#ffa35e]">Escolas</p>
                    <p className="mt-2 text-sm font-bold leading-[1.7] text-white/88">Organizações e fluxos com mais clareza operacional.</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="axiora-login-chip inline-flex items-center gap-1.5 rounded-full border border-[rgba(246,223,183,0.30)] bg-[rgba(10,22,16,0.62)] px-3.5 py-2 text-[0.72rem] font-bold text-[#f6c870] shadow-[0_4px_12px_rgba(4,10,6,0.22)] backdrop-blur-sm">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#f6c870] shadow-[0_0_6px_#f6c870]" />
                  Seguro por padrão
                </span>
                <span className="axiora-login-chip inline-flex items-center gap-1.5 rounded-full border border-[rgba(110,231,183,0.26)] bg-[rgba(10,22,16,0.62)] px-3.5 py-2 text-[0.72rem] font-bold text-[#6ee7b7] shadow-[0_4px_12px_rgba(4,10,6,0.22)] backdrop-blur-sm">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#6ee7b7] shadow-[0_0_6px_#6ee7b7]" />
                  Acesso com Google
                </span>
              </div>
            </div>
          </div>

          <div className="relative flex items-center justify-center lg:justify-end">
            <div className="absolute inset-0 hidden lg:block bg-[radial-gradient(circle_at_65%_50%,rgba(255,248,238,0.18),transparent_34%)]" aria-hidden="true" />
            <div className="axiora-login-panel relative z-10 w-full max-w-[28.5rem] overflow-hidden rounded-[2.15rem] border border-[rgba(255,239,221,0.72)] bg-[linear-gradient(160deg,rgba(255,251,246,0.88)_0%,rgba(244,234,222,0.84)_100%)] p-5 shadow-[0_32px_80px_rgba(10,18,14,0.42),0_2px_0_rgba(255,255,255,0.55)_inset] backdrop-blur-2xl sm:p-6">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#f3d7b0,#eeb17d,#dcefe8)]" aria-hidden="true" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),transparent_34%)]" aria-hidden="true" />
              <div className="mb-6 flex items-center gap-4 lg:hidden">
                <div className="shrink-0">
                  <Image
                    src="/axiora/mascot/axiora-mascot.png"
                    alt="Mascote Axiora"
                    width={80}
                    height={80}
                  />
                </div>
                <div>
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[#8b755d]">Boas-vindas</p>
                  <h2 className="mt-1 text-2xl font-black text-[#22352f]">Entrar no Axiora</h2>
                </div>
              </div>

              <div className="relative hidden lg:block">
                <p className="text-[0.7rem] font-black uppercase tracking-[0.24em] text-[#9c7c58]">Acesso principal</p>
                <h2 className="mt-2 text-[2.05rem] font-black leading-tight tracking-[-0.025em] text-[#203846]">Entrar no Axiora</h2>
                <p className="mt-3 max-w-[23rem] text-sm font-semibold leading-6 text-[#5e605b]">
                  Use email e senha ou continue com Google. Se existir mais de uma organização vinculada, você escolhe o tenant no próximo passo.
                </p>
              </div>

              <form className="relative mt-6 space-y-4" onSubmit={handleEmailLogin}>
                <div className="space-y-2">
                  <label className="block text-[0.78rem] font-black uppercase tracking-[0.18em] text-[#816b57]" htmlFor="email">
                    Email
                  </label>
                  <Input
                    id="email"
                    placeholder="voce@familia.com"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "login-error" : undefined}
                    className="h-12 rounded-[1.15rem] border-[rgba(230,213,195,0.92)] bg-[rgba(245,248,252,0.96)] text-[#203846] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_12px_26px_rgba(194,170,144,0.16)] placeholder:text-[#9e9386] focus-visible:ring-[#ffb170]"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className="block text-[0.78rem] font-black uppercase tracking-[0.18em] text-[#816b57]" htmlFor="password">
                      Senha
                    </label>
                    <Link className="text-xs font-black text-[#a2602d] transition hover:text-[#7e4a23]" href="/reset-password">
                      Esqueci minha senha
                    </Link>
                  </div>
                  <Input
                    id="password"
                    placeholder="Sua senha"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "login-error" : undefined}
                    className="h-12 rounded-[1.15rem] border-[rgba(230,213,195,0.92)] bg-[rgba(245,248,252,0.96)] text-[#203846] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_12px_26px_rgba(194,170,144,0.16)] placeholder:text-[#9e9386] focus-visible:ring-[#ffb170]"
                    required
                  />
                </div>

                {error ? (
                  <p id="login-error" role="alert" aria-live="polite" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                    {error}
                  </p>
                ) : null}

                <Button className="w-full bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] shadow-[inset_0_1px_0_rgba(255,219,190,0.46),0_6px_0_rgba(158,74,30,0.42),0_16px_24px_rgba(93,48,22,0.18)]" type="submit" disabled={loading || googleLoading}>
                  {loading ? "Entrando..." : "Entrar com email"}
                </Button>
              </form>

              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-[#dbcab6]" />
                <span className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-[#8f7a65]">ou</span>
                <span className="h-px flex-1 bg-[#dbcab6]" />
              </div>

              {GOOGLE_CLIENT_ID ? (
                <div className="space-y-3">
                  <div
                    className={`rounded-[1.5rem] border border-[rgba(233,217,200,0.88)] bg-[rgba(255,255,255,0.8)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_14px_28px_rgba(194,170,144,0.14)] ${googleLoading ? "pointer-events-none opacity-70" : ""}`}
                  >
                    <div ref={googleButtonRef} className="flex min-h-[44px] items-center justify-center" aria-label="Entrar com Google" />
                  </div>
                  <p className="text-xs font-semibold leading-5 text-[#6f665d]">
                    Se for seu primeiro acesso com Google, criamos sua conta e iniciamos sua organização familiar automaticamente.
                  </p>
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-[#d5c3ae] bg-[rgba(255,255,255,0.6)] px-4 py-3 text-sm font-semibold leading-6 text-[#706257]">
                  Login com Google será habilitado nesta organização assim que a configuração de acesso for concluída.
                </div>
              )}

              <div className="mt-6 rounded-[1.55rem] border border-[rgba(234,220,202,0.9)] bg-[rgba(255,255,255,0.62)] px-4 py-4 text-sm text-[#5f5a52] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_12px_22px_rgba(194,170,144,0.1)]">
                <p className="font-bold text-[#27404a]">Ainda não tem conta?</p>
                <p className="mt-1 font-semibold leading-6">Crie sua família agora e siga para o onboarding com consentimento, perfis e seleção de criança.</p>
                <Button asChild variant="outline" className="mt-4 w-full border-[#ddc6ab] bg-[rgba(255,250,244,0.88)] text-[#29403a] shadow-[0_8px_18px_rgba(194,170,144,0.1)]">
                  <Link href="/signup">Criar conta</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
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
            opacity: 0.45;
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

        @keyframes axiora-login-rise {
          0% {
            opacity: 0;
            transform: translateY(22px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes axiora-login-soft-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-3px);
          }
        }

        .axiora-login-hero {
          animation: axiora-login-rise 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .axiora-login-panel {
          animation: axiora-login-rise 860ms cubic-bezier(0.22, 1, 0.36, 1) 80ms both;
        }

        .axiora-login-info-card {
          transition:
            transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 220ms cubic-bezier(0.22, 1, 0.36, 1),
            border-color 220ms ease;
        }

        .axiora-login-info-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 28px 58px rgba(4, 12, 8, 0.42);
          border-color: rgba(255, 255, 255, 0.18);
        }

        .axiora-login-chip {
          transition:
            transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .axiora-login-chip:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 18px rgba(6, 17, 28, 0.14);
        }

        @media (min-width: 1024px) {
          .axiora-login-panel {
            animation:
              axiora-login-rise 860ms cubic-bezier(0.22, 1, 0.36, 1) 80ms both,
              axiora-login-soft-float 6s ease-in-out 1.1s infinite;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .axion-float,
          .axion-glow,
          .axion-crown,
          .axion-blink,
          .axiora-login-hero,
          .axiora-login-panel {
            animation: none;
          }

          .axiora-login-info-card,
          .axiora-login-chip {
            transition: none;
          }

          .axiora-login-info-card:hover,
          .axiora-login-chip:hover {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
