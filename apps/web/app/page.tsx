import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Gamepad2,
  Trophy,
  Zap,
  FileText,
  Printer,
  CheckCircle,
  Star,
  Map,
  Sparkles,
  Clock,
  Users,
} from "lucide-react";

// ─── Tools cards ─────────────────────────────────────────────────────────────
const TOOLS = [
  {
    Icon: FileText,
    accent: "#ee8748",
    title: "Gerador de Exercícios",
    description:
      "Crie listas personalizadas por matéria, tema e idade em segundos. Gabarito e PDF prontos para imprimir.",
    badge: "Grátis para começar",
    href: "/tools/gerador-atividades",
  },
  {
    Icon: Printer,
    accent: "#a855f7",
    title: "Planner Familiar",
    description:
      "Transforme os objetivos da semana em uma rotina simples e visual para toda a família.",
    badge: "Em breve",
    href: "/tools/planner-familiar",
  },
  {
    Icon: CheckCircle,
    accent: "#14b8a6",
    title: "Checkup de Aprendizagem",
    description:
      "Diagnóstico rápido do nível do aluno com plano de ação claro para os próximos 7 dias.",
    badge: "Em breve",
    href: "/tools/checkup-aprendizagem",
  },
];

// ─── App features ─────────────────────────────────────────────────────────────
const APP_FEATURES = [
  { Icon: BookOpen, accent: "#3b82f6", title: "Trilhas de aprendizado", description: "Caminho estruturado do básico ao avançado em cada disciplina." },
  { Icon: Gamepad2, accent: "#a855f7", title: "Aprendizado gamificado", description: "XP, conquistas e streaks que tornam o estudo diário um hábito." },
  { Icon: Trophy, accent: "#f59e0b", title: "Rankings e desafios", description: "Compare o progresso com amigos e supere metas semanais." },
  { Icon: Map, accent: "#14b8a6", title: "Mapa de progresso", description: "Visualize o avanço e identifique onde focar o próximo estudo." },
];

// ─── Coming soon ─────────────────────────────────────────────────────────────
const COMING_SOON = [
  { Icon: Sparkles, title: "Correção automática com IA", description: "Envie a foto da folha respondida — a IA corrige e dá feedback." },
  { Icon: Users, title: "Modo turma", description: "Professores gerenciam alunos, atribuem listas e acompanham resultados." },
  { Icon: Clock, title: "Histórico de gerações", description: "Salve e reutilize listas antigas com um clique." },
  { Icon: Zap, title: "Banco de questões", description: "Mais de 10 mil questões categorizadas prontas para montar listas." },
];

// ─── Stats ────────────────────────────────────────────────────────────────────
const STATS = [
  { value: "+2.400", label: "listas geradas" },
  { value: "5 matérias", label: "suportadas" },
  { value: "100%", label: "gratuito para começar" },
];

