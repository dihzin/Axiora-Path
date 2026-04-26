"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToolsIdentity } from "@/context/tools-identity-context";
import { ApiError, signup } from "@/lib/api/client";
import { clearTenantSlug, clearTokens } from "@/lib/api/session";
import { ToolsAuthShell } from "../_components/tools-auth-shell";

const GENERATOR_PATH = "/tools/gerador-atividades";
const LOGIN_PATH = "/tools/gerador-atividades/login";

const toolsSignupSchema = z.object({
  name: z.string().min(2, "Nome deve ter no minimo 2 caracteres."),
  email: z.string().email("E-mail invalido."),
});

function getPasswordValidationMessage(password: string): string | null {
  if (password.length < 10) {
    return "A senha deve ter pelo menos 10 caracteres.";
  }
  if (!/[A-Z]/.test(password)) {
    return "A senha deve ter pelo menos uma letra maiuscula.";
  }
  if (!/[a-z]/.test(password)) {
    return "A senha deve ter pelo menos uma letra minuscula.";
  }
  if (!/\d/.test(password)) {
    return "A senha deve ter pelo menos um numero.";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "A senha deve ter pelo menos um caractere especial.";
  }
  return null;
}

function mapToolsSignupError(err: unknown): string {
  if (err instanceof ApiError) {
    const payload = err.payload as {
      message?: unknown;
      detail?: unknown;
      details?: unknown;
    } | null;

    const detailText = Array.isArray(payload?.detail)
      ? payload.detail
          .map((item) => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object" && "msg" in item && typeof (item as { msg?: unknown }).msg === "string") {
              return (item as { msg: string }).msg;
            }
            return "";
          })
          .join(" ")
      : typeof payload?.detail === "string"
        ? payload.detail
        : "";

    const rawMessage = `${typeof payload?.message === "string" ? payload.message : ""} ${detailText}`.toLowerCase();

    if (err.status === 409 || rawMessage.includes("already") || rawMessage.includes("exists") || rawMessage.includes("cadastrad")) {
      return "Este e-mail ja esta cadastrado. Tente entrar ou redefinir a senha.";
    }
    if (rawMessage.includes("special character")) {
      return "A senha deve ter pelo menos um caractere especial.";
    }
    if (rawMessage.includes("uppercase")) {
      return "A senha deve ter pelo menos uma letra maiuscula.";
    }
    if (rawMessage.includes("lowercase")) {
      return "A senha deve ter pelo menos uma letra minuscula.";
    }
    if (rawMessage.includes("digit") || rawMessage.includes("number")) {
      return "A senha deve ter pelo menos um numero.";
    }
    if (
      rawMessage.includes("at least") ||
      rawMessage.includes("min length") ||
      rawMessage.includes("too short") ||
      rawMessage.includes("length")
    ) {
      return "A senha deve ter pelo menos 10 caracteres.";
    }
    if (rawMessage.includes("invalid email") || rawMessage.includes("value is not a valid email")) {
      return "E-mail invalido.";
    }
    if (err.status === 422) {
      return "Revise os dados informados e tente novamente.";
    }
  }

  return "Nao foi possivel criar sua conta. Revise os dados e tente novamente.";
}

export default function GeradorAtividadesCadastroPage() {
  const router = useRouter();
  const { hasAuthenticatedSession, initializing } = useToolsIdentity();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initializing && hasAuthenticatedSession) {
      router.push(GENERATOR_PATH);
    }
  }, [hasAuthenticatedSession, initializing, router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const validation = toolsSignupSchema.safeParse({ name, email });
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    const passwordValidationMessage = getPasswordValidationMessage(password);
    if (passwordValidationMessage) {
      setError(passwordValidationMessage);
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
        family_name: `Familia ${name.trim()}`,
      });
      if (!tokens.access_token) {
        throw new Error("Missing access token after signup");
      }
      clearTokens();
      clearTenantSlug();
      router.push(LOGIN_PATH);
    } catch (err) {
      clearTokens();
      clearTenantSlug();
      setError(mapToolsSignupError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolsAuthShell
      title="Crie sua conta para comecar"
      subtitle="Apos o cadastro, voce conclui o onboarding e volta para gerar suas listas no Axiora Tools."
    >
      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-[24px] border border-white/12 bg-[rgba(255,255,255,0.05)] p-5 shadow-[0_18px_44px_rgba(4,12,20,0.24)] backdrop-blur-sm sm:p-6"
      >
        <div className="space-y-2">
          <label className="block text-xs font-black uppercase tracking-[0.14em] text-white/65" htmlFor="tools-signup-name">
            Nome
          </label>
          <Input
            id="tools-signup-name"
            placeholder="Seu nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "tools-signup-error" : undefined}
            className="border-white/20 bg-[rgba(255,255,255,0.92)] text-[#1e293b] placeholder:text-[#94a3b8] focus-visible:ring-[#ee8748]"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-black uppercase tracking-[0.14em] text-white/65" htmlFor="tools-signup-email">
            E-mail
          </label>
          <Input
            id="tools-signup-email"
            type="email"
            placeholder="email@dominio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "tools-signup-error" : undefined}
            className="border-white/20 bg-[rgba(255,255,255,0.92)] text-[#1e293b] placeholder:text-[#94a3b8] focus-visible:ring-[#ee8748]"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-black uppercase tracking-[0.14em] text-white/65" htmlFor="tools-signup-password">
            Senha
          </label>
          <Input
            id="tools-signup-password"
            type="password"
            placeholder="Crie uma senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "tools-signup-error" : undefined}
            className="border-white/20 bg-[rgba(255,255,255,0.92)] text-[#1e293b] placeholder:text-[#94a3b8] focus-visible:ring-[#ee8748]"
            required
          />
          <p className="text-[11px] font-semibold text-white/60">
            Requisitos da senha: minimo de 10 caracteres, com letra maiúscula, letra minúscula, número e caractere especial.
          </p>
        </div>

        {error ? (
          <p
            id="tools-signup-error"
            role="alert"
            aria-live="polite"
            className="rounded-2xl border border-[rgba(244,114,114,0.35)] bg-[rgba(127,29,29,0.28)] px-4 py-2 text-sm font-semibold text-[#fecaca]"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" variant="secondary" className="sm:min-w-[180px]" disabled={loading || initializing}>
            {loading ? "Criando conta..." : "Criar conta"}
          </Button>
          <Button asChild variant="outline" className="sm:min-w-[180px] border-white/25 bg-[rgba(255,255,255,0.04)] text-white hover:text-[#fde68a]">
            <Link href={LOGIN_PATH}>Voltar para entrar</Link>
          </Button>
        </div>
      </form>
    </ToolsAuthShell>
  );
}
