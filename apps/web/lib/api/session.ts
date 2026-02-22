"use client";

const ACCESS_TOKEN_KEY = "axiora_access_token";
const TENANT_SLUG_KEY = "axiora_tenant_slug";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY) ?? sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function getTenantSlug(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TENANT_SLUG_KEY);
}

export function setTenantSlug(slug: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TENANT_SLUG_KEY, slug);
}

export function clearTenantSlug(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TENANT_SLUG_KEY);
}
