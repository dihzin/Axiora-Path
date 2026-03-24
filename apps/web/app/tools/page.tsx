import Link from "next/link";

import { getVariant } from "@/lib/ab";
import { HowItWorks } from "./_components/how-it-works";
import { ArrowRightIcon, CheckIcon, ClockIcon, ArrowPathIcon, DocumentTextIcon, QuoteIcon } from "./_components/icons";
import { PdfPreviewCard } from "./_components/pdf-preview-card";
import { PricingBlock } from "./_components/pricing-block";
import { ToolsPageTracker } from "@/components/tools/tools-page-tracker";

// ─── Copy ─────────────────────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote: "Em 15 minutos preparei a semana toda de reforço de matemática. Antes levava duas horas.",
    author: "Mãe de aluno do 4º ano",
    role: "São Paulo, SP",
  },
  {
    quote: "Semana inteira de exercícios preparada sem criar nada do zero. O gabarito pronto é um diferencial enorme.",
    author: "Professora do fundamental I",
    role: "Professora há 12 anos",
  },
  {
    quote: "Minha filha parou de reclamar dos exercícios porque agora são do nível dela. Faz diferença.",
    author: "Pai de estudante de 8 anos",
    role: "Curitiba, PR",
  },
];

const PAINS = [
  {
    Icon: ClockIcon,
    title: "2 horas de preparo para 20 minutos de atividade",
    body: "Buscar, adaptar e formatar exercícios para a idade certa — tempo que deveria ser de ensino vira tempo de secretaria.",
  },
  {
    Icon: DocumentTextIcon,
    title: "Material da internet não serve para o seu aluno",
    body: "Exercício fora do nível frustra a criança. Fácil demais desmotiva. Difícil demais bloqueia. Nenhum dos dois funciona.",
  },
  {
    Icon: ArrowPathIcon,
    title: "Toda semana começa do zero",
    body: "Sem uma ferramenta, o planejamento recomeça do zero toda semana — mesma energia, resultado que não avança.",
  },
];

// ─── Componentes reutilizados entre variantes ──────────────────────────────

