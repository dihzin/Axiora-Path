import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const isAuthenticated = typeof authHeader === "string" && authHeader.startsWith("Bearer ");

  // Informações sensíveis só para usuários autenticados
  if (!isAuthenticated) {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_GIT_SHA ??
    process.env.GIT_SHA ??
    "unknown";
  const build = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.BUILD_ID ?? "unknown";
  const env = process.env.NODE_ENV ?? "unknown";

  return NextResponse.json(
    {
      status: "ok",
      env,
      commit,
      build,
    },
    { status: 200 },
  );
}

