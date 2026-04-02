/**
 * Utilitários de identidade local do Axiora Tools.
 *
 * anonymous_id  — UUID v4 persistente no localStorage.
 *                 Identidade principal de longa duração.
 *
 * fingerprint_id — SHA-256 de características do browser (32 hex chars).
 *                  Sem libs externas; usa apenas Web Crypto API.
 *                  Auxilia reconciliação quando o localStorage é limpo,
 *                  mas não substitui o anonymous_id.
 */

export const ANON_ID_KEY = "ax_anon_id";
export const FINGERPRINT_KEY = "ax_fp_id";

// ── anonymous_id ──────────────────────────────────────────────────────────────

function createAnonUuid(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-");
  }

  return `anon-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function getOrCreateAnonId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(ANON_ID_KEY);
  if (existing) return existing;
  const id = createAnonUuid();
  window.localStorage.setItem(ANON_ID_KEY, id);
  return id;
}

// ── fingerprint_id ────────────────────────────────────────────────────────────

/**
 * Canvas fingerprint — renderiza texto com gradiente e lê os pixels de volta.
 * O resultado varia por GPU/driver/OS mas é IDÊNTICO entre incognito e normal
 * no mesmo hardware, pois depende da pilha de renderização, não do storage.
 */
function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(238,135,72,0.9)";
    ctx.fillRect(0, 0, 240, 60);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 14px Arial, sans-serif";
    ctx.fillText("Axiora Tools fp v2", 4, 22);
    ctx.fillStyle = "rgba(15,23,42,0.6)";
    ctx.font = "11px monospace";
    ctx.fillText(navigator.vendor ?? "x", 4, 42);
    // Últimos 80 chars: região mais sensível a diferenças de renderização
    return canvas.toDataURL("image/png").slice(-80);
  } catch {
    return "";
  }
}

/**
 * WebGL fingerprint — extrai renderer e vendor da GPU via extensão WEBGL_debug.
 * Strings como "ANGLE (NVIDIA GeForce RTX...)" são únicas por hardware.
 */
function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = (
      canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl")
    ) as WebGLRenderingContext | null;
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return gl.getParameter(gl.RENDERER) as string ?? "";
    const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) as string ?? "";
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string ?? "";
    return `${vendor}::${renderer}`;
  } catch {
    return "";
  }
}

async function computeFingerprint(): Promise<string> {
  // Tier 1: sinais hardware-bound (idênticos entre incognito e janela normal)
  const canvasFp = getCanvasFingerprint();
  const webglFp = getWebGLFingerprint();

  // Tier 2: sinais de navegador — estáveis mas podem diferir em extensões de privacidade
  const browserSignals = [
    navigator.userAgent,
    navigator.language,
    navigator.languages?.join(",") ?? "",
    `${screen.width}x${screen.height}x${screen.colorDepth}x${screen.pixelDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    String(navigator.hardwareConcurrency ?? ""),
    String((navigator as unknown as Record<string, unknown>).deviceMemory ?? ""),
    navigator.platform ?? "",
    navigator.vendor ?? "",
    String(navigator.maxTouchPoints ?? 0),
  ].join("|");

  const raw = [canvasFp, webglFp, browserSignals].join("§");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function getOrCreateFingerprintId(): Promise<string> {
  if (typeof window === "undefined") return "";
  // Sem cache em localStorage: Canvas+WebGL são hardware-bound e recalcular é rápido
  // (~5ms). Não cachear garante que janela normal e incognito produzem o mesmo hash
  // mesmo após mudanças de algoritmo — eliminando a janela de bypass por transição.
  try {
    return await computeFingerprint();
  } catch {
    return "";
  }
}
