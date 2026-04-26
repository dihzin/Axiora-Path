"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToolsIdentity } from "@/context/tools-identity-context";
import { ApiError, loginPrimary } from "@/lib/api/client";
import { clearTenantSlug, clearTokens } from "@/lib/api/session";
import { finishPrimaryLogin } from "./_components/finish-primary-login";
import { ToolsAuthShell } from "./_components/tools-auth-shell";

const GENERATOR_PATH = "/tools/gerador-atividades";
const SIGNUP_PATH = "/tools/gerador-atividades/login/cadastro";
const RESET_PASSWORD_PATH = "/tools/gerador-atividades/login/redefinicao-senha";

function mapToolsLoginError(err: unknown): string {
  if (err instanceof ApiError) {
    const payload = err.payload as { message?: unknown; detail?: unknown } | null;
    const rawMessage = `${typeof payload?.message === "string" ? payload.message : ""} ${typeof payload?.detail === "string" ? payload.detail : ""}`.toLowerCase();

    if (err.status === 401 || rawMessage.includes("invalid credentials")) {
      return "E-mail ou senha invalidos.";
    }

    if (
      err.status === 404 ||
      rawMessage.includes("not found") ||
      rawMessage.includes("nao cadastrado") ||
      rawMessage.includes("nao encontrado")
    ) {
      return "Usuario nao cadastrado.";
    }

    if (rawMessage.includes("network") || err.status === 0) {
      return "Nao foi possivel conectar ao servidor. Tente novamente.";
    }

    if (rawMessage.includes("too many requests") || err.status === 429) {
      return "Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.";
    }

    if (err.status >= 500) {
      return "Erro temporario no servidor. Tente novamente em instantes.";
    }
  }

  if (err instanceof Error && err.message === "TOOLS_ACCESS_DENIED") {
    return "Usuario nao tem acesso ao Gerador de Atividades.";
  }

  return "Nao foi possivel autenticar. Verifique e-mail e senha.";
}

export default function GeradorAtividadesLoginPage() {
  const router = useRouter();
  const { establishAuthenticatedSession, hasAuthenticatedSession, initializing } = useToolsIdentity();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!initializing && hasAuthenticatedSession) {
      router.push(GENERATOR_PATH);
    }
  }, [hasAuthenticatedSession, initializing, router]);

  useEffect(() => {
    setEmail("");
    setPassword("");
  }, []);

  const handleEmailLogin = async (event: FormEvent) => {
    event.preventDefault();
    const resolvedEmail = (emailInputRef.current?.value ?? email).trim();
    const resolvedPassword = passwordInputRef.current?.value ?? password;
    setEmail(resolvedEmail);
    setPassword(resolvedPassword);

    if (!resolvedEmail || !resolvedPassword) {
      setError("Informe e-mail e senha para continuar.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      clearTokens();
      clearTenantSlug();
      const loginResponse = await loginPrimary(resolvedEmail, resolvedPassword);
      const credits = await finishPrimaryLogin({ loginResponse });
      establishAuthenticatedSession(credits);
      router.replace(GENERATOR_PATH);
      return;
    } catch (err) {
      clearTokens();
      clearTenantSlug();
      setError(mapToolsLoginError(err));
    }
    setLoading(false);
  };

  return (
    <ToolsAuthShell title="Entre para criar sua lista de atividades" subtitle="">
      <form
        onSubmit={handleEmailLogin}
        autoComplete="off"
        className="space-y-4 rounded-[24px] border border-white/12 bg-[rgba(255,255,255,0.05)] p-5 shadow-[0_18px_44px_rgba(4,12,20,0.24)] backdrop-blur-sm sm:p-6"
      >
        <div className="space-y-2">
          <label className="block text-xs font-black uppercase tracking-[0.14em] text-white/65" htmlFor="tools-login-email">
            E-mail
          </label>
          <Input
            ref={emailInputRef}
            id="tools-login-email"
            type="email"
            placeholder="email@dominio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            name="tools_login_email"
            autoComplete="section-tools-gerador-login username"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "tools-login-error" : undefined}
            className="border-white/20 bg-[rgba(255,255,255,0.92)] text-[#1e293b] placeholder:text-[#94a3b8] focus-visible:ring-[#ee8748]"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-black uppercase tracking-[0.14em] text-white/65" htmlFor="tools-login-password">
            Senha
          </label>
          <Input
            ref={passwordInputRef}
            id="tools-login-password"
            type="password"
            placeholder="Sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            name="tools_login_password"
            autoComplete="section-tools-gerador-login current-password"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "tools-login-error" : undefined}
            className="border-white/20 bg-[rgba(255,255,255,0.92)] text-[#1e293b] placeholder:text-[#94a3b8] focus-visible:ring-[#ee8748]"
            required
          />
        </div>

        {error ? (
          <p
            id="tools-login-error"
            role="alert"
            aria-live="polite"
            className="rounded-2xl border border-[rgba(244,114,114,0.35)] bg-[rgba(127,29,29,0.28)] px-4 py-2 text-sm font-semibold text-[#fecaca]"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" variant="secondary" className="sm:min-w-[180px]" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
          <Button asChild variant="outline" className="sm:min-w-[180px] border-white/25 bg-[rgba(255,255,255,0.04)] text-white hover:text-[#fde68a]">
            <Link href={SIGNUP_PATH}>Criar conta</Link>
          </Button>
        </div>

        <p className="text-xs text-white/55">
          Ainda nao tem acesso? Crie sua conta para liberar seu ambiente e gerar suas atividades.
        </p>
        <p className="text-xs text-white/60">
          Esqueceu a senha? Clique{" "}
          <Link href={RESET_PASSWORD_PATH} className="font-black text-[#f6c46a] transition hover:text-[#ffd894]">
            aqui
          </Link>{" "}
          para redefinir.
        </p>
      </form>
    </ToolsAuthShell>
  );
}