function TestimonialsSection() {
  return (
    <section className="mt-24">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Quem já usa</p>
        <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl md:text-4xl">
          Quem testou, continuou usando.
        </h2>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <blockquote
            key={t.author}
            className="flex flex-col rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.06)] p-5 backdrop-blur-sm"
          >
            <QuoteIcon className="h-5 w-5 text-[#ee8748]/60" />
            <p className="mt-3 flex-1 text-sm leading-relaxed text-white/85">{t.quote}</p>
            <footer className="mt-4 space-y-0.5">
              <p className="text-xs font-bold text-[#fcd34d]">{t.author}</p>
              <p className="text-[11px] text-white/35">{t.role}</p>
            </footer>
          </blockquote>
        ))}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function ToolsLandingPage() {
  // Lê variantes do cookie atribuído pelo middleware
  const [v1, v2, v3, v4] = await Promise.all([
    getVariant("exp1_headline"),
    getVariant("exp2_cta"),
    getVariant("exp3_price"),
    getVariant("exp4_social"),
  ]);

  // ── Exp 1: Headline ────────────────────────────────────────────────────────
  const headline =
    v1 === "b"
      ? { main: "Professores que usam Axiora Tools têm a semana de matemática pronta em 15 minutos.", accent: "Você pode ser o próximo." }
      : { main: "Chega de domingo perdido preparando lista de matemática.", accent: "Gere em 30 segundos." };

  // ── Exp 2: CTA ─────────────────────────────────────────────────────────────
  const ctaLabel = v2 === "b" ? "Quero minha lista pronta em 30 segundos" : "Gerar minha primeira lista grátis";

  return (
    <div className="relative isolate">
      <ToolsPageTracker />
      {/* ── Background ─────────────────────────────────────────────────────── */}
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-[58%_center] bg-no-repeat"
        style={{ backgroundImage: "url('/axiora/auth/wallpaper.jpg')", backgroundColor: "#0b1420" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(90deg,rgba(6,14,22,0.82)_0%,rgba(10,22,32,0.58)_50%,rgba(10,22,32,0.68)_100%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_14%_20%,rgba(255,224,154,0.20),transparent_30%),radial-gradient(circle_at_82%_16%,rgba(150,234,221,0.12),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(7,20,17,0.45),transparent_50%)]"
        aria-hidden="true"
      />

      <main className="relative z-10 min-h-screen text-white">

        {/* ── NAV ─────────────────────────────────────────────────────────────── */}
        <nav className="sticky top-0 z-30 border-b border-white/10 bg-[rgba(6,14,22,0.92)] backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[linear-gradient(180deg,#ee8748,#db6728)] shadow-[0_2px_0_rgba(158,74,30,0.5)]">
                <span className="text-[0.65rem] font-black text-white">A</span>
              </div>
              <span className="text-sm font-extrabold tracking-tight text-white">
                Axiora <span className="text-[#fcd34d]">Tools</span>
              </span>
            </div>

            {/* CTA único na nav */}
            <Link
              href="/tools/gerador-atividades"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-4 py-2 text-xs font-extrabold text-white shadow-[0_4px_0_rgba(158,74,30,0.5),0_8px_16px_rgba(93,48,22,0.22)] transition hover:brightness-110"
            >
              Gerar lista grátis
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </nav>

        <div className="mx-auto w-full max-w-5xl px-5 pb-28">

          {/* ── 1. HERO ─────────────────────────────────────────────────────── */}
          <section className="overflow-hidden pt-16 text-center md:pt-24">

            {/* Badge */}
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(238,135,72,0.35)] bg-[rgba(238,135,72,0.12)] px-4 py-1.5 text-xs font-semibold text-[#fcd34d]">
              <CheckIcon className="h-3.5 w-3.5 text-[#ee8748]" />
              3 listas grátis &nbsp;·&nbsp; sem cadastro &nbsp;·&nbsp; sem login
            </span>

            {/* Headline — TEMPO + RESULTADO */}
            <div className="relative mt-6">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[300px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background: "radial-gradient(ellipse, rgba(238,135,72,0.22) 0%, rgba(238,135,72,0.07) 50%, transparent 75%)",
                  filter: "blur(48px)",
                }}
              />
              {/* Exp 1 — A: Tempo/dor | B: Identidade/aspiração */}
              <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl md:text-[3.5rem]">
                {headline.main}{" "}
                <span className="bg-[linear-gradient(180deg,#fde68a_0%,#f59e0b_50%,#ee8748_100%)] bg-clip-text text-transparent">
                  {headline.accent}
                </span>
              </h1>
            </div>

            {/* Subheadline — remove esforço */}
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
              Escolha o tema de matemática e a idade do aluno.{" "}
              <strong className="text-white">A ferramenta monta os exercícios, escreve as instruções e gera o gabarito</strong>{" "}
              — tudo em PDF pronto para imprimir ou compartilhar.
            </p>

            {/* CTA único */}
            <div className="mt-8">
              <Link
                href="/tools/gerador-atividades"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-10 py-4 text-base font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.30),0_6px_0_rgba(158,74,30,0.45),0_16px_28px_rgba(93,48,22,0.30)] transition-[filter,box-shadow] duration-150 hover:brightness-110 active:shadow-[inset_0_1px_0_rgba(255,219,190,0.30),0_2px_0_rgba(158,74,30,0.45)] active:translate-y-1"
              >
                {/* Exp 2 — A: genérico | B: promessa específica */}
                {ctaLabel}
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
              <p className="mt-3 text-xs text-white/40">
                Sem cadastro. Sem cartão. Resultado em segundos.
              </p>
            </div>

            {/* Micro prova social */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[rgba(6,14,22,0.60)] px-4 py-2 text-xs shadow-[0_4px_16px_rgba(0,0,0,0.25)] backdrop-blur-sm">
                <span className="font-extrabold text-white">+4.200</span>
                <span className="text-white/55">listas geradas</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[rgba(6,14,22,0.60)] px-4 py-2 text-xs shadow-[0_4px_16px_rgba(0,0,0,0.25)] backdrop-blur-sm">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span className="text-white/65">
                  <span className="font-semibold text-white">Mariana R.</span> acabou de gerar —{" "}
                  <span className="font-semibold text-[#fde68a]">Matemática · 7 anos</span>
                </span>
              </div>
            </div>

            {/* Trust pills */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-white/45">
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon className="h-3 w-3 text-[#ee8748]" />Sem assinatura
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon className="h-3 w-3 text-[#ee8748]" />PDF em 1 clique
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon className="h-3 w-3 text-[#ee8748]" />Gabarito incluído
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon className="h-3 w-3 text-[#ee8748]" />Foco total em Matemática
              </span>
            </div>
          </section>

          {/* ── 2. PROBLEMA ──────────────────────────────────────────────────── */}
          <section className="mt-24">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">O ciclo que você conhece</p>
              <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl md:text-4xl">
                Horas toda semana. Para 30 minutos de exercício.
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm text-white/55">
                Não é falta de dedicação. É falta da ferramenta certa.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {PAINS.map((pain) => (
                <article
                  key={pain.title}
                  className="relative overflow-hidden rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.06)] p-5 backdrop-blur-sm"
                >
                  <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl bg-[linear-gradient(90deg,#fde68a,#ee8748,transparent)]" aria-hidden="true" />
                  <pain.Icon className="h-8 w-8 text-[#ee8748]" />
                  <h3 className="mt-3 text-base font-bold">{pain.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">{pain.body}</p>
                </article>
              ))}
            </div>
          </section>

          {/* ── 3. SOLUÇÃO: 3 PASSOS ─────────────────────────────────────────── */}
          <div id="como-funciona">
            <HowItWorks />
          </div>

          {/* ── 4. DEMONSTRAÇÃO ──────────────────────────────────────────────── */}
          <section className="mt-24">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Resultado real</p>
              <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl md:text-4xl">
                Isso é o que você recebe.
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm text-white/60">
                Gerado em menos de 30 segundos — sem editar nada, sem formatar nada.
              </p>
            </div>

            <div className="mx-auto mt-10 max-w-lg">
              <PdfPreviewCard />
              <p className="mt-3 text-center text-xs text-white/35">
                O seu material segue o mesmo formato — pronto para imprimir.
              </p>
            </div>
          </section>

          {/* ── 5. CTA INTERMEDIÁRIO ─────────────────────────────────────────── */}
          <div className="mt-10 flex flex-col items-center gap-2 text-center">
            <Link
              href="/tools/gerador-atividades"
              className="inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-10 py-4 text-base font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.30),0_6px_0_rgba(158,74,30,0.45),0_16px_28px_rgba(93,48,22,0.28)] transition-[filter] duration-150 hover:brightness-110"
            >
              Gerar minha primeira lista grátis
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <p className="text-xs text-white/40">3 listas completas para começar.</p>
          </div>

          {/* ── Exp 4: Prova social ANTES do preço (variante B) ──────────────── */}
          {v4 === "b" && <TestimonialsSection />}

          {/* ── 6. PREÇO ─────────────────────────────────────────────────────── */}
          <PricingBlock priceVariant={v3} />

          {/* ── 7. PROVA SOCIAL (posição original — variante A) ───────────────── */}
          {v4 === "a" && <TestimonialsSection />}

          {/* ── 8. CTA FINAL ─────────────────────────────────────────────────── */}
          <section className="mt-24 rounded-3xl border border-[rgba(238,135,72,0.30)] bg-[linear-gradient(150deg,rgba(110,48,8,0.48),rgba(40,18,4,0.58))] px-5 py-14 text-center backdrop-blur-sm sm:px-8 sm:py-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Pronto para recuperar seu tempo?</p>
            <h2 className="mt-4 text-2xl font-extrabold leading-tight sm:text-3xl md:text-4xl">
              Sua primeira lista fica pronta antes de você{" "}
              <br className="hidden sm:block" />
              <span className="text-white/55">terminar este parágrafo.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm text-white/60">
              3 listas completas com gabarito e PDF — grátis, agora mesmo.
              Se precisar de mais: <strong className="text-white">R$ 29 por 30 listas, sem assinatura.</strong>
            </p>
            <Link
              href="/tools/gerador-atividades"
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-10 py-4 text-base font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.30),0_6px_0_rgba(158,74,30,0.45),0_20px_40px_rgba(93,48,22,0.45)] transition-[filter] duration-150 hover:brightness-110 sm:w-auto"
            >
              Começar agora — é grátis
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </section>
        </div>

        {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
        <footer className="border-t border-white/10 bg-[rgba(6,14,22,0.82)] backdrop-blur-md">
          <div className="mx-auto max-w-5xl px-5 py-10">
            <div className="grid gap-8 sm:grid-cols-3">

              {/* Marca */}
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[linear-gradient(180deg,#ee8748,#db6728)] shadow-[0_2px_0_rgba(158,74,30,0.5)]">
                    <span className="text-[0.7rem] font-black text-white">A</span>
                  </div>
                  <span className="text-sm font-extrabold tracking-tight text-white">
                    Axiora <span className="text-[#fcd34d]">Tools</span>
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-white/40">
                  Exercícios personalizados com gabarito e PDF — sem cadastro, sem assinatura.
                </p>
                <div className="mt-4 flex items-center gap-2.5">
                  <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram da Axiora" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/40 transition hover:border-white/20 hover:text-white/80">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" /></svg>
                  </a>
                  <a href="https://tiktok.com" target="_blank" rel="noopener noreferrer" aria-label="TikTok da Axiora" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/40 transition hover:border-white/20 hover:text-white/80">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.29 6.29 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" /></svg>
                  </a>
                  <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube da Axiora" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/40 transition hover:border-white/20 hover:text-white/80">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.75 15.52V8.48L15.5 12l-5.75 3.52z" /></svg>
                  </a>
                </div>
              </div>

              {/* Ferramentas */}
              <div>
                <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Ferramentas</p>
                <ul className="space-y-2 text-xs">
                  <li>
                    <Link href="/tools/gerador-atividades" className="text-white/45 transition hover:text-white/75">
                      Gerador de Exercícios
                    </Link>
                  </li>
                  <li className="flex items-center gap-2 text-white/25">
                    Planner Familiar
                    <span className="rounded-full bg-white/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/30">
                      em breve
                    </span>
                  </li>
                  <li className="flex items-center gap-2 text-white/25">
                    Checkup de Aprendizagem
                    <span className="rounded-full bg-white/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/30">
                      em breve
                    </span>
                  </li>
                </ul>
              </div>

              {/* Contato */}
              <div>
                <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Contato</p>
                <ul className="space-y-2.5 text-xs">
                  <li>
                    <a href="mailto:oi@axiora.com.br" className="flex items-center gap-2 text-white/45 transition hover:text-white/75">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                      oi@axiora.com.br
                    </a>
                  </li>
                  <li>
                    <a href="#" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white/45 transition hover:text-white/75">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12 2C6.477 2 2 6.484 2 12.017c0 1.99.518 3.86 1.42 5.488L2 22l4.633-1.364A9.953 9.953 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.946 7.946 0 0 1-4.291-1.254l-.308-.183-3.187.939.888-3.094-.2-.317A7.962 7.962 0 0 1 4 12c0-4.418 3.582-8 8-8s8 3.582 8 8-3.582 8-8 8z" /></svg>
                      WhatsApp
                    </a>
                  </li>
                  <li className="pt-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(238,135,72,0.25)] bg-[rgba(238,135,72,0.08)] px-2.5 py-1 text-[10px] font-semibold text-[#fde68a]">
                      Feito no Brasil 🇧🇷
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Linha inferior */}
            <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-white/8 pt-6 sm:flex-row">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                <p className="text-[11px] text-white/25">© 2026 Axiora Educação Digital. Todos os direitos reservados.</p>
                <span className="hidden text-white/15 sm:inline">·</span>
                <p className="text-[11px] text-white/25">Desenvolvido por <span className="font-semibold text-white/35">Impact Digital Growth</span></p>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-white/30">
                <Link href="/privacidade" className="transition hover:text-white/60">Privacidade</Link>
                <Link href="/termos" className="transition hover:text-white/60">Termos de uso</Link>
              </div>
            </div>
          </div>
        </footer>

        {/* ── CTA FIXO MOBILE ──────────────────────────────────────────────────── */}
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[rgba(6,14,22,0.96)] p-3 backdrop-blur-md md:hidden">
          <Link
            href="/tools/gerador-atividades"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] py-3.5 text-sm font-extrabold text-white shadow-[0_4px_0_rgba(158,74,30,0.5),0_8px_20px_rgba(93,48,22,0.30)] transition hover:brightness-110"
          >
            Gerar minha lista grátis agora
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
          <p className="mt-1.5 text-center text-[10px] text-white/35">
            Sem cadastro &nbsp;·&nbsp; Sem cartão &nbsp;·&nbsp; 3 grátis
          </p>
        </div>

      </main>
    </div>
  );
}
