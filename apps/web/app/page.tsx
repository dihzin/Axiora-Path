import Link from "next/link";
import { ArrowRight, FileText, Printer, CheckCircle, Sparkles, Clock, Users } from "lucide-react";

import { AxioraHeaderLogo } from "@/components/brand/axiora-header-logo";
import { AxioraLogo } from "@/components/brand/axiora-logo";
import { MarketingBackground } from "@/components/marketing-background";
import { WaitlistCapture } from "./_components/waitlist-capture";

const TOOLS = [
  {
    Icon: FileText,
    accent: "#ee8748",
    title: "Gerador de Exercicios",
    description: "Crie listas de matematica por tema e idade em segundos. Gabarito e PDF prontos para imprimir.",
    badge: "Disponivel agora",
    href: "/tools/gerador-atividades/login",
  },
  {
    Icon: Printer,
    accent: "#a855f7",
    title: "Planner Familiar",
    description: "Transforme objetivos da semana em rotina visual com tarefas e acompanhamento.",
    badge: "Em breve",
    href: "#waitlist-tools",
  },
  {
    Icon: CheckCircle,
    accent: "#14b8a6",
    title: "Checkup de Aprendizagem",
    description: "Diagnostico rapido com plano de acao para os proximos 7 dias.",
    badge: "Em breve",
    href: "#waitlist-tools",
  },
] as const;

const ROADMAP = [
  { Icon: Sparkles, title: "Correcao automatica com IA", description: "Envie a foto da folha respondida e receba feedback objetivo." },
  { Icon: Users, title: "Modo turma", description: "Gestao de alunos, distribuicao de listas e acompanhamento centralizado." },
  { Icon: Clock, title: "Historico de geracoes", description: "Reutilize listas antigas com um clique e organize por tema." },
  { Icon: CheckCircle, title: "Banco de questoes", description: "Biblioteca crescente de questoes prontas para combinar." },
] as const;

const TESTIMONIALS = [
  {
    quote: "Consegui montar atividade para dois niveis na mesma aula sem perder meu domingo.",
    author: "Camila S.",
    role: "Professora (exemplo ilustrativo)",
  },
  {
    quote: "Antes eu improvisava material. Agora eu gero, imprimo e ja entro com plano pronto.",
    author: "Rafael M.",
    role: "Pai e tutor (exemplo ilustrativo)",
  },
  {
    quote: "A clareza do gabarito me ajudou a revisar rapido com a turma no fim da atividade.",
    author: "Patricia L.",
    role: "Coordenacao pedagogica (exemplo ilustrativo)",
  },
] as const;

