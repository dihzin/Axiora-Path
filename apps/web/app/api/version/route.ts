import { NextResponse } from "next/server";

export async function GET() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_GIT_SHA ??
    process.env.GIT_SHA ??
    "unknown";
  const build = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.BUILD_ID ?? "unknown";
  const env = process.env.NODE_ENV ?? "unknown";
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "undefined";

  return NextResponse.json(
    {
      status: "ok",
      env,
      commit,
      build,
      apiBase,
    },
    { status: 200 },
  );
}

