#!/usr/bin/env node

import { execSync } from "node:child_process";

function parseArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function shortSha(sha) {
  return typeof sha === "string" && sha.length >= 7 ? sha.slice(0, 7) : sha || "unknown";
}

async function fetchJson(url) {
  const response = await fetch(url, { method: "GET", redirect: "follow" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} at ${url}`);
  }
  return response.json();
}

async function main() {
  const localCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const webUrl = parseArg("web") || process.env.WEB_URL;
  const apiUrl = parseArg("api") || process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

  if (!webUrl || !apiUrl) {
    console.error("Usage: node scripts/release-parity-check.mjs --web=https://your-web --api=https://your-api");
    process.exit(2);
  }

  const normalizedWeb = webUrl.replace(/\/+$/, "");
  const normalizedApi = apiUrl.replace(/\/+$/, "");
  const [webVersion, apiHealth] = await Promise.all([
    fetchJson(`${normalizedWeb}/api/version`),
    fetchJson(`${normalizedApi}/health`),
  ]);

  const webCommit = String(webVersion.commit ?? "unknown");
  const apiCommit = String(apiHealth.commit ?? "unknown");
  const localShort = shortSha(localCommit);
  const webShort = shortSha(webCommit);
  const apiShort = shortSha(apiCommit);

  const checks = [
    { name: "web_vs_api", ok: webCommit !== "unknown" && apiCommit !== "unknown" && webShort === apiShort },
    { name: "local_vs_web", ok: webCommit !== "unknown" && localShort === webShort },
    { name: "local_vs_api", ok: apiCommit !== "unknown" && localShort === apiShort },
  ];

  console.log("\nAxiora Release Parity");
  console.log("---------------------");
  console.log(`Local commit: ${localCommit}`);
  console.log(`Web commit:   ${webCommit}`);
  console.log(`API commit:   ${apiCommit}`);
  console.log(`Web env:      ${webVersion.env ?? "unknown"} | build: ${webVersion.build ?? "unknown"}`);
  console.log(`API env:      ${apiHealth.env ?? "unknown"} | build: ${apiHealth.build ?? "unknown"}`);
  console.log("");

  let failed = false;
  for (const check of checks) {
    const status = check.ok ? "OK" : "FAIL";
    console.log(`${status.padEnd(4)} ${check.name}`);
    if (!check.ok) failed = true;
  }

  if (failed) {
    console.error("\nParity check failed. Review deployments/caches and re-run.");
    process.exit(1);
  }

  console.log("\nParity check passed.");
}

main().catch((error) => {
  console.error("Parity check error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

