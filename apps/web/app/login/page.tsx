"use client";

import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import Image from "next/image";

import { Eye, EyeOff, GraduationCap, Loader2, Lock, Mail, Star, Trophy, Users, Zap } from "lucide-react";

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
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleScriptReady, setGoogleScriptReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const syncViewport = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
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

  const compactDesktop = viewportWidth >= 1024 && viewportHeight <= 820;
  const shortDesktop = viewportWidth >= 1024 && viewportHeight <= 760;

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
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-[58%_center] bg-no-repeat"
        style={{ backgroundImage: "url('/axiora/auth/wallpaper.jpg')", backgroundColor: "#0b1420" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(90deg,rgba(6,14,22,0.82)_0%,rgba(10,22,32,0.52)_38%,rgba(16,28,32,0.18)_100%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_14%_20%,rgba(255,224,154,0.13),transparent_20%),radial-gradient(circle_at_82%_16%,rgba(150,234,221,0.1),transparent_22%),radial-gradient(circle_at_50%_100%,rgba(7,20,17,0.4),transparent_44%)]"
        aria-hidden="true"
      />

      <main className="axiora-brand-content axiora-login-fullscreen relative z-10 flex min-h-[100svh] w-full items-center overflow-hidden">
        <section className={`axiora-login-grid relative z-10 mx-auto grid w-full max-w-[1480px] items-center px-4 py-4 sm:px-6 lg:max-h-[100svh] lg:overflow-hidden lg:grid-cols-[1.1fr_0.9fr] ${compactDesktop ? "gap-5 lg:px-8 lg:py-3" : "gap-6 lg:px-10 lg:py-6"}`}>
          <div className={`axiora-login-hero flex flex-col justify-center rounded-[2rem] border border-white/8 bg-[rgba(8,18,28,0.16)] backdrop-blur-[1px] sm:p-8 lg:h-full lg:border-transparent lg:bg-transparent lg:items-start lg:justify-center lg:backdrop-blur-0 ${compactDesktop ? "gap-3 p-4 lg:p-5" : "gap-3 p-5 lg:p-8"}`}>
            <div className={`max-w-[36rem] text-white ${compactDesktop ? "space-y-2.5" : "space-y-3"}`}>
              {/* Mascot com aura radial */}
              <div className="relative w-fit">
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 rounded-full ${shortDesktop ? "h-[128px] w-[128px]" : compactDesktop ? "h-[144px] w-[144px]" : "h-[160px] w-[160px]"}`}
                  style={{ background: "radial-gradient(circle, rgba(251,191,36,0.26) 0%, rgba(238,135,72,0.12) 45%, transparent 72%)", filter: "blur(10px)" }}
                />
                <Image
                  src="/axiora/mascot/axiora-mascot.png"
                  alt="Mascote Axiora"
                  width={shortDesktop ? 94 : compactDesktop ? 108 : 120}
                  height={shortDesktop ? 94 : compactDesktop ? 108 : 120}
                  priority
                />
              </div>

              {/* Achievement notification — demonstra o produto */}
              <div className={`inline-flex items-center rounded-2xl border border-[rgba(52,211,153,0.28)] bg-[rgba(6,24,18,0.68)] shadow-[0_8px_28px_rgba(0,0,0,0.28)] backdrop-blur-sm ${shortDesktop ? "gap-2 px-3 py-1.5" : compactDesktop ? "gap-2.5 px-3.5 py-2" : "gap-2.5 px-3.5 py-2"}`}>
                <div className={`flex shrink-0 items-center justify-center rounded-full bg-[rgba(52,211,153,0.18)] ${shortDesktop ? "h-6 w-6" : "h-7 w-7"}`}>
                  <Trophy className="h-3.5 w-3.5 text-[#34d399]" strokeWidth={2.5} aria-hidden />
                </div>
                <div>
                  <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-[#34d399]">Missão concluída!</p>
                  <div className={`flex items-center gap-2 ${shortDesktop ? "mt-0.5" : "mt-1"}`}>
                    <div className={`h-1.5 overflow-hidden rounded-full bg-white/15 ${shortDesktop ? "w-16" : "w-20"}`}>
                      <div className="h-full w-[78%] rounded-full bg-[linear-gradient(90deg,#34d399,#6ee7b7)]" />
                    </div>
                    <span className="text-[0.62rem] font-black text-[#6ee7b7]">+120 XP</span>
                  </div>
                </div>
              </div>

              <div className={compactDesktop ? "space-y-2" : "space-y-2"}>
                <h1 className={`max-w-[10ch] text-4xl font-black uppercase leading-[0.81] tracking-[-0.045em] sm:text-5xl ${shortDesktop ? "lg:text-[3.15rem]" : compactDesktop ? "lg:text-[3.45rem]" : "lg:text-[3.8rem]"}`}>
                  <span className="block text-[#fffaf4] drop-shadow-[0_10px_22px_rgba(7,20,17,0.28)]">Abrir</span>
                  <span className="block bg-[linear-gradient(180deg,#fff1cf_0%,#f4ca97_44%,#de9b79_100%)] bg-clip-text text-transparent drop-shadow-[0_10px_26px_rgba(87,40,24,0.18)]">
                    caminhos.
                  </span>
                  <span className="block text-[#f4f6fb] drop-shadow-[0_10px_22px_rgba(7,20,17,0.28)]">Cultivar</span>
                  <span className="block bg-[linear-gradient(180deg,#f2f7f5_0%,#bddfd7_45%,#f6e8c8_100%)] bg-clip-text text-transparent drop-shadow-[0_10px_28px_rgba(13,49,52,0.14)]">
                    conquistas.
                  </span>
                </h1>
                <p className={`max-w-[33rem] font-semibold leading-[1.6] text-white/82 ${shortDesktop ? "text-[13px] leading-[1.45]" : compactDesktop ? "text-[13.5px] leading-[1.5]" : "text-sm"}`}>
                  Seu filho aprende jogando, ganha XP e sobe de nível — enquanto você acompanha cada conquista em tempo real.
                </p>
              </div>

              <div className={`grid gap-2 sm:grid-cols-3 ${compactDesktop ? "lg:gap-1.5" : ""}`}>
                {/* Famílias — âmbar quente */}
                <div className={`axiora-login-info-card relative overflow-hidden border border-[rgba(251,191,36,0.38)] bg-[linear-gradient(150deg,rgba(120,72,8,0.72),rgba(78,44,6,0.82))] backdrop-blur-md ${shortDesktop ? "rounded-[1.15rem] px-3 py-2.5 shadow-[0_12px_26px_rgba(60,28,4,0.32)]" : compactDesktop ? "rounded-[1.25rem] px-3.5 py-2.5 shadow-[0_14px_30px_rgba(60,28,4,0.35)]" : "rounded-[1.4rem] px-3.5 py-3 shadow-[0_16px_36px_rgba(60,28,4,0.38)]"}`}>
                  <div className="absolute inset-x-0 top-0 h-[2.5px] rounded-t-[1.7rem] bg-[linear-gradient(90deg,#fde68a,#f59e0b,#d97706)]" aria-hidden="true" />
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(253,230,138,0.14),transparent_55%)]" aria-hidden="true" />
                  <div className="relative">
                    <p className="inline-flex items-center gap-1.5 text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#fcd34d]">
                      <Users className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
                      Famílias
                    </p>
                    <p className="mt-1 text-xs font-bold leading-[1.5] text-white/90">Acompanhe o progresso do seu filho em tempo real.</p>
                  </div>
                </div>
                {/* Crianças — ciano/esmeralda */}
                <div className={`axiora-login-info-card relative overflow-hidden border border-[rgba(52,211,153,0.35)] bg-[linear-gradient(150deg,rgba(6,78,59,0.76),rgba(4,54,40,0.84))] backdrop-blur-md ${shortDesktop ? "rounded-[1.15rem] px-3 py-2.5 shadow-[0_12px_26px_rgba(4,40,28,0.32)]" : compactDesktop ? "rounded-[1.25rem] px-3.5 py-2.5 shadow-[0_14px_30px_rgba(4,40,28,0.35)]" : "rounded-[1.4rem] px-3.5 py-3 shadow-[0_16px_36px_rgba(4,40,28,0.40)]"}`}>
                  <div className="absolute inset-x-0 top-0 h-[2.5px] rounded-t-[1.7rem] bg-[linear-gradient(90deg,#6ee7b7,#34d399,#059669)]" aria-hidden="true" />
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(110,231,183,0.12),transparent_55%)]" aria-hidden="true" />
                  <div className="relative">
                    <p className="inline-flex items-center gap-1.5 text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#6ee7b7]">
                      <Star className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
                      Crianças
                    </p>
                    <p className="mt-1 text-xs font-bold leading-[1.5] text-white/90">Missões, XP e trilha própria para cada criança.</p>
                  </div>
                </div>
                {/* Escolas — índigo/violeta */}
                <div className={`axiora-login-info-card relative overflow-hidden border border-[rgba(165,180,252,0.32)] bg-[linear-gradient(150deg,rgba(49,42,150,0.74),rgba(30,26,100,0.84))] backdrop-blur-md ${shortDesktop ? "rounded-[1.15rem] px-3 py-2.5 shadow-[0_12px_26px_rgba(20,14,80,0.32)]" : compactDesktop ? "rounded-[1.25rem] px-3.5 py-2.5 shadow-[0_14px_30px_rgba(20,14,80,0.35)]" : "rounded-[1.4rem] px-3.5 py-3 shadow-[0_16px_36px_rgba(20,14,80,0.40)]"}`}>
                  <div className="absolute inset-x-0 top-0 h-[2.5px] rounded-t-[1.7rem] bg-[linear-gradient(90deg,#c4b5fd,#818cf8,#6366f1)]" aria-hidden="true" />
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(196,181,253,0.12),transparent_55%)]" aria-hidden="true" />
                  <div className="relative">
                    <p className="inline-flex items-center gap-1.5 text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#c4b5fd]">
                      <GraduationCap className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
                      Escolas
                    </p>
                    <p className="mt-1 text-xs font-bold leading-[1.5] text-white/90">Turmas, relatórios e fluxos de aprendizado unificados.</p>
                  </div>
                </div>
              </div>

              <div className={`flex flex-wrap items-center ${shortDesktop ? "hidden" : compactDesktop ? "gap-x-5 gap-y-2 pt-0.5" : "gap-x-6 gap-y-3"}`}>
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 shrink-0 text-[#fde68a]" strokeWidth={2.5} aria-hidden />
                  <span className="text-sm font-black text-white">12.000+</span>
                  <span className="text-sm font-semibold text-white/55">famílias</span>
                </div>
                <span className="text-white/20" aria-hidden>·</span>
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 shrink-0 text-[#6ee7b7]" strokeWidth={2.5} aria-hidden />
                  <span className="text-sm font-black text-white">2,4 M</span>
                  <span className="text-sm font-semibold text-white/55">missões</span>
                </div>
                <span className="text-white/20" aria-hidden>·</span>
                <div className="flex items-center gap-2">
                  <Star className="h-3.5 w-3.5 shrink-0 text-[#c4b5fd]" strokeWidth={2.5} aria-hidden />
                  <span className="text-sm font-black text-white">4,9</span>
                  <span className="text-sm font-semibold text-white/55">avaliação</span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex items-center justify-center lg:justify-end">
            <div className="absolute inset-0 hidden lg:block bg-[radial-gradient(circle_at_65%_50%,rgba(255,248,238,0.28),transparent_38%)]" aria-hidden="true" />
            <div className={`axiora-login-panel relative z-10 w-full overflow-hidden border border-[rgba(255,239,221,0.72)] bg-[linear-gradient(160deg,rgba(255,251,246,0.88)_0%,rgba(244,234,222,0.84)_100%)] backdrop-blur-2xl ${shortDesktop ? "max-w-[26.5rem] rounded-[1.85rem] p-3.5 shadow-[0_22px_54px_rgba(10,18,14,0.34),0_2px_0_rgba(255,255,255,0.55)_inset] sm:p-4" : compactDesktop ? "max-w-[27.75rem] rounded-[2rem] p-4 shadow-[0_26px_62px_rgba(10,18,14,0.37),0_2px_0_rgba(255,255,255,0.55)_inset] sm:p-[1.125rem]" : "max-w-[28.5rem] rounded-[2.15rem] p-4 shadow-[0_32px_80px_rgba(10,18,14,0.42),0_2px_0_rgba(255,255,255,0.55)_inset] sm:p-5"}`}>
              <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-[2.15rem] bg-[linear-gradient(90deg,#f6c870,#ee8748,#c8e6dc)]" aria-hidden="true" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),transparent_34%)]" aria-hidden="true" />
              <div className={`flex items-center gap-4 lg:hidden ${compactDesktop ? "mb-4" : "mb-6"}`}>
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
                <div className={`flex items-center gap-2.5 ${compactDesktop ? "mb-1.5" : "mb-2"}`}>
                  <div className="h-4 w-[3px] rounded-full bg-[linear-gradient(180deg,#ee8748,#f59e0b)]" aria-hidden="true" />
                  <p className="text-[0.7rem] font-black uppercase tracking-[0.24em] text-[#9c7c58]">Acesso principal</p>
                </div>
                <h2 className={`font-black leading-tight tracking-[-0.025em] text-[#203846] ${shortDesktop ? "text-[1.52rem]" : compactDesktop ? "text-[1.64rem]" : "text-[1.75rem]"}`}>Entrar no Axiora</h2>
                <p className={`max-w-[23rem] font-semibold text-[#5e605b] ${shortDesktop ? "mt-1 text-[13px] leading-5" : compactDesktop ? "mt-1 text-[13.5px] leading-5" : "mt-1.5 text-sm leading-5"}`}>
                  Use email e senha ou continue com Google. Se você tiver mais de um perfil, escolheremos juntos qual usar.
                </p>
              </div>

              <form className={`relative ${shortDesktop ? "mt-3 space-y-2.5" : compactDesktop ? "mt-3.5 space-y-2.5" : "mt-4 space-y-3"}`} onSubmit={handleEmailLogin}>
                <div className={compactDesktop ? "space-y-1.5" : "space-y-2"}>
                  <label className="block text-[0.78rem] font-black uppercase tracking-[0.18em] text-[#816b57]" htmlFor="email">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b09880]" aria-hidden />
                    <Input
                      id="email"
                      placeholder="voce@familia.com"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "login-error" : undefined}
                      className={`border-[rgba(230,213,195,0.92)] bg-[rgba(245,248,252,0.96)] pl-10 text-[#203846] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_12px_26px_rgba(194,170,144,0.16)] placeholder:text-[#9e9386] focus-visible:ring-[#ffb170] ${shortDesktop ? "h-9 rounded-[0.95rem]" : compactDesktop ? "h-9.5 rounded-[0.95rem]" : "h-10 rounded-[1rem]"}`}
                      required
                    />
                  </div>
                </div>

                <div className={compactDesktop ? "space-y-1.5" : "space-y-2"}>
                  <div className="flex items-center justify-between gap-3">
                    <label className="block text-[0.78rem] font-black uppercase tracking-[0.18em] text-[#816b57]" htmlFor="password">
                      Senha
                    </label>
                    <Link className="text-xs font-black text-[#a2602d] transition hover:text-[#7e4a23]" href="/reset-password">
                      Esqueci minha senha
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b09880]" aria-hidden />
                    <Input
                      id="password"
                      placeholder="Sua senha"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "login-error" : undefined}
                      className={`border-[rgba(230,213,195,0.92)] bg-[rgba(245,248,252,0.96)] pl-10 pr-11 text-[#203846] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_12px_26px_rgba(194,170,144,0.16)] placeholder:text-[#9e9386] focus-visible:ring-[#ffb170] ${shortDesktop ? "h-9 rounded-[0.95rem]" : compactDesktop ? "h-9.5 rounded-[0.95rem]" : "h-10 rounded-[1rem]"}`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#b09880] transition hover:text-[#7a5c40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffb170]"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <p
                  id="login-error"
                  role="alert"
                  aria-live="polite"
                  className={`rounded-2xl border px-4 text-sm font-bold transition-colors duration-200 ${compactDesktop ? "py-2" : "py-2.5"}`}
                  style={error ? {
                    borderColor: "rgba(210,100,50,0.30)",
                    background: "rgba(254,242,232,0.92)",
                    color: "#9b3a18",
                  } : {
                    borderColor: "transparent",
                    background: "transparent",
                    color: "transparent",
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                >
                  {error ?? "\u00A0"}
                </p>

                <Button className={`w-full bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] shadow-[inset_0_1px_0_rgba(255,219,190,0.46),0_6px_0_rgba(158,74,30,0.42),0_16px_24px_rgba(93,48,22,0.18)] ${shortDesktop ? "min-h-10" : compactDesktop ? "min-h-[42px]" : ""}`} type="submit" disabled={loading || googleLoading}>
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Entrando...
                    </span>
                  ) : "Entrar com email"}
                </Button>
              </form>

              <div className={`flex items-center gap-3 ${shortDesktop ? "my-2.5" : compactDesktop ? "my-3" : "my-3"}`}>
                <span className="h-px flex-1 bg-[linear-gradient(to_right,transparent,#dbcab6)]" />
                <span className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-[#8f7a65]">ou</span>
                <span className="h-px flex-1 bg-[linear-gradient(to_left,transparent,#dbcab6)]" />
              </div>

              {GOOGLE_CLIENT_ID ? (
                <div className={shortDesktop ? "space-y-2" : compactDesktop ? "space-y-2.5" : "space-y-3"}>
                  <div
                    className={`rounded-[1.5rem] border border-[rgba(233,217,200,0.88)] bg-[rgba(255,255,255,0.8)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_14px_28px_rgba(194,170,144,0.14)] ${googleLoading ? "pointer-events-none opacity-70" : ""}`}
                  >
                    <div ref={googleButtonRef} className="flex min-h-[44px] items-center justify-center" aria-label="Entrar com Google" />
                  </div>
                  <p className={`font-semibold text-[#6f665d] ${shortDesktop ? "text-[11px] leading-4.5" : compactDesktop ? "text-[11.5px] leading-5" : "text-xs leading-5"}`}>
                    Primeira vez? Sua conta familiar é criada automaticamente.
                  </p>
                </div>
              ) : (
                <div className={`rounded-[1.5rem] border border-dashed border-[#d5c3ae] bg-[rgba(255,255,255,0.6)] px-4 font-semibold text-[#706257] ${shortDesktop ? "py-2.5 text-[13px] leading-5" : compactDesktop ? "py-3 text-[13.5px] leading-5" : "py-3 text-sm leading-6"}`}>
                  Login com Google será habilitado nesta organização assim que a configuração de acesso for concluída.
                </div>
              )}

              <div className={`rounded-[1.55rem] border border-[rgba(234,220,202,0.9)] bg-[rgba(255,255,255,0.62)] px-4 text-sm text-[#5f5a52] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_12px_22px_rgba(194,170,144,0.1)] ${shortDesktop ? "mt-2.5 py-2.5" : compactDesktop ? "mt-3 py-3" : "mt-3 py-3"}`}>
                <p className="font-bold text-[#27404a]">Novo aqui?</p>
                <p className={`mt-1 font-semibold ${compactDesktop ? "leading-5" : "leading-6"}`}>Crie sua conta e comece em minutos.</p>
                <div className={`grid gap-2 ${shortDesktop ? "mt-2.5" : compactDesktop ? "mt-2.5" : "mt-3"} ${GOOGLE_CLIENT_ID ? "sm:grid-cols-2" : ""}`}>
                <Button asChild variant="outline" className={`w-full border-[#ddc6ab] bg-[rgba(255,250,244,0.88)] text-[#29403a] shadow-[0_8px_18px_rgba(194,170,144,0.1)] ${shortDesktop ? "min-h-10" : compactDesktop ? "min-h-[42px]" : ""}`}>
                  <Link href="/signup">Criar conta gratuitamente</Link>
                </Button>
                {GOOGLE_CLIENT_ID ? (
                  <Button asChild variant="outline" className={`w-full border-[rgba(216,196,172,0.96)] bg-[rgba(255,255,255,0.9)] text-[#6d5844] shadow-[0_8px_18px_rgba(194,170,144,0.08)] hover:bg-[rgba(255,252,247,0.96)] ${shortDesktop ? "min-h-10" : compactDesktop ? "min-h-[42px]" : ""}`}>
                    <Link href="/signup">Criar conta com Google</Link>
                  </Button>
                ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

    </div>
  );
}
