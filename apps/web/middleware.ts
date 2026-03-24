import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// IDs dos experimentos ativos
const EXPERIMENTS = [
  "exp1_headline",
  "exp2_cta",
  "exp3_price",
  "exp4_social",
  "exp5_paywall",
] as const;

const COOKIE_PREFIX = "ax_ab_";
// 30 dias — garante que o usuário veja sempre a mesma variante
const MAX_AGE = 60 * 60 * 24 * 30;

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  for (const exp of EXPERIMENTS) {
    const name = `${COOKIE_PREFIX}${exp}`;
    // Só atribui se ainda não tiver cookie
    if (!request.cookies.has(name)) {
      const variant = Math.random() < 0.5 ? "a" : "b";
      response.cookies.set(name, variant, {
        maxAge: MAX_AGE,
        sameSite: "lax",
        httpOnly: false, // precisa ser lido pelo cliente também
        path: "/",
      });
    }
  }

  return response;
}

// Roda apenas nas rotas do Tools — não interfere no restante do app
export const config = {
  matcher: ["/tools", "/tools/:path*"],
};
