"use client";

import { getAccessToken, getRefreshToken, getTenantSlug, setAccessToken, setRefreshToken } from "@/lib/api/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  requireAuth?: boolean;
  includeTenant?: boolean;
};

class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  const tenantSlug = getTenantSlug();
  if (!refreshToken || !tenantSlug) return null;

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Slug": tenantSlug,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) return null;
  const data = (await response.json()) as { access_token: string; refresh_token: string };
  setAccessToken(data.access_token);
  setRefreshToken(data.refresh_token);
  return data.access_token;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.includeTenant !== false) {
    const tenantSlug = getTenantSlug();
    if (tenantSlug) {
      headers["X-Tenant-Slug"] = tenantSlug;
    }
  }

  let accessToken = getAccessToken();
  if (options.requireAuth !== false && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const makeRequest = async (): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let response = await makeRequest();
  if (response.status === 401 && options.requireAuth !== false) {
    accessToken = await refreshAccessToken();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
      response = await makeRequest();
    }
  }

  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    throw new ApiError("API request failed", response.status, payload);
  }

  return (await parseJsonSafe(response)) as T;
}

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type AuthMeResponse = {
  user: { id: number; email: string; name: string };
  membership: { role: string; tenant_id: number; tenant_slug: string };
  child_profiles: Array<{ id: number; display_name: string; avatar_key: string | null; birth_year: number | null }>;
};

export async function login(email: string, password: string): Promise<AuthTokens> {
  return apiRequest<AuthTokens>("/auth/login", {
    method: "POST",
    body: { email, password },
    requireAuth: false,
    includeTenant: true,
  });
}

export async function getMe(): Promise<AuthMeResponse> {
  return apiRequest<AuthMeResponse>("/auth/me", { method: "GET", requireAuth: true, includeTenant: true });
}

