"use client";

import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage, getLegalStatus, googleLogin, listMemberships, type PrimaryLoginResponse, selectTenant, signup } from "@/lib/api/client";
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

export default function SignupPage() {
  const router = useRouter();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleCredentialHandlerRef = useRef<(credential?: string) => Promise<void>>(async () => {});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [familyName, setFamilyName] = useState("");
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

    router.push("/select-child");
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      clearTokens();
      clearTenantSlug();

      const tokens = await signup({
        name,
        email,
        password,
        family_name: familyName,
      });
      setAccessToken(tokens.access_token);

      const memberships = await listMemberships();
      const familyMembership = memberships[0];
      if (!familyMembership) {
        throw new Error("Missing membership after signup");
      }

      setTenantSlug(familyMembership.tenant_slug);
      router.push("/onboarding");
    } catch (err) {
      clearTokens();
      clearTenantSlug();
      setError(getApiErrorMessage(err, "Não foi possível criar sua conta. Revise os dados e tente novamente."));
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
      clearTokens();
      clearTenantSlug();
      const loginResponse = await googleLogin(credential);
      await finishPrimaryLogin(loginResponse);
    } catch (err) {
      clearTokens();
      clearTenantSlug();
      setError(getApiErrorMessage(err, "Não foi possível criar ou acessar sua conta com Google agora."));
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
        className="pointer-events-none fixed left-[-12px] top-[-12px] z-0 h-[calc(100vh+24px)] w-[calc(100vw+24px)] bg-[linear-gradient(90deg,rgba(8,18,27,0.7)_0%,rgba(10,24,35,0.46)_34%,rgba(16,30,34,0.22)_100%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed left-[-12px] top-[-12px] z-0 h-[calc(100vh+24px)] w-[calc(100vw+24px)] bg-[radial-gradient(circle_at_14%_20%,rgba(255,224,154,0.13),transparent_20%),radial-gradient(circle_at_82%_16%,rgba(150,234,221,0.1),transparent_22%),radial-gradient(circle_at_50%_100%,rgba(7,20,17,0.4),transparent_44%)]"
        aria-hidden="true"
      />

      <main className="axiora-brand-content relative z-10 min-h-screen w-full overflow-hidden">
        <section className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1480px] items-center gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-10 lg:py-10">
          <div className="axiora-signup-hero flex min-h-[44vh] flex-col justify-start gap-8 rounded-[2rem] border border-white/8 bg-[rgba(8,18,28,0.16)] p-5 backdrop-blur-[1px] sm:p-8 lg:min-h-[78vh] lg:border-transparent lg:bg-transparent lg:p-8 lg:backdrop-blur-0">
            <div className="flex items-start justify-between gap-4 lg:pt-3">
              <div />
              <div className="hidden lg:block lg:translate-y-[-0.8rem] lg:scale-[0.8]">
                <AxionMascot />
              </div>
            </div>

            <div className="max-w-[37rem] space-y-6 pt-2 text-white lg:pt-8">
              <div className="space-y-4">
                <h1 className="max-w-[11ch] text-4xl font-black uppercase leading-[0.81] tracking-[-0.045em] sm:text-5xl lg:text-[5rem]">
                  <span className="block text-[#fffaf4] drop-shadow-[0_10px_22px_rgba(7,20,17,0.28)]">Criar</span>
                  <span className="block bg-[linear-gradient(180deg,#fff1cf_0%,#f4ca97_44%,#de9b79_100%)] bg-clip-text text-transparent drop-shadow-[0_10px_26px_rgba(87,40,24,0.18)]">
                    presença.
                  </span>
                  <span className="block text-[#f4f6fb] drop-shadow-[0_10px_22px_rgba(7,20,17,0.28)]">Cultivar</span>
                  <span className="block bg-[linear-gradient(180deg,#f2f7f5_0%,#bddfd7_45%,#f6e8c8_100%)] bg-clip-text text-transparent drop-shadow-[0_10px_28px_rgba(13,49,52,0.14)]">
                    caminhos.
                  </span>
                </h1>
                <p className="max-w-[34rem] text-base font-semibold leading-7 text-white/82 lg:text-[1.01rem]">
                  Comece a jornada da sua família com consentimento, perfis e acompanhamento em uma experiência segura, clara e acolhedora.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="axiora-signup-info-card relative overflow-hidden rounded-[1.7rem] border border-[rgba(255,235,210,0.78)] bg-[linear-gradient(180deg,rgba(255,251,246,0.98),rgba(242,232,220,0.93))] px-4 py-5 shadow-[0_24px_54px_rgba(6,17,28,0.24)]">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#f6dfb7,#e8b97c)]" aria-hidden="true" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.86),transparent_38%)]" aria-hidden="true" />
                  <div className="relative">
                    <p className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#a67845]">Famílias</p>
                    <p className="mt-2 text-sm font-black leading-[1.75] text-[#183654]">Cadastro inicial com base pronta para onboarding e consentimento.</p>
                  </div>
                </div>
                <div className="axiora-signup-info-card relative overflow-hidden rounded-[1.7rem] border border-[rgba(218,243,237,0.78)] bg-[linear-gradient(180deg,rgba(250,255,253,0.98),rgba(227,241,237,0.93))] px-4 py-5 shadow-[0_24px_54px_rgba(6,17,28,0.24)]">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#d7f1eb,#7fd8c5)]" aria-hidden="true" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.88),transparent_38%)]" aria-hidden="true" />
                  <div className="relative">
                    <p className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#3a8e83]">Crianças</p>
                    <p className="mt-2 text-sm font-black leading-[1.75] text-[#163752]">Perfis e trilhas organizados desde o primeiro acesso.</p>
                  </div>
                </div>
                <div className="axiora-signup-info-card relative overflow-hidden rounded-[1.7rem] border border-[rgba(244,221,212,0.78)] bg-[linear-gradient(180deg,rgba(255,251,249,0.98),rgba(244,231,224,0.93))] px-4 py-5 shadow-[0_24px_54px_rgba(6,17,28,0.24)]">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#f6ddd3,#e8ab92)]" aria-hidden="true" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.88),transparent_38%)]" aria-hidden="true" />
                  <div className="relative">
                    <p className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#b67357]">Google</p>
                    <p className="mt-2 text-sm font-black leading-[1.75] text-[#183654]">Primeiro acesso com criação automática da conta familiar.</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-white/72">
                <span className="axiora-signup-chip rounded-full border border-[rgba(255,235,208,0.52)] bg-[rgba(255,248,237,0.92)] px-3 py-2 text-[#7d6645] shadow-[0_4px_10px_rgba(6,17,28,0.1)]">Onboarding guiado</span>
                <span className="axiora-signup-chip rounded-full border border-[rgba(244,221,212,0.52)] bg-[rgba(255,248,245,0.92)] px-3 py-2 text-[#8e6555] shadow-[0_4px_10px_rgba(6,17,28,0.1)]">Cadastro com Google</span>
              </div>
            </div>
          </div>

          <div className="relative flex items-center justify-center lg:justify-end">
            <div className="absolute inset-0 hidden lg:block bg-[radial-gradient(circle_at_65%_50%,rgba(255,248,238,0.18),transparent_34%)]" aria-hidden="true" />
            <div className="axiora-signup-panel relative z-10 w-full max-w-[29rem] overflow-hidden rounded-[2.15rem] border border-[rgba(255,239,221,0.84)] bg-[linear-gradient(180deg,rgba(255,252,248,0.96),rgba(242,234,225,0.91))] p-5 shadow-[0_30px_74px_rgba(15,24,22,0.34)] backdrop-blur-xl sm:p-6">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#f3d7b0,#eeb17d,#dcefe8)]" aria-hidden="true" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),transparent_34%)]" aria-hidden="true" />

              <div className="mb-6 flex items-center gap-4 lg:hidden">
                <div className="shrink-0">
                  <AxionMascot />
                </div>
                <div>
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[#8b755d]">Novo acesso</p>
                  <h2 className="mt-1 text-2xl font-black text-[#22352f]">Criar conta</h2>
                </div>
              </div>

              <div className="relative hidden lg:block">
                <p className="text-[0.7rem] font-black uppercase tracking-[0.24em] text-[#9c7c58]">Novo acesso</p>
                <h2 className="mt-2 text-[2.05rem] font-black leading-tight tracking-[-0.025em] text-[#203846]">Criar conta no Axiora</h2>
                <p className="mt-3 max-w-[23rem] text-sm font-semibold leading-6 text-[#5e605b]">
                  Cadastre sua família com email e senha ou continue com Google para iniciar o onboarding com menos atrito.
                </p>
              </div>

              <form className="relative mt-6 space-y-4" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <label className="block text-[0.78rem] font-black uppercase tracking-[0.18em] text-[#816b57]" htmlFor="name">
                    Nome
                  </label>
                  <Input
                    id="name"
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "signup-error" : undefined}
                    className="h-12 rounded-[1.15rem] border-[rgba(230,213,195,0.92)] bg-[rgba(245,248,252,0.96)] text-[#203846] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_12px_26px_rgba(194,170,144,0.16)] placeholder:text-[#9e9386] focus-visible:ring-[#ffb170]"
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
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
                      aria-describedby={error ? "signup-error" : undefined}
                      className="h-12 rounded-[1.15rem] border-[rgba(230,213,195,0.92)] bg-[rgba(245,248,252,0.96)] text-[#203846] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_12px_26px_rgba(194,170,144,0.16)] placeholder:text-[#9e9386] focus-visible:ring-[#ffb170]"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[0.78rem] font-black uppercase tracking-[0.18em] text-[#816b57]" htmlFor="familyName">
                      Família
                    </label>
                    <Input
                      id="familyName"
                      placeholder="Ex: Família Silva"
                      value={familyName}
                      onChange={(e) => setFamilyName(e.target.value)}
                      autoComplete="organization"
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "signup-error" : undefined}
                      className="h-12 rounded-[1.15rem] border-[rgba(230,213,195,0.92)] bg-[rgba(245,248,252,0.96)] text-[#203846] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_12px_26px_rgba(194,170,144,0.16)] placeholder:text-[#9e9386] focus-visible:ring-[#ffb170]"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[0.78rem] font-black uppercase tracking-[0.18em] text-[#816b57]" htmlFor="password">
                    Senha
                  </label>
                  <Input
                    id="password"
                    placeholder="Crie uma senha"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "signup-error" : undefined}
                    className="h-12 rounded-[1.15rem] border-[rgba(230,213,195,0.92)] bg-[rgba(245,248,252,0.96)] text-[#203846] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_12px_26px_rgba(194,170,144,0.16)] placeholder:text-[#9e9386] focus-visible:ring-[#ffb170]"
                    required
                  />
                </div>

                {error ? (
                  <p id="signup-error" role="alert" aria-live="polite" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                    {error}
                  </p>
                ) : null}

                <Button className="w-full bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] shadow-[inset_0_1px_0_rgba(255,219,190,0.46),0_6px_0_rgba(158,74,30,0.42),0_16px_24px_rgba(93,48,22,0.18)]" type="submit" disabled={loading || googleLoading}>
                  {loading ? "Criando conta..." : "Criar conta com email"}
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
                    <div ref={googleButtonRef} className="flex min-h-[44px] items-center justify-center" aria-label="Criar conta com Google" />
                  </div>
                  <p className="text-xs font-semibold leading-5 text-[#6f665d]">
                    No primeiro acesso com Google, criamos sua conta, sua organização familiar e iniciamos o onboarding automaticamente.
                  </p>
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-[#d5c3ae] bg-[rgba(255,255,255,0.6)] px-4 py-3 text-sm font-semibold leading-6 text-[#706257]">
                  Cadastro com Google será habilitado nesta organização assim que a configuração de acesso for concluída.
                </div>
              )}

              <div className="mt-6 rounded-[1.55rem] border border-[rgba(234,220,202,0.9)] bg-[rgba(255,255,255,0.62)] px-4 py-4 text-sm text-[#5f5a52] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_12px_22px_rgba(194,170,144,0.1)]">
                <p className="font-bold text-[#27404a]">Já tem conta?</p>
                <p className="mt-1 font-semibold leading-6">Entre com email ou Google para acessar sua família, perfis e próximos passos do onboarding.</p>
                <Button asChild variant="outline" className="mt-4 w-full border-[#ddc6ab] bg-[rgba(255,250,244,0.88)] text-[#29403a] shadow-[0_8px_18px_rgba(194,170,144,0.1)]">
                  <Link href="/login">Entrar</Link>
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

        @keyframes axiora-signup-rise {
          0% {
            opacity: 0;
            transform: translateY(22px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .axiora-signup-hero {
          animation: axiora-signup-rise 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .axiora-signup-panel {
          animation: axiora-signup-rise 860ms cubic-bezier(0.22, 1, 0.36, 1) 80ms both;
        }

        .axiora-signup-info-card {
          transition:
            transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 220ms cubic-bezier(0.22, 1, 0.36, 1),
            border-color 220ms ease;
        }

        .axiora-signup-info-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 28px 58px rgba(6, 17, 28, 0.28);
        }

        .axiora-signup-chip {
          transition:
            transform 180ms ease,
            box-shadow 180ms ease,
            background-color 180ms ease;
        }

        .axiora-signup-chip:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(6, 17, 28, 0.12);
        }

        @media (prefers-reduced-motion: reduce) {
          .axion-float,
          .axion-glow,
          .axion-crown,
          .axion-blink,
          .axiora-signup-hero,
          .axiora-signup-panel {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
