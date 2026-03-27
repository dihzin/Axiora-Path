"use client";

import {
  clearTenantSlug,
  clearTokens,
  getAccessToken,
  getTenantSlug,
  setAccessToken,
} from "@/lib/api/session";

function resolveApiUrl(path = ""): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (typeof window !== "undefined" && (path.startsWith("/api/") || path.startsWith("/auth/"))) {
    return "";
  }
  if (apiUrl) {
    return apiUrl.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  throw new Error("NEXT_PUBLIC_API_URL is not defined");
}
export type ThemeName = "default" | "space" | "jungle" | "ocean" | "soccer" | "capybara" | "dinos" | "princess" | "heroes";
export type MultiplayerSessionStatus = "WAITING" | "IN_PROGRESS" | "FINISHED" | "CANCELLED";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  requireAuth?: boolean;
  includeTenant?: boolean;
  suppressAuthRedirect?: boolean;
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

type ApiErrorPayload = {
  code?: string;
  message?: string;
  details?: unknown;
};

let parentalConsentBlocked = false;

function isParentalConsentCode(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const code = (payload as { code?: unknown }).code;
  return typeof code === "string" && code.trim().toUpperCase() === "PARENTAL_CONSENT_REQUIRED";
}

function isMissingTenantHeaderCode(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const code = (payload as { code?: unknown }).code;
  const message = (payload as { message?: unknown }).message;
  if (typeof code !== "string" || code.trim().toUpperCase() !== "BAD_REQUEST") return false;
  return typeof message === "string" && message.includes("X-Tenant-Slug header is required");
}

function isConsentExemptPath(path: string): boolean {
  return (
    path === "/legal" ||
    path.startsWith("/legal") ||
    path.startsWith("/auth/") ||
    path === "/health" ||
    path.startsWith("/docs") ||
    path.startsWith("/openapi") ||
    path.startsWith("/api/platform-admin/")
  );
}

