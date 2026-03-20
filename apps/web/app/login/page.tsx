"use client";

import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import Image from "next/image";

import { ArrowRight, Eye, EyeOff, GraduationCap, Loader2, Lock, Mail, Star, Trophy, Users, Zap } from "lucide-react";

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
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
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
    <div className="axiora-brand-page relative isolate flex h-dvh flex-col overflow-hidden">
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
        <section className={`axiora-login-grid relative z-10 mx-auto grid w-full max-w-[1480px] items-center overflow-x-clip px-4 py-4 sm:px-6 lg:max-h-[100svh] lg:overflow-hidden lg:grid-cols-[1.1fr_0.9fr] ${compactDesktop ? "gap-2 lg:gap-5 lg:px-8 lg:py-3" : "gap-2 lg:gap-6 lg:px-10 lg:py-6"}`}>
          <div className={`axiora-login-hero min-w-0 flex flex-col justify-center border-transparent bg-transparent lg:h-full lg:items-start lg:justify-center ${compactDesktop ? "gap-3 px-2 py-1 lg:p-5" : "gap-3 px-2 py-1 lg:p-8"}`}>
            <div className={`max-w-[36rem] text-white space-y-2 ${compactDesktop ? "lg:space-y-2.5" : "lg:space-y-3"}`}>
              {/* Mascot com aura radial — apenas desktop */}
              <div className="relative hidden w-fit lg:block">
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
                  style={{ filter: "drop-shadow(0 8px 28px rgba(251,191,36,0.48)) drop-shadow(0 2px 10px rgba(238,135,72,0.32))" }}
                />
              </div>

              {/* Achievement notification — demonstra o produto */}
              <div className={`inline-flex items-center rounded-2xl border border-[rgba(52,211,153,0.36)] bg-[rgba(6,24,18,0.72)] shadow-[0_8px_28px_rgba(0,0,0,0.28),0_0_18px_rgba(52,211,153,0.18)] backdrop-blur-sm ${shortDesktop ? "gap-2 px-3 py-1.5" : compactDesktop ? "gap-2.5 px-3.5 py-2" : "gap-2.5 px-3.5 py-2"}`}>
                <div className={`flex shrink-0 items-center justify-center rounded-full bg-[rgba(52,211,153,0.18)] ${shortDesktop ? "h-6 w-6" : "h-7 w-7"}`}>
                  <Trophy className="h-3.5 w-3.5 text-[#34d399]" strokeWidth={2.5} aria-hidden />
                </div>
                <div>
                  <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-[#34d399]">Missão concluída!</p>
                  <div className={`flex items-center gap-2 ${shortDesktop ? "mt-0.5" : "mt-1"}`}>
                    <div className={`h-1.5 overflow-hidden rounded-full bg-white/15 ${shortDesktop ? "w-16" : "w-20"}`}>
                      <div className="h-full w-[78%] rounded-full bg-[linear-gradient(90deg,#34d399,#6ee7b7)] motion-safe:animate-pulse" />
                    </div>
                    <span className="text-[0.62rem] font-black text-[#6ee7b7]">+120 XP</span>
                  </div>
                </div>
              </div>

              <div className={compactDesktop ? "space-y-2" : "space-y-2"}>
                <div className="flex items-center gap-1 lg:block">
                  <h1 className={`flex-1 text-[2rem] font-black uppercase leading-[0.85] tracking-[-0.04em] sm:text-4xl ${shortDesktop ? "lg:text-[3.15rem]" : compactDesktop ? "lg:text-[3.45rem]" : "lg:text-[3.8rem]"} lg:max-w-[10ch] lg:leading-[0.81] lg:tracking-[-0.045em]`}>
                    <span className="block text-[#fffaf4] drop-shadow-[0_10px_22px_rgba(7,20,17,0.28)]">Abrir</span>
                    <span className="block bg-[linear-gradient(180deg,#fff1cf_0%,#f4ca97_44%,#de9b79_100%)] bg-clip-text text-transparent drop-shadow-[0_10px_26px_rgba(87,40,24,0.18)]">
                      caminhos.
                    </span>
                    <span className="block text-[#f4f6fb] drop-shadow-[0_10px_22px_rgba(7,20,17,0.28)]">Cultivar</span>
                    <span className="block bg-[linear-gradient(180deg,#f2f7f5_0%,#bddfd7_45%,#f6e8c8_100%)] bg-clip-text text-transparent drop-shadow-[0_10px_28px_rgba(13,49,52,0.14)]">
                      conquistas.
                    </span>
                  </h1>
                  {/* Mascote — direita da copy, apenas mobile */}
                  <div className="relative shrink-0 lg:hidden" aria-hidden="true">
                    <div
                      className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{ background: "radial-gradient(circle, rgba(251,191,36,0.38) 0%, rgba(238,135,72,0.18) 50%, transparent 75%)", filter: "blur(14px)" }}
                    />
                    <Image
                      src="/axiora/mascot/axiora-mascot.png"
                      alt="Mascote Axiora"
                      width={124}
                      height={124}
                      style={{ filter: "drop-shadow(0 8px 24px rgba(251,191,36,0.58)) drop-shadow(0 2px 10px rgba(238,135,72,0.34))" }}
                    />
                  </div>
                </div>
                <p className={`hidden max-w-[33rem] font-semibold leading-[1.6] text-white/82 lg:block ${shortDesktop ? "text-[13px] leading-[1.45]" : compactDesktop ? "text-[13.5px] leading-[1.5]" : "text-sm"}`}>
                  Seu filho aprende jogando, ganha XP e sobe de nível — enquanto você acompanha cada conquista em tempo real.
                </p>
              </div>

              <div className={`hidden gap-2 lg:grid lg:grid-cols-3 ${compactDesktop ? "lg:gap-1.5" : ""}`}>
                {/* Famílias — âmbar quente */}
                <div className={`axiora-login-info-card relative overflow-hidden border border-[rgba(251,191,36,0.38)] bg-[linear-gradient(150deg,rgba(120,72,8,0.72),rgba(78,44,6,0.82))] backdrop-blur-md transition-all duration-200 hover:border-[rgba(251,191,36,0.60)] hover:brightness-110 ${shortDesktop ? "rounded-[1.15rem] px-3 py-2.5 shadow-[0_12px_26px_rgba(60,28,4,0.32)]" : compactDesktop ? "rounded-[1.25rem] px-3.5 py-2.5 shadow-[0_14px_30px_rgba(60,28,4,0.35)]" : "rounded-[1.4rem] px-3.5 py-3 shadow-[0_16px_36px_rgba(60,28,4,0.38)]"}`}>
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
                <div className={`axiora-login-info-card relative overflow-hidden border border-[rgba(52,211,153,0.35)] bg-[linear-gradient(150deg,rgba(6,78,59,0.76),rgba(4,54,40,0.84))] backdrop-blur-md transition-all duration-200 hover:border-[rgba(52,211,153,0.58)] hover:brightness-110 ${shortDesktop ? "rounded-[1.15rem] px-3 py-2.5 shadow-[0_12px_26px_rgba(4,40,28,0.32)]" : compactDesktop ? "rounded-[1.25rem] px-3.5 py-2.5 shadow-[0_14px_30px_rgba(4,40,28,0.35)]" : "rounded-[1.4rem] px-3.5 py-3 shadow-[0_16px_36px_rgba(4,40,28,0.40)]"}`}>
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
                <div className={`axiora-login-info-card relative overflow-hidden border border-[rgba(165,180,252,0.32)] bg-[linear-gradient(150deg,rgba(49,42,150,0.74),rgba(30,26,100,0.84))] backdrop-blur-md transition-all duration-200 hover:border-[rgba(165,180,252,0.55)] hover:brightness-110 ${shortDesktop ? "rounded-[1.15rem] px-3 py-2.5 shadow-[0_12px_26px_rgba(20,14,80,0.32)]" : compactDesktop ? "rounded-[1.25rem] px-3.5 py-2.5 shadow-[0_14px_30px_rgba(20,14,80,0.35)]" : "rounded-[1.4rem] px-3.5 py-3 shadow-[0_16px_36px_rgba(20,14,80,0.40)]"}`}>
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

              <div className={`hidden flex-wrap items-center lg:flex ${shortDesktop ? "lg:hidden" : compactDesktop ? "gap-x-5 gap-y-2 pt-0.5" : "gap-x-6 gap-y-3"}`}>
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

          <div className="relative min-w-0 flex items-center justify-center pt-0 lg:justify-end lg:pt-0">
            <div className={`axiora-login-panel relative z-10 w-full overflow-hidden border border-[rgba(255,239,221,0.72)] bg-[linear-gradient(160deg,rgba(255,251,246,0.88)_0%,rgba(244,234,222,0.84)_100%)] backdrop-blur-2xl ${shortDesktop ? "max-w-[26.5rem] rounded-[1.85rem] p-3.5 shadow-[0_22px_54px_rgba(10,18,14,0.34),0_2px_0_rgba(255,255,255,0.55)_inset] sm:p-4" : compactDesktop ? "max-w-[27.75rem] rounded-[2rem] p-4 shadow-[0_26px_62px_rgba(10,18,14,0.37),0_2px_0_rgba(255,255,255,0.55)_inset] sm:p-[1.125rem]" : "max-w-[28.5rem] rounded-[2.15rem] p-4 shadow-[0_24px_56px_-8px_rgba(10,18,14,0.42),0_2px_0_rgba(255,255,255,0.55)_inset] sm:p-5"}`}>
              {/* Stripe topo com glow */}
              <div className="absolute inset-x-0 top-0 h-1.5 rounded-t-[2.15rem] bg-[linear-gradient(90deg,#f6c870,#ee8748_40%,#e07060_60%,#c8e6dc)]" aria-hidden="true" />
              <div className="absolute inset-x-0 top-0 h-8 rounded-t-[2.15rem] bg-[linear-gradient(180deg,rgba(238,135,72,0.10),transparent)]" aria-hidden="true" />
              {/* Luz ambiente interior */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.94),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(255,220,170,0.10),transparent_44%)]" aria-hidden="true" />
              <div className={`text-center lg:hidden ${compactDesktop ? "mb-3" : "mb-4"}`}>
                <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[#8b755d]">Axiora Path</p>
                <h2 className="mt-0.5 text-xl font-black leading-tight text-[#22352f]">Entrar <span className="font-normal">na sua</span> conta</h2>
              </div>

              <div className="relative hidden lg:block">
                <div className={`${compactDesktop ? "mb-2" : "mb-3"}`}>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(238,135,72,0.28)] bg-[rgba(238,135,72,0.08)] px-3 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#ee8748]" aria-hidden="true" />
                    <span className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-[#b06030]">Acesso principal</span>
                  </span>
                </div>
                <h2 className={`font-black leading-[1.05] tracking-[-0.03em] text-[#1a2e38] ${shortDesktop ? "text-[1.6rem]" : compactDesktop ? "text-[1.75rem]" : "text-[2rem]"}`}>
                  Entrar no{" "}
                  <span className="bg-[linear-gradient(135deg,#ee8748,#d4600a)] bg-clip-text text-transparent">Axiora</span>
                </h2>
                <p className={`max-w-[23rem] font-medium text-[#6b6560] ${shortDesktop ? "mt-1.5 text-[12.5px] leading-5" : compactDesktop ? "mt-1.5 text-[13px] leading-5" : "mt-2 text-[13.5px] leading-[1.55]"}`}>
                  Use email e senha ou continue com Google. Com mais de um perfil, escolheremos juntos qual usar.
                </p>
              </div>

              <form className={`relative ${shortDesktop ? "mt-2.5 space-y-2" : compactDesktop ? "mt-3 space-y-2.5" : "mt-3 space-y-2.5"}`} onSubmit={handleEmailLogin}>
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
                      className={`border-[rgba(210,185,162,0.80)] bg-[rgba(255,252,246,0.96)] pl-10 text-[#1e2e3a] shadow-[inset_0_2px_4px_rgba(180,140,100,0.10),0_1px_0_rgba(255,255,255,0.95)] placeholder:text-[#b0a090] transition-shadow focus-visible:ring-[#ee8748] focus-visible:shadow-[inset_0_2px_4px_rgba(180,140,100,0.08),0_0_0_3px_rgba(238,135,72,0.12)] ${shortDesktop ? "h-9 rounded-[0.95rem]" : compactDesktop ? "h-9.5 rounded-[0.95rem]" : "h-10 rounded-[1rem]"}`}
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
                      className={`border-[rgba(210,185,162,0.80)] bg-[rgba(255,252,246,0.96)] pl-10 pr-11 text-[#1e2e3a] shadow-[inset_0_2px_4px_rgba(180,140,100,0.10),0_1px_0_rgba(255,255,255,0.95)] placeholder:text-[#b0a090] transition-shadow focus-visible:ring-[#ee8748] focus-visible:shadow-[inset_0_2px_4px_rgba(180,140,100,0.08),0_0_0_3px_rgba(238,135,72,0.12)] ${shortDesktop ? "h-9 rounded-[0.95rem]" : compactDesktop ? "h-9.5 rounded-[0.95rem]" : "h-10 rounded-[1rem]"}`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-[#b09880] transition hover:text-[#7a5c40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffb170]"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p
                    id="login-error"
                    role="alert"
                    aria-live="polite"
                    className={`rounded-2xl border px-4 text-sm font-bold ${compactDesktop ? "py-1.5" : "py-2"}`}
                    style={{ borderColor: "rgba(210,100,50,0.30)", background: "rgba(254,242,232,0.92)", color: "#9b3a18" }}
                  >
                    {error}
                  </p>
                )}

                <Button className={`w-full bg-[linear-gradient(180deg,#f49552_0%,#ee8748_35%,#d4600a_100%)] font-black tracking-wide shadow-[inset_0_1px_0_rgba(255,230,190,0.55),inset_0_-1px_0_rgba(120,50,10,0.20),0_6px_0_rgba(148,64,18,0.50),0_14px_28px_rgba(93,48,22,0.22)] transition-all duration-150 hover:shadow-[inset_0_1px_0_rgba(255,230,190,0.55),inset_0_-1px_0_rgba(120,50,10,0.20),0_3px_0_rgba(148,64,18,0.50),0_8px_18px_rgba(93,48,22,0.20)] hover:translate-y-[2px] active:translate-y-[5px] active:shadow-[inset_0_1px_0_rgba(255,230,190,0.40),0_1px_0_rgba(148,64,18,0.50),0_4px_12px_rgba(93,48,22,0.18)] ${shortDesktop ? "min-h-10" : compactDesktop ? "min-h-[42px]" : ""}`} type="submit" disabled={loading || googleLoading}>
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Entrando...
                    </span>
                  ) : "Entrar com email"}
                </Button>
              </form>

              <div className={`flex items-center gap-3 ${shortDesktop ? "my-2" : compactDesktop ? "my-2.5" : "my-2.5"}`}>
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
                  <p className={`hidden font-semibold text-[#6f665d] lg:block ${shortDesktop ? "text-[11px] leading-4.5" : compactDesktop ? "text-[11.5px] leading-5" : "text-xs leading-5"}`}>
                    Primeira vez? Sua conta familiar é criada automaticamente.
                  </p>
                </div>
              ) : (
                <div className={`rounded-[1.5rem] border border-dashed border-[#d5c3ae] bg-[rgba(255,255,255,0.6)] px-4 font-semibold text-[#706257] ${shortDesktop ? "py-2.5 text-[13px] leading-5" : compactDesktop ? "py-3 text-[13.5px] leading-5" : "py-3 text-sm leading-6"}`}>
                  Login com Google será habilitado nesta organização assim que a configuração de acesso for concluída.
                </div>
              )}

              {/* Separador + CTA de cadastro */}
              <div className={`${shortDesktop ? "mt-2.5" : "mt-3"}`}>
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-[linear-gradient(to_right,transparent,rgba(200,175,148,0.45))]" />
                  <span className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[#a8947c]">Novo aqui?</span>
                  <span className="h-px flex-1 bg-[linear-gradient(to_left,transparent,rgba(200,175,148,0.45))]" />
                </div>
                <Link
                  href="/signup"
                  className={`group mt-3 flex w-full items-center justify-center gap-2 rounded-[1.15rem] border border-[rgba(238,135,72,0.22)] bg-[linear-gradient(135deg,rgba(255,248,238,0.90),rgba(255,238,218,0.80))] font-bold text-[#b05c22] shadow-[inset_0_1px_0_rgba(255,255,255,0.80),0_2px_8px_rgba(238,135,72,0.08)] transition-all duration-200 hover:border-[rgba(238,135,72,0.40)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.80),0_4px_14px_rgba(238,135,72,0.14)] ${shortDesktop ? "py-2.5 text-[13px]" : "py-3 text-sm"}`}
                >
                  Criar conta gratuita
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="absolute bottom-0 left-0 right-0 z-20 py-4 text-center">
        <p className="text-[11px] text-white/25">
          <Link href="/privacidade" className="transition hover:text-white/50">Privacidade</Link>
          <span className="mx-2 text-white/15">·</span>
          <Link href="/termos" className="transition hover:text-white/50">Termos de uso</Link>
          <span className="mx-2 text-white/15">·</span>
          <span>© 2026 Axiora Educação Digital</span>
        </p>
      </footer>
    </div>
  );
}
