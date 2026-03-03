export default function AccessDeniedPage() {
  return (
    <main className="min-h-screen w-full bg-[#F7FAFF] px-4 py-10 md:px-8">
      <section className="mx-auto max-w-2xl rounded-3xl border border-[#D4E1F3] bg-white p-8 shadow-[0_14px_30px_rgba(16,48,90,0.08)]">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#6986AE]">Acesso negado</p>
        <h1 className="mt-2 text-2xl font-black text-[#173A66]">Permissão insuficiente</h1>
        <p className="mt-3 text-sm font-semibold text-[#4F6C94]">
          Esta área é restrita a administradores da plataforma.
        </p>
      </section>
    </main>
  );
}
