"use client";

import {
  clearTenantSlug,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getTenantSlug,
  setAccessToken,
  setRefreshToken,
} from "@/lib/api/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_URL) {
  throw new Error("NEXT_PUBLIC_API_URL is not defined");
}
export type ThemeName = "default" | "space" | "jungle" | "ocean" | "soccer" | "capybara" | "dinos" | "princess" | "heroes";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  requireAuth?: boolean;
  includeTenant?: boolean;
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

function redirectToLoginIfBrowser(): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/login") return;
  window.location.assign("/login");
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const payload = error.payload as ApiErrorPayload | null;
    if (payload && typeof payload.message === "string" && payload.message.trim().length > 0) {
      return payload.message;
    }
  }
  return fallback;
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
  if (!refreshToken || !tenantSlug) {
    clearTokens();
    clearTenantSlug();
    redirectToLoginIfBrowser();
    return null;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": tenantSlug,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    clearTokens();
    clearTenantSlug();
    redirectToLoginIfBrowser();
    return null;
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearTokens();
      clearTenantSlug();
      redirectToLoginIfBrowser();
    }
    return null;
  }
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

  const makeRequest = async (): Promise<Response> => {
    try {
      return await fetch(`${API_URL}${path}`, {
        method,
        headers,
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
    accessToken = await refreshAccessToken();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
      response = await makeRequest();
    }
  }

  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    if (options.requireAuth !== false && response.status === 401) {
      clearTokens();
      clearTenantSlug();
      redirectToLoginIfBrowser();
    }
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
  membership: { role: string; tenant_id: number; tenant_slug: string; tenant_type: "FAMILY" | "SCHOOL"; onboarding_completed: boolean };
  child_profiles: Array<{ id: number; display_name: string; avatar_key: string | null; birth_year: number | null; theme: ThemeName; avatar_stage: number }>;
};

export type OrganizationMembership = {
  role: string;
  tenant_id: number;
  tenant_name: string;
  tenant_slug: string;
  tenant_type: "FAMILY" | "SCHOOL";
  onboarding_completed: boolean;
};

export type ChildProfileSummary = {
  id: number;
  display_name: string;
  avatar_key: string | null;
  birth_year: number | null;
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

export type AxionStateResponse = {
  stage: number;
  mood_state: string;
  personality_traits: string[];
};

export type AxionBriefResponse = {
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

export type GameType = "TICTACTOE" | "WORDSEARCH" | "CROSSWORD" | "HANGMAN" | "FINANCE_SIM";

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

export async function logout(): Promise<{ message: string }> {
  return apiRequest<{ message: string }>("/auth/logout", { method: "POST", requireAuth: false, includeTenant: false });
}

export async function listMemberships(): Promise<OrganizationMembership[]> {
  return apiRequest<OrganizationMembership[]>("/auth/memberships", { method: "GET", requireAuth: true, includeTenant: false });
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
  birth_year?: number | null;
  theme: ThemeName;
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
  payload: { display_name: string; birth_year?: number | null; theme: ThemeName },
): Promise<ChildProfileSummary> {
  return apiRequest<ChildProfileSummary>(`/children/${childId}`, {
    method: "PUT",
    body: payload,
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

export async function getAxionState(childId: number): Promise<AxionStateResponse> {
  return apiRequest<AxionStateResponse>(`/axion/state?child_id=${childId}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAxionBrief(params?: { context?: string; axionDebug?: boolean }): Promise<AxionBriefResponse> {
  const query = new URLSearchParams();
  if (params?.context) query.set("context", params.context);
  if (params?.axionDebug) query.set("axionDebug", "true");
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<AxionBriefResponse>(`/api/axion/brief${suffix}`, {
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

export async function startLearningSession(payload: {
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
  sessionId: string;
  totalQuestions: number;
  correctCount: number;
}): Promise<LearningSessionFinishResponse> {
  return apiRequest<LearningSessionFinishResponse>("/api/learning/session/finish", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: true,
  });
}

export async function getAdaptiveLearningNext(payload: {
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

export async function getLearningPath(subjectId?: number): Promise<LearningPathResponse> {
  const query = subjectId ? `?subjectId=${subjectId}` : "";
  return apiRequest<LearningPathResponse>(`/api/learning/path${query}`, {
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
    includeTenant: false,
  });
}

export async function getAxionStudioMe(): Promise<AxionStudioMe> {
  return apiRequest<AxionStudioMe>("/api/platform-admin/axion/me", {
    method: "GET",
    requireAuth: true,
    includeTenant: false,
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
    includeTenant: false,
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
    includeTenant: false,
  });
}

export async function toggleAxionStudioPolicy(policyId: number): Promise<AxionStudioPolicy> {
  return apiRequest<AxionStudioPolicy>(`/api/platform-admin/axion/policies/${policyId}/toggle`, {
    method: "POST",
    requireAuth: true,
    includeTenant: false,
  });
}

export async function getAxionStudioPolicyVersions(policyId: number): Promise<AxionStudioVersion[]> {
  return apiRequest<AxionStudioVersion[]>(`/api/platform-admin/axion/policies/${policyId}/versions`, {
    method: "GET",
    requireAuth: true,
    includeTenant: false,
  });
}

export async function restoreAxionStudioPolicy(policyId: number, version: number): Promise<AxionStudioPolicy> {
  return apiRequest<AxionStudioPolicy>(`/api/platform-admin/axion/policies/${policyId}/restore`, {
    method: "POST",
    body: { version },
    requireAuth: true,
    includeTenant: false,
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
    includeTenant: false,
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
    includeTenant: false,
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
    includeTenant: false,
  });
}

export async function toggleAxionStudioTemplate(templateId: number): Promise<AxionStudioTemplate> {
  return apiRequest<AxionStudioTemplate>(`/api/platform-admin/axion/templates/${templateId}/toggle`, {
    method: "POST",
    requireAuth: true,
    includeTenant: false,
  });
}

export async function getAxionStudioTemplateVersions(templateId: number): Promise<AxionStudioVersion[]> {
  return apiRequest<AxionStudioVersion[]>(`/api/platform-admin/axion/templates/${templateId}/versions`, {
    method: "GET",
    requireAuth: true,
    includeTenant: false,
  });
}

export async function restoreAxionStudioTemplate(templateId: number, version: number): Promise<AxionStudioTemplate> {
  return apiRequest<AxionStudioTemplate>(`/api/platform-admin/axion/templates/${templateId}/restore`, {
    method: "POST",
    body: { version },
    requireAuth: true,
    includeTenant: false,
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
    includeTenant: false,
  });
}

export async function getAxionStudioPreviewUsers(): Promise<AxionStudioPreviewUser[]> {
  return apiRequest<AxionStudioPreviewUser[]>("/api/platform-admin/axion/users", {
    method: "GET",
    requireAuth: true,
    includeTenant: false,
  });
}

export async function previewAxionStudio(payload: { userId: number; context: string }): Promise<AxionStudioPreviewResponse> {
  return apiRequest<AxionStudioPreviewResponse>("/api/platform-admin/axion/preview", {
    method: "POST",
    body: payload,
    requireAuth: true,
    includeTenant: false,
  });
}

export async function getAxionStudioImpact(params: { userId: number; days?: number }): Promise<AxionImpactResponse> {
  const query = new URLSearchParams();
  query.set("userId", String(params.userId));
  if (params.days) query.set("days", String(params.days));
  return apiRequest<AxionImpactResponse>(`/api/platform-admin/axion/impact?${query.toString()}`, {
    method: "GET",
    requireAuth: true,
    includeTenant: false,
  });
}
