import Link from "next/link";

type BetaPageProps = {
  searchParams: Promise<{ tool?: string }>;
};

export default async function BetaPage({ searchParams }: BetaPageProps) {
  const { tool } = await searchParams;
  const selectedTool = (tool ?? "").trim();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12 text-white">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.16em] text-white/60">Axiora Beta</p>
        <h1 className="text-3xl font-extrabold md:text-4xl">Lista de espera inteligente</h1>
        <p className="text-white/80">
          Fluxo de captura para validar demanda dos tools sem acoplar ao produto principal.
        </p>
      </header>

      <section className="rounded-2xl border border-white/15 bg-white/5 p-6">
        <p className="text-sm text-white/80">
          Tool de interesse:{" "}
          <span className="font-semibold text-emerald-200">{selectedTool.length > 0 ? selectedTool : "não informado"}</span>
        </p>
        <p className="mt-3 text-sm text-white/80">
          Backend disponível via <code>/api/tools/guest-session</code> e <code>/api/tools/identify</code> para captura progressiva (guest → e-mail).
        </p>
      </section>

      <div className="flex gap-3">
        <Link href="/tools" className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
          Ver tools
        </Link>
        <Link href="/app" className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-300">
          Ir para produto principal
        </Link>
      </div>
    </main>
  );
}
