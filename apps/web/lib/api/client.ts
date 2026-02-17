"use client";

import { getAccessToken, getRefreshToken, getTenantSlug, setAccessToken, setRefreshToken } from "@/lib/api/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export type ThemeName = "default" | "space" | "jungle" | "ocean" | "soccer" | "capybara" | "dinos" | "princess" | "heroes";

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
  membership: { role: string; tenant_id: number; tenant_slug: string; onboarding_completed: boolean };
  child_profiles: Array<{ id: number; display_name: string; avatar_key: string | null; birth_year: number | null; theme: ThemeName; avatar_stage: number }>;
};

export type StreakResponse = {
  child_id: number;
  current: number;
  freeze_tokens: number;
  freeze_used_today: boolean;
  last_date: string | null;
};

export type WalletSummaryResponse = {
  child_id: number;
  wallet_id: number;
  currency_code: string;
  total_balance_cents: number;
  pot_balances_cents: {
    SPEND: number;
    SAVE: number;
    DONATE: number;
  };
};

export type GoalOut = {
  id: number;
  child_id: number;
  title: string;
  target_cents: number;
  image_url: string | null;
  is_locked: boolean;
  created_at: string;
};

export type LevelResponse = {
  child_id: number;
  xp_total: number;
  avatar_stage: number;
  level: number;
  level_progress_percent: number;
  xp_current_level_start: number;
  xp_next_level_target: number;
};

export type WeeklyMetricsResponse = {
  completion_rate: number;
  approved_count: number;
  pending_count: number;
  rejected_count: number;
};

export type WeeklyTrendResponse = {
  completion_delta_percent: number;
  earnings_delta_percent: number;
};

export type RecommendationOut = {
  id: number;
  child_id: number;
  type: string;
  title: string;
  body: string;
  severity: string;
  created_at: string;
  dismissed_at: string | null;
};

export type AchievementItem = {
  id: number;
  slug: string;
  title: string;
  description: string;
  icon_key: string;
  unlocked: boolean;
  unlocked_at: string | null;
};

export type AchievementListResponse = {
  child_id: number;
  achievements: AchievementItem[];
};

export type RoutineWeekLog = {
  id: number;
  child_id: number;
  task_id: number;
  date: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: string;
  decided_at: string | null;
  decided_by_user_id: number | null;
  parent_comment: string | null;
};

export type RoutineWeekResponse = {
  start_date: string;
  end_date: string;
  logs: RoutineWeekLog[];
};

export type MoodType = "HAPPY" | "OK" | "SAD" | "ANGRY" | "TIRED";

export type MoodOut = {
  child_id: number;
  date: string;
  mood: MoodType;
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

export async function getTasks(): Promise<Array<{ id: number; title: string; difficulty: string; weight: number; is_active: boolean }>> {
  return apiRequest<Array<{ id: number; title: string; difficulty: string; weight: number; is_active: boolean }>>("/tasks", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function completeOnboarding(payload: {
  child_name: string;
  reward_split: { spend: number; save: number; donate: number };
  monthly_allowance_cents: number;
  parent_pin: string;
}): Promise<{ onboarding_completed: boolean }> {
  return apiRequest<{ onboarding_completed: boolean }>("/onboarding/complete", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function acceptLegal(dataRetentionPolicyVersion = "v1"): Promise<{
  accepted: boolean;
  accepted_terms_at: string;
  accepted_privacy_at: string;
  data_retention_policy_version: string;
}> {
  return apiRequest<{
    accepted: boolean;
    accepted_terms_at: string;
    accepted_privacy_at: string;
    data_retention_policy_version: string;
  }>("/legal/accept", {
    method: "POST",
    body: { data_retention_policy_version: dataRetentionPolicyVersion },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getStreak(childId: number): Promise<StreakResponse> {
  return apiRequest<StreakResponse>(`/streak?child_id=${childId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getWalletSummary(childId: number): Promise<WalletSummaryResponse> {
  return apiRequest<WalletSummaryResponse>(`/wallet/summary?child_id=${childId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getGoals(childId: number): Promise<GoalOut[]> {
  return apiRequest<GoalOut[]>(`/goals?child_id=${childId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getLevels(childId: number): Promise<LevelResponse> {
  return apiRequest<LevelResponse>(`/levels?child_id=${childId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getWeeklyMetrics(childId: number): Promise<WeeklyMetricsResponse> {
  return apiRequest<WeeklyMetricsResponse>(`/routine/weekly-metrics?child_id=${childId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getWeeklyTrend(childId: number): Promise<WeeklyTrendResponse> {
  return apiRequest<WeeklyTrendResponse>(`/analytics/weekly-trend?child_id=${childId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getRoutineWeek(childId: number, isoDate: string): Promise<RoutineWeekResponse> {
  return apiRequest<RoutineWeekResponse>(`/routine/week?child_id=${childId}&date=${isoDate}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function decideRoutine(logId: number, decision: "APPROVE" | "REJECT", parentComment?: string): Promise<RoutineWeekLog> {
  return apiRequest<RoutineWeekLog>("/routine/decide", {
    method: "POST",
    body: { log_id: logId, decision, parent_comment: parentComment ?? null },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function markRoutine(childId: number, taskId: number, isoDate: string): Promise<RoutineWeekLog> {
  return apiRequest<RoutineWeekLog>("/routine/mark", {
    method: "POST",
    body: { child_id: childId, task_id: taskId, date: isoDate },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getMood(childId: number): Promise<MoodOut[]> {
  return apiRequest<MoodOut[]>(`/mood?child_id=${childId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function postMood(childId: number, mood: MoodType): Promise<MoodOut> {
  return apiRequest<MoodOut>("/mood", {
    method: "POST",
    body: { child_id: childId, mood },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getRecommendations(childId: number): Promise<RecommendationOut[]> {
  return apiRequest<RecommendationOut[]>(`/recommendations?child_id=${childId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function dismissRecommendation(recommendationId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/recommendations/${recommendationId}/dismiss`, {
    method: "POST",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function updateChildTheme(childId: number, theme: ThemeName): Promise<{ child_id: number; theme: ThemeName }> {
  return apiRequest<{ child_id: number; theme: ThemeName }>(`/children/${childId}/theme`, {
    method: "PUT",
    body: { theme },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAchievements(childId: number): Promise<AchievementListResponse> {
  return apiRequest<AchievementListResponse>(`/achievements?child_id=${childId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}