export default function HomePage() {
  return (
    <div className="relative isolate">
      <MarketingBackground priority />

      <div className="relative z-10 min-h-screen text-white">
        <nav className="sticky top-0 z-30 border-b border-[rgba(238,135,72,0.14)] bg-[linear-gradient(180deg,rgba(8,20,31,0.72)_0%,rgba(9,24,36,0.62)_100%] shadow-[0_10px_30px_rgba(4,12,20,0.16)] backdrop-blur-xl">
          <div className="mx-auto flex h-[65px] max-w-5xl items-center justify-between gap-3 px-5">
            <Link href="/" className="flex shrink-0 items-center">
              <AxioraHeaderLogo priority />
            </Link>

            <div className="flex items-center gap-2">
              <a href="#como-funciona" className="hidden rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white sm:inline-flex">
                Como funciona
              </a>
              <Link href="/tools/gerador-atividades/login" className="hidden rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white sm:inline-flex">
                Entrar
              </Link>
              <Link
                href="/tools/gerador-atividades/login"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-4 py-2 text-xs font-extrabold text-white shadow-[0_4px_0_rgba(158,74,30,0.5)] transition hover:brightness-110"
              >
                Gerar minha primeira lista
              </Link>
            </div>
          </div>
        </nav>

        <div className="mx-auto w-full max-w-5xl px-5 pb-28">
          <section className="pt-16 text-center md:pt-20">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Plataforma educacional para pais e professores</p>
            <h1 className="mx-auto mt-4 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-6xl">
              Lista de matematica pronta <span className="bg-[linear-gradient(180deg,#fde68a_0%,#f59e0b_50%,#ee8748_100%)] bg-clip-text text-transparent">em 30 segundos.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-white/75 md:text-lg">
              Entre com sua conta, gere exercicios com gabarito e PDF, e acompanhe seus creditos com seguranca.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link href="/tools/gerador-atividades/login" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-8 py-4 text-base font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.3),0_6px_0_rgba(158,74,30,0.45),0_16px_28px_rgba(93,48,22,0.25)] transition hover:brightness-110 sm:w-auto">
                Gerar minha primeira lista gratis
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-white/10 bg-[rgba(6,14,22,0.58)] px-5 py-4 backdrop-blur-sm">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-2xl font-extrabold text-white">+4.200</p>
                  <p className="text-xs text-white/60">listas geradas</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-white">Matematica</p>
                  <p className="text-xs text-white/60">foco inicial</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-white">3 creditos</p>
                  <p className="text-xs text-white/60">para comecar</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-20" id="como-funciona">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Axiora Tools</p>
              <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl md:text-4xl">Ferramentas para transformar preparo em minutos.</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-white/65">Primeiro voce gera. Depois salva, acompanha e evolui com o ecossistema Axiora.</p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {TOOLS.map((tool) => (
                <a key={tool.title} href={tool.href} className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.08)] p-5 backdrop-blur-sm transition hover:-translate-y-1 hover:border-white/20 hover:bg-[rgba(255,255,255,0.1)]">
                  <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl" style={{ background: `linear-gradient(90deg, ${tool.accent}, transparent)` }} aria-hidden="true" />
                  <div className="flex items-center justify-between gap-2">
                    <tool.Icon size={18} strokeWidth={1.75} style={{ color: tool.accent }} />
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/70">{tool.badge}</span>
                  </div>
                  <h3 className="mt-3 text-base font-bold">{tool.title}</h3>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-white/65">{tool.description}</p>
                  <div className="mt-4 flex items-center gap-1 text-xs font-semibold" style={{ color: tool.accent }}>
                    {tool.badge === "Disponivel agora" ? "Experimentar agora" : "Avisar quando abrir"}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                </a>
              ))}
            </div>

            <div id="waitlist-tools" className="mt-6">
              <WaitlistCapture
                context="tools_coming_soon"
                title="Planner Familiar e Checkup de Aprendizagem"
                description="Entre na lista para receber acesso assim que essas duas ferramentas abrirem."
              />
            </div>
          </section>

          <section className="mt-20">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Confianca</p>
              <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl md:text-4xl">Como o resultado chega na pratica</h2>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {TESTIMONIALS.map((t) => (
                <article key={t.author} className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.06)] p-5">
                  <p className="text-sm leading-relaxed text-white/85">&ldquo;{t.quote}&rdquo;</p>
                  <p className="mt-3 text-xs font-bold text-[#fcd34d]">{t.author}</p>
                  <p className="text-[11px] text-white/50">{t.role}</p>
                </article>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-white/45">Depoimentos ilustrativos para demonstracao de layout.</p>
          </section>

          <section className="mt-20">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Axiora Path</p>
              <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl md:text-4xl">App em desenvolvimento com trilha e acompanhamento continuo</h2>
            </div>
            <div className="mt-6">
              <WaitlistCapture
                context="app"
                title="Quer ser avisado no lancamento do app?"
                description="Deixe seu e-mail para entrar na lista de espera do Axiora Path."
              />
            </div>
          </section>

          <section className="mt-20">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Roadmap</p>
              <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl md:text-4xl">Proximas entregas em construcao</h2>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {ROADMAP.map((item) => (
                <div key={item.title} className="flex items-start gap-4 rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] p-5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.07)]">
                    <item.Icon size={15} strokeWidth={1.75} className="text-white/60" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">{item.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-white/55">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <WaitlistCapture
                context="roadmap"
                title="Quer saber quando essas features sairem?"
                description="Receba aviso por e-mail conforme avancamos no roadmap."
                compact
              />
            </div>
          </section>

          <section className="mt-20 rounded-3xl border border-[rgba(238,135,72,0.25)] bg-[rgba(238,135,72,0.08)] px-5 py-10 text-center backdrop-blur-sm sm:px-8 sm:py-12">
            <h2 className="text-2xl font-extrabold sm:text-3xl md:text-4xl">Comece agora e gere sua primeira lista em 30 segundos</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-white/75 md:text-base">Fluxo com conta, saldo sincronizado e compra de creditos quando precisar continuar.</p>
            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link href="/tools/gerador-atividades/login" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-10 py-4 text-base font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.3),0_6px_0_rgba(158,74,30,0.45),0_16px_28px_rgba(93,48,22,0.25)] transition hover:brightness-110 sm:w-auto">
                Comecar em 30 segundos
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        </div>

        <footer className="relative border-t border-[rgba(238,135,72,0.12)] bg-[linear-gradient(180deg,rgba(8,18,29,0.76)_0%,rgba(7,16,27,0.84)_100%)] backdrop-blur-xl">
          <div className="relative mx-auto max-w-5xl px-5 py-12">
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-1">
                <AxioraLogo size="sm" className="border-[rgba(255,255,255,0.14)] bg-[rgba(12,16,22,0.42)]" alt="Axiora Educação Digital" />
                <p className="mt-3 text-xs leading-relaxed text-white/45">Ferramentas educacionais para pais, professores e criancas.</p>
              </div>
              <div>
                <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Navegacao</p>
                <ul className="space-y-2.5 text-xs text-white/50">
                  <li><a href="#como-funciona" className="transition hover:text-white/80">Como funciona</a></li>
                  <li><Link href="/tools" className="transition hover:text-white/80">Tools</Link></li>
                  <li><Link href="/tools/gerador-atividades/login" className="transition hover:text-white/80">Entrar</Link></li>
                </ul>
              </div>
              <div>
                <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Contato</p>
                <ul className="space-y-2.5 text-xs text-white/50">
                  <li><a href="mailto:contato@axiorapath.com" className="transition hover:text-white/80">contato@axiorapath.com</a></li>
                  <li><a href="https://wa.me/5511966305417" target="_blank" rel="noopener noreferrer" className="transition hover:text-white/80">WhatsApp</a></li>
                </ul>
              </div>
              <div>
                <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Status</p>
                <p className="text-xs text-white/50">App principal em desenvolvimento. Tools em operacao com login e creditos.</p>
              </div>
            </div>
            <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/8 pt-6 sm:flex-row">
              <p className="text-[11px] text-white/25">© 2026 Axiora Educação Digital. Todos os direitos reservados.</p>
              <div className="flex items-center gap-4 text-[11px] text-white/30">
                <Link href="/privacidade" className="transition hover:text-white/60">Privacidade</Link>
                <Link href="/termos" className="transition hover:text-white/60">Termos de uso</Link>
              </div>
            </div>
          </div>
        </footer>

        <div className="sticky bottom-0 z-40 border-t border-[rgba(238,135,72,0.14)] bg-[linear-gradient(180deg,rgba(8,20,31,0.84)_0%,rgba(7,18,29,0.92)_100%)] p-3 backdrop-blur-xl md:hidden">
          <Link href="/tools/gerador-atividades/login" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] py-3.5 text-sm font-extrabold text-white shadow-[0_4px_0_rgba(158,74,30,0.5)] transition hover:brightness-110">
            Gerar minha primeira lista
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-1.5 text-center text-[10px] text-white/45">Com conta • sem assinatura • 3 creditos para comecar</p>
        </div>
      </div>
    </div>
  );
}

