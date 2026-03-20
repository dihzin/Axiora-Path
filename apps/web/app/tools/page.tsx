import Link from "next/link";

import { HowItWorks } from "./_components/how-it-works";
import { ArrowRightIcon, CheckIcon, ClockIcon, ArrowPathIcon, DocumentTextIcon, QuoteIcon } from "./_components/icons";
import { PdfPreviewCard } from "./_components/pdf-preview-card";
import { PricingBlock } from "./_components/pricing-block";

// ─── Prova social ────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote: "Em 15 minutos preparei a semana toda de reforço de matemática. Antes levava duas horas.",
    author: "Mãe de aluno do 4º ano",
  },
  {
    quote: "Gerei lista por lista sem precisar criar nada do zero. O gabarito pronto é um diferencial enorme.",
    author: "Professora do fundamental I",
  },
  {
    quote: "Minha filha parou de reclamar dos exercícios porque agora são do nível dela. Faz diferença.",
    author: "Pai de estudante de 8 anos",
  },
];

// ─── Dores ───────────────────────────────────────────────────────────────────
const PAINS = [
  {
    Icon: ClockIcon,
    title: "Horas gastas toda semana",
    body: "Buscar, adaptar e formatar atividades para a idade certa consome tempo que deveria ser de ensino.",
  },
  {
    Icon: DocumentTextIcon,
    title: "Material genérico não funciona",
    body: "Exercício fora do nível frustra a criança. Fácil demais desmotiva. Difícil demais bloqueia.",
  },
  {
    Icon: ArrowPathIcon,
    title: "Repetir o mesmo todo mês",
    body: "Sem uma ferramenta, o planejamento recome do zero toda semana — consumindo energia sem resultado novo.",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ToolsLandingPage() {
  return (
    <div className="relative isolate">
      {/* ── Background: wallpaper + overlays (igual ao login) ─────────────── */}
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-[58%_center] bg-no-repeat"
        style={{ backgroundImage: "url('/axiora/auth/wallpaper.jpg')", backgroundColor: "#0b1420" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(90deg,rgba(6,14,22,0.80)_0%,rgba(10,22,32,0.56)_50%,rgba(10,22,32,0.66)_100%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_14%_20%,rgba(255,224,154,0.20),transparent_30%),radial-gradient(circle_at_82%_16%,rgba(150,234,221,0.12),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(7,20,17,0.45),transparent_50%)]"
        aria-hidden="true"
      />

      <main className="relative z-10 min-h-screen text-white">
        {/* ── Nav ────────────────────────────────────────────────────────────── */}
        <nav className="sticky top-0 z-30 border-b border-white/10 bg-[rgba(6,14,22,0.88)] backdrop-blur-md">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[linear-gradient(180deg,#ee8748,#db6728)] shadow-[0_2px_0_rgba(158,74,30,0.5)]">
                  <span className="text-[0.65rem] font-black text-white">A</span>
                </div>
                <span className="text-sm font-extrabold tracking-tight text-white">Axiora <span className="text-[#fcd34d]">Tools</span></span>
              </div>
              <Link
                href="/"
                className="hidden items-center gap-1 text-[11px] font-semibold text-white/40 transition hover:text-white/70 sm:inline-flex"
              >
                Conhecer o Axiora completo
                <ArrowRightIcon className="h-3 w-3" />
              </Link>
            </div>
            <Link
              href="/tools/gerador-atividades"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-4 py-2 text-xs font-extrabold text-white shadow-[0_4px_0_rgba(158,74,30,0.5),0_8px_16px_rgba(93,48,22,0.22)] transition hover:brightness-110"
            >
              Gerar exercícios agora
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
          {/* Subtexto de contexto */}
          <div className="border-t border-white/5 px-5 py-1.5 text-center text-[11px] text-white/35">
            Ferramentas práticas enquanto a plataforma completa está em desenvolvimento —{" "}
            <Link href="/" className="font-semibold text-white/50 underline underline-offset-2 transition hover:text-white/80">
              conhecer o Axiora Path
            </Link>
          </div>
        </nav>

        <div className="mx-auto w-full max-w-5xl px-5 pb-24">
          {/* ── HERO ──────────────────────────────────────────────────────────── */}
          <section className="overflow-hidden pt-16 text-center md:pt-24">
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(238,135,72,0.35)] bg-[rgba(238,135,72,0.12)] px-4 py-1.5 text-xs font-semibold text-[#fcd34d]">
              <CheckIcon className="h-3.5 w-3.5 text-[#ee8748]" />
              3 gerações grátis &nbsp;·&nbsp; sem cadastro &nbsp;·&nbsp; sem login
            </span>

            <div className="relative mt-5">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[300px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: "radial-gradient(ellipse, rgba(238,135,72,0.2) 0%, rgba(238,135,72,0.07) 50%, transparent 75%)", filter: "blur(48px)" }}
              />
              <h1 className="mx-auto max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-6xl">
                Exercícios personalizados{" "}
                <span className="bg-[linear-gradient(180deg,#fde68a_0%,#f59e0b_50%,#ee8748_100%)] bg-clip-text text-transparent">
                  prontos em segundos.
                </span>
              </h1>
            </div>

            <p className="mx-auto mt-5 max-w-2xl text-base text-white/75 md:text-lg">
              Escolha a matéria, o tema e a idade do aluno. A Axiora gera uma lista completa com{" "}
              <strong className="text-white">gabarito e PDF</strong> pronto para imprimir — sem template, sem copiar e
              colar.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/tools/gerador-atividades"
                className="inline-flex items-center justify-center gap-2 w-full rounded-2xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-8 py-4 text-base font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.3),0_6px_0_rgba(158,74,30,0.45),0_16px_28px_rgba(93,48,22,0.25)] transition hover:brightness-110 sm:w-auto"
              >
                Gerar exercícios agora
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
              <a
                href="#como-funciona"
                className="w-full rounded-2xl border border-white/25 bg-[rgba(255,255,255,0.07)] px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition hover:bg-[rgba(255,255,255,0.13)] hover:border-white/35 sm:w-auto text-center"
              >
                Ver como funciona
              </a>
            </div>

            {/* ── Live social proof ── */}
            <div className="mt-7 flex justify-center">
              <div className="inline-flex items-center gap-2.5 rounded-2xl border border-white/10 bg-[rgba(6,14,22,0.65)] px-4 py-2.5 text-xs shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-sm">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span className="text-white/65">
                  <span className="font-semibold text-white">Beatriz G.</span> acabou de gerar uma lista de{" "}
                  <span className="font-semibold text-[#fde68a]">Ciências · 8 anos</span>
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-white/50">
              <span className="inline-flex items-center gap-1.5"><CheckIcon className="h-3 w-3 text-[#ee8748]" />Sem assinatura</span>
              <span className="inline-flex items-center gap-1.5"><CheckIcon className="h-3 w-3 text-[#ee8748]" />PDF em 1 clique</span>
              <span className="inline-flex items-center gap-1.5"><CheckIcon className="h-3 w-3 text-[#ee8748]" />Gabarito incluído</span>
              <span className="inline-flex items-center gap-1.5"><CheckIcon className="h-3 w-3 text-[#ee8748]" />Adapta para qualquer idade</span>
            </div>
          </section>

          {/* ── PROBLEMA ──────────────────────────────────────────────────────── */}
          <section className="mt-20">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">O problema</p>
              <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl md:text-4xl">
                Preparar material leva tempo que você não tem.
              </h2>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {PAINS.map((pain) => (
                <article
                  key={pain.title}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.08)] p-5 backdrop-blur-sm transition-transform duration-200 hover:-translate-y-1 hover:border-white/20 hover:bg-[rgba(255,255,255,0.08)]"
                >
                  <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl bg-[linear-gradient(90deg,#fde68a,#ee8748,transparent)]" aria-hidden="true" />
                  <pain.Icon className="h-8 w-8 text-[#ee8748]" />
                  <h3 className="mt-3 text-base font-bold">{pain.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">{pain.body}</p>
                </article>
              ))}
            </div>
          </section>

          {/* ── COMO FUNCIONA ──────────────────────────────────────────────────── */}
          <div id="como-funciona">
            <HowItWorks />
          </div>

          {/* ── PREVIEW DO PDF ────────────────────────────────────────────────── */}
          <section className="mt-20">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Resultado real</p>
              <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl md:text-4xl">Isso é o que você recebe.</h2>
              <p className="mx-auto mt-3 max-w-lg text-sm text-white/70">
                Exemplo gerado pelo sistema para Matemática · Frações · 9 anos · Médio.
              </p>
            </div>

            <div className="mx-auto mt-10 max-w-lg">
              <PdfPreviewCard />
              <p className="mt-4 text-center text-xs text-white/40">
                O seu material segue o mesmo formato — pronto para imprimir.
              </p>
            </div>

            <div className="mt-8 text-center">
              <Link
                href="/tools/gerador-atividades"
                className="inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-8 py-4 text-base font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.3),0_6px_0_rgba(158,74,30,0.45),0_16px_28px_rgba(93,48,22,0.25)] transition hover:brightness-110"
              >
                Gerar o meu agora
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </section>

          {/* ── PREÇO ──────────────────────────────────────────────────────────── */}
          <PricingBlock />

          {/* ── PROVA SOCIAL ───────────────────────────────────────────────────── */}
          <section className="mt-20">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Depoimentos</p>
              <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl md:text-4xl">Quem testou, continuou usando.</h2>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {TESTIMONIALS.map((t) => (
                <blockquote
                  key={t.author}
                  className="flex flex-col rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.08)] p-5 backdrop-blur-sm transition-transform duration-200 hover:-translate-y-1 hover:border-[rgba(238,135,72,0.25)]"
                >
                  <QuoteIcon className="h-5 w-5 text-[#ee8748]/60" />
                  <p className="mt-2 text-sm leading-relaxed text-white/85">
                    {t.quote}
                  </p>
                  <footer className="mt-4 text-xs font-semibold text-[#fcd34d]">{t.author}</footer>
                </blockquote>
              ))}
            </div>
          </section>

          {/* ── CTA FINAL ──────────────────────────────────────────────────────── */}
          <section className="mt-20 rounded-3xl border border-[rgba(238,135,72,0.25)] bg-[rgba(238,135,72,0.08)] px-5 py-10 text-center backdrop-blur-sm sm:px-8 sm:py-12">
            <h2 className="text-2xl font-extrabold sm:text-3xl md:text-4xl">Comece agora — é grátis.</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-white/75 md:text-base">
              Sem cadastro, sem cartão. Gere até 3 exercícios completos com gabarito e PDF hoje mesmo.
            </p>
            <Link
              href="/tools/gerador-atividades"
              className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-10 py-4 text-base font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.3),0_6px_0_rgba(158,74,30,0.45),0_16px_28px_rgba(93,48,22,0.25)] transition hover:brightness-110 sm:w-auto"
            >
              Gerar exercícios agora
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <p className="mt-4 text-xs text-white/40">
              Se precisar de mais: R$ 29 por 30 gerações, sem assinatura.
            </p>
          </section>
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
        <footer className="border-t border-white/10 bg-[rgba(6,14,22,0.82)] backdrop-blur-md">
          <div className="mx-auto max-w-5xl px-5 py-12">
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">

              {/* Marca */}
              <div className="lg:col-span-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[linear-gradient(180deg,#ee8748,#db6728)] shadow-[0_2px_0_rgba(158,74,30,0.5)]">
                    <span className="text-[0.7rem] font-black text-white">A</span>
                  </div>
                  <span className="text-sm font-extrabold tracking-tight text-white">
                    Axiora <span className="text-[#fcd34d]">Tools</span>
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-white/45">
                  Exercícios personalizados com gabarito e PDF — sem cadastro, sem assinatura.
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram da Axiora" className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/40 transition hover:border-white/20 hover:bg-white/10 hover:text-white/80">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" /></svg>
                  </a>
                  <a href="https://tiktok.com" target="_blank" rel="noopener noreferrer" aria-label="TikTok da Axiora" className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/40 transition hover:border-white/20 hover:bg-white/10 hover:text-white/80">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.29 6.29 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" /></svg>
                  </a>
                  <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube da Axiora" className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/40 transition hover:border-white/20 hover:bg-white/10 hover:text-white/80">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.75 15.52V8.48L15.5 12l-5.75 3.52z" /></svg>
                  </a>
                </div>
              </div>

              {/* Ferramentas */}
              <div>
                <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Ferramentas</p>
                <ul className="space-y-2.5 text-xs text-white/50">
                  <li><Link href="/tools/gerador-atividades" className="transition hover:text-white/80">Gerador de Exercícios</Link></li>
                  <li><Link href="/tools/planner-familiar" className="transition hover:text-white/80">Planner Familiar</Link></li>
                  <li><Link href="/tools/checkup-aprendizagem" className="transition hover:text-white/80">Checkup de Aprendizagem</Link></li>
                </ul>
              </div>

              {/* Quem somos */}
              <div>
                <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Quem somos</p>
                <ul className="space-y-2.5 text-xs text-white/50">
                  <li>A Axiora nasceu da frustração de pais e professores que gastavam horas preparando material educacional do zero toda semana.</li>
                  <li className="pt-1">
                    <Link href="/" className="inline-flex items-center gap-1 font-semibold text-[#fde68a] transition hover:text-white">
                      Conhecer o Axiora Path
                      <ArrowRightIcon className="h-3 w-3" />
                    </Link>
                  </li>
                  <li className="pt-0.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(238,135,72,0.3)] bg-[rgba(238,135,72,0.1)] px-2.5 py-1 text-[10px] font-semibold text-[#fde68a]">
                      Feito no Brasil 🇧🇷
                    </span>
                  </li>
                </ul>
              </div>

              {/* Contato */}
              <div>
                <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Contato</p>
                <ul className="space-y-2.5 text-xs">
                  <li>
                    <a href="mailto:oi@axiora.com.br" className="flex items-center gap-2 text-white/50 transition hover:text-white/80">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                      oi@axiora.com.br
                    </a>
                  </li>
                  <li>
                    <a href="#" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white/50 transition hover:text-white/80">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12 2C6.477 2 2 6.484 2 12.017c0 1.99.518 3.86 1.42 5.488L2 22l4.633-1.364A9.953 9.953 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.946 7.946 0 0 1-4.291-1.254l-.308-.183-3.187.939.888-3.094-.2-.317A7.962 7.962 0 0 1 4 12c0-4.418 3.582-8 8-8s8 3.582 8 8-3.582 8-8 8z" /></svg>
                      WhatsApp
                    </a>
                  </li>
                  <li className="pt-1"><p className="text-[10px] text-white/30">Seg–Sex, 9h–18h (BRT)</p></li>
                </ul>
              </div>
            </div>

            {/* Linha inferior */}
            <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/8 pt-6 sm:flex-row">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                <p className="text-[11px] text-white/25">© 2026 Axiora Educação Digital. Todos os direitos reservados.</p>
                <span className="hidden text-white/15 sm:inline">·</span>
                <p className="text-[11px] text-white/25">Desenvolvido por <span className="font-semibold text-white/40">Impact Digital Growth</span></p>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-white/30">
                <Link href="/privacidade" className="transition hover:text-white/60">Privacidade</Link>
                <Link href="/termos" className="transition hover:text-white/60">Termos de uso</Link>
              </div>
            </div>
          </div>
        </footer>

        {/* ── CTA FIXO MOBILE ────────────────────────────────────────────────── */}
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[rgba(6,14,22,0.95)] p-3 backdrop-blur-md md:hidden">
          <Link
            href="/tools/gerador-atividades"
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] py-3.5 text-sm font-extrabold text-white shadow-[0_4px_0_rgba(158,74,30,0.5)] transition hover:brightness-110"
          >
            Gerar exercícios agora
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
