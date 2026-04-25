"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToolsIdentity } from "@/context/tools-identity-context";
import { ApiError, getApiErrorMessage, resetPasswordByEmail } from "@/lib/api/client";
import { ToolsAuthShell } from "../_components/tools-auth-shell";

const GENERATOR_PATH = "/tools/gerador-atividades";
const LOGIN_PATH = "/tools/gerador-atividades/login";

function getPasswordValidationMessage(password: string): string | null {
  if (password.length < 10) {
    return "A nova senha precisa ter pelo menos 10 caracteres.";
  }
  if (!/[A-Z]/.test(password)) {
    return "A nova senha precisa ter pelo menos uma letra maiúscula.";
  }
  if (!/[a-z]/.test(password)) {
    return "A nova senha precisa ter pelo menos uma letra minúscula.";
  }
  if (!/\d/.test(password)) {
    return "A nova senha precisa ter pelo menos um número.";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "A nova senha precisa ter pelo menos um caractere especial.";
  }
  return null;
}

function mapResetPasswordError(err: unknown): string {
  if (err instanceof ApiError) {
    const payload = err.payload as
      | { message?: string; detail?: string | Array<{ msg?: string }> }
      | null;
    const detailText =
      typeof payload?.detail === "string"
        ? payload.detail
        : Array.isArray(payload?.detail)
          ? payload.detail.map((item) => item?.msg ?? "").join(" ")
          : "";
    const rawMessage = `${payload?.message ?? ""} ${detailText}`.toLowerCase();

    if (err.status === 404 || rawMessage.includes("not found")) {
      return "O e-mail informado ainda não tem cadastro.";
    }
    if (rawMessage.includes("at least 10 characters") || rawMessage.includes("string should have at least 10 characters")) {
      return "A nova senha precisa ter pelo menos 10 caracteres.";
    }
    if (rawMessage.includes("uppercase")) {
      return "A nova senha precisa ter pelo menos uma letra maiúscula.";
    }
    if (rawMessage.includes("lowercase")) {
      return "A nova senha precisa ter pelo menos uma letra minúscula.";
    }
    if (rawMessage.includes("number")) {
      return "A nova senha precisa ter pelo menos um número.";
    }
    if (rawMessage.includes("special character")) {
      return "A nova senha precisa ter pelo menos um caractere especial.";
    }
  }

  return getApiErrorMessage(err, "Não foi possível redefinir a senha agora.");
}

export default function GeradorAtividadesResetPasswordPage() {
  const router = useRouter();
  const { hasAuthenticatedSession, initializing } = useToolsIdentity();
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initializing && hasAuthenticatedSession) {
      router.push(GENERATOR_PATH);
    }
  }, [hasAuthenticatedSession, initializing, router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const resolvedEmail = email.trim().toLowerCase();

    if (!resolvedEmail || !newPassword || !confirmPassword) {
      setError("Preencha e-mail, nova senha e confirmação.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("A confirmação da nova senha não coincide com a nova senha.");
      return;
    }

    const passwordValidationMessage = getPasswordValidationMessage(newPassword);
    if (passwordValidationMessage) {
      setError(passwordValidationMessage);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await resetPasswordByEmail(resolvedEmail, newPassword);
      router.replace(LOGIN_PATH);
    } catch (err) {
      setError(mapResetPasswordError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolsAuthShell
      title="Redefina sua senha para voltar ao gerador"
      subtitle="Informe o e-mail cadastrado e escolha uma nova senha para continuar criando suas atividades."
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-[24px] border border-white/12 bg-[rgba(255,255,255,0.05)] p-5 shadow-[0_18px_44px_rgba(4,12,20,0.24)] backdrop-blur-sm sm:p-6"
      >
        <div className="space-y-2">
          <label className="block text-xs font-black uppercase tracking-[0.14em] text-white/65" htmlFor="tools-reset-email">
            E-mail
          </label>
          <Input
            id="tools-reset-email"
            type="email"
            placeholder="email@dominio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "tools-reset-error" : undefined}
            className="border-white/20 bg-[rgba(255,255,255,0.92)] text-[#1e293b] placeholder:text-[#94a3b8] focus-visible:ring-[#ee8748]"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-black uppercase tracking-[0.14em] text-white/65" htmlFor="tools-reset-password">
            Nova senha
          </label>
          <Input
            id="tools-reset-password"
            type="password"
            placeholder="Digite sua nova senha"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "tools-reset-error" : undefined}
            className="border-white/20 bg-[rgba(255,255,255,0.92)] text-[#1e293b] placeholder:text-[#94a3b8] focus-visible:ring-[#ee8748]"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-black uppercase tracking-[0.14em] text-white/65" htmlFor="tools-reset-password-confirm">
            Confirmar nova senha
          </label>
          <Input
            id="tools-reset-password-confirm"
            type="password"
            placeholder="Confirme sua nova senha"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "tools-reset-error" : undefined}
            className="border-white/20 bg-[rgba(255,255,255,0.92)] text-[#1e293b] placeholder:text-[#94a3b8] focus-visible:ring-[#ee8748]"
            required
          />
        </div>

        {error ? (
          <p
            id="tools-reset-error"
            role="alert"
            aria-live="polite"
            className="rounded-2xl border border-[rgba(244,114,114,0.35)] bg-[rgba(127,29,29,0.28)] px-4 py-2 text-sm font-semibold text-[#fecaca]"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" variant="secondary" className="sm:min-w-[220px]" disabled={loading}>
            {loading ? "Redefinindo..." : "Redefinir senha"}
          </Button>
          <Button asChild variant="outline" className="sm:min-w-[180px] border-white/25 bg-[rgba(255,255,255,0.04)] text-white hover:text-[#fde68a]">
            <Link href={LOGIN_PATH}>Voltar para entrar</Link>
          </Button>
        </div>
      </form>
    </ToolsAuthShell>
  );
}
