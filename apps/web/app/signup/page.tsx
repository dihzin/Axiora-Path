"use client";

import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { AxioraLogo } from "@/components/brand/axiora-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthWallpaper } from "@/components/layout/auth-wallpaper";
import { getApiErrorMessage, getLegalStatus, googleLogin, listMemberships, type PrimaryLoginResponse, selectTenant, signup } from "@/lib/api/client";
import { clearTenantSlug, clearTokens, setAccessToken, setTenantSlug } from "@/lib/api/session";
import { signupSchema } from "@/lib/schemas";

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
    <div className="axion-float axion-glow relative mx-auto h-[112px] w-[112px]">
      <Image
        src="/axiora/mascot/axiora-mascot.png"
        alt="Mascote Axiora"
        fill
        sizes="112px"
        className="object-contain"
        priority
      />
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleCredentialHandlerRef = useRef<(credential?: string) => Promise<void>>(async () => {});
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleScriptReady, setGoogleScriptReady] = useState(false);

  useEffect(() => {
    if (GOOGLE_CLIENT_ID && window.google) {
      setGoogleScriptReady(true);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextFromQuery = params.get("next");
    if (nextFromQuery && nextFromQuery.startsWith("/")) {
      setNextPath(nextFromQuery);
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

    router.push(nextPath ?? "/select-child");
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const validation = signupSchema.safeParse({ name, familyName, email, password });
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }
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

      <AuthWallpaper />

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
                <AxioraLogo size="md" priority className="w-[170px] border-white/12 bg-[rgba(12,16,22,0.34)] shadow-[0_16px_36px_rgba(0,0,0,0.22)] sm:w-[205px]" alt="Axiora Educação Digital" />
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
                  <AxioraLogo size="sm" className="mb-3 w-[138px] border-[rgba(223,204,183,0.88)] bg-[rgba(255,250,244,0.82)] shadow-[0_16px_32px_rgba(164,132,101,0.16)]" alt="Axiora Educação Digital" />
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[#8b755d]">Novo acesso</p>
                  <h2 className="mt-1 text-2xl font-black text-[#22352f]">Criar conta</h2>
                </div>
              </div>

              <div className="relative hidden lg:block">
                <AxioraLogo size="sm" className="mb-4 w-[148px] border-[rgba(223,204,183,0.88)] bg-[rgba(255,250,244,0.8)] shadow-[0_16px_32px_rgba(164,132,101,0.16)]" alt="Axiora Educação Digital" />
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
    </div>
  );
}