function redirectToLoginIfBrowser(): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/login") return;
  window.location.assign("/login");
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const payload = error.payload as ApiErrorPayload | null;
    if (payload && typeof payload.code === "string" && payload.code.toUpperCase() === "PARENTAL_CONSENT_REQUIRED") {
      return "Consentimento parental pendente. Peça para um responsável aceitar os termos para continuar.";
    }
    if (payload && typeof payload.message === "string" && payload.message.trim().length > 0) {
      return payload.message;
    }
  }
  return fallback;
}

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split("; ")
    .find((item) => item.startsWith("axiora_csrf_token="));
  if (!raw) return null;
  const value = raw.split("=")[1];
  return value ? decodeURIComponent(value) : null;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function refreshAccessToken(suppressRedirect = false): Promise<string | null> {
  const apiUrl = resolveApiUrl("/auth/refresh");
  const tenantSlug = getTenantSlug();

  let response: Response;
  try {
    const csrfToken = getCsrfTokenFromCookie();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (tenantSlug) {
      headers["X-Tenant-Slug"] = tenantSlug;
    }
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }

    response = await fetch(`${apiUrl}/auth/refresh`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({}),
    });
  } catch {
    clearTokens();
    clearTenantSlug();
    if (!suppressRedirect) {
      redirectToLoginIfBrowser();
    }
    return null;
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearTokens();
      clearTenantSlug();
      if (!suppressRedirect) {
        redirectToLoginIfBrowser();
      }
    }
    return null;
  }
  const data = (await response.json()) as { access_token: string };
  setAccessToken(data.access_token);
  return data.access_token;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const apiUrl = resolveApiUrl(path);
  const method = options.method ?? "GET";
  if (parentalConsentBlocked && !isConsentExemptPath(path)) {
    throw new ApiError("Blocked by parental consent policy", 403, {
      code: "PARENTAL_CONSENT_REQUIRED",
      message: "Parental consent required",
    });
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const csrfToken = getCsrfTokenFromCookie();

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

  const makeRequest = async (): Promise<Response> => {
    try {
      if (csrfToken && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        headers["X-CSRF-Token"] = csrfToken;
      }
      return await fetch(`${apiUrl}${path}`, {
        method,
        headers,
        credentials: "include",
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch {
      throw new ApiError("Network error", 0, {
        code: "NETWORK_ERROR",
        message: "Não foi possível conectar ao servidor",
      });
    }
  };

  let response = await makeRequest();
  if (response.status === 401 && options.requireAuth !== false) {
    accessToken = await refreshAccessToken(Boolean(options.suppressAuthRedirect));
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
      response = await makeRequest();
    }
  }

  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    if (isParentalConsentCode(payload)) {
      parentalConsentBlocked = true;
    }
    if (response.status === 400 && options.includeTenant !== false && isMissingTenantHeaderCode(payload)) {
      clearTenantSlug();
      if (typeof window !== "undefined" && window.location.pathname !== "/select-tenant") {
        window.location.assign("/select-tenant");
      }
    }
    if (options.requireAuth !== false && response.status === 401) {
      clearTokens();
      clearTenantSlug();
      if (!options.suppressAuthRedirect) {
        redirectToLoginIfBrowser();
      }
    }
    throw new ApiError("API request failed", response.status, payload);
  }

  if (path.startsWith("/legal")) {
    parentalConsentBlocked = false;
  }

  return (await parseJsonSafe(response)) as T;
}

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type PrimaryLoginMembership = {
  tenant_id: number;
  tenant_slug: string;
  tenant_name: string;
  tenant_type: "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN";
  role: string;
};

export type PrimaryLoginResponse = {
  access_token: string;
  user: { id: number; email: string; name: string; created_at: string };
  memberships: PrimaryLoginMembership[];
};

export type SelectTenantResponse = {
  access_token: string;
  tenant_slug: string;
  role: string;
};

export type AuthMeResponse = {
  user: { id: number; email: string; name: string };
  membership: { role: string; tenant_id: number; tenant_slug: string; tenant_type: "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN"; onboarding_completed: boolean };
  child_profiles: Array<{
    id: number;
    display_name: string;
    avatar_key: string | null;
    date_of_birth: string | null;
    birth_year: number | null;
    needs_profile_completion: boolean;
    theme: ThemeName;
    avatar_stage: number;
  }>;
};

export type OrganizationMembership = {
  role: string;
  tenant_id: number;
  tenant_name: string;
  tenant_slug: string;
  tenant_type: "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN";
  onboarding_completed: boolean;
};

export type ChildProfileSummary = {
  id: number;
  display_name: string;
  avatar_key: string | null;
  date_of_birth: string | null;
  birth_year: number | null;
  needs_profile_completion: boolean;
  theme: ThemeName;
  avatar_stage: number;
};

export type TaskOut = {
  id: number;
  title: string;
  description?: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD" | "LEGENDARY";
  weight: number;
  is_active: boolean;
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
  xp_reward?: number;
  coin_reward?: number;
  badge_key?: string | null;
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
  task_title: string;
  task_weight: number;
  date: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: string;
  decided_at: string | null;
  decided_by_user_id: number | null;
  parent_comment: string | null;
  xp_awarded: number;
  xp_source: "TASK" | null;
};

export type RoutineTaskProgress = {
  task_id: number;
  task_title: string;
  task_weight: number;
  xp_per_approval: number;
  marked_count_week: number;
  approved_count_week: number;
  pending_count_week: number;
  rejected_count_week: number;
  completion_percent_week: number;
  completed_today: boolean;
  xp_gained_week: number;
};

export type RoutineWeekResponse = {
  start_date: string;
  end_date: string;
  logs: RoutineWeekLog[];
  task_progress: RoutineTaskProgress[];
};

export type MoodType = "HAPPY" | "OK" | "SAD" | "ANGRY" | "TIRED";

export type MoodOut = {
  child_id: number;
  date: string;
  mood: MoodType;
};

export type AxionStateResponse = {
  stage: number;
  mood_state: string;
  personality_traits: string[];
};

export type AxionBriefResponse = {
  decision_id: string;
  tenant_id: number;
  child_id: number;
  experiment_key?: string | null;
  variant?: string | null;
  nba_enabled_final: boolean;
  nba_reason: string;
  actionType: string;
  context: string;
  cooldown_until?: string | null;
  stateSummary: {
    trend: "UP" | "DOWN" | "STABLE";
  };
  message: string;
  tone: "CALM" | "ENCOURAGE" | "CHALLENGE" | "CELEBRATE" | "SUPPORT" | string;
  cta: {
    label: string;
    actionType: string;
    payload: Record<string, unknown>;
  };
  miniStats: {
    streak: number;
    dueReviews: number;
    energy: number;
  };
  debug?: {
    state: Record<string, unknown>;
    triggeredRules: number[];
    evaluatedRules: Array<Record<string, unknown>>;
    decisions: Array<Record<string, unknown>>;
    factsUsed: Record<string, unknown>;
    temporaryBoosts: Array<Record<string, unknown>>;
    templateChosen: number | null;
  } | null;
};

export type AxionBrainStateSubject = {
  subject: string;
  masteryScore: number;
  trendLast7Days: number;
  status: "improving" | "stable" | "needs_attention" | string;
};

export type AxionBrainStateResponse = {
  subjects: AxionBrainStateSubject[];
  weakestSubject: string | null;
  strongestSubject: string | null;
  averageMastery: number;
};

export type AxionRecentUnlock = {
  contentId: number;
  subject: string;
  unlockedAt: string;
  reason: string;
};

export type AxionGuardrailsSummaryResponse = {
  repeats_blocked_last_7_days: number;
  safety_blocks_last_7_days: number;
  fallback_activations_last_7_days: number;
};

export type AxionPolicyStatusResponse = {
  policyMode: string;
  rolloutPercentage: number | null;
};

export type AxionExperimentDashboardVariant = {
  variant: string;
  exposures: number;
  ctaToStartedPct: number;
  d1RatePct: number;
  sessionFrequency: number;
  rawPValue: number | null;
  adjustedPValue: number | null;
  liftPctPoints: number;
  significant: boolean;
  correctionMethod: string;
};

export type AxionExperimentDashboardResponse = {
  exposuresTotal: number;
  uniqueExposuresPerDay: number;
  ctaClicked: number;
  sessionStarted: number;
  ctaToSessionStartedPct: number;
  d1RatePct: number;
  d7RatePct: number | null;
  avgSessionFrequency30d: number;
  variants: AxionExperimentDashboardVariant[];
};

export type AxionExperimentRetentionVariantResponse = {
  variant: string;
  cohortUsers: number;
  retainedD1Users: number;
  retainedD7Users: number;
  d1Rate: number;
  d7Rate: number;
};

export type AxionExperimentRetentionResponse = {
  experimentKey: string;
  experimentStatus: "ACTIVE" | "PAUSED" | "AUTO_PAUSED" | string;
  cohortUsers: number;
  retainedD1Users: number;
  retainedD7Users: number;
  d1Rate: number;
  d7Rate: number;
  variants: AxionExperimentRetentionVariantResponse[];
};

export type AxionExecutiveWeeklyPoint = {
  weekStart: string;
  d1RatePct: number;
  d7RatePct: number;
  ctrPct: number;
};

export type AxionExecutiveExperimentSummary = {
  experimentKey: string;
  status: string;
  liftPp: number;
  significantPositive: boolean;
  rolloutPercent: number;
  indicator: "green" | "yellow" | "red";
};

export type AxionExecutiveDashboardResponse = {
  activeExperiments: number;
  pausedExperiments: number;
  weightedAverageLiftPp: number;
  aggregatedD1RatePct: number;
  aggregatedD7RatePct: number;
  experimentalSuccessRatePct: number;
  averageRolloutPct: number;
  experiments: AxionExecutiveExperimentSummary[];
  weeklyRetention: AxionExecutiveWeeklyPoint[];
  weeklyCtr: AxionExecutiveWeeklyPoint[];
};

export type AxionRetentionMetricsResponse = {
  cohortUsers: number;
  retainedD1Users: number;
  retainedD7Users: number;
  retainedD30Users: number;
  d1Rate: number;
  d7Rate: number;
  d30Rate: number;
  sessionFrequency: number;
  ctaClickUsers: number;
  sessionStartedUsers: number;
  ctaSessionStartedConvertedUsers: number;
  ctaToSessionStartedConversion: number;
  ctaSessionConvertedUsers: number;
  ctaToSessionConversion: number;
  exposuresTotal: number;
  uniqueExposuresPerDay: number;
  lookbackDays: number;
  filters: Record<string, unknown>;
};

export type ParentInsightCard = {
  title: string;
  summary: string;
  tone: string;
};

export type ParentInsightSkill = {
  skillName: string;
  subjectName: string;
  explanation: string;
};

export type ParentAxionInsightsResponse = {
  learningRhythm: ParentInsightCard;
  emotionalTrend: ParentInsightCard;
  strengthSkills: ParentInsightSkill[];
  reinforcementSkills: ParentInsightSkill[];
  dropoutRisk: ParentInsightCard;
  suggestedParentalActions: string[];
  decisionId?: string | null;
};

export type AxionStudioPolicy = {
  id: number;
  name: string;
  context: string;
  condition: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
  priority: number;
  enabled: boolean;
  lastUpdated: string;
};

export type AxionStudioTemplate = {
  id: number;
  context: string;
  tone: string;
  tags: string[];
  conditions: Record<string, unknown>;
  text: string;
  weight: number;
  enabled: boolean;
  lastUpdated: string;
};

export type AxionStudioVersion = {
  id: string;
  version: number;
  snapshot: Record<string, unknown>;
  createdByUserId: number;
  createdAt: string;
};

export type AxionStudioAudit = {
  id: number;
  actorUserId: number;
  action: string;
  entityType: string;
  entityId: string;
  diff: Record<string, unknown>;
  createdAt: string;
};

export type AxionStudioPreviewUser = {
  userId: number;
  name: string;
  email: string;
};

export type AxionStudioMe = {
  userId: number;
  name: string;
  email: string;
};

export type PlatformTenantSummary = {
  id: number;
  name: string;
  slug: string;
  type: "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN" | string;
  onboardingCompleted: boolean;
  consentCompleted: boolean;
  createdAt: string;
};

export type PlatformTenantCreateResponse = {
  tenant: PlatformTenantSummary;
  adminUserId: number;
  adminEmail: string;
  adminRole: "PARENT" | "TEACHER" | string;
  userCreated: boolean;
  membershipCreated: boolean;
  testChildCreated: boolean;
};

export type PlatformTenantAdminMember = {
  userId: number;
  name: string;
  email: string;
  role: "PARENT" | "TEACHER" | string;
};

export type PlatformTenantDetail = {
  tenant: PlatformTenantSummary;
  adminMembers: PlatformTenantAdminMember[];
  childrenCount: number;
  activeChildrenCount: number;
  membershipsCount: number;
};

export type PlatformAdminUserCreateResponse = {
  userId: number;
  adminEmail: string;
  tenantSlug: string;
  tenantType: "SYSTEM_ADMIN" | string;
  userCreated: boolean;
  membershipCreated: boolean;
  passwordReset: boolean;
  tenantId: number;
};

export type PlatformAdminUserDeleteResponse = {
  deleted: boolean;
  userId: number;
  tenantId: number;
};

export type AxionStudioPreviewResponse = {
  state: Record<string, unknown>;
  facts: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
  message: string;
  tone: string;
  cta: Record<string, unknown>;
  chosenRuleIds: number[];
  chosenTemplateId: number | null;
};

export type AxionImpactResponse = {
  userId: number;
  days: number;
  decisionsTotal: number;
  improvementRatePercent: number;
  avgXpDeltaAfterBoost: number;
  avgFrustrationDeltaAfterDifficultyCap: number;
  avgDropoutRiskDelta: number;
  masteryGrowthProxy: number;
};

export type AxionFinanceRecurrence = "NONE" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type AxionFinanceStoredStatus = "PENDING" | "PAID";

export type AxionFinanceBill = {
  id: number;
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  recurrence: AxionFinanceRecurrence;
  status: AxionFinanceStoredStatus;
  notes: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AxionFinanceBillsPage = {
  items: AxionFinanceBill[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AxionFinanceBalance = {
  balance: number;
  updatedAt: string | null;
};

export type AxionFinancePayBillResponse = {
  paidBill: AxionFinanceBill;
  recurringBill: AxionFinanceBill | null;
  balance: number;
};

export type CoachResponse = {
  reply: string;
  suggested_actions: string[];
  tone: string;
};

export type DailyMissionResponse = {
  id: string;
  date: string;
  title: string;
  description: string;
  rarity: "normal" | "special" | "epic";
  xp_reward: number;
  coin_reward: number;
  status: "pending" | "completed";
};

export type DailyMissionCompleteResponse = {
  success: boolean;
  xp_gained: number;
  coins_gained: number;
  new_level: number;
  streak: number;
};

export type GameType =
  | "TICTACTOE"
  | "WORDSEARCH"
  | "MEMORY"
  | "CROSSWORD"
  | "HANGMAN"
  | "FINANCE_SIM"
  | "TUG_OF_WAR"
  | "QUIZ_BATTLE"
  | "MATH_CHALLENGE"
  | "PUZZLE_COOP"
  | "FINANCE_BATTLE";
export type GameEngineDifficulty = "EASY" | "MEDIUM" | "HARD";

export type GameCatalogItem = {
  templateId: string;
  title: string;
  description: string;
  subject: string;
  ageGroup: string;
  engineKey: string;
  difficulty: GameEngineDifficulty;
  status: "AVAILABLE" | "COMING_SOON" | "BETA" | "LOCKED";
  playRoute: string | null;
  estimatedMinutes: number;
  xpReward: number;
  coinsReward: number;
  tags: string[];
};

export type GamesCatalogResponse = {
  items: GameCatalogItem[];
};

export type StartGameSessionResponse = {
  sessionId: string;
  game: {
    engineKey: string;
    runtimeConfig: Record<string, unknown>;
    initialPayload: Record<string, unknown>;
  };
  axion: {
    difficultyMix: Record<string, unknown>;
    activeBoosts: Array<Record<string, unknown>>;
  } | null;
};

export type GameAnswerResponse = {
  correct: boolean;
  scoreDelta: number;
  feedback: string;
  cognitiveSignals: Array<Record<string, unknown>>;
  nextStep: Record<string, unknown> | null;
};

export type FinishGameSessionResponse = {
  sessionId: string;
  totalScore: number;
  accuracy: number;
  timeSpentMs: number;
  xpEarned: number;
  coinsEarned: number;
  updatedSkills: Array<Record<string, unknown>>;
};

export type GameSessionRegisterResponse = {
  profile: {
    id: string;
    userId: number;
    xp: number;
    level: number;
    axionCoins: number;
    dailyXp?: number;
    lastXpReset?: string;
    createdAt: string;
    updatedAt: string;
  };
  session: {
    id: string;
    userId: number;
    gameType: GameType;
    score: number;
    xpEarned: number;
    coinsEarned: number;
    createdAt: string;
  };
  dailyLimit: {
    maxXpPerDay?: number;
    maxXpPerDayPerGame?: number;
    grantedXp: number;
    requestedXp: number;
    remainingXpToday: number;
  };
  unlockedAchievements?: string[];
};

export type GamePersonalBestType = "score" | "streak" | "speed";

export type GameResultPayload = {
  gameId: string;
  sessionId?: string | null;
  score: number;
  accuracy?: number | null;
  correctAnswers?: number | null;
  wrongAnswers?: number | null;
  streak?: number | null;
  maxStreak?: number | null;
  durationSeconds?: number | null;
  levelReached?: number | null;
  completed?: boolean;
  xpDelta?: number | null;
  coinsDelta?: number | null;
  personalBestType?: GamePersonalBestType | null;
  metadata?: Record<string, unknown>;
};

export type GamePersonalBestResponse = {
  id: string;
  childId: number;
  gameId: string;
  bestScore: number | null;
  bestStreak: number | null;
  bestDurationSeconds: number | null;
  lastSurpassedAt: string | null;
  bestResultPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type GameSessionCompleteResponse = GameSessionRegisterResponse & {
  isPersonalBest: boolean;
  personalBestType: GamePersonalBestType | null;
  personalBest: GamePersonalBestResponse | null;
  weeklyRanking?: {
    position: number | null;
    score: number | null;
    inTop: boolean;
    totalPlayers: number;
  } | null;
  leagueImpact?: {
    xpContribution: number;
    position: number | null;
    message: string;
  } | null;
};

export type GameMetagameMissionScope = "daily" | "weekly";
export type GameMetagameMissionMetric = "sessions" | "xp" | "records";

export type GameMetagameMission = {
  id: string;
  scope: GameMetagameMissionScope;
  title: string;
  description: string;
  metric: GameMetagameMissionMetric;
  target: number;
  current: number;
  progressPercent: number;
  rewardXp: number;
  rewardCoins: number;
  periodStart: string;
  periodEnd: string;
  claimed: boolean;
  rewardReady: boolean;
  ctaLabel: string;
};

export type GameMetagameBadge = {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  progress: number;
  target: number;
};

export type GameMetagameSummaryResponse = {
  generatedAt: string;
  streak: {
    current: number;
    best: number;
  };
  stats: {
    totalSessions: number;
    weeklySessions: number;
    dailySessions: number;
    xpToday: number;
    xpWeek: number;
    recordsTotal: number;
    recordsToday: number;
    recordsWeek: number;
    favoriteGameId: string | null;
    distinctGamesPlayed: number;
  };
  dailyMission: GameMetagameMission;
  weeklyMission: GameMetagameMission;
  badges: GameMetagameBadge[];
  motivationMessage: string;
};

export type GameMetagameClaimResponse = {
  missionScope: GameMetagameMissionScope;
  missionId: string;
  completed: boolean;
  rewardGranted: boolean;
  alreadyClaimed: boolean;
  xpReward: number;
  coinReward: number;
};

export type GameRankingMetric = {
  key: string;
  label: string;
  direction: "asc" | "desc";
  unit: string;
};

export type GameWeeklyRankingEntry = {
  position: number;
  player: string;
  avatarKey: string | null;
  score: number;
  lastPlayedAt: string;
};

export type GameWeeklyRankingResponse = {
  gameId: string;
  metric: GameRankingMetric;
  weekStart: string;
  weekEnd: string;
  top: GameWeeklyRankingEntry[];
  me: {
    position: number | null;
    score: number | null;
    inTop: boolean;
    totalPlayers: number;
  };
};

export type GamePersonalRankingResponse = {
  items: Array<{
    position: number;
    gameId: string;
    gameLabel: string;
    metricLabel: string;
    score: number;
    unit: string;
  }>;
};

export type GameLeagueTier = "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";
export type GameLeagueStatus = "promoted" | "safe" | "relegated";

export type GameLeagueSummaryResponse = {
  tier: GameLeagueTier;
  tierLabel: string;
  groupId: string;
  weekStart: string;
  weekEnd: string;
  scoreWeek: number;
  position: number | null;
  groupSize: number;
  promotionZoneMax: number;
  relegationZoneMin: number | null;
  status: GameLeagueStatus | null;
  positionsToPromotion: number | null;
  topEntries: Array<{
    position: number;
    player: string;
    avatarKey: string | null;
    score: number;
  }>;
  motivationMessage: string;
  reward: {
    rewardXp: number;
    rewardCoins: number;
    readyToClaim: boolean;
    resultStatus: GameLeagueStatus | null;
    cycleWeekStart: string | null;
    cycleWeekEnd: string | null;
  };
};

export type GameLeagueClaimResponse = {
  rewardGranted: boolean;
  alreadyClaimed: boolean;
  xpReward: number;
  coinReward: number;
  cycleWeekStart: string | null;
  cycleWeekEnd: string | null;
  tierFrom: GameLeagueTier | null;
  tierTo: GameLeagueTier | null;
  resultStatus: GameLeagueStatus | null;
};

export type StoreCatalogItem = {
  id: number;
  name: string;
  type: "AVATAR_SKIN" | "BACKGROUND_THEME" | "CELEBRATION_ANIMATION" | "BADGE_FRAME";
  price: number;
  rarity: "COMMON" | "RARE" | "EPIC" | "LEGENDARY";
  imageUrl: string | null;
  owned: boolean;
  equipped: boolean;
};

export type StoreCatalogResponse = {
  coins: number;
  items: StoreCatalogItem[];
};

export type AprenderLessonContentType = "TEXT" | "IMAGE" | "AUDIO" | "QUESTION";

export type AprenderLessonContent = {
  id: number;
  lessonId: number;
  contentType: AprenderLessonContentType;
  contentData: Record<string, unknown>;
  order: number;
};

export type AprenderLessonCompleteResponse = {
  lessonProgress: {
    id: number;
    userId: number;
    lessonId: number;
    completed: boolean;
    score: number | null;
    attempts: number;
    repeatRequired: boolean;
    variationSeed: string | null;
    completedAt: string | null;
  };
  xpRequested: number;
  xpGranted: number;
  coinsRequested: number;
  coinsGranted: number;
  coinMultiplierApplied: number;
  unitBoostActivated: boolean;
  unitBoostMultiplier: number;
  unitBoostRemainingLessons: number;
  repeatRequired: boolean;
  variationSeed: string | null;
  unlockedAchievements: string[];
  learningStreak: AprenderLearningStreak | null;
  gamification: {
    xp: number;
    level: number;
    dailyXp: number;
  };
};

export type AprenderLearningStreak = {
  currentStreak: number;
  longestStreak: number;
  lastLessonDate: string | null;
  bonusCoinsGranted: number;
  unlocked30DayBadge: boolean;
};

export type AprenderLearningProfile = {
  xp: number;
  level: number;
  dailyXp: number;
  axionCoins: number;
  xpLevelPercent: number;
  xpInLevel: number;
  xpToNextLevel: number;
  maxDailyXp: number;
};

export type AprenderLearningEnergyStatus = {
  energy: number;
  maxEnergy: number;
  canPlay: boolean;
  secondsUntilPlayable: number;
  secondsUntilNextEnergy: number;
  refillCoinCost: number;
  axionCoins: number;
};

export type AprenderLearningEnergyConsumeResponse = {
  consumed: boolean;
  status: AprenderLearningEnergyStatus;
};

export type LearningQuestionType = "MCQ" | "TRUE_FALSE" | "DRAG_DROP" | "FILL_BLANK" | "MATCH" | "ORDERING" | "TEMPLATE";
export type LearningDifficulty = "EASY" | "MEDIUM" | "HARD";
export type LearningAnswerResult = "CORRECT" | "WRONG" | "SKIPPED";

export type LearningNextItem = {
  questionId: string | null;
  templateId: string | null;
  generatedVariantId: string | null;
  variantId: string | null;
  skillId: string;
  difficulty: LearningDifficulty;
  type: LearningQuestionType;
  prompt: string;
  explanation?: string | null;
  metadata: Record<string, unknown>;
};

export type LearningNextResponse = {
  items: LearningNextItem[];
  plan: {
    focusSkills: Array<{ skillId: string; mastery: number; priority: number }>;
    difficultyMix: { easy: number; medium: number; hard: number };
    diagnostics?: {
      candidates_raw?: number;
      candidates_filtered?: number;
      fallback_reason?: string | null;
      block_reason?: string | null;
      slots_with_no_candidates?: number;
    } | null;
  };
};

export type LearningAnswerResponse = {
  questionId: string | null;
  templateId: string | null;
  generatedVariantId: string | null;
  skillId: string;
  mastery: number;
  masteryDelta: number;
  streakCorrect: number;
  streakWrong: number;
  nextReviewAt: string | null;
  retryRecommended: boolean;
  remediationText?: string | null;
};

export type LearningPathEventType = "CHEST" | "CHECKPOINT" | "MINI_BOSS" | "STORY_STOP" | "BOOST" | "REVIEW_GATE";
export type LearningPathEventStatus = "LOCKED" | "AVAILABLE" | "COMPLETED" | "SKIPPED";

export type LearningPathLessonNode = {
  id: number;
  title: string;
  order: number;
  xpReward: number;
  unlocked: boolean;
  completed: boolean;
  score: number | null;
  starsEarned: number;
  skill?: string | null;
  difficulty?: string | null;
  lessonKey?: string | null;
  prerequisiteSkill?: string | null;
  prerequisiteMastery?: number | null;
  prerequisiteThreshold?: number | null;
  isRecommended?: boolean;
};

export type LearningPathEventNode = {
  id: string;
  type: LearningPathEventType;
  title: string;
  description: string | null;
  iconKey: string;
  rarity: string;
  status: LearningPathEventStatus;
  orderIndex: number;
  rules: Record<string, unknown>;
  rewardGranted: boolean;
};

export type LearningPathNode = {
  kind: "LESSON" | "EVENT";
  orderIndex: number;
  lesson: LearningPathLessonNode | null;
  event: LearningPathEventNode | null;
};

export type LearningPathUnit = {
  id: number;
  title: string;
  description: string | null;
  order: number;
  completionRate: number;
  nodes: LearningPathNode[];
};

export type LearningPathResponse = {
  subjectId: number;
  subjectName: string;
  ageGroup: string;
  dueReviewsCount: number;
  streakDays: number;
  masteryAverage: number;
  units: LearningPathUnit[];
};

export type AprenderSubjectOption = {
  id: number;
  name: string;
  ageGroup: string;
  ageMin: number;
  ageMax: number;
  icon: string | null;
  color: string | null;
  order: number;
};

export type LearnRecommendation = {
  subject: string;
  skill: string;
  lesson: string;
  difficulty: string;
  reason: string;
};

export type LearnSubjectsResponse = {
  subjects: string[];
  lesson: string | null;
  difficulty: string | null;
  xpReward: number;
  nextRecommendation: LearnRecommendation | null;
};

export type LearnSkillsResponse = {
  subject: string;
  skills: string[];
  prerequisiteMasteryThreshold: number;
  skillGraph: LearnSkillGraphEntry[];
  lesson: string | null;
  difficulty: string | null;
  xpReward: number;
  nextRecommendation: LearnRecommendation | null;
};

export type LearnLessonResponse = {
  lesson: string | null;
  difficulty: string | null;
  xpReward: number;
  nextRecommendation: LearnRecommendation | null;
};

export type LearnSkillLesson = {
  lessonId: number;
  lesson: string;
  skill: string;
  difficulty: string;
  completed: boolean;
  stars: number;
  unlocked: boolean;
};

export type LearnSkillGraphEntry = {
  skill: string;
  mastery: number;
  prerequisiteSkill: string | null;
  prerequisiteMastery: number;
  prerequisiteThreshold: number;
  lessons: LearnSkillLesson[];
};

export type LearningEventStartResponse = {
  event: LearningPathEventNode;
  payload: Record<string, unknown>;
};

export type LearningEventCompleteResponse = {
  event: LearningPathEventNode;
  status: LearningPathEventStatus;
  rewards: Record<string, unknown>;
  passed: boolean;
  needsRetry: boolean;
};

export type LearningSessionStartResponse = {
  sessionId: string;
  subjectId: number;
  unitId: number | null;
  lessonId: number | null;
  startedAt: string;
};

export type LearningSessionFinishResponse = {
  sessionId: string;
  endedAt: string | null;
  stars: number;
  accuracy: number;
  totalQuestions: number;
  correctCount: number;
  xpEarned: number;
  coinsEarned: number;
  leveledUp: boolean;
  gamification: {
    xp: number;
    level: number;
    axionCoins: number;
  };
};

export type LearningInsightSkill = {
  skillId: string;
  skillName: string;
  subjectName: string;
  mastery: number;
};

export type LearningInsightSubject = {
  subjectId: number;
  subjectName: string;
  ageGroup: string;
  masteryAverage: number;
  unitCompletionPercent: number;
};

export type LearningInsightsResponse = {
  strongestSkills: LearningInsightSkill[];
  practiceSkills: LearningInsightSkill[];
  dueReviewsCount: number;
  weeklyXpEarned: number;
  subjects: LearningInsightSubject[];
};

export type WeeklyMissionType = "LESSONS_COMPLETED" | "XP_GAINED" | "PERFECT_SCORES" | "STREAK_DAYS" | "MINI_BOSS_WINS";

export type MissionProgress = {
  missionId: string;
  title: string;
  description?: string | null;
  missionType: WeeklyMissionType;
  targetValue: number;
  currentValue: number;
  completed: boolean;
  completedAt: string | null;
  rewardGranted: boolean;
  xpReward: number;
  coinReward: number;
  isSeasonal: boolean;
  themeKey: string | null;
  startDate: string;
  endDate: string;
  progressPercent: number;
};

export type MissionsCurrentResponse = {
  missions: MissionProgress[];
  currentStreak: number;
  longestStreak: number;
  almostThere: boolean;
  showNudge: boolean;
  nudgeMessage: string;
  upcomingSeasonalEvent: {
    name: string;
    themeKey: string;
    startsInDays: number;
  } | null;
};

export type MissionClaimResponse = {
  missionId: string;
  completed: boolean;
  rewardGranted: boolean;
  xpReward: number;
  coinReward: number;
};

export type SeasonEvent = {
  id: string;
  name: string;
  themeKey: string;
  startDate: string;
  endDate: string;
  description?: string | null;
  backgroundStyle: Record<string, unknown>;
  bonusXpMultiplier: number;
  bonusCoinMultiplier: number;
};

export type ActiveSeasonEventsResponse = {
  active: SeasonEvent[];
  upcoming: SeasonEvent | null;
  countdownDays: number | null;
};

export type CalendarActivityDay = {
  date: string;
  lessonsCompleted: number;
  xpEarned: number;
  missionsCompleted: number;
  streakMaintained: boolean;
  perfectSessions: number;
};

export type CalendarActivityResponse = {
  month: number;
  year: number;
  currentStreak: number;
  longestStreak: number;
  days: CalendarActivityDay[];
};

export type LegalStatusResponse = {
  tenant_id: number;
  consent_required: boolean;
  accepted_terms_at: string | null;
  accepted_privacy_at: string | null;
  data_retention_policy_version: string | null;
  coppa_ready: boolean;
};

export type UserUXSettings = {
  id: number;
  userId: number;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  reducedMotion: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function login(email: string, password: string): Promise<AuthTokens> {
  const response = await apiRequest<AuthTokens>("/auth/login", {
    method: "POST",
    body: { email, password },
    requireAuth: false,
    includeTenant: true,
  });
  parentalConsentBlocked = false;
  return response;
}

export async function signup(payload: {
  name: string;
  email: string;
  password: string;
  family_name: string;
}): Promise<AuthTokens> {
  const response = await apiRequest<AuthTokens>("/auth/signup", {
    method: "POST",
    body: {
      name: payload.name,
      email: payload.email,
      password: payload.password,
      tenant_type: "FAMILY",
      tenant_name: payload.family_name,
    },
    requireAuth: false,
    includeTenant: false,
  });
  parentalConsentBlocked = false;
  return response;
}

export async function loginPrimary(email: string, password: string): Promise<PrimaryLoginResponse> {
  const response = await apiRequest<PrimaryLoginResponse>("/auth/login-primary", {
    method: "POST",
    body: { email, password },
    requireAuth: false,
    includeTenant: false,
  });
  parentalConsentBlocked = false;
  return response;
}

export async function googleLogin(idToken: string): Promise<PrimaryLoginResponse> {
  const response = await apiRequest<PrimaryLoginResponse>("/auth/google", {
    method: "POST",
    body: { id_token: idToken },
    requireAuth: false,
    includeTenant: false,
  });
  parentalConsentBlocked = false;
  return response;
}

export async function platformLogin(email: string, password: string): Promise<AuthTokens> {
  const response = await apiRequest<AuthTokens>("/auth/platform-login", {
    method: "POST",
    body: { email, password },
    requireAuth: false,
    includeTenant: false,
  });
  parentalConsentBlocked = false;
  return response;
}

export async function getMe(): Promise<AuthMeResponse> {
  return apiRequest<AuthMeResponse>("/auth/me", { method: "GET", requireAuth: true, includeTenant: true });
}

export async function logout(): Promise<{ message: string }> {
  const response = await apiRequest<{ message: string }>("/auth/logout", { method: "POST", requireAuth: false, includeTenant: false });
  parentalConsentBlocked = false;
  return response;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>("/auth/change-password", {
    method: "POST",
    body: { current_password: currentPassword, new_password: newPassword },
    requireAuth: true,
    includeTenant: false,
  });
}

export async function listMemberships(): Promise<OrganizationMembership[]> {
  return apiRequest<OrganizationMembership[]>("/auth/memberships", { method: "GET", requireAuth: true, includeTenant: false });
}

export async function selectTenant(tenantSlug: string): Promise<SelectTenantResponse> {
  return apiRequest<SelectTenantResponse>("/auth/select-tenant", {
    method: "POST",
    body: { tenant_slug: tenantSlug },
    requireAuth: true,
    includeTenant: false,
  });
}

export async function listChildren(): Promise<ChildProfileSummary[]> {
  return apiRequest<ChildProfileSummary[]>("/children", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function createChild(payload: {
  display_name: string;
  date_of_birth: string;
  theme: ThemeName;
  avatar_key?: string | null;
}): Promise<ChildProfileSummary> {
  return apiRequest<ChildProfileSummary>("/children", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function updateChild(
  childId: number,
  payload: { display_name: string; date_of_birth: string; theme: ThemeName; avatar_key?: string | null },
): Promise<ChildProfileSummary> {
  return apiRequest<ChildProfileSummary>(`/children/${childId}`, {
    method: "PUT",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function deleteChild(childId: number, pin: string): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`/children/${childId}`, {
    method: "DELETE",
    body: { pin },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getTasks(): Promise<TaskOut[]> {
  return apiRequest<TaskOut[]>("/tasks", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function createTask(payload: {
  title: string;
  description?: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD" | "LEGENDARY";
  weight: number;
}): Promise<TaskOut> {
  return apiRequest<TaskOut>("/tasks", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function updateTask(
  taskId: number,
  payload: {
    title: string;
    description?: string | null;
    difficulty: "EASY" | "MEDIUM" | "HARD" | "LEGENDARY";
    weight: number;
    is_active: boolean;
  },
): Promise<TaskOut> {
  return apiRequest<TaskOut>(`/tasks/${taskId}`, {
    method: "PUT",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function deleteTask(taskId: number): Promise<TaskOut> {
  return apiRequest<TaskOut>(`/tasks/${taskId}`, {
    method: "DELETE",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function completeOnboarding(payload: {
  child_name: string;
  child_avatar_key?: string | null;
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

export async function verifyParentPin(pin: string): Promise<{ verified: boolean }> {
  return apiRequest<{ verified: boolean }>("/onboarding/verify-pin", {
    method: "POST",
    body: { pin },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getLegalStatus(): Promise<LegalStatusResponse> {
  return apiRequest<LegalStatusResponse>("/legal", {
    method: "GET",
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
  const response = await apiRequest<{
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
  parentalConsentBlocked = false;
  return response;
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

export async function getAxionState(childId: number): Promise<AxionStateResponse> {
  return apiRequest<AxionStateResponse>(`/axion/state?child_id=${childId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionBrief(params?: { context?: string; childId?: number; axionDebug?: boolean }): Promise<AxionBriefResponse> {
  const query = new URLSearchParams();
  if (params?.context) query.set("context", params.context);
  if (typeof params?.childId === "number") query.set("childId", String(params.childId));
  if (params?.axionDebug) query.set("axionDebug", "true");
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<AxionBriefResponse>(`/api/axion/brief${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionBrainState(childId: number): Promise<AxionBrainStateResponse> {
  return apiRequest<AxionBrainStateResponse>(`/axion/brain_state?childId=${childId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionRecentUnlocks(childId: number): Promise<AxionRecentUnlock[]> {
  return apiRequest<AxionRecentUnlock[]>(`/axion/recent_unlocks?childId=${childId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionGuardrailsSummary(childId: number): Promise<AxionGuardrailsSummaryResponse> {
  return apiRequest<AxionGuardrailsSummaryResponse>(`/axion/guardrails_summary?childId=${childId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionPolicyStatus(childId: number): Promise<AxionPolicyStatusResponse> {
  return apiRequest<AxionPolicyStatusResponse>(`/axion/policy_status?childId=${childId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function trackAxionCtaClicked(payload: {
  decisionId: string;
  actionType: string;
  context: string;
}): Promise<{ status: string }> {
  return apiRequest<{ status: string }>("/api/axion/cta/clicked", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function trackAxionCtaExecuted(payload: {
  decisionId: string;
  actionType: string;
  context: string;
}): Promise<{ status: string }> {
  return apiRequest<{ status: string }>("/api/axion/cta/executed", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function trackAxionSessionStarted(payload: {
  decisionId: string;
  destination: "learning" | "games" | "missions" | "other";
  context?: string;
}): Promise<{ status: string }> {
  return apiRequest<{ status: string }>("/api/axion/session/started", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function trackAxionSessionCompleted(payload: {
  decisionId: string;
  destination: "learning" | "games" | "missions" | "other";
  context?: string;
}): Promise<{ status: string }> {
  return apiRequest<{ status: string }>("/api/axion/session/completed", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getParentAxionInsights(): Promise<ParentAxionInsightsResponse> {
  try {
    return await apiRequest<ParentAxionInsightsResponse>("/axion/parent-insights", {
      method: "GET",
      requireAuth: true,
      includeTenant: true,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return apiRequest<ParentAxionInsightsResponse>("/api/axion/parent_insights", {
        method: "GET",
        requireAuth: true,
        includeTenant: true,
      });
    }
    throw error;
  }
}

export async function trackParentActionClicked(payload: {
  actionLabel: string;
  context?: string;
  decisionId?: string | null;
  childId?: number | null;
}): Promise<{ status: string }> {
  return apiRequest<{ status: string }>("/api/axion/parent/action-clicked", {
    method: "POST",
    body: {
      actionLabel: payload.actionLabel,
      context: payload.context ?? "parent_dashboard",
      decisionId: payload.decisionId ?? null,
      childId: payload.childId ?? null,
    },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getNbaExperimentDashboard(params?: {
  dateFrom?: string;
  dateTo?: string;
  destination?: "learning" | "games" | "missions" | "other";
  dedupeExposurePerDay?: boolean;
}): Promise<AxionExperimentDashboardResponse> {
  const query = new URLSearchParams();
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  if (params?.destination) query.set("destination", params.destination);
  query.set("dedupeExposurePerDay", String(params?.dedupeExposurePerDay ?? true));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<AxionExperimentDashboardResponse>(`/api/axion/experiment/nba_retention_v1/dashboard${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAdminExperimentAccess(): Promise<{ ok: boolean; tenantId: number; userId: number; email: string }> {
  // Source of truth for /platform-admin/experiments admin reads:
  // - /admin/experiments/access
  // - /admin/experiments/{key}/dashboard
  // - /admin/experiments/{key}/retention
  // - /admin/experiments/{key}/retention_metrics
  // - /admin/experiments/executive
  return apiRequest<{ ok: boolean; tenantId: number; userId: number; email: string }>("/admin/experiments/access", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAdminExecutiveDashboard(): Promise<AxionExecutiveDashboardResponse> {
  return apiRequest<AxionExecutiveDashboardResponse>("/admin/experiments/executive", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAdminExperimentDashboard(
  experimentKey: string,
  params?: {
    dateFrom?: string;
    dateTo?: string;
    destination?: "learning" | "games" | "missions" | "other";
    dedupeExposurePerDay?: boolean;
  },
): Promise<AxionExperimentDashboardResponse> {
  const query = new URLSearchParams();
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  if (params?.destination) query.set("destination", params.destination);
  query.set("dedupeExposurePerDay", String(params?.dedupeExposurePerDay ?? true));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<AxionExperimentDashboardResponse>(`/admin/experiments/${encodeURIComponent(experimentKey)}/dashboard${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAdminExperimentRetention(
  experimentKey: string,
  params?: {
    dateFrom?: string;
    dateTo?: string;
  },
): Promise<AxionExperimentRetentionResponse> {
  const query = new URLSearchParams();
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<AxionExperimentRetentionResponse>(`/admin/experiments/${encodeURIComponent(experimentKey)}/retention${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAdminExperimentRetentionMetrics(
  experimentKey: string,
  params?: {
    variant?: string;
    destination?: "learning" | "games" | "missions" | "other";
    dedupeExposurePerDay?: boolean;
    lookbackDays?: number;
  },
): Promise<AxionRetentionMetricsResponse> {
  const query = new URLSearchParams();
  if (params?.variant) query.set("variant", params.variant);
  if (params?.destination) query.set("destination", params.destination);
  query.set("dedupeExposurePerDay", String(params?.dedupeExposurePerDay ?? true));
  query.set("lookbackDays", String(params?.lookbackDays ?? 30));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<AxionRetentionMetricsResponse>(`/admin/experiments/${encodeURIComponent(experimentKey)}/retention_metrics${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionRetentionMetrics(params?: {
  experimentKey?: string;
  variant?: string;
  destination?: "learning" | "games" | "missions" | "other";
  dedupeExposurePerDay?: boolean;
  lookbackDays?: number;
}): Promise<AxionRetentionMetricsResponse> {
  const query = new URLSearchParams();
  if (params?.experimentKey) query.set("experimentKey", params.experimentKey);
  if (params?.variant) query.set("variant", params.variant);
  if (params?.destination) query.set("destination", params.destination);
  query.set("dedupeExposurePerDay", String(params?.dedupeExposurePerDay ?? true));
  query.set("lookbackDays", String(params?.lookbackDays ?? 30));
  return apiRequest<AxionRetentionMetricsResponse>(`/api/axion/retention_metrics?${query.toString()}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function useAiCoach(childId: number, mode: "CHILD" | "PARENT", message?: string): Promise<CoachResponse> {
  return apiRequest<CoachResponse>("/ai/coach", {
    method: "POST",
    body: { child_id: childId, mode, message: message ?? null },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getDailyMission(childId: number): Promise<DailyMissionResponse> {
  return apiRequest<DailyMissionResponse>(`/children/${childId}/daily-mission`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function completeDailyMission(missionId: string): Promise<DailyMissionCompleteResponse> {
  return apiRequest<DailyMissionCompleteResponse>(`/daily-mission/${missionId}/complete`, {
    method: "POST",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function registerGameSession(payload: { gameType: GameType; score: number }): Promise<GameSessionRegisterResponse> {
  return apiRequest<GameSessionRegisterResponse>("/api/games/session", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function completeGameSession(payload: { childId?: number; result: GameResultPayload }): Promise<GameSessionCompleteResponse> {
  return apiRequest<GameSessionCompleteResponse>("/api/games/session/complete", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getGamePersonalBest(gameId: string, childId?: number): Promise<GamePersonalBestResponse> {
  const query = typeof childId === "number" ? `?childId=${childId}` : "";
  return apiRequest<GamePersonalBestResponse>(`/api/games/personal-best/${encodeURIComponent(gameId)}${query}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getGamePersonalBests(childId?: number): Promise<GamePersonalBestResponse[]> {
  const query = typeof childId === "number" ? `?childId=${childId}` : "";
  return apiRequest<GamePersonalBestResponse[]>(`/api/games/personal-best${query}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getGamesMetagameSummary(childId?: number): Promise<GameMetagameSummaryResponse> {
  const query = typeof childId === "number" ? `?childId=${childId}` : "";
  return apiRequest<GameMetagameSummaryResponse>(`/api/games/metagame/summary${query}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function claimGamesMetagameMission(payload: {
  missionScope: GameMetagameMissionScope;
  missionId: string;
  childId?: number;
}): Promise<GameMetagameClaimResponse> {
  return apiRequest<GameMetagameClaimResponse>("/api/games/metagame/claim", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getGameWeeklyRanking(
  gameId: string,
  childId?: number,
  limit = 10,
  timezone?: string,
): Promise<GameWeeklyRankingResponse> {
  const query = new URLSearchParams();
  if (typeof childId === "number") query.set("childId", String(childId));
  query.set("limit", String(limit));
  if (timezone && timezone.trim().length > 0) {
    query.set("timezone", timezone.trim());
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<GameWeeklyRankingResponse>(`/api/games/ranking/weekly/${encodeURIComponent(gameId)}${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getMyGamesRanking(childId?: number, limit = 5): Promise<GamePersonalRankingResponse> {
  const query = new URLSearchParams();
  if (typeof childId === "number") query.set("childId", String(childId));
  query.set("limit", String(limit));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<GamePersonalRankingResponse>(`/api/games/ranking/me${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getGamesLeagueSummary(childId?: number, timezone?: string): Promise<GameLeagueSummaryResponse> {
  const query = new URLSearchParams();
  if (typeof childId === "number") query.set("childId", String(childId));
  if (timezone && timezone.trim().length > 0) query.set("timezone", timezone.trim());
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<GameLeagueSummaryResponse>(`/api/games/league/summary${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function claimGamesLeagueReward(childId?: number): Promise<GameLeagueClaimResponse> {
  const query = new URLSearchParams();
  if (typeof childId === "number") query.set("childId", String(childId));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<GameLeagueClaimResponse>(`/api/games/league/claim${suffix}`, {
    method: "POST",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getGamesCatalog(params?: {
  ageGroup?: "6-8" | "9-12" | "13-15";
  subject?: string;
  limit?: number;
}): Promise<GamesCatalogResponse> {
  const query = new URLSearchParams();
  if (params?.ageGroup) query.set("ageGroup", params.ageGroup);
  if (params?.subject) query.set("subject", params.subject);
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<GamesCatalogResponse>(`/api/games/catalog${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function startGameEngineSession(payload: {
  templateId: string;
  variationId?: string | null;
  levelId?: string | null;
  context?: Record<string, unknown>;
}): Promise<StartGameSessionResponse> {
  return apiRequest<StartGameSessionResponse>("/api/games/session/start", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function submitGameEngineAnswer(
  sessionId: string,
  payload: {
    stepId: string;
    answer: Record<string, unknown>;
    elapsedMs: number;
    hintsUsed?: number;
  },
): Promise<GameAnswerResponse> {
  return apiRequest<GameAnswerResponse>(`/api/games/session/${sessionId}/answer`, {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function finishGameEngineSession(sessionId: string): Promise<FinishGameSessionResponse> {
  return apiRequest<FinishGameSessionResponse>(`/api/games/session/${sessionId}/finish`, {
    method: "POST",
    requireAuth: true,
    includeTenant: true,
  });
}

export type ToolsPricingPack = {
  code: string;
  credits: number;
  price_cents: number;
  price_label: string;
  currency: string;
};

export type ToolsPricingResponse = {
  packs: ToolsPricingPack[];
};

export async function getToolsPricing(): Promise<ToolsPricingResponse> {
  return apiRequest<ToolsPricingResponse>("/api/tools/pricing", {
    method: "GET",
    requireAuth: false,
    includeTenant: false,
  });
}

export type ToolsExerciseItem = {
  number: number;
  prompt: string;
  answer: string;
};

export type ToolsGenerateExercisesResponse = {
  title: string;
  instructions: string;
  exercises: ToolsExerciseItem[];
  answer_key: ToolsExerciseItem[];
  pdf_html: string;
  free_limit: number;
  free_used: number;
  remaining_free_generations: number;
  paywall_required: boolean;
  upgrade_url: string;
  llm_mode: "llm" | "fallback" | string;
  paid_credits_remaining: number;
};

export type ToolsBillingStatusResponse = {
  free_limit: number;
  free_used: number;
  remaining_free_generations: number;
  paid_credits_remaining: number;
};

export type ToolsCheckoutSessionResponse = {
  checkout_url: string;
  checkout_session_id: string;
};

export type ToolsCreditsResponse = {
  credits: number;
};

export type ToolsTemplateRecord = {
  id: string;
  user_id: number;
  name: string;
  config: Record<string, unknown>;
  blocks: unknown[];
  is_public: boolean;
  created_at: string;
};

export async function createToolsTemplate(payload: {
  name: string;
  config: Record<string, unknown>;
  blocks: unknown[];
  is_public?: boolean;
}): Promise<ToolsTemplateRecord> {
  return apiRequest<ToolsTemplateRecord>("/api/tools/templates", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: false,
    suppressAuthRedirect: true,
  });
}

export async function getToolsCredits(): Promise<ToolsCreditsResponse> {
  return apiRequest<ToolsCreditsResponse>("/api/tools/credits", {
    method: "GET",
    requireAuth: true,
    includeTenant: false,
    suppressAuthRedirect: true,
  });
}

export async function useToolsCredit(): Promise<ToolsCreditsResponse> {
  return apiRequest<ToolsCreditsResponse>("/api/tools/use-credit", {
    method: "POST",
    requireAuth: true,
    includeTenant: false,
    suppressAuthRedirect: true,
  });
}

export async function createToolsCheckout(payload?: {
  plan_code?: "credits_30";
  customer_email?: string;
}): Promise<ToolsCheckoutSessionResponse> {
  return apiRequest<ToolsCheckoutSessionResponse>("/api/tools/checkout", {
    method: "POST",
    body: payload ?? { plan_code: "credits_30" },
    requireAuth: true,
    includeTenant: false,
    suppressAuthRedirect: true,
  });
}

export async function getToolsTemplates(): Promise<ToolsTemplateRecord[]> {
  return apiRequest<ToolsTemplateRecord[]>("/api/tools/templates", {
    method: "GET",
    requireAuth: true,
    includeTenant: false,
    suppressAuthRedirect: true,
  });
}

export async function deleteToolsTemplate(templateId: string): Promise<void> {
  await apiRequest<null>(`/api/tools/templates/${encodeURIComponent(templateId)}`, {
    method: "DELETE",
    requireAuth: true,
    includeTenant: false,
    suppressAuthRedirect: true,
  });
}

export async function duplicateToolsTemplate(templateId: string): Promise<ToolsTemplateRecord> {
  return apiRequest<ToolsTemplateRecord>(`/api/tools/templates/${encodeURIComponent(templateId)}/duplicate`, {
    method: "POST",
    requireAuth: true,
    includeTenant: false,
    suppressAuthRedirect: true,
  });
}

export async function generateToolsExercises(payload: {
  subject: string;
  topic: string;
  age: number;
  difficulty: string;
  exercise_count?: number;
  session_token?: string;
}): Promise<ToolsGenerateExercisesResponse> {
  return apiRequest<ToolsGenerateExercisesResponse>("/api/tools/generate-exercises", {
    method: "POST",
    body: payload,
    requireAuth: false,
    includeTenant: false,
  });
}

export async function getToolsBillingStatus(sessionToken?: string): Promise<ToolsBillingStatusResponse> {
  const query = sessionToken ? `?session_token=${encodeURIComponent(sessionToken)}` : "";
  return apiRequest<ToolsBillingStatusResponse>(`/api/tools/billing/status${query}`, {
    method: "GET",
    requireAuth: false,
    includeTenant: false,
  });
}

export async function createToolsCheckoutSession(payload: {
  plan_code?: "credits_30";
  session_token?: string;
  customer_email?: string;
  anonymous_id?: string;
}): Promise<ToolsCheckoutSessionResponse> {
  return apiRequest<ToolsCheckoutSessionResponse>("/api/tools/billing/checkout-session", {
    method: "POST",
    body: payload,
    requireAuth: false,
    includeTenant: false,
  });
}

// ── Checkout canônico v2 ───────────────────────────────────────────────────

export type ToolsCheckoutStatusResponse = {
  ok: boolean;
  payment_status: "created" | "pending" | "paid" | "completed" | "expired";
  credits_added: number;
  paid_generations_available: number;
};

/**
 * POST /api/tools/checkout/create
 * Endpoint canônico para compra de pacote por identidade anônima.
 * Inclui fingerprint_id para melhor reconciliação.
 */
export async function createToolsCheckoutV2(payload: {
  anonymous_id: string;
  fingerprint_id?: string;
  package_type?: "pack_30";
}): Promise<ToolsCheckoutSessionResponse> {
  return apiRequest<ToolsCheckoutSessionResponse>("/api/tools/checkout/create", {
    method: "POST",
    body: { package_type: "pack_30", ...payload },
    requireAuth: false,
    includeTenant: false,
  });
}

/**
 * GET /api/tools/checkout/status?session_id=...
 * Consulta o status de uma sessão após retorno do Stripe.
 */
export async function getToolsCheckoutStatus(sessionId: string, anonymousId?: string): Promise<ToolsCheckoutStatusResponse> {
  const query = new URLSearchParams({ session_id: sessionId });
  if (anonymousId) {
    query.set("anonymous_id", anonymousId);
  }
  return apiRequest<ToolsCheckoutStatusResponse>(
    `/api/tools/checkout/status?${query.toString()}`,
    { method: "GET", requireAuth: false, includeTenant: false },
  );
}

// ── Identidade anônima ─────────────────────────────────────────────────────

export type ToolsAnonStatusResponse = {
  anonymous_id: string;
  free_limit: number;
  free_used: number;
  remaining_free_generations: number;
  paid_credits_remaining: number;
};

/** Lê o anonymous_id do localStorage, criando um UUID v4 na primeira visita. */
export function getOrCreateAnonId(): string {
  const KEY = "ax_anon_id";
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

/** Busca (e cria se necessário) o estado de uso anônimo no servidor. */
export async function getAnonStatus(anonymousId: string): Promise<ToolsAnonStatusResponse> {
  return apiRequest<ToolsAnonStatusResponse>(
    `/api/tools/anon-status?anonymous_id=${encodeURIComponent(anonymousId)}`,
    { method: "GET", requireAuth: false, includeTenant: false },
  );
}

/** Consome 1 geração do saldo anônimo. Lança erro 402 se sem saldo. */
export async function useAnonCredit(anonymousId: string): Promise<ToolsAnonStatusResponse> {
  return apiRequest<ToolsAnonStatusResponse>("/api/tools/anon-use", {
    method: "POST",
    body: { anonymous_id: anonymousId, tool_slug: "exercise-generator" },
    requireAuth: false,
    includeTenant: false,
  });
}

// ── Endpoints v2 (spec pública) ───────────────────────────────────────────────

export type AnonIdentityOut = {
  anonymous_id: string;
  free_generations_used: number;
  free_generations_remaining: number;
  paid_generations_available: number;
  can_generate: boolean;
};

export type AnonIdentifyResponse = {
  ok: boolean;
  identity: AnonIdentityOut;
};

export type AnonUsageStatusResponse = {
  free_generations_used: number;
  free_generations_remaining: number;
  paid_generations_available: number;
  can_generate: boolean;
  paywall_required: boolean;
};

/**
 * POST /api/tools/anonymous/identify
 * Registra ou atualiza a identidade anônima. Deve ser chamado na montagem
 * do componente gerador (substitui getAnonStatus quando fingerprint_id estiver
 * disponível).
 */
export async function anonymousIdentify(payload: {
  anonymous_id: string;
  fingerprint_id?: string;
  user_agent?: string;
}): Promise<AnonIdentifyResponse> {
  return apiRequest<AnonIdentifyResponse>("/api/tools/anonymous/identify", {
    method: "POST",
    body: payload,
    requireAuth: false,
    includeTenant: false,
  });
}

/**
 * GET /api/tools/usage-status
 * Consulta o status atual sem criar nem consumir créditos.
 * Usado para polling leve (ex: verificar créditos após retorno do Stripe).
 */
export async function getUsageStatus(params: {
  anonymous_id: string;
  fingerprint_id?: string;
}): Promise<AnonUsageStatusResponse> {
  const qs = new URLSearchParams({ anonymous_id: params.anonymous_id });
  if (params.fingerprint_id) qs.set("fingerprint_id", params.fingerprint_id);
  return apiRequest<AnonUsageStatusResponse>(`/api/tools/usage-status?${qs.toString()}`, {
    method: "GET",
    requireAuth: false,
    includeTenant: false,
  });
}

export type MultiplayerCreateResponse = {
  sessionId: string;
  joinCode: string;
  joinToken: string;
  joinUrl: string;
  gameType: "TICTACTOE" | "QUIZ_BATTLE" | "MATH_CHALLENGE" | "PUZZLE_COOP" | "FINANCE_BATTLE";
  engineKey: string;
  status: MultiplayerSessionStatus;
  expiresAt: string;
};

export type MultiplayerStateResponse = {
  sessionId: string;
  status: MultiplayerSessionStatus;
  multiplayerMode: "PVP_PRIVATE" | "COOP_PRIVATE";
  gameType: "TICTACTOE" | "QUIZ_BATTLE" | "MATH_CHALLENGE" | "PUZZLE_COOP" | "FINANCE_BATTLE";
  engineKey: string;
  board: Array<string | null>;
  participants: Array<{ userId: number; isHost: boolean; playerRole: string }>;
  moves: Array<{ moveIndex: number; userId: number; cellIndex: number; playerRole: string; createdAt: string }>;
  nextTurn: string | null;
  winner: string | null;
  canPlay: boolean;
  expiresAt: string | null;
  engineState: Record<string, unknown>;
};

export type MultiplayerGuestJoinResponse = {
  accessToken: string;
  state: MultiplayerStateResponse;
};

export async function createMultiplayerSession(payload?: {
  gameType?: "TICTACTOE" | "QUIZ_BATTLE" | "MATH_CHALLENGE" | "PUZZLE_COOP" | "FINANCE_BATTLE";
  mode?: "PVP_PRIVATE" | "COOP_PRIVATE";
  joinMethod?: "QR_CODE" | "SHORT_CODE";
  ttlMinutes?: number;
  config?: Record<string, unknown>;
}): Promise<MultiplayerCreateResponse> {
  return apiRequest<MultiplayerCreateResponse>("/api/games/multiplayer/session/create", {
    method: "POST",
    body: payload ?? { gameType: "TICTACTOE", mode: "PVP_PRIVATE", joinMethod: "QR_CODE", ttlMinutes: 30 },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function joinMultiplayerSession(payload: {
  joinCode?: string;
  joinToken?: string;
}): Promise<MultiplayerStateResponse> {
  return apiRequest<MultiplayerStateResponse>("/api/games/multiplayer/session/join", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
    suppressAuthRedirect: true,
  });
}

export async function joinMultiplayerSessionAsGuest(payload: {
  joinCode?: string;
  joinToken?: string;
  displayName: string;
  avatar?: string;
}): Promise<MultiplayerGuestJoinResponse> {
  return apiRequest<MultiplayerGuestJoinResponse>("/api/games/multiplayer/session/join/public", {
    method: "POST",
    body: payload,
    requireAuth: false,
    includeTenant: true,
  });
}

export async function getMultiplayerSession(sessionId: string): Promise<MultiplayerStateResponse> {
  return apiRequest<MultiplayerStateResponse>(`/api/games/multiplayer/session/${sessionId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
    suppressAuthRedirect: true,
  });
}

export async function postMultiplayerMove(
  sessionId: string,
  cellIndex: number,
  options?: { action?: string; payload?: Record<string, unknown> },
): Promise<MultiplayerStateResponse> {
  return apiRequest<MultiplayerStateResponse>(`/api/games/multiplayer/session/${sessionId}/move`, {
    method: "POST",
    body: { cellIndex, action: options?.action, payload: options?.payload },
    requireAuth: true,
    includeTenant: true,
    suppressAuthRedirect: true,
  });
}

export async function closeMultiplayerSession(sessionId: string, reason?: string): Promise<MultiplayerStateResponse> {
  return apiRequest<MultiplayerStateResponse>(`/api/games/multiplayer/session/${sessionId}/close`, {
    method: "POST",
    body: { reason: reason ?? null },
    requireAuth: true,
    includeTenant: true,
    suppressAuthRedirect: true,
  });
}

export async function getStoreItems(): Promise<StoreCatalogResponse> {
  return apiRequest<StoreCatalogResponse>("/api/store/items", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function purchaseStoreItem(itemId: number): Promise<{ success: boolean; coins: number; itemId: number }> {
  return apiRequest<{ success: boolean; coins: number; itemId: number }>("/api/store/purchase", {
    method: "POST",
    body: { itemId },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function equipStoreItem(itemId: number): Promise<{ success: boolean; coins: number; itemId: number }> {
  return apiRequest<{ success: boolean; coins: number; itemId: number }>("/api/store/equip", {
    method: "POST",
    body: { itemId },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAprenderLessonContents(lessonId: number): Promise<AprenderLessonContent[]> {
  return apiRequest<AprenderLessonContent[]>(`/api/aprender/lessons/${lessonId}/contents`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function completeAprenderLesson(lessonId: number, score: number): Promise<AprenderLessonCompleteResponse> {
  return apiRequest<AprenderLessonCompleteResponse>(`/api/aprender/lessons/${lessonId}/complete`, {
    method: "POST",
    body: { score },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAprenderLearningEnergy(): Promise<AprenderLearningEnergyStatus> {
  return apiRequest<AprenderLearningEnergyStatus>("/api/aprender/energy", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function consumeAprenderWrongAnswerEnergy(): Promise<AprenderLearningEnergyConsumeResponse> {
  return apiRequest<AprenderLearningEnergyConsumeResponse>("/api/aprender/energy/consume-wrong", {
    method: "POST",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function refillAprenderEnergyWithWait(): Promise<AprenderLearningEnergyStatus> {
  return apiRequest<AprenderLearningEnergyStatus>("/api/aprender/energy/refill/wait", {
    method: "POST",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function refillAprenderEnergyWithCoins(): Promise<AprenderLearningEnergyStatus> {
  return apiRequest<AprenderLearningEnergyStatus>("/api/aprender/energy/refill/coins", {
    method: "POST",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAprenderLearningStreak(): Promise<AprenderLearningStreak> {
  return apiRequest<AprenderLearningStreak>("/api/aprender/streak", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAprenderLearningProfile(params?: { cacheBuster?: string | number }): Promise<AprenderLearningProfile> {
  const query = new URLSearchParams();
  if (params?.cacheBuster !== undefined && params.cacheBuster !== null) {
    query.set("t", String(params.cacheBuster));
  }
  const suffix = query.toString();
  return apiRequest<AprenderLearningProfile>(`/api/aprender/profile${suffix ? `?${suffix}` : ""}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function startLearningSession(payload: {
  childId?: number;
  subjectId?: number;
  unitId?: number;
  lessonId?: number;
}): Promise<LearningSessionStartResponse> {
  return apiRequest<LearningSessionStartResponse>("/api/learning/session/start", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function finishLearningSession(payload: {
  childId?: number;
  sessionId: string;
  totalQuestions: number;
  correctCount: number;
  decisionId?: string;
}): Promise<LearningSessionFinishResponse> {
  return apiRequest<LearningSessionFinishResponse>("/api/learning/session/finish", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAdaptiveLearningNext(payload: {
  childId?: number;
  subjectId?: number;
  lessonId?: number;
  focusSkillId?: string;
  forceDifficulty?: LearningDifficulty;
  count?: number;
}): Promise<LearningNextResponse> {
  return apiRequest<LearningNextResponse>("/api/learning/next", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function submitAdaptiveLearningAnswer(payload: {
  childId?: number;
  questionId?: string | null;
  templateId?: string | null;
  generatedVariantId?: string | null;
  variantId?: string | null;
  wrongAnswer?: string | null;
  result: LearningAnswerResult;
  timeMs: number;
}): Promise<LearningAnswerResponse> {
  return apiRequest<LearningAnswerResponse>("/api/learning/answer", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getLearningPath(subjectId?: number, childId?: number): Promise<LearningPathResponse> {
  const query = new URLSearchParams();
  if (typeof subjectId === "number" && Number.isFinite(subjectId) && subjectId > 0) {
    query.set("subjectId", String(subjectId));
  }
  if (typeof childId === "number" && Number.isFinite(childId) && childId > 0) {
    query.set("childId", String(childId));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<LearningPathResponse>(`/api/learning/path${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAprenderSubjects(params?: { ageGroup?: string; childId?: number }): Promise<AprenderSubjectOption[]> {
  const query = new URLSearchParams();
  if (params?.ageGroup) query.set("ageGroup", params.ageGroup);
  if (typeof params?.childId === "number" && Number.isFinite(params.childId) && params.childId > 0) {
    query.set("childId", String(params.childId));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<AprenderSubjectOption[]>(`/api/aprender/subjects${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function startLearningPathEvent(eventId: string): Promise<LearningEventStartResponse> {
  return apiRequest<LearningEventStartResponse>("/api/learning/event/start", {
    method: "POST",
    body: { eventId },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function completeLearningPathEvent(payload: {
  eventId: string;
  resultSummary: Record<string, unknown>;
}): Promise<LearningEventCompleteResponse> {
  return apiRequest<LearningEventCompleteResponse>("/api/learning/event/complete", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getLearningInsights(): Promise<LearningInsightsResponse> {
  return apiRequest<LearningInsightsResponse>("/api/learning/insights", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getCurrentMissions(): Promise<MissionsCurrentResponse> {
  return apiRequest<MissionsCurrentResponse>("/api/missions/current", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function claimMission(missionId: string): Promise<MissionClaimResponse> {
  return apiRequest<MissionClaimResponse>("/api/missions/claim", {
    method: "POST",
    body: { missionId },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getLearnSubjects(): Promise<LearnSubjectsResponse> {
  return apiRequest<LearnSubjectsResponse>("/learn/subjects", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getLearnSkills(subject: string): Promise<LearnSkillsResponse> {
  const query = new URLSearchParams({ subject });
  return apiRequest<LearnSkillsResponse>(`/learn/skills?${query.toString()}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function startLearnLesson(payload: {
  skill?: string;
  subject?: string;
}): Promise<LearnLessonResponse> {
  return apiRequest<LearnLessonResponse>("/learn/lesson/start", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function completeLearnLesson(payload: {
  subject: string;
  skill: string;
  lesson: string;
  score: number;
  stars: number;
  timeSpent: number;
  mastery?: number;
  confidence?: number;
  velocity?: number;
}): Promise<LearnLessonResponse> {
  return apiRequest<LearnLessonResponse>("/learn/lesson/complete", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getLearnNext(): Promise<LearnLessonResponse> {
  return apiRequest<LearnLessonResponse>("/learn/next", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getActiveSeasonEvents(): Promise<ActiveSeasonEventsResponse> {
  return apiRequest<ActiveSeasonEventsResponse>("/api/events/active", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getCalendarActivity(params?: { month?: number; year?: number }): Promise<CalendarActivityResponse> {
  const query = new URLSearchParams();
  if (params?.month) query.set("month", String(params.month));
  if (params?.year) query.set("year", String(params.year));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<CalendarActivityResponse>(`/api/calendar/activity${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getUserUXSettings(): Promise<UserUXSettings> {
  return apiRequest<UserUXSettings>("/api/user/ux-settings", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function upsertUserUXSettings(payload: {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  reducedMotion: boolean;
}): Promise<UserUXSettings> {
  return apiRequest<UserUXSettings>("/api/user/ux-settings", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionStudioPolicies(params?: { context?: string; q?: string }): Promise<AxionStudioPolicy[]> {
  const query = new URLSearchParams();
  if (params?.context) query.set("context", params.context);
  if (params?.q) query.set("q", params.q);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<AxionStudioPolicy[]>(`/api/platform-admin/axion/policies${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionStudioMe(): Promise<AxionStudioMe> {
  return apiRequest<AxionStudioMe>("/api/platform-admin/axion/me", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getPlatformTenants(params?: { q?: string; tenantType?: "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN" | "" }): Promise<PlatformTenantSummary[]> {
  const query = new URLSearchParams();
  if (params?.q) query.set("q", params.q);
  if (params?.tenantType) query.set("tenantType", params.tenantType);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<PlatformTenantSummary[]>(`/api/platform-admin/tenants${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function createPlatformTenant(payload: {
  name: string;
  slug: string;
  type: "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN";
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  createTestChild: boolean;
  testChildName: string;
  testChildBirthYear?: number | null;
  resetExistingUserPassword: boolean;
}): Promise<PlatformTenantCreateResponse> {
  return apiRequest<PlatformTenantCreateResponse>("/api/platform-admin/tenants", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getPlatformTenantDetail(tenantId: number): Promise<PlatformTenantDetail> {
  return apiRequest<PlatformTenantDetail>(`/api/platform-admin/tenants/${tenantId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function deletePlatformTenant(tenantId: number, confirmSlug: string): Promise<{ deleted: boolean; tenantId: number }> {
  return apiRequest<{ deleted: boolean; tenantId: number }>(`/api/platform-admin/tenants/${tenantId}`, {
    method: "DELETE",
    body: { confirmSlug },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function updatePlatformTenant(
  tenantId: number,
  payload: {
    name: string;
    type: "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN";
    adminEmail: string;
    adminName: string;
    adminPassword?: string | null;
    resetExistingUserPassword: boolean;
  },
): Promise<PlatformTenantDetail> {
  return apiRequest<PlatformTenantDetail>(`/api/platform-admin/tenants/${tenantId}`, {
    method: "PATCH",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function createPlatformAdminUser(payload: {
  slug: string;
  type: "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN";
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  resetExistingUserPassword: boolean;
}): Promise<PlatformAdminUserCreateResponse> {
  return apiRequest<PlatformAdminUserCreateResponse>("/api/platform-admin/tenants/platform-admin/admin-users", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function updatePlatformAdminUser(
  userId: number,
  payload: {
    slug: string;
    type: "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN";
    adminEmail: string;
    adminName: string;
    adminPassword?: string | null;
    resetExistingUserPassword: boolean;
  },
): Promise<PlatformAdminUserCreateResponse> {
  return apiRequest<PlatformAdminUserCreateResponse>(`/api/platform-admin/tenants/platform-admin/admin-users/${userId}`, {
    method: "PATCH",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function deletePlatformAdminUser(userId: number): Promise<PlatformAdminUserDeleteResponse> {
  return apiRequest<PlatformAdminUserDeleteResponse>(`/api/platform-admin/tenants/platform-admin/admin-users/${userId}`, {
    method: "DELETE",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function createAxionStudioPolicy(payload: {
  name: string;
  context: string;
  condition: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
  priority: number;
  enabled: boolean;
}): Promise<AxionStudioPolicy> {
  return apiRequest<AxionStudioPolicy>("/api/platform-admin/axion/policies", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function patchAxionStudioPolicy(
  policyId: number,
  payload: Partial<{
    name: string;
    context: string;
    condition: Record<string, unknown>;
    actions: Array<Record<string, unknown>>;
    priority: number;
    enabled: boolean;
  }>
): Promise<AxionStudioPolicy> {
  return apiRequest<AxionStudioPolicy>(`/api/platform-admin/axion/policies/${policyId}`, {
    method: "PATCH",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function toggleAxionStudioPolicy(policyId: number): Promise<AxionStudioPolicy> {
  return apiRequest<AxionStudioPolicy>(`/api/platform-admin/axion/policies/${policyId}/toggle`, {
    method: "POST",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionStudioPolicyVersions(policyId: number): Promise<AxionStudioVersion[]> {
  return apiRequest<AxionStudioVersion[]>(`/api/platform-admin/axion/policies/${policyId}/versions`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function restoreAxionStudioPolicy(policyId: number, version: number): Promise<AxionStudioPolicy> {
  return apiRequest<AxionStudioPolicy>(`/api/platform-admin/axion/policies/${policyId}/restore`, {
    method: "POST",
    body: { version },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionStudioTemplates(params?: { context?: string; tone?: string }): Promise<AxionStudioTemplate[]> {
  const query = new URLSearchParams();
  if (params?.context) query.set("context", params.context);
  if (params?.tone) query.set("tone", params.tone);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<AxionStudioTemplate[]>(`/api/platform-admin/axion/templates${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function createAxionStudioTemplate(payload: {
  context: string;
  tone: string;
  tags: string[];
  conditions: Record<string, unknown>;
  text: string;
  weight: number;
  enabled: boolean;
}): Promise<AxionStudioTemplate> {
  return apiRequest<AxionStudioTemplate>("/api/platform-admin/axion/templates", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function patchAxionStudioTemplate(
  templateId: number,
  payload: Partial<{
    context: string;
    tone: string;
    tags: string[];
    conditions: Record<string, unknown>;
    text: string;
    weight: number;
    enabled: boolean;
  }>
): Promise<AxionStudioTemplate> {
  return apiRequest<AxionStudioTemplate>(`/api/platform-admin/axion/templates/${templateId}`, {
    method: "PATCH",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function toggleAxionStudioTemplate(templateId: number): Promise<AxionStudioTemplate> {
  return apiRequest<AxionStudioTemplate>(`/api/platform-admin/axion/templates/${templateId}/toggle`, {
    method: "POST",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionStudioTemplateVersions(templateId: number): Promise<AxionStudioVersion[]> {
  return apiRequest<AxionStudioVersion[]>(`/api/platform-admin/axion/templates/${templateId}/versions`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function restoreAxionStudioTemplate(templateId: number, version: number): Promise<AxionStudioTemplate> {
  return apiRequest<AxionStudioTemplate>(`/api/platform-admin/axion/templates/${templateId}/restore`, {
    method: "POST",
    body: { version },
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionStudioAudit(params?: { actorUserId?: number; entityType?: string }): Promise<AxionStudioAudit[]> {
  const query = new URLSearchParams();
  if (params?.actorUserId) query.set("actorUserId", String(params.actorUserId));
  if (params?.entityType) query.set("entityType", params.entityType);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<AxionStudioAudit[]>(`/api/platform-admin/axion/audit${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionStudioPreviewUsers(): Promise<AxionStudioPreviewUser[]> {
  return apiRequest<AxionStudioPreviewUser[]>("/api/platform-admin/axion/users", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function previewAxionStudio(payload: { userId: number; context: string }): Promise<AxionStudioPreviewResponse> {
  return apiRequest<AxionStudioPreviewResponse>("/api/platform-admin/axion/preview", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionStudioImpact(params: { userId: number; days?: number }): Promise<AxionImpactResponse> {
  const query = new URLSearchParams();
  query.set("userId", String(params.userId));
  if (params.days) query.set("days", String(params.days));
  return apiRequest<AxionImpactResponse>(`/api/platform-admin/axion/impact?${query.toString()}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionStudioFinanceBalance(): Promise<AxionFinanceBalance> {
  return apiRequest<AxionFinanceBalance>("/api/platform-admin/axion/finance/balance", {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function patchAxionStudioFinanceBalance(payload: { balance: number }): Promise<AxionFinanceBalance> {
  return apiRequest<AxionFinanceBalance>("/api/platform-admin/axion/finance/balance", {
    method: "PATCH",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionStudioFinanceBills(params?: {
  q?: string;
  statusFilter?: "ALL" | "PENDING" | "PAID" | "OVERDUE";
  page?: number;
  pageSize?: number;
}): Promise<AxionFinanceBillsPage> {
  const query = new URLSearchParams();
  if (params?.q) query.set("q", params.q);
  if (params?.statusFilter) query.set("statusFilter", params.statusFilter);
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<AxionFinanceBillsPage>(`/api/platform-admin/axion/finance/bills${suffix}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function createAxionStudioFinanceBill(payload: {
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  recurrence: AxionFinanceRecurrence;
  notes: string;
}): Promise<AxionFinanceBill> {
  return apiRequest<AxionFinanceBill>("/api/platform-admin/axion/finance/bills", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function patchAxionStudioFinanceBill(
  billId: number,
  payload: Partial<{
    description: string;
    category: string;
    amount: number;
    dueDate: string;
    recurrence: AxionFinanceRecurrence;
    notes: string;
  }>
): Promise<AxionFinanceBill> {
  return apiRequest<AxionFinanceBill>(`/api/platform-admin/axion/finance/bills/${billId}`, {
    method: "PATCH",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function deleteAxionStudioFinanceBill(billId: number): Promise<{ deleted: boolean; billId: number }> {
  return apiRequest<{ deleted: boolean; billId: number }>(`/api/platform-admin/axion/finance/bills/${billId}`, {
    method: "DELETE",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function payAxionStudioFinanceBill(billId: number): Promise<AxionFinancePayBillResponse> {
  return apiRequest<AxionFinancePayBillResponse>(`/api/platform-admin/axion/finance/bills/${billId}/pay`, {
    method: "POST",
    requireAuth: true,
    includeTenant: true,
  });
}
