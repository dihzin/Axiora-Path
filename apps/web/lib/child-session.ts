/**
 * Child session storage — usa sessionStorage (limpo ao fechar a aba)
 * para reduzir a janela de exposição de PII (nome e ID da criança).
 * Não usa localStorage para evitar persistência além da sessão.
 */

const CHILD_ID_KEY = "axiora_child_id";
const CHILD_NAME_KEY = "axiora_child_name";

function store(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

export function getChildId(): number | null {
  const raw = store()?.getItem(CHILD_ID_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function setChildId(id: number): void {
  store()?.setItem(CHILD_ID_KEY, String(id));
}

export function getChildName(): string | null {
  return store()?.getItem(CHILD_NAME_KEY) ?? null;
}

export function setChildName(name: string): void {
  store()?.setItem(CHILD_NAME_KEY, name);
}

export function clearChildSession(): void {
  store()?.removeItem(CHILD_ID_KEY);
  store()?.removeItem(CHILD_NAME_KEY);
}
