"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage, verifyParentPin } from "@/lib/api/client";

export default function ParentPinPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await verifyParentPin(pin);
      if (!result.verified) {
        setError("PIN inválido.");
        return;
      }
      sessionStorage.setItem("axiora_parent_pin_ok", "1");
      router.push("/parent");
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível validar PIN agora."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="axiora-brand-page parent-pin-screen safe-px safe-pb flex min-h-screen w-full max-w-none items-stretch overflow-x-clip p-0">
      <div className="parent-pin-shell w-full">
        <section className="parent-pin-stage">
          <span className="parent-luxe-badge inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-[#FFF4E7]">
            <ShieldCheck className="h-3.5 w-3.5" />
            Acesso protegido
          </span>
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E6D8C7]">Área dos pais</p>
              <h1 className="mt-3 text-3xl font-semibold leading-tight text-[#FFF7EE] md:text-[2.7rem]">
                Confirme seu PIN para entrar no workspace familiar
              </h1>
            </div>
            <p className="parent-pin-copy max-w-xl text-sm leading-7 md:text-[15px]">
              Este acesso separa o modo de gestão do ambiente da criança. Assim, ajustes da rotina, aprovações e decisões da família ficam protegidos em uma etapa curta e clara.
            </p>
          </div>
          <div className="parent-pin-benefits">
            <div className="parent-soft-block rounded-[24px] p-4">
              <div className="flex items-center gap-2 text-[#FFF0E1]">
                <LockKeyhole className="h-4 w-4" />
                <p className="text-sm font-semibold">Entrada segura e rápida</p>
              </div>
              <p className="parent-pin-copy-soft mt-2 text-sm leading-6">
                O PIN mantém as ferramentas dos responsáveis fora do alcance da navegação infantil.
              </p>
            </div>
            <div className="parent-soft-block rounded-[24px] p-4">
              <div className="flex items-center gap-2 text-[#FFF0E1]">
                <Sparkles className="h-4 w-4" />
                <p className="text-sm font-semibold">Continuidade da semana</p>
              </div>
              <p className="parent-pin-copy-soft mt-2 text-sm leading-6">
                Depois da validação, o painel abre direto no contexto atual da família e da criança ativa.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-slate-300 transition hover:text-white"
            onClick={() => router.push("/child")}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao modo criança
          </button>
        </section>

        <Card className="parent-pin-card axiora-glass-card w-full text-[#FFF4E7]">
          <CardHeader className="space-y-3">
            <div className="parent-soft-block inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold text-[#FFF4E7]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Validação parental
            </div>
            <div>
              <CardTitle className="text-2xl text-[#FFF7EE]">PIN dos pais</CardTitle>
              <CardDescription className="mt-2 max-w-sm text-sm leading-6 text-[#E7DACA]">
                Confirme o PIN para acessar aprovações, perfis da família e ajustes de rotina.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#D8C6B1]">PIN de acesso</label>
                <Input
                  className="!h-12 !rounded-2xl !border-white/18 !bg-[#18312E]/45 !text-lg !tracking-[0.24em] !text-[#FFF4E7] placeholder:!tracking-normal"
                  placeholder="0000"
                  inputMode="numeric"
                  type="password"
                  autoComplete="one-time-code"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button className="apple-btn-primary !h-12 w-full !text-sm" type="submit" disabled={loading}>
                {loading ? "Validando..." : "Entrar na área dos pais"}
              </Button>
              <p className="text-xs leading-6 text-[#D8C6B1]">
                Se precisar trocar de organização ou sessão, volte para o fluxo principal antes de continuar.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