export default function HomePage() {
  return (
    <div className="relative isolate">
      {/* ── Background ─────────────────────────────────────────────────────── */}
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

      <div className="relative z-10 min-h-screen text-white">
        {/* ── Nav ────────────────────────────────────────────────────────────── */}
        <nav className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[rgba(6,14,22,0.88)] px-5 py-3 backdrop-blur-md">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[linear-gradient(180deg,#ee8748,#db6728)] shadow-[0_2px_0_rgba(158,74,30,0.5)]">
              <span className="text-[0.65rem] font-black text-white">A</span>
            </div>
            <span className="text-sm font-extrabold tracking-tight text-white">
              Axiora <span className="text-[#fcd34d]">Path</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/tools"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:text-white sm:inline-flex"
            >
              Tools
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-4 py-2 text-xs font-extrabold text-white shadow-[0_3px_0_rgba(158,74,30,0.5)] transition hover:brightness-110"
            >
              Entrar
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </nav>

        <div className="mx-auto w-full max-w-5xl px-5 pb-24">
          {/* ── HERO ───────────────────────────────────────────────────────────── */}
          <section className="overflow-hidden pt-16 text-center md:pt-24">
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(238,135,72,0.35)] bg-[rgba(238,135,72,0.12)] px-4 py-1.5 text-xs font-semibold text-[#fcd34d]">
              <Star className="h-3.5 w-3.5 text-[#ee8748]" />
              Ferramentas educacionais para pais e educadores
            </span>

            <div className="relative mt-5">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[300px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: "radial-gradient(ellipse, rgba(238,135,72,0.18) 0%, rgba(238,135,72,0.06) 50%, transparent 75%)", filter: "blur(48px)" }}
              />
              <h1 className="mx-auto max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-6xl">
                Aprendizado que{" "}
                <span className="bg-[linear-gradient(180deg,#fde68a_0%,#f59e0b_50%,#ee8748_100%)] bg-clip-text text-transparent">
                  realmente funciona.
                </span>
              </h1>
            </div>

            <p className="mx-auto mt-5 max-w-2xl text-base text-white/75 md:text-lg">
              Da criação de exercícios personalizados ao acompanhamento do progresso — a Axiora entrega
              as ferramentas certas para cada etapa do aprendizado.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/tools"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-8 py-4 text-base font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.3),0_6px_0_rgba(158,74,30,0.45),0_16px_28px_rgba(93,48,22,0.25)] transition hover:brightness-110 sm:w-auto"
              >
                Explorar ferramentas grátis
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/25 bg-[rgba(255,255,255,0.07)] px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition hover:border-white/35 hover:bg-[rgba(255,255,255,0.13)] sm:w-auto"
              >
                Acessar o app
              </Link>
            </div>

            {/* Stats strip */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-4 sm:gap-x-8">
              {STATS.map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-2xl font-extrabold text-white">{s.value}</p>
                  <p className="mt-0.5 text-xs text-white/50">{s.label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── AXIORA TOOLS ───────────────────────────────────────────────────── */}
          <section className="mt-24">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Axiora Tools</p>
              <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl md:text-4xl">Crie material educacional em segundos.</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-white/65">
                Ferramentas sem login, sem assinatura. Funciona no navegador e gera PDF pronto para imprimir.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {TOOLS.map((tool) => (
                <Link
                  key={tool.title}
                  href={tool.href}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.08)] p-5 backdrop-blur-sm transition hover:-translate-y-1 hover:border-white/20 hover:bg-[rgba(255,255,255,0.08)]"
                >
                  <div
                    className="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl"
                    style={{ background: `linear-gradient(90deg, ${tool.accent}, transparent)` }}
                    aria-hidden="true"
                  />
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `rgba(${tool.accent === "#ee8748" ? "238,135,72" : tool.accent === "#a855f7" ? "168,85,247" : "20,184,166"},0.15)` }}
                    >
                      <tool.Icon size={18} strokeWidth={1.75} style={{ color: tool.accent }} />
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{
                        background: tool.badge === "Grátis para começar" ? "rgba(238,135,72,0.18)" : "rgba(255,255,255,0.1)",
                        color: tool.badge === "Grátis para começar" ? "#fde68a" : "rgba(255,255,255,0.5)",
                      }}
                    >
                      {tool.badge}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-bold">{tool.title}</h3>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-white/65">{tool.description}</p>
                  <div className="mt-4 flex items-center gap-1 text-xs font-semibold" style={{ color: tool.accent }}>
                    {tool.badge === "Grátis para começar" ? "Acessar agora" : "Ver quando disponível"}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-6 text-center">
              <Link
                href="/tools"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 transition hover:text-white"
              >
                Ver todas as ferramentas
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>

          {/* ── AXIORA PATH (APP) ───────────────────────────────────────────────── */}
          <section className="mt-24">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Axiora Path</p>
              <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl md:text-4xl">O app que transforma o estudo em hábito.</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-white/65">
                Trilhas estruturadas, gamificação real e acompanhamento de progresso para alunos de 6 a 16 anos.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              {APP_FEATURES.map((feat) => (
                <div
                  key={feat.title}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.08)] p-5 backdrop-blur-sm transition hover:border-white/20 hover:bg-[rgba(255,255,255,0.08)]"
                >
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-xl"
                    style={{ background: `rgba(${feat.accent === "#3b82f6" ? "59,130,246" : feat.accent === "#a855f7" ? "168,85,247" : feat.accent === "#f59e0b" ? "245,158,11" : "20,184,166"},0.15)` }}
                  >
                    <feat.Icon size={18} strokeWidth={1.75} style={{ color: feat.accent }} />
                  </div>
                  <h3 className="text-sm font-bold">{feat.title}</h3>
                  <p className="text-xs leading-relaxed text-white/60">{feat.description}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-6 py-5 text-center backdrop-blur-sm">
              <p className="text-sm text-white/65">
                O Axiora Path está em acesso restrito.{" "}
                <Link href="/login" className="font-semibold text-[#fde68a] transition hover:text-white">
                  Faça login para acessar
                </Link>{" "}
                ou{" "}
                <Link href="/login" className="font-semibold text-white/80 underline underline-offset-2 transition hover:text-white">
                  solicite acesso antecipado.
                </Link>
              </p>
            </div>
          </section>

          {/* ── COMING SOON ────────────────────────────────────────────────────── */}
          <section className="mt-24">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Roadmap</p>
              <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl md:text-4xl">O que vem a seguir.</h2>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {COMING_SOON.map((item) => (
                <div
                  key={item.title}
                  className="flex items-start gap-4 rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] p-5 backdrop-blur-sm"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.07)]">
                    <item.Icon size={15} strokeWidth={1.75} className="text-white/50" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">{item.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-white/55">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── CTA FINAL ──────────────────────────────────────────────────────── */}
          <section className="mt-24 rounded-3xl border border-[rgba(238,135,72,0.25)] bg-[rgba(238,135,72,0.08)] px-5 py-10 text-center backdrop-blur-sm sm:px-8 sm:py-12">
            <h2 className="text-2xl font-extrabold sm:text-3xl md:text-4xl">Comece agora — é grátis.</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-white/75 md:text-base">
              Sem cadastro, sem cartão. Gere exercícios completos com gabarito e PDF em menos de 30 segundos.
            </p>
            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/tools/gerador-atividades"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-10 py-4 text-base font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.3),0_6px_0_rgba(158,74,30,0.45),0_16px_28px_rgba(93,48,22,0.25)] transition hover:brightness-110 sm:w-auto"
              >
                Gerar exercícios grátis
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/25 bg-[rgba(255,255,255,0.07)] px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition hover:border-white/35 hover:bg-[rgba(255,255,255,0.13)] sm:w-auto"
              >
                Acessar o app
              </Link>
            </div>
          </section>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <footer className="border-t border-white/10 bg-[rgba(6,14,22,0.82)] backdrop-blur-md">
          <div className="mx-auto max-w-5xl px-5 py-12">
            {/* ── Grid principal ── */}
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">

              {/* Marca */}
              <div className="lg:col-span-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[linear-gradient(180deg,#ee8748,#db6728)] shadow-[0_2px_0_rgba(158,74,30,0.5)]">
                    <span className="text-[0.7rem] font-black text-white">A</span>
                  </div>
                  <span className="text-sm font-extrabold tracking-tight text-white">
                    Axiora <span className="text-[#fcd34d]">Path</span>
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-white/45">
                  Aprendizado que realmente funciona — ferramentas educacionais para pais, professores e crianças.
                </p>
                {/* Redes sociais */}
                <div className="mt-4 flex items-center gap-3">
                  <a
                    href="https://instagram.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram da Axiora"
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/40 transition hover:border-white/20 hover:bg-white/10 hover:text-white/80"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
                    </svg>
                  </a>
                  <a
                    href="https://tiktok.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="TikTok da Axiora"
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/40 transition hover:border-white/20 hover:bg-white/10 hover:text-white/80"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.29 6.29 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
                    </svg>
                  </a>
                  <a
                    href="https://youtube.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="YouTube da Axiora"
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/40 transition hover:border-white/20 hover:bg-white/10 hover:text-white/80"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                      <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.75 15.52V8.48L15.5 12l-5.75 3.52z" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* Produto */}
              <div>
                <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Produto</p>
                <ul className="space-y-2.5 text-xs text-white/50">
                  <li><Link href="/tools" className="transition hover:text-white/80">Axiora Tools</Link></li>
                  <li><Link href="/tools/gerador-atividades" className="transition hover:text-white/80">Gerador de Exercícios</Link></li>
                  <li><Link href="/tools/planner-familiar" className="transition hover:text-white/80">Planner Familiar</Link></li>
                  <li><Link href="/tools/checkup-aprendizagem" className="transition hover:text-white/80">Checkup de Aprendizagem</Link></li>
                  <li><Link href="/login" className="transition hover:text-white/80">Axiora Path (App)</Link></li>
                </ul>
              </div>

              {/* Quem somos */}
              <div>
                <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Quem somos</p>
                <ul className="space-y-2.5 text-xs text-white/50">
                  <li>
                    <span className="text-white/50">
                      A Axiora nasceu da frustração de pais e professores que gastavam horas preparando material educacional do zero toda semana.
                    </span>
                  </li>
                  <li className="pt-1">
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
                    <a
                      href="mailto:oi@axiora.com.br"
                      className="flex items-center gap-2 text-white/50 transition hover:text-white/80"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden="true">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                      oi@axiora.com.br
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-white/50 transition hover:text-white/80"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden="true">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 1.99.518 3.86 1.42 5.488L2 22l4.633-1.364A9.953 9.953 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.946 7.946 0 0 1-4.291-1.254l-.308-.183-3.187.939.888-3.094-.2-.317A7.962 7.962 0 0 1 4 12c0-4.418 3.582-8 8-8s8 3.582 8 8-3.582 8-8 8z" />
                      </svg>
                      WhatsApp
                    </a>
                  </li>
                  <li className="pt-1">
                    <p className="text-[10px] text-white/30">Seg–Sex, 9h–18h (BRT)</p>
                  </li>
                </ul>
              </div>
            </div>

            {/* ── Linha inferior ── */}
            <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/8 pt-6 sm:flex-row">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                <p className="text-[11px] text-white/25">© 2026 Axiora Educação Digital. Todos os direitos reservados.</p>
                <span className="hidden text-white/15 sm:inline">·</span>
                <p className="text-[11px] text-white/25">Desenvolvido por <span className="text-white/40 font-semibold">Impact Digital Growth</span></p>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-white/30">
                <Link href="/privacidade" className="transition hover:text-white/60">Privacidade</Link>
                <Link href="/termos" className="transition hover:text-white/60">Termos de uso</Link>
              </div>
            </div>
          </div>
        </footer>

        {/* ── CTA fixo mobile ─────────────────────────────────────────────────── */}
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[rgba(6,14,22,0.95)] p-3 backdrop-blur-md md:hidden">
          <Link
            href="/tools/gerador-atividades"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] py-3.5 text-sm font-extrabold text-white shadow-[0_4px_0_rgba(158,74,30,0.5)] transition hover:brightness-110"
          >
            Gerar exercícios grátis
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
