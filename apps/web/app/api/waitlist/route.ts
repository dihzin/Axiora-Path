import { NextResponse } from "next/server";

type WaitlistContext = "app" | "roadmap" | "tools_coming_soon";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function notifyByResend(email: string, context: WaitlistContext): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.AXIORA_WAITLIST_TO_EMAIL?.trim();
  const from = process.env.AXIORA_WAITLIST_FROM_EMAIL?.trim() || "onboarding@resend.dev";
  if (!apiKey || !to) return false;

  const subjectByContext: Record<WaitlistContext, string> = {
    app: "[Waitlist] Interesse no Axiora Path",
    roadmap: "[Waitlist] Interesse no roadmap",
    tools_coming_soon: "[Waitlist] Interesse nas tools em breve",
  };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: subjectByContext[context],
      html: `<p>Novo interesse de waitlist:</p><ul><li><strong>E-mail:</strong> ${email}</li><li><strong>Contexto:</strong> ${context}</li><li><strong>Data:</strong> ${new Date().toISOString()}</li></ul>`,
    }),
    cache: "no-store",
  });

  return response.ok;
}

export async function POST(req: Request) {
  let payload: { email?: string; context?: WaitlistContext } = {};
  try {
    payload = (await req.json()) as { email?: string; context?: WaitlistContext };
  } catch {
    return NextResponse.json({ message: "Payload inválido." }, { status: 400 });
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const context = payload.context;
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ message: "Informe um e-mail válido." }, { status: 400 });
  }
  if (!context || !["app", "roadmap", "tools_coming_soon"].includes(context)) {
    return NextResponse.json({ message: "Contexto inválido." }, { status: 400 });
  }

  const delivered = await notifyByResend(email, context);

  return NextResponse.json({
    ok: true,
    delivered,
    message: delivered
      ? "Perfeito. Registramos seu interesse e vamos avisar por e-mail."
      : "Perfeito. Registramos seu interesse e vamos avisar quando abrir.",
  });
}

