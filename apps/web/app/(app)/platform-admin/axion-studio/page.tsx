"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";

import {
  ApiError,
  changePassword,
  createPlatformAdminUser,
  createPlatformTenant,
  deletePlatformAdminUser,
  deletePlatformTenant,
  createAxionStudioPolicy,
  createAxionStudioTemplate,
  createAxionStudioFinanceBill,
  deleteAxionStudioFinanceBill,
  getApiErrorMessage,
  getAxionStudioAudit,
  getAxionStudioFinanceBalance,
  getAxionStudioFinanceBills,
  getAxionStudioImpact,
  getAxionStudioMe,
  getPlatformTenants,
  getPlatformTenantDetail,
  updatePlatformTenant,
  getAxionStudioPolicies,
  getAxionStudioPolicyVersions,
  getAxionStudioPreviewUsers,
  getAxionStudioTemplates,
  getAxionStudioTemplateVersions,
  patchAxionStudioPolicy,
  patchAxionStudioFinanceBalance,
  patchAxionStudioFinanceBill,
  patchAxionStudioTemplate,
  payAxionStudioFinanceBill,
  previewAxionStudio,
  restoreAxionStudioPolicy,
  restoreAxionStudioTemplate,
  toggleAxionStudioPolicy,
  toggleAxionStudioTemplate,
  updatePlatformAdminUser,
  logout,
  type AxionStudioAudit,
  type AxionImpactResponse,
  type AxionFinanceBill as AxionFinanceBillApi,
  type AxionFinanceRecurrence as AxionFinanceRecurrenceApi,
  type AxionStudioMe,
  type AxionStudioPolicy,
  type AxionStudioPreviewResponse,
  type AxionStudioPreviewUser,
  type AxionStudioTemplate,
  type AxionStudioVersion,
  type PlatformAdminUserCreateResponse,
  type PlatformTenantCreateResponse,
  type PlatformTenantDetail,
  type PlatformTenantSummary,
} from "@/lib/api/client";
import { clearTenantSlug, clearTokens, getAccessToken, getTenantSlug, setTenantSlug } from "@/lib/api/session";

type Tab = "policies" | "messages" | "preview" | "audit" | "impact" | "finance" | "orgs";
type OrgViewTab = "clients" | "admin";
type TenantFieldKey = "name" | "slug" | "type" | "adminName" | "adminEmail" | "adminPassword" | "testChildName" | "testChildBirthYear";
type AdminUserFieldKey = "slug" | "type" | "adminName" | "adminEmail" | "adminPassword";
type FinanceRecurrence = AxionFinanceRecurrenceApi;
type FinanceStoredStatus = "PENDING" | "PAID";
type FinanceBillStatus = FinanceStoredStatus | "OVERDUE";
type FinanceFilterStatus = "ALL" | FinanceBillStatus;
type FinanceBill = AxionFinanceBillApi;

const CONTEXTS = ["child_tab", "before_learning", "after_learning", "games_tab", "wallet_tab"] as const;
const TONES = ["CALM", "ENCOURAGE", "CHALLENGE", "CELEBRATE", "SUPPORT"] as const;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CONTEXT_LABELS: Record<string, string> = {
  child_tab: "Aba da criança",
  before_learning: "Antes de aprender",
  after_learning: "Após aprender",
  games_tab: "Aba de jogos",
  wallet_tab: "Aba da carteira",
};

const TONE_LABELS: Record<string, string> = {
  CALM: "Calmo",
  ENCOURAGE: "Incentivo",
  CHALLENGE: "Desafio",
  CELEBRATE: "Celebração",
  SUPPORT: "Apoio",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  RULE: "Regra",
  TEMPLATE: "Template",
};

const ACTION_LABELS: Record<string, string> = {
  RULE_CREATE: "Criação de regra",
  RULE_UPDATE: "Atualização de regra",
  RULE_TOGGLE: "Ativar/Desativar regra",
  TEMPLATE_CREATE: "Criação de template",
  TEMPLATE_UPDATE: "Atualização de template",
  TEMPLATE_TOGGLE: "Ativar/Desativar template",
  RESTORE_VERSION: "Restauração de versão",
};

const FINANCE_RECURRENCE_LABELS: Record<FinanceRecurrence, string> = {
  NONE: "Sem recorrência",
  WEEKLY: "Semanal",
  MONTHLY: "Mensal",
  YEARLY: "Anual",
};
const FINANCE_STATUS_LABELS: Record<FinanceBillStatus, string> = {
  PENDING: "Pendente",
  PAID: "Pago",
  OVERDUE: "Atrasado",
};
const FINANCE_CATEGORY_OPTIONS = ["Infraestrutura", "Operação", "Marketing", "Serviços", "Impostos", "Outros"];

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function safeParseJson(text: string, fallback: unknown): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function contextLabel(value: string): string {
  return CONTEXT_LABELS[value] ?? value;
}

function toneLabel(value: string): string {
  return TONE_LABELS[value] ?? value;
}

function isValidTab(value: string | null): value is Tab {
  return value === "policies" || value === "messages" || value === "preview" || value === "audit" || value === "impact" || value === "finance" || value === "orgs";
}

function toIsoDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateAtNoon(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function parseCurrencyInput(value: string): number {
  return Number(value.replace(",", "."));
}

function financeComputedStatus(bill: FinanceBill, todayIso: string): FinanceBillStatus {
  if (bill.status === "PAID") return "PAID";
  if (bill.dueDate < todayIso) return "OVERDUE";
  return "PENDING";
}

function validateTenantDraft(draft: {
  name: string;
  slug: string;
  type: "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN";
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  createTestChild: boolean;
  testChildName: string;
  testChildBirthYear: string;
  resetExistingUserPassword: boolean;
}, options?: { isEditing?: boolean }): Partial<Record<TenantFieldKey, string>> {
  const isEditing = Boolean(options?.isEditing);
  const errors: Partial<Record<TenantFieldKey, string>> = {};
  const currentYear = new Date().getFullYear();

  if (draft.name.trim().length < 2) errors.name = "Informe um nome com pelo menos 2 caracteres.";
  if (!isEditing && !SLUG_REGEX.test(draft.slug.trim().toLowerCase())) {
    errors.slug = "Use apenas letras minúsculas, números e hífen (ex.: familia-silva).";
  }
  if (draft.adminName.trim().length < 2) errors.adminName = "Informe o nome do administrador (mínimo 2 caracteres).";
  if (!EMAIL_REGEX.test(draft.adminEmail.trim().toLowerCase())) errors.adminEmail = "Informe um e-mail válido.";
  if (!isEditing || draft.resetExistingUserPassword) {
    if (draft.adminPassword.length < 10) errors.adminPassword = "A senha inicial deve ter no mínimo 10 caracteres.";
  }

  if (draft.type === "FAMILY" && draft.createTestChild && draft.testChildName.trim().length < 2) {
    errors.testChildName = "Informe o nome da criança com pelo menos 2 caracteres.";
  }
  if (draft.testChildBirthYear.trim().length > 0) {
    const birthYear = Number(draft.testChildBirthYear);
    if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > currentYear) {
      errors.testChildBirthYear = "Ano inválido. Use um valor entre 1900 e o ano atual.";
    }
  }

  return errors;
}

function mapTenant422Errors(payload: unknown): Partial<Record<TenantFieldKey, string>> {
  const mapped: Partial<Record<TenantFieldKey, string>> = {};
  if (!payload || typeof payload !== "object") return mapped;
  const detail = (payload as { detail?: unknown }).detail;
  if (!Array.isArray(detail)) return mapped;

  for (const item of detail) {
    if (!item || typeof item !== "object") continue;
    const loc = Array.isArray((item as { loc?: unknown[] }).loc) ? (item as { loc: unknown[] }).loc : [];
    const rawField = String(loc[loc.length - 1] ?? "");
    const message = String((item as { msg?: unknown }).msg ?? "Valor inválido.");

    const fieldMap: Record<string, TenantFieldKey> = {
      name: "name",
      slug: "slug",
      type: "type",
      adminName: "adminName",
      admin_name: "adminName",
      adminEmail: "adminEmail",
      admin_email: "adminEmail",
      adminPassword: "adminPassword",
      admin_password: "adminPassword",
      testChildName: "testChildName",
      test_child_name: "testChildName",
      testChildBirthYear: "testChildBirthYear",
      test_child_birth_year: "testChildBirthYear",
    };
    const mappedField = fieldMap[rawField];
    if (mappedField && !mapped[mappedField]) {
      mapped[mappedField] = message;
    }
  }

  return mapped;
}

function validateAdminUserDraft(draft: {
  slug: string;
  type: "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN";
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  resetExistingUserPassword: boolean;
}, options?: { isEditing?: boolean }): Partial<Record<AdminUserFieldKey, string>> {
  const isEditing = Boolean(options?.isEditing);
  const errors: Partial<Record<AdminUserFieldKey, string>> = {};
  if (!SLUG_REGEX.test(draft.slug.trim().toLowerCase())) {
    errors.slug = "Use apenas letras minúsculas, números e hífen (ex.: platform-admin).";
  }
  if (draft.adminName.trim().length < 2) errors.adminName = "Informe o nome do administrador (mínimo 2 caracteres).";
  if (!EMAIL_REGEX.test(draft.adminEmail.trim().toLowerCase())) errors.adminEmail = "Informe um e-mail válido.";
  if (!isEditing || draft.resetExistingUserPassword) {
    if (draft.adminPassword.length < 10) errors.adminPassword = "A senha inicial deve ter no mínimo 10 caracteres.";
  }
  return errors;
}

function AxionStudioPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("orgs");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [me, setMe] = useState<AxionStudioMe | null>(null);
  const [policies, setPolicies] = useState<AxionStudioPolicy[]>([]);
  const [templates, setTemplates] = useState<AxionStudioTemplate[]>([]);
  const [audit, setAudit] = useState<AxionStudioAudit[]>([]);
  const [users, setUsers] = useState<AxionStudioPreviewUser[]>([]);
  const [tenants, setTenants] = useState<PlatformTenantSummary[]>([]);
  const [orgViewTab, setOrgViewTab] = useState<OrgViewTab>("clients");
  const [selectedTenantDetail, setSelectedTenantDetail] = useState<PlatformTenantDetail | null>(null);
  const [deleteTargetTenant, setDeleteTargetTenant] = useState<PlatformTenantSummary | null>(null);
  const [deleteConfirmSlug, setDeleteConfirmSlug] = useState("");
  const [tenantSearch, setTenantSearch] = useState("");
  const [tenantTypeFilter, setTenantTypeFilter] = useState<"" | "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN">("");
  const [tenantCreateResult, setTenantCreateResult] = useState<PlatformTenantCreateResponse | null>(null);
  const [editingTenantId, setEditingTenantId] = useState<number | null>(null);
  const [tenantOperationMessage, setTenantOperationMessage] = useState<string | null>(null);
  const [tenantFieldErrors, setTenantFieldErrors] = useState<Partial<Record<TenantFieldKey, string>>>({});
  const [platformAdminUserResult, setPlatformAdminUserResult] = useState<PlatformAdminUserCreateResponse | null>(null);
  const [editingPlatformAdminUserId, setEditingPlatformAdminUserId] = useState<number | null>(null);
  const [adminUserFieldErrors, setAdminUserFieldErrors] = useState<Partial<Record<AdminUserFieldKey, string>>>({});
  const [platformAdminMembers, setPlatformAdminMembers] = useState<PlatformTenantDetail["adminMembers"]>([]);
  const [platformAdminTenantId, setPlatformAdminTenantId] = useState<number | null>(null);
  const [platformAdminTenantType, setPlatformAdminTenantType] = useState<"FAMILY" | "SCHOOL" | "SYSTEM_ADMIN" | "">("");
  const [tenantDraft, setTenantDraft] = useState({
    name: "",
    slug: "",
    type: "FAMILY" as "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN",
    adminEmail: "",
    adminName: "",
    adminPassword: "",
    createTestChild: true,
    testChildName: "Filho Teste",
    testChildBirthYear: "",
    resetExistingUserPassword: false,
  });
  const [platformAdminUserDraft, setPlatformAdminUserDraft] = useState({
    slug: "platform-admin",
    type: "SYSTEM_ADMIN" as "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN",
    adminEmail: "",
    adminName: "",
    adminPassword: "",
    resetExistingUserPassword: false,
  });

  const [policySearch, setPolicySearch] = useState("");
  const [policyContext, setPolicyContext] = useState("");
  const [policyDraft, setPolicyDraft] = useState<{
    id: number | null;
    name: string;
    context: string;
    conditionJson: string;
    actionsJson: string;
    priority: number;
    enabled: boolean;
  }>({
    id: null,
    name: "",
    context: "before_learning",
    conditionJson: "{}",
    actionsJson: "[]",
    priority: 100,
    enabled: true,
  });

  const [templateDraft, setTemplateDraft] = useState<{
    id: number | null;
    context: string;
    tone: string;
    tagsCsv: string;
    conditionsJson: string;
    text: string;
    weight: number;
    enabled: boolean;
  }>({
    id: null,
    context: "child_tab",
    tone: "ENCOURAGE",
    tagsCsv: "axion,studio",
    conditionsJson: "{}",
    text: "",
    weight: 1,
    enabled: true,
  });

  const [previewUserId, setPreviewUserId] = useState<number | null>(null);
  const [previewContext, setPreviewContext] = useState("child_tab");
  const [previewResult, setPreviewResult] = useState<AxionStudioPreviewResponse | null>(null);
  const [impactUserId, setImpactUserId] = useState<number | null>(null);
  const [impactDays, setImpactDays] = useState<number>(7);
  const [impactResult, setImpactResult] = useState<AxionImpactResponse | null>(null);
  const [financeBills, setFinanceBills] = useState<FinanceBill[]>([]);
  const [financeBalance, setFinanceBalance] = useState<number>(0);
  const [financeBalanceDraft, setFinanceBalanceDraft] = useState<string>("0");
  const [financeSearch, setFinanceSearch] = useState("");
  const [financeFilterStatus, setFinanceFilterStatus] = useState<FinanceFilterStatus>("ALL");
  const [financeFeedback, setFinanceFeedback] = useState<string | null>(null);
  const [financeInsightDismissed, setFinanceInsightDismissed] = useState(false);
  const [financeEditingBillId, setFinanceEditingBillId] = useState<number | null>(null);
  const [financeRowsPerPage, setFinanceRowsPerPage] = useState<number>(20);
  const [financePage, setFinancePage] = useState<number>(1);
  const [financeDraft, setFinanceDraft] = useState<{
    description: string;
    category: string;
    amount: string;
    dueDate: string;
    recurrence: FinanceRecurrence;
    notes: string;
  }>({
    description: "",
    category: "Operação",
    amount: "",
    dueDate: toIsoDateInput(new Date()),
    recurrence: "MONTHLY",
    notes: "",
  });
  const [versions, setVersions] = useState<AxionStudioVersion[]>([]);
  const [versionsTitle, setVersionsTitle] = useState("");
  const [versionsTarget, setVersionsTarget] = useState<{ type: "RULE" | "TEMPLATE"; id: number } | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordFeedback, setPasswordFeedback] = useState<string | null>(null);

  const setTabWithUrl = (nextTab: Tab) => {
    setTab(nextTab);
    const currentTab = searchParams.get("tab");
    if (currentTab === nextTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const templateCharCount = useMemo(() => templateDraft.text.trim().length, [templateDraft.text]);
  const clientTenants = useMemo(() => tenants.filter((tenant) => tenant.slug !== "platform-admin"), [tenants]);
  const adminTenants = useMemo(() => tenants.filter((tenant) => tenant.slug === "platform-admin"), [tenants]);
  const filteredPlatformAdminMembers = useMemo(() => {
    const query = tenantSearch.trim().toLowerCase();
    if (!query) return platformAdminMembers;
    return platformAdminMembers.filter((member) => {
      const name = member.name.toLowerCase();
      const email = member.email.toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [platformAdminMembers, tenantSearch]);
  const filteredFinanceBills = useMemo(() => {
    const query = financeSearch.trim().toLowerCase();
    const todayIso = toIsoDateInput(new Date());
    return financeBills
      .filter((bill) => {
        const status = financeComputedStatus(bill, todayIso);
        const matchesFilter = financeFilterStatus === "ALL" || status === financeFilterStatus;
        if (!matchesFilter) return false;
        if (!query) return true;
        return bill.description.toLowerCase().includes(query) || bill.category.toLowerCase().includes(query) || bill.notes.toLowerCase().includes(query);
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [financeBills, financeFilterStatus, financeSearch]);
  const financeStats = useMemo(() => {
    const today = parseDateAtNoon(toIsoDateInput(new Date()));
    const todayIso = toIsoDateInput(today);
    const nextSevenDays = new Date(today);
    nextSevenDays.setDate(nextSevenDays.getDate() + 7);
    const nextSevenDaysIso = toIsoDateInput(nextSevenDays);

    let pendingTotal = 0;
    let overdueTotal = 0;
    let dueNext7Days = 0;
    let recurringCommitmentMonthly = 0;
    let paidTotal = 0;

    for (const bill of financeBills) {
      const status = financeComputedStatus(bill, todayIso);
      if (status === "PAID") {
        paidTotal += bill.amount;
      }
      if (status !== "PAID") {
        pendingTotal += bill.amount;
      }
      if (status === "OVERDUE") {
        overdueTotal += bill.amount;
      }
      if (status !== "PAID" && bill.dueDate >= todayIso && bill.dueDate <= nextSevenDaysIso) {
        dueNext7Days += 1;
      }
      if (status !== "PAID") {
        if (bill.recurrence === "WEEKLY") recurringCommitmentMonthly += bill.amount * 4.33;
        if (bill.recurrence === "MONTHLY") recurringCommitmentMonthly += bill.amount;
        if (bill.recurrence === "YEARLY") recurringCommitmentMonthly += bill.amount / 12;
      }
    }

    const projectedBalanceAfterPending = financeBalance - pendingTotal;
    return { pendingTotal, overdueTotal, dueNext7Days, recurringCommitmentMonthly, projectedBalanceAfterPending, paidTotal };
  }, [financeBalance, financeBills]);
  const financeInsight = useMemo(() => {
    if (financeStats.overdueTotal > 0) {
      return `Prioridade crítica: ${formatCurrencyBRL(financeStats.overdueTotal)} já está em atraso.`;
    }
    if (financeStats.dueNext7Days > 0) {
      return `Atenção: ${financeStats.dueNext7Days} conta(s) vencem nos próximos 7 dias.`;
    }
    return null;
  }, [financeStats]);
  const financeTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredFinanceBills.length / financeRowsPerPage));
  }, [filteredFinanceBills.length, financeRowsPerPage]);
  const paginatedFinanceBills = useMemo(() => {
    const start = (financePage - 1) * financeRowsPerPage;
    return filteredFinanceBills.slice(start, start + financeRowsPerPage);
  }, [filteredFinanceBills, financePage, financeRowsPerPage]);

  const redirectToLogin = () => {
    clearTokens();
    clearTenantSlug();
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.assign(`/platform-admin/login?next=${next}`);
  };

  const isAuthError = (err: unknown): boolean => err instanceof ApiError && err.status === 401;

  const loadFinanceData = async () => {
    const [balanceResult, billsResult] = await Promise.all([
      getAxionStudioFinanceBalance(),
      getAxionStudioFinanceBills({ page: 1, pageSize: 100 }),
    ]);
    setFinanceBalance(balanceResult.balance);
    setFinanceBills(billsResult.items);
  };

  const loadBase = async () => {
    setLoading(true);
    setError(null);
    try {
      const [meResult, policyResult, templateResult, auditResult, usersResult, tenantsResult, financeBalanceResult, financeBillsResult] = await Promise.allSettled([
        getAxionStudioMe(),
        getAxionStudioPolicies({ context: policyContext || undefined, q: policySearch || undefined }),
        getAxionStudioTemplates(),
        getAxionStudioAudit(),
        getAxionStudioPreviewUsers(),
        getPlatformTenants({ q: tenantSearch || undefined, tenantType: orgViewTab === "admin" ? "" : tenantTypeFilter }),
        getAxionStudioFinanceBalance(),
        getAxionStudioFinanceBills({ page: 1, pageSize: 100 }),
      ]);

      if (meResult.status === "fulfilled") {
        setMe(meResult.value);
      }
      if (policyResult.status === "fulfilled") {
        setPolicies(policyResult.value);
      }
      if (templateResult.status === "fulfilled") {
        setTemplates(templateResult.value);
      }
      if (auditResult.status === "fulfilled") {
        setAudit(auditResult.value);
      }
      if (usersResult.status === "fulfilled") {
        setUsers(usersResult.value);
        if (!previewUserId && usersResult.value.length > 0) setPreviewUserId(usersResult.value[0].userId);
        if (!impactUserId && usersResult.value.length > 0) setImpactUserId(usersResult.value[0].userId);
      }
      if (tenantsResult.status === "fulfilled") {
        setTenants(tenantsResult.value);
      }
      if (financeBalanceResult.status === "fulfilled") {
        setFinanceBalance(financeBalanceResult.value.balance);
      }
      if (financeBillsResult.status === "fulfilled") {
        setFinanceBills(financeBillsResult.value.items);
      }

      const firstFailure =
        (meResult.status === "rejected" && meResult.reason) ||
        (policyResult.status === "rejected" && policyResult.reason) ||
        (templateResult.status === "rejected" && templateResult.reason) ||
        (auditResult.status === "rejected" && auditResult.reason) ||
        (usersResult.status === "rejected" && usersResult.reason) ||
        (tenantsResult.status === "rejected" && tenantsResult.reason) ||
        (financeBalanceResult.status === "rejected" && financeBalanceResult.reason) ||
        (financeBillsResult.status === "rejected" && financeBillsResult.reason) ||
        null;
      if (firstFailure) {
        if (isAuthError(firstFailure)) {
          redirectToLogin();
          return;
        }
        setError(getApiErrorMessage(firstFailure, "Não foi possível carregar todos os dados do Axion Studio."));
      }
    } catch (err) {
      if (isAuthError(err)) {
        redirectToLogin();
        return;
      }
      setError(getApiErrorMessage(err, "Não foi possível carregar o Axion Studio."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const hasAccess = Boolean(getAccessToken());
    if (!hasAccess) {
      redirectToLogin();
      return;
    }
    if (!getTenantSlug()) {
      setTenantSlug("platform-admin");
    }
    setAuthChecked(true);
    void loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authChecked || tab !== "orgs") return;
    if (orgViewTab === "admin" && tenantTypeFilter !== "") {
      setTenantTypeFilter("");
    }
    void loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgViewTab, tab]);

  useEffect(() => {
    if (tab !== "orgs" || orgViewTab !== "admin") {
      setPlatformAdminMembers([]);
      setPlatformAdminTenantId(null);
      setPlatformAdminTenantType("");
      return;
    }
    const platformTenant = adminTenants[0];
    if (!platformTenant) {
      setPlatformAdminMembers([]);
      setPlatformAdminTenantId(null);
      setPlatformAdminTenantType("");
      return;
    }
    void loadPlatformAdminMembers(platformTenant.id).catch((err) => {
      setError(getApiErrorMessage(err, "Falha ao carregar administradores da plataforma."));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, orgViewTab, adminTenants]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (isValidTab(requestedTab) && requestedTab !== tab) {
      setTab(requestedTab);
    }
  }, [searchParams, tab]);

  useEffect(() => {
    setFinanceBalanceDraft(financeBalance.toFixed(2));
  }, [financeBalance]);

  useEffect(() => {
    setFinancePage(1);
  }, [financeSearch, financeFilterStatus, financeRowsPerPage]);

  useEffect(() => {
    if (financePage > financeTotalPages) {
      setFinancePage(financeTotalPages);
    }
  }, [financePage, financeTotalPages]);

  useEffect(() => {
    setFinanceInsightDismissed(false);
  }, [financeInsight]);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
    } catch {
      // mesmo em erro, forçamos encerramento local da sessão
    } finally {
      clearTokens();
      clearTenantSlug();
      window.location.assign("/platform-admin/login");
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim()) {
      setPasswordFeedback("Preencha senha atual e nova senha.");
      return;
    }
    setLoading(true);
    setPasswordFeedback(null);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordFeedback("Senha atualizada com sucesso.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordFeedback(getApiErrorMessage(err, "Não foi possível atualizar a senha."));
    } finally {
      setLoading(false);
    }
  };

  if (!authChecked) {
    return (
      <main className="min-h-screen w-full overflow-x-clip px-4 py-6 md:px-8 xl:px-14 2xl:px-20">
        <div className="rounded-3xl border border-[#BFD3EE] bg-white p-6 text-sm font-semibold text-[#5F80AA] shadow-[0_14px_40px_rgba(16,48,90,0.08)]">
          Validando sessão...
        </div>
      </main>
    );
  }

  const savePolicy = async (previewAfterSave: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        name: policyDraft.name.trim(),
        context: policyDraft.context,
        condition: safeParseJson(policyDraft.conditionJson, {}) as Record<string, unknown>,
        actions: safeParseJson(policyDraft.actionsJson, []) as Array<Record<string, unknown>>,
        priority: policyDraft.priority,
        enabled: policyDraft.enabled,
      };
      if (policyDraft.id) {
        await patchAxionStudioPolicy(policyDraft.id, payload);
      } else {
        await createAxionStudioPolicy(payload);
      }
      await loadBase();
      if (previewAfterSave && previewUserId) {
        const result = await previewAxionStudio({ userId: previewUserId, context: previewContext });
        setPreviewResult(result);
        setTabWithUrl("preview");
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao salvar regra."));
    } finally {
      setLoading(false);
    }
  };

  const saveTemplate = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        context: templateDraft.context,
        tone: templateDraft.tone,
        tags: templateDraft.tagsCsv
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        conditions: safeParseJson(templateDraft.conditionsJson, {}) as Record<string, unknown>,
        text: templateDraft.text.trim(),
        weight: templateDraft.weight,
        enabled: templateDraft.enabled,
      };
      if (templateDraft.id) {
        await patchAxionStudioTemplate(templateDraft.id, payload);
      } else {
        await createAxionStudioTemplate(payload);
      }
      await loadBase();
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao salvar template."));
    } finally {
      setLoading(false);
    }
  };

  const runPreview = async () => {
    if (!previewUserId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await previewAxionStudio({ userId: previewUserId, context: previewContext });
      setPreviewResult(result);
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao executar prévia."));
    } finally {
      setLoading(false);
    }
  };

  const runImpact = async () => {
    if (!impactUserId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getAxionStudioImpact({ userId: impactUserId, days: impactDays });
      setImpactResult(result);
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao calcular impacto do Axion."));
    } finally {
      setLoading(false);
    }
  };

  const resetFinanceDraft = () => {
    setFinanceEditingBillId(null);
    setFinanceDraft({
      description: "",
      category: "Operação",
      amount: "",
      dueDate: toIsoDateInput(new Date()),
      recurrence: "MONTHLY",
      notes: "",
    });
  };

  const startEditFinanceBill = (bill: FinanceBill) => {
    setFinanceEditingBillId(bill.id);
    setFinanceDraft({
      description: bill.description,
      category: bill.category,
      amount: bill.amount.toFixed(2),
      dueDate: bill.dueDate,
      recurrence: bill.recurrence,
      notes: bill.notes,
    });
    setFinanceFeedback("Modo de edicao ativado para a conta selecionada.");
    setError(null);
  };

  const saveFinanceBalance = async () => {
    const parsed = parseCurrencyInput(financeBalanceDraft);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Informe um saldo válido (zero ou maior).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await patchAxionStudioFinanceBalance({ balance: parsed });
      setFinanceBalance(result.balance);
      setFinanceBalanceDraft(result.balance.toFixed(2));
      setFinanceFeedback("Saldo atualizado com sucesso.");
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível atualizar o saldo."));
    } finally {
      setLoading(false);
    }
  };

  const addFinanceBill = async () => {
    const amount = parseCurrencyInput(financeDraft.amount);
    if (financeDraft.description.trim().length < 2) {
      setError("Informe uma descrição da conta com pelo menos 2 caracteres.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Informe um valor válido para a conta.");
      return;
    }
    if (!financeDraft.dueDate) {
      setError("Informe a data de vencimento.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (financeEditingBillId !== null) {
        await patchAxionStudioFinanceBill(financeEditingBillId, {
          description: financeDraft.description.trim(),
          category: financeDraft.category,
          amount,
          dueDate: financeDraft.dueDate,
          recurrence: financeDraft.recurrence,
          notes: financeDraft.notes.trim(),
        });
      } else {
        await createAxionStudioFinanceBill({
          description: financeDraft.description.trim(),
          category: financeDraft.category,
          amount,
          dueDate: financeDraft.dueDate,
          recurrence: financeDraft.recurrence,
          notes: financeDraft.notes.trim(),
        });
      }
      await loadFinanceData();
      setFinanceFeedback(financeEditingBillId !== null ? "Conta atualizada com sucesso." : "Conta adicionada com sucesso.");
      resetFinanceDraft();
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível salvar a conta."));
    } finally {
      setLoading(false);
    }
  };

  const registerFinancePayment = async (billId: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await payAxionStudioFinanceBill(billId);
      setFinanceBalance(result.balance);
      await loadFinanceData();
      setFinanceFeedback(result.recurringBill ? "Pagamento registrado e próxima recorrência criada automaticamente." : "Pagamento registrado com sucesso.");
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível registrar o pagamento."));
    } finally {
      setLoading(false);
    }
  };
  const deleteFinanceBill = async (billId: number) => {
    setLoading(true);
    setError(null);
    try {
      await deleteAxionStudioFinanceBill(billId);
      if (financeEditingBillId === billId) {
        resetFinanceDraft();
      }
      await loadFinanceData();
      setFinanceFeedback("Conta removida.");
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível remover a conta."));
    } finally {
      setLoading(false);
    }
  };

  const resetPlatformAdminForm = () => {
    setEditingPlatformAdminUserId(null);
    setAdminUserFieldErrors({});
    setPlatformAdminUserDraft({
      slug: "platform-admin",
      type: "SYSTEM_ADMIN",
      adminEmail: "",
      adminName: "",
      adminPassword: "",
      resetExistingUserPassword: false,
    });
  };

  const loadPlatformAdminMembers = async (tenantId: number) => {
    const detail = await getPlatformTenantDetail(tenantId);
    setPlatformAdminTenantId(detail.tenant.id);
    setPlatformAdminTenantType(detail.tenant.type === "SYSTEM_ADMIN" ? "SYSTEM_ADMIN" : detail.tenant.type === "SCHOOL" ? "SCHOOL" : "FAMILY");
    setPlatformAdminMembers(detail.adminMembers.filter((member) => member.role === "PLATFORM_ADMIN"));
  };

  const saveTenant = async () => {
    const isEditing = editingTenantId !== null;
    const localErrors = validateTenantDraft(tenantDraft, { isEditing });
    if (Object.keys(localErrors).length > 0) {
      setTenantFieldErrors(localErrors);
      setError("Revise os campos obrigatórios e os formatos informados.");
      return;
    }

    setLoading(true);
    setError(null);
    setTenantOperationMessage(null);
    setTenantCreateResult(null);
    setTenantFieldErrors({});
    try {
      if (isEditing && editingTenantId !== null) {
        await updatePlatformTenant(editingTenantId, {
          name: tenantDraft.name.trim(),
          type: tenantDraft.type,
          adminEmail: tenantDraft.adminEmail.trim().toLowerCase(),
          adminName: tenantDraft.adminName.trim(),
          adminPassword: tenantDraft.resetExistingUserPassword ? tenantDraft.adminPassword : null,
          resetExistingUserPassword: tenantDraft.resetExistingUserPassword,
        });
        await loadBase();
        setTenantOperationMessage("Organização atualizada com sucesso.");
        setEditingTenantId(null);
        setTenantDraft((prev) => ({
          ...prev,
          name: "",
          slug: "",
          type: "FAMILY",
          adminEmail: "",
          adminName: "",
          adminPassword: "",
          createTestChild: true,
          testChildName: "Filho Teste",
          testChildBirthYear: "",
          resetExistingUserPassword: false,
        }));
        return;
      }
      const payload = {
        name: tenantDraft.name.trim(),
        slug: tenantDraft.slug.trim().toLowerCase(),
        type: tenantDraft.type,
        adminEmail: tenantDraft.adminEmail.trim().toLowerCase(),
        adminName: tenantDraft.adminName.trim(),
        adminPassword: tenantDraft.adminPassword,
        createTestChild: tenantDraft.createTestChild && tenantDraft.type === "FAMILY",
        testChildName: tenantDraft.testChildName.trim() || "Filho Teste",
        testChildBirthYear: tenantDraft.testChildBirthYear.trim() ? Number(tenantDraft.testChildBirthYear) : null,
        resetExistingUserPassword: tenantDraft.resetExistingUserPassword,
      };
      const result = await createPlatformTenant(payload);
      setTenantCreateResult(result);
      setTenantOperationMessage("Organização criada com sucesso.");
      await loadBase();
      setTenantDraft((prev) => ({
        ...prev,
        name: "",
        slug: "",
        type: "FAMILY",
        adminEmail: "",
        adminName: "",
        adminPassword: "",
        createTestChild: true,
        testChildName: "Filho Teste",
        testChildBirthYear: "",
        resetExistingUserPassword: false,
      }));
      setEditingTenantId(null);
      setTenantFieldErrors({});
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const mapped = mapTenant422Errors(err.payload);
        if (Object.keys(mapped).length > 0) {
          setTenantFieldErrors(mapped);
        }
        setError("Alguns campos não passaram na validação. Revise os itens destacados.");
      } else {
        setTenantFieldErrors({});
        setError(getApiErrorMessage(err, isEditing ? "Falha ao atualizar organização." : "Falha ao criar organização."));
      }
    } finally {
      setLoading(false);
    }
  };

  const savePlatformAdminUser = async () => {
    const isEditing = editingPlatformAdminUserId !== null;
    const localErrors = validateAdminUserDraft(platformAdminUserDraft, { isEditing });
    if (Object.keys(localErrors).length > 0) {
      setAdminUserFieldErrors(localErrors);
      setError("Revise os campos do administrador da plataforma.");
      return;
    }

    setLoading(true);
    setError(null);
    setTenantOperationMessage(null);
    setPlatformAdminUserResult(null);
    setAdminUserFieldErrors({});
    try {
      const payload = {
        slug: platformAdminUserDraft.slug.trim().toLowerCase(),
        type: platformAdminUserDraft.type,
        adminEmail: platformAdminUserDraft.adminEmail.trim().toLowerCase(),
        adminName: platformAdminUserDraft.adminName.trim(),
        adminPassword: platformAdminUserDraft.adminPassword,
        resetExistingUserPassword: platformAdminUserDraft.resetExistingUserPassword,
      };
      const result = isEditing && editingPlatformAdminUserId !== null
        ? await updatePlatformAdminUser(editingPlatformAdminUserId, {
          ...payload,
          adminPassword: payload.resetExistingUserPassword ? payload.adminPassword : null,
        })
        : await createPlatformAdminUser(payload);
      setPlatformAdminUserResult(result);
      setTenantOperationMessage(isEditing ? "Administrador da plataforma atualizado com sucesso." : "Administrador da plataforma criado com sucesso.");
      await loadBase();
      await loadPlatformAdminMembers(result.tenantId);
      resetPlatformAdminForm();
    } catch (err) {
      setError(getApiErrorMessage(err, isEditing ? "Falha ao atualizar administrador da plataforma." : "Falha ao criar administrador da plataforma."));
    } finally {
      setLoading(false);
    }
  };

  const startEditPlatformAdminUser = async (tenant: PlatformTenantSummary) => {
    setLoading(true);
    setError(null);
    setTenantOperationMessage(null);
    setPlatformAdminUserResult(null);
    try {
      const detail = await getPlatformTenantDetail(tenant.id);
      const adminMember = detail.adminMembers.find((member) => member.role === "PLATFORM_ADMIN") ?? detail.adminMembers[0];
      if (!adminMember) {
        setError("Nenhum administrador encontrado para edição.");
        return;
      }
      setEditingPlatformAdminUserId(adminMember.userId);
      setAdminUserFieldErrors({});
      setPlatformAdminUserDraft({
        slug: detail.tenant.slug,
        type: detail.tenant.type === "SYSTEM_ADMIN" ? "SYSTEM_ADMIN" : detail.tenant.type === "SCHOOL" ? "SCHOOL" : "FAMILY",
        adminEmail: adminMember.email,
        adminName: adminMember.name,
        adminPassword: "",
        resetExistingUserPassword: false,
      });
      setOrgViewTab("admin");
      setTabWithUrl("orgs");
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar administrador para edição."));
    } finally {
      setLoading(false);
    }
  };

  const startEditPlatformAdminUserMember = async (userId: number) => {
    if (!platformAdminTenantId) return;
    setLoading(true);
    setError(null);
    setTenantOperationMessage(null);
    setPlatformAdminUserResult(null);
    try {
      const detail = await getPlatformTenantDetail(platformAdminTenantId);
      const adminMember = detail.adminMembers.find((member) => member.userId === userId);
      if (!adminMember) {
        setError("Administrador não encontrado para edição.");
        return;
      }
      setEditingPlatformAdminUserId(adminMember.userId);
      setAdminUserFieldErrors({});
      setPlatformAdminUserDraft({
        slug: detail.tenant.slug,
        type: detail.tenant.type === "SYSTEM_ADMIN" ? "SYSTEM_ADMIN" : detail.tenant.type === "SCHOOL" ? "SCHOOL" : "FAMILY",
        adminEmail: adminMember.email,
        adminName: adminMember.name,
        adminPassword: "",
        resetExistingUserPassword: false,
      });
      setOrgViewTab("admin");
      setTabWithUrl("orgs");
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar administrador para edição."));
    } finally {
      setLoading(false);
    }
  };

  const removePlatformAdminUserFromTenant = async (tenant: PlatformTenantSummary) => {
    setLoading(true);
    setError(null);
    setTenantOperationMessage(null);
    setPlatformAdminUserResult(null);
    try {
      const detail = await getPlatformTenantDetail(tenant.id);
      const adminMember = detail.adminMembers.find((member) => member.role === "PLATFORM_ADMIN") ?? detail.adminMembers[0];
      if (!adminMember) {
        setError("Nenhum administrador encontrado para exclusão.");
        return;
      }
      await deletePlatformAdminUser(adminMember.userId);
      setTenantOperationMessage("Administrador da plataforma excluído com sucesso.");
      await loadBase();
      resetPlatformAdminForm();
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao excluir administrador da plataforma."));
    } finally {
      setLoading(false);
    }
  };

  const removePlatformAdminUserMember = async (userId: number) => {
    setLoading(true);
    setError(null);
    setTenantOperationMessage(null);
    setPlatformAdminUserResult(null);
    try {
      await deletePlatformAdminUser(userId);
      setTenantOperationMessage("Administrador da plataforma excluído com sucesso.");
      await loadBase();
      if (platformAdminTenantId) {
        await loadPlatformAdminMembers(platformAdminTenantId);
      }
      resetPlatformAdminForm();
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao excluir administrador da plataforma."));
    } finally {
      setLoading(false);
    }
  };

  const startEditTenant = async (tenant: PlatformTenantSummary) => {
    setLoading(true);
    setError(null);
    setTenantOperationMessage(null);
    setTenantCreateResult(null);
    try {
      const detail = await getPlatformTenantDetail(tenant.id);
      const primaryAdmin = detail.adminMembers[0];
      if (!primaryAdmin) {
        setError("Nenhum administrador encontrado para edição.");
        return;
      }
      setTenantDraft({
        name: detail.tenant.name,
        slug: detail.tenant.slug,
        type: detail.tenant.type === "SYSTEM_ADMIN" ? "SYSTEM_ADMIN" : detail.tenant.type === "SCHOOL" ? "SCHOOL" : "FAMILY",
        adminEmail: primaryAdmin.email,
        adminName: primaryAdmin.name,
        adminPassword: "",
        createTestChild: false,
        testChildName: "Filho Teste",
        testChildBirthYear: "",
        resetExistingUserPassword: false,
      });
      setEditingTenantId(tenant.id);
      setTenantFieldErrors({});
      setOrgViewTab("clients");
      setTabWithUrl("orgs");
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar dados para edição da organização."));
    } finally {
      setLoading(false);
    }
  };

  const openTenantDetail = async (tenantId: number) => {
    setLoading(true);
    setError(null);
    try {
      const detail = await getPlatformTenantDetail(tenantId);
      setSelectedTenantDetail(detail);
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar detalhes da organização."));
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteTenant = async () => {
    if (!deleteTargetTenant) return;
    if (deleteConfirmSlug.trim().toLowerCase() !== deleteTargetTenant.slug) {
      setError("Confirmação inválida. Digite o slug exato da organização.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await deletePlatformTenant(deleteTargetTenant.id, deleteConfirmSlug.trim().toLowerCase());
      setDeleteTargetTenant(null);
      setDeleteConfirmSlug("");
      setSelectedTenantDetail(null);
      await loadBase();
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao excluir organização."));
    } finally {
      setLoading(false);
    }
  };

  const loadPolicyVersions = async (policyId: number) => {
    const rows = await getAxionStudioPolicyVersions(policyId);
    setVersions(rows);
    setVersionsTitle(`Versões da regra #${policyId}`);
    setVersionsTarget({ type: "RULE", id: policyId });
    setTabWithUrl("audit");
  };

  const loadTemplateVersions = async (templateId: number) => {
    const rows = await getAxionStudioTemplateVersions(templateId);
    setVersions(rows);
    setVersionsTitle(`Versões do template #${templateId}`);
    setVersionsTarget({ type: "TEMPLATE", id: templateId });
    setTabWithUrl("audit");
  };

  return (
    <main
      className="min-h-screen w-full overflow-x-clip bg-[#f6f6f3] bg-cover bg-center bg-no-repeat px-4 py-6 md:px-8 xl:px-14 2xl:px-20"
      style={{ backgroundImage: "url('/axiora/home/login-background.svg')" }}
    >
      <div className="rounded-3xl border border-[#BFD3EE] bg-white/95 p-5 shadow-[0_14px_40px_rgba(16,48,90,0.18)] md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black text-[#17345E]">Axion Studio</h1>
            <p className="mt-1 text-sm font-semibold text-[#5A7AA4]">Gerencie políticas e mensagens do Axion sem deploy de código.</p>
          </div>
          <div className="rounded-2xl border border-[#C9D8EF] bg-[#F6FAFF] px-4 py-2 text-right">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#6A86AA]">Sessão</p>
              <p className="text-sm font-black text-[#1E3B65]">{me?.name ?? "Não identificado"}</p>
              <p className="text-xs font-semibold text-[#5F7EA6]">{me?.email ?? "sem e-mail na sessão"}</p>
            </div>
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn-sm text-[#2F527D]"
                disabled={loading}
                onClick={() => setShowPasswordModal(true)}
                type="button"
              >
                Redefinir senha
              </button>
              <button
                className="axiora-chunky-btn axiora-chunky-btn--destructive axiora-admin-btn-sm text-white"
                disabled={loading}
                onClick={() => void handleLogout()}
                type="button"
              >
                Sair
              </button>
            </div>
          </div>
        </div>

        {loading ? <p className="mt-3 text-xs font-bold text-[#5F80AA]">Atualizando dados...</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { id: "orgs", label: "Organizações" },
            { id: "policies", label: "Políticas" },
            { id: "messages", label: "Mensagens" },
            { id: "preview", label: "Prévia" },
            { id: "audit", label: "Auditoria" },
            { id: "impact", label: "Impacto" },
            { id: "finance", label: "Financeiro" },
          ].map((item) => (
            <button
              key={item.id}
              className={`axiora-chunky-btn axiora-admin-btn px-3 py-2 text-sm ${
                tab === item.id ? "axiora-chunky-btn--secondary text-white" : "axiora-chunky-btn--outline text-[#34557F]"
              }`}
              onClick={() => setTabWithUrl(item.id as Tab)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-[#F4C5C2] bg-[#FFF2F1] px-3 py-2 text-sm font-semibold text-[#B54C47]">{error}</div> : null}

        {tab === "policies" ? (
          <section className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-[#C9D8EF] p-3">
              <div className="mb-3 flex flex-wrap gap-2">
                <input className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm sm:min-w-[220px] sm:flex-1" onChange={(e) => setPolicySearch(e.target.value)} placeholder="Buscar regra..." value={policySearch} />
                <NativeSelect className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm sm:min-w-[200px] sm:w-auto" onChange={(e) => setPolicyContext(e.target.value)} value={policyContext}>
                  <option value="">Todos os contextos</option>
                  {CONTEXTS.map((ctx) => (
                    <option key={ctx} value={ctx}>
                      {contextLabel(ctx)}
                    </option>
                  ))}
                </NativeSelect>
                <button className="axiora-chunky-btn axiora-chunky-btn--secondary axiora-admin-btn px-3 py-2 text-sm text-white" onClick={() => void loadBase()} type="button">
                  Filtrar
                </button>
              </div>
              <div className="max-h-[560px] overflow-auto rounded-xl border border-[#D7E2F4]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] text-left text-sm">
                    <thead className="bg-[#F4F8FF] text-[#35567F]">
                      <tr>
                        <th className="px-3 py-2">Nome</th>
                        <th className="px-3 py-2">Contexto</th>
                        <th className="px-3 py-2">Prioridade</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {policies.length === 0 ? (
                        <tr>
                          <td className="px-3 py-6 text-center text-sm font-semibold text-[#6B87AC]" colSpan={5}>
                            Nenhuma regra encontrada com os filtros atuais.
                          </td>
                        </tr>
                      ) : null}
                      {policies.map((p) => (
                        <tr key={p.id} className="border-t border-[#E2EAF8]">
                          <td className="px-3 py-2 font-semibold text-[#223F68]">{p.name}</td>
                          <td className="px-3 py-2">{contextLabel(p.context)}</td>
                          <td className="px-3 py-2">{p.priority}</td>
                          <td className="px-3 py-2">{p.enabled ? "Ativa" : "Inativa"}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              <button
                                className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn-sm text-[#2F527D]"
                                onClick={() =>
                                  setPolicyDraft({
                                    id: p.id,
                                    name: p.name,
                                    context: p.context,
                                    conditionJson: pretty(p.condition),
                                    actionsJson: pretty(p.actions),
                                    priority: p.priority,
                                    enabled: p.enabled,
                                  })
                                }
                                type="button"
                              >
                                Editar
                              </button>
                              <button className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn-sm text-[#2F527D]" onClick={() => void toggleAxionStudioPolicy(p.id).then(loadBase)} type="button">
                                {p.enabled ? "Desativar" : "Ativar"}
                              </button>
                              <button className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn-sm text-[#2F527D]" onClick={() => void loadPolicyVersions(p.id)} type="button">
                                Versões
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[#C9D8EF] p-3 xl:sticky xl:top-4 xl:self-start">
              <h3 className="mb-2 text-sm font-black text-[#1E3B65]">Editor de regra</h3>
              <input className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setPolicyDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Nome" value={policyDraft.name} />
              <NativeSelect className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setPolicyDraft((d) => ({ ...d, context: e.target.value }))} value={policyDraft.context}>
                {CONTEXTS.map((ctx) => (
                  <option key={ctx} value={ctx}>
                    {contextLabel(ctx)}
                  </option>
                ))}
              </NativeSelect>
              <textarea className="mb-2 h-28 w-full rounded-xl border border-[#C9D8EF] p-2 text-xs font-mono" onChange={(e) => setPolicyDraft((d) => ({ ...d, conditionJson: e.target.value }))} value={policyDraft.conditionJson} />
              <textarea className="mb-2 h-28 w-full rounded-xl border border-[#C9D8EF] p-2 text-xs font-mono" onChange={(e) => setPolicyDraft((d) => ({ ...d, actionsJson: e.target.value }))} value={policyDraft.actionsJson} />
              <input className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setPolicyDraft((d) => ({ ...d, priority: Number(e.target.value) || 100 }))} type="number" value={policyDraft.priority} />
              <label className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#2B4E79]">
                <input checked={policyDraft.enabled} onChange={(e) => setPolicyDraft((d) => ({ ...d, enabled: e.target.checked }))} type="checkbox" />
                Habilitada
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="axiora-chunky-btn axiora-chunky-btn--secondary axiora-admin-btn px-3 py-2 text-sm text-white" disabled={loading} onClick={() => void savePolicy(false)} type="button">
                  Salvar
                </button>
                <button className="axiora-chunky-btn axiora-admin-btn px-3 py-2 text-sm text-white" disabled={loading} onClick={() => void savePolicy(true)} type="button">
                  Salvar e prévia
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {tab === "messages" ? (
          <section className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-[#C9D8EF] p-3">
              <div className="max-h-[560px] overflow-auto rounded-xl border border-[#D7E2F4]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[840px] text-left text-sm">
                    <thead className="bg-[#F4F8FF] text-[#35567F]">
                      <tr>
                        <th className="px-3 py-2">Contexto</th>
                        <th className="px-3 py-2">Tom</th>
                        <th className="px-3 py-2">Tags</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Peso</th>
                        <th className="px-3 py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templates.length === 0 ? (
                        <tr>
                          <td className="px-3 py-6 text-center text-sm font-semibold text-[#6B87AC]" colSpan={6}>
                            Nenhum template encontrado.
                          </td>
                        </tr>
                      ) : null}
                      {templates.map((t) => (
                        <tr key={t.id} className="border-t border-[#E2EAF8]">
                          <td className="px-3 py-2">{contextLabel(t.context)}</td>
                          <td className="px-3 py-2">{toneLabel(t.tone)}</td>
                          <td className="px-3 py-2 text-xs">{t.tags.join(", ")}</td>
                          <td className="px-3 py-2">{t.enabled ? "Ativo" : "Inativo"}</td>
                          <td className="px-3 py-2">{t.weight}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              <button
                                className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn-sm text-[#2F527D]"
                                onClick={() =>
                                  setTemplateDraft({
                                    id: t.id,
                                    context: t.context,
                                    tone: t.tone,
                                    tagsCsv: t.tags.join(", "),
                                    conditionsJson: pretty(t.conditions),
                                    text: t.text,
                                    weight: t.weight,
                                    enabled: t.enabled,
                                  })
                                }
                                type="button"
                              >
                                Editar
                              </button>
                              <button className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn-sm text-[#2F527D]" onClick={() => void toggleAxionStudioTemplate(t.id).then(loadBase)} type="button">
                                {t.enabled ? "Desativar" : "Ativar"}
                              </button>
                              <button className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn-sm text-[#2F527D]" onClick={() => void loadTemplateVersions(t.id)} type="button">
                                Versões
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[#C9D8EF] p-3 xl:sticky xl:top-4 xl:self-start">
              <h3 className="mb-2 text-sm font-black text-[#1E3B65]">Editor de template</h3>
              <NativeSelect className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setTemplateDraft((d) => ({ ...d, context: e.target.value }))} value={templateDraft.context}>
                {CONTEXTS.map((ctx) => (
                  <option key={ctx} value={ctx}>
                    {contextLabel(ctx)}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setTemplateDraft((d) => ({ ...d, tone: e.target.value }))} value={templateDraft.tone}>
                {TONES.map((tone) => (
                  <option key={tone} value={tone}>
                    {toneLabel(tone)}
                  </option>
                ))}
              </NativeSelect>
              <input className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setTemplateDraft((d) => ({ ...d, tagsCsv: e.target.value }))} placeholder="tags, separadas por vírgula" value={templateDraft.tagsCsv} />
              <textarea className="mb-2 h-24 w-full rounded-xl border border-[#C9D8EF] p-2 text-xs font-mono" onChange={(e) => setTemplateDraft((d) => ({ ...d, conditionsJson: e.target.value }))} value={templateDraft.conditionsJson} />
              <textarea className="mb-1 h-28 w-full rounded-xl border border-[#C9D8EF] p-2 text-sm" onChange={(e) => setTemplateDraft((d) => ({ ...d, text: e.target.value }))} value={templateDraft.text} />
              <div className={`mb-2 text-xs font-semibold ${templateCharCount > 220 ? "text-[#B94A48]" : "text-[#5A7AA4]"}`}>Caracteres: {templateCharCount}/220</div>
              <input className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setTemplateDraft((d) => ({ ...d, weight: Number(e.target.value) || 1 }))} type="number" value={templateDraft.weight} />
              <label className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#2B4E79]">
                <input checked={templateDraft.enabled} onChange={(e) => setTemplateDraft((d) => ({ ...d, enabled: e.target.checked }))} type="checkbox" />
                Habilitado
              </label>
              <button className="axiora-chunky-btn axiora-chunky-btn--secondary axiora-admin-btn px-3 py-2 text-sm text-white" disabled={loading || templateCharCount > 220} onClick={() => void saveTemplate()} type="button">
                Salvar
              </button>
              <p className="mt-3 text-xs font-semibold text-[#6C88AF]">Placeholders: {"{{name}}, {{skill}}, {{strongSkill}}, {{lesson}}, {{unit}}, {{streak}}, {{coins}}, {{xp}}, {{dueReviews}}, {{energy}}"}</p>
            </div>
          </section>
        ) : null}

        {tab === "preview" ? (
          <section className="mt-5 rounded-2xl border border-[#C9D8EF] p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <NativeSelect className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm sm:min-w-[260px] sm:flex-1" onChange={(e) => setPreviewUserId(Number(e.target.value))} value={previewUserId ?? ""}>
                {users.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.name} (#{u.userId})
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm sm:min-w-[200px] sm:w-auto" onChange={(e) => setPreviewContext(e.target.value)} value={previewContext}>
                {CONTEXTS.map((ctx) => (
                  <option key={ctx} value={ctx}>
                    {contextLabel(ctx)}
                  </option>
                ))}
              </NativeSelect>
              <button className="axiora-chunky-btn axiora-chunky-btn--secondary axiora-admin-btn px-3 py-2 text-sm text-white" onClick={() => void runPreview()} type="button">
                Executar prévia
              </button>
              <button
                className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn px-3 py-2 text-sm text-[#2F527D]"
                onClick={() => void navigator.clipboard.writeText(pretty(previewResult ?? {}))}
                type="button"
              >
                Copiar JSON
              </button>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="rounded-xl bg-[#F6FAFF] p-3">
                <h4 className="text-sm font-black text-[#20406A]">Saída sugerida</h4>
                <p className="mt-2 text-sm font-semibold text-[#2E4E78]">{previewResult?.message ?? "Sem prévia ainda."}</p>
                <p className="mt-2 text-xs font-bold text-[#6582AA]">Tom: {previewResult?.tone ? toneLabel(previewResult.tone) : "-"}</p>
                <p className="mt-1 text-xs font-bold text-[#6582AA]">CTA: {(previewResult?.cta?.label as string) ?? "-"}</p>
                <p className="mt-1 text-xs font-bold text-[#6582AA]">Regras acionadas: {previewResult?.chosenRuleIds.join(", ") || "-"}</p>
              </div>
              <div className="rounded-xl bg-[#F6FAFF] p-3">
                <h4 className="text-sm font-black text-[#20406A]">Resumo amigável</h4>
                <pre className="mt-2 overflow-auto text-xs text-[#2E4E78]">{pretty({ estado: previewResult?.state, fatos: previewResult?.facts })}</pre>
              </div>
            </div>
          </section>
        ) : null}

        {tab === "audit" ? (
          <section className="mt-5 grid gap-4 2xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <div className="max-h-[560px] overflow-auto rounded-2xl border border-[#C9D8EF] p-3">
              {audit.length === 0 ? <p className="text-sm font-semibold text-[#6B87AC]">Sem eventos de auditoria ainda.</p> : null}
              {audit.map((item) => (
                <div key={item.id} className="mb-2 rounded-xl border border-[#DCE6F7] bg-[#F7FAFF] p-3">
                  <p className="text-xs font-black text-[#24456F]">
                    {ACTION_LABELS[item.action] ?? item.action} • {ENTITY_TYPE_LABELS[item.entityType] ?? item.entityType} #{item.entityId}
                  </p>
                  <p className="text-[11px] font-semibold text-[#6B87AC]">Autor: {item.actorUserId} • {new Date(item.createdAt).toLocaleString("pt-BR")}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-[#C9D8EF] p-3">
              <h3 className="text-sm font-black text-[#1E3B65]">{versionsTitle || "Versões"}</h3>
              <div className="mt-2 max-h-[500px] space-y-2 overflow-auto">
                {versions.map((v) => (
                  <div key={v.id} className="rounded-xl border border-[#DCE6F7] bg-[#F7FAFF] p-2">
                    <p className="text-xs font-black text-[#24456F]">Versão {v.version}</p>
                    <p className="text-[11px] font-semibold text-[#6B87AC]">{new Date(v.createdAt).toLocaleString("pt-BR")}</p>
                    <div className="mt-2 flex gap-2">
                      {versionsTarget?.type === "RULE" ? (
                        <button className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn-sm text-[#2F527D]" onClick={() => void restoreAxionStudioPolicy(versionsTarget.id, v.version).then(loadBase)} type="button">
                          Restaurar
                        </button>
                      ) : versionsTarget?.type === "TEMPLATE" ? (
                        <button className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn-sm text-[#2F527D]" onClick={() => void restoreAxionStudioTemplate(versionsTarget.id, v.version).then(loadBase)} type="button">
                          Restaurar
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {tab === "impact" ? (
          <section className="mt-5 rounded-2xl border border-[#C9D8EF] p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <NativeSelect className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm sm:min-w-[260px] sm:flex-1" onChange={(e) => setImpactUserId(Number(e.target.value))} value={impactUserId ?? ""}>
                {users.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.name} (#{u.userId})
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm sm:min-w-[140px] sm:w-auto" onChange={(e) => setImpactDays(Number(e.target.value) || 7)} value={impactDays}>
                <option value={7}>7 dias</option>
                <option value={14}>14 dias</option>
                <option value={30}>30 dias</option>
              </NativeSelect>
              <button className="axiora-chunky-btn axiora-chunky-btn--secondary axiora-admin-btn px-3 py-2 text-sm text-white" onClick={() => void runImpact()} type="button">
                Calcular impacto
              </button>
            </div>

            {impactResult ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-[#DCE6F7] bg-[#F7FAFF] p-3">
                  <p className="text-[11px] font-bold uppercase text-[#6B87AC]">Decisões com melhora</p>
                  <p className="text-lg font-black text-[#24456F]">{impactResult.improvementRatePercent.toFixed(1)}%</p>
                  <p className="text-xs text-[#5E7DA6]">{impactResult.decisionsTotal} decisões avaliadas</p>
                </div>
                <div className="rounded-xl border border-[#DCE6F7] bg-[#F7FAFF] p-3">
                  <p className="text-[11px] font-bold uppercase text-[#6B87AC]">XP após BOOST</p>
                  <p className="text-lg font-black text-[#24456F]">{impactResult.avgXpDeltaAfterBoost >= 0 ? "+" : ""}{impactResult.avgXpDeltaAfterBoost.toFixed(1)}</p>
                  <p className="text-xs text-[#5E7DA6]">delta médio real</p>
                </div>
                <div className="rounded-xl border border-[#DCE6F7] bg-[#F7FAFF] p-3">
                  <p className="text-[11px] font-bold uppercase text-[#6B87AC]">Queda de frustração</p>
                  <p className="text-lg font-black text-[#24456F]">{impactResult.avgFrustrationDeltaAfterDifficultyCap.toFixed(3)}</p>
                  <p className="text-xs text-[#5E7DA6]">após ajuste de dificuldade</p>
                </div>
                <div className="rounded-xl border border-[#DCE6F7] bg-[#F7FAFF] p-3">
                  <p className="text-[11px] font-bold uppercase text-[#6B87AC]">Redução de risco</p>
                  <p className="text-lg font-black text-[#24456F]">{impactResult.avgDropoutRiskDelta.toFixed(3)}</p>
                  <p className="text-xs text-[#5E7DA6]">evasão em tendência</p>
                </div>
                <div className="rounded-xl border border-[#DCE6F7] bg-[#F7FAFF] p-3 md:col-span-2 xl:col-span-4">
                  <p className="text-[11px] font-bold uppercase text-[#6B87AC]">Crescimento de mastery (proxy)</p>
                  <p className="text-lg font-black text-[#24456F]">{impactResult.masteryGrowthProxy >= 0 ? "+" : ""}{impactResult.masteryGrowthProxy.toFixed(4)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm font-semibold text-[#6B87AC]">Selecione um aluno e rode o cálculo para ver correlações reais de resultado.</p>
            )}
          </section>
        ) : null}

        {tab === "finance" ? (
          <section className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-[#C9D8EF] p-3">
              <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <div className="rounded-xl border border-[#DCE6F7] bg-[#F7FAFF] p-3">
                  <p className="text-[11px] font-bold uppercase text-[#6B87AC]">Total pendente</p>
                  <p className="text-lg font-black text-[#24456F]">{formatCurrencyBRL(financeStats.pendingTotal)}</p>
                </div>
                <div className="rounded-xl border border-[#F4CFCC] bg-[#FFF7F6] p-3">
                  <p className="text-[11px] font-bold uppercase text-[#B5635D]">Em atraso</p>
                  <p className="text-lg font-black text-[#8F3630]">{formatCurrencyBRL(financeStats.overdueTotal)}</p>
                </div>
                <div className="rounded-xl border border-[#DCE6F7] bg-[#F7FAFF] p-3">
                  <p className="text-[11px] font-bold uppercase text-[#6B87AC]">Vencem em 7 dias</p>
                  <p className="text-lg font-black text-[#24456F]">{financeStats.dueNext7Days}</p>
                </div>
                <div className="rounded-xl border border-[#DCE6F7] bg-[#F7FAFF] p-3">
                  <p className="text-[11px] font-bold uppercase text-[#6B87AC]">Compromisso mensal</p>
                  <p className="text-lg font-black text-[#24456F]">{formatCurrencyBRL(financeStats.recurringCommitmentMonthly)}</p>
                </div>
                <div className="rounded-xl border border-[#D0E4DA] bg-[#F2FBF8] p-3">
                  <p className="text-[11px] font-bold uppercase text-[#4F7B69]">Total pago</p>
                  <p className="text-lg font-black text-[#1D6A4E]">{formatCurrencyBRL(financeStats.paidTotal)}</p>
                </div>
                <div className={`rounded-xl border p-3 ${financeBalance >= 0 ? "border-[#CDE4DC] bg-[#F2FBF8]" : "border-[#F4CFCC] bg-[#FFF7F6]"}`}>
                  <p className="text-[11px] font-bold uppercase text-[#4E7A7A]">Saldo disponível</p>
                  <p className={`text-lg font-black ${financeBalance >= 0 ? "text-[#1F5E5E]" : "text-[#8F3630]"}`}>{formatCurrencyBRL(financeBalance)}</p>
                  <p className="text-xs font-semibold text-[#6D89AF]">Após pendências: {formatCurrencyBRL(financeStats.projectedBalanceAfterPending)}</p>
                </div>
              </div>
              {financeInsight && !financeInsightDismissed ? (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-[#CDE4DC] bg-[#F2FBF8] p-3 text-sm font-semibold text-[#285B5D]">
                  <p>{financeInsight}</p>
                  <button
                    aria-label="Fechar aviso"
                    className="rounded-md px-2 py-0.5 text-xs font-black text-[#2E6A6A] hover:bg-[#DDF3EC]"
                    onClick={() => setFinanceInsightDismissed(true)}
                    type="button"
                  >
                    x
                  </button>
                </div>
              ) : null}
              {financeFeedback ? (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-[#CBE7E4] bg-[#F1FCFA] p-3 text-xs font-semibold text-[#245A67]">
                  <p>{financeFeedback}</p>
                  <button
                    aria-label="Fechar mensagem"
                    className="rounded-md px-2 py-0.5 text-xs font-black text-[#245A67] hover:bg-[#D8F1ED]"
                    onClick={() => setFinanceFeedback(null)}
                    type="button"
                  >
                    x
                  </button>
                </div>
              ) : null}
              <div className="mb-3 rounded-xl border border-[#D7E2F4] bg-[#F7FAFF] p-3">
                <p className="mb-2 text-xs font-black uppercase text-[#5D7EA8]">Saldo editável</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm sm:max-w-[220px]"
                    onChange={(e) => setFinanceBalanceDraft(e.target.value)}
                    placeholder="Saldo atual (R$)"
                    type="number"
                    min={0}
                    step="0.01"
                    value={financeBalanceDraft}
                  />
                  <button className="axiora-chunky-btn axiora-chunky-btn--secondary axiora-admin-btn px-3 py-2 text-sm text-white" onClick={saveFinanceBalance} type="button">
                    Salvar saldo
                  </button>
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                <input
                  className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm sm:min-w-[220px] sm:flex-1"
                  onChange={(e) => setFinanceSearch(e.target.value)}
                  placeholder="Buscar conta por descrição, categoria ou observação..."
                  value={financeSearch}
                />
                <NativeSelect
                  className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm sm:min-w-[200px] sm:w-auto"
                  onChange={(e) => setFinanceFilterStatus(e.target.value as FinanceFilterStatus)}
                  value={financeFilterStatus}
                >
                  <option value="ALL">Todos os status</option>
                  <option value="PENDING">Pendentes</option>
                  <option value="OVERDUE">Atrasadas</option>
                  <option value="PAID">Pagas</option>
                </NativeSelect>
                <NativeSelect
                  className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm sm:min-w-[140px] sm:w-auto"
                  onChange={(e) => setFinanceRowsPerPage(Number(e.target.value))}
                  value={financeRowsPerPage}
                >
                  <option value={10}>10 linhas</option>
                  <option value={20}>20 linhas</option>
                  <option value={50}>50 linhas</option>
                  <option value={100}>100 linhas</option>
                </NativeSelect>
              </div>
              <div className="max-h-[560px] overflow-auto rounded-xl border border-[#D7E2F4]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="bg-[#F4F8FF] text-[#35567F]">
                      <tr>
                        <th className="px-3 py-2">Conta</th>
                        <th className="px-3 py-2">Categoria</th>
                        <th className="px-3 py-2">Valor</th>
                        <th className="px-3 py-2">Vencimento</th>
                        <th className="px-3 py-2">Recorrência</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFinanceBills.length === 0 ? (
                        <tr>
                          <td className="px-3 py-6 text-center text-sm font-semibold text-[#6B87AC]" colSpan={7}>
                            Nenhuma conta encontrada com os filtros atuais.
                          </td>
                        </tr>
                      ) : null}
                      {paginatedFinanceBills.map((bill) => {
                        const status = financeComputedStatus(bill, toIsoDateInput(new Date()));
                        return (
                          <tr key={bill.id} className="border-t border-[#E2EAF8]">
                            <td className="px-3 py-2 font-semibold text-[#223F68]">
                              {bill.description}
                              {bill.notes ? <p className="mt-1 text-xs font-semibold text-[#6D89AF]">{bill.notes}</p> : null}
                            </td>
                            <td className="px-3 py-2">{bill.category}</td>
                            <td className="px-3 py-2 font-black text-[#24456F]">{formatCurrencyBRL(bill.amount)}</td>
                            <td className="px-3 py-2">{new Date(`${bill.dueDate}T12:00:00`).toLocaleDateString("pt-BR")}</td>
                            <td className="px-3 py-2">{FINANCE_RECURRENCE_LABELS[bill.recurrence]}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex rounded-full px-2 py-1 text-xs font-black ${
                                  status === "PAID"
                                    ? "bg-[#E5F6EF] text-[#1D6A4E]"
                                    : status === "OVERDUE"
                                      ? "bg-[#FFE8E6] text-[#B54C47]"
                                      : "bg-[#E7F0FF] text-[#35567F]"
                                }`}
                              >
                                {FINANCE_STATUS_LABELS[status]}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                <button
                                  className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn-sm text-[#2F527D]"
                                  onClick={() => startEditFinanceBill(bill)}
                                  type="button"
                                >
                                  Editar
                                </button>
                                <button
                                  className="axiora-chunky-btn axiora-chunky-btn--secondary axiora-admin-btn-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={status === "PAID"}
                                  onClick={() => registerFinancePayment(bill.id)}
                                  type="button"
                                >
                                  Registrar pagamento
                                </button>
                                <button
                                  className="axiora-chunky-btn axiora-chunky-btn--destructive axiora-admin-btn-sm text-white"
                                  onClick={() => deleteFinanceBill(bill.id)}
                                  type="button"
                                >
                                  Excluir
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {filteredFinanceBills.length > 20 ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#6B87AC]">
                    Página {financePage} de {financeTotalPages} • {filteredFinanceBills.length} registro(s)
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn-sm text-[#2F527D] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={financePage <= 1}
                      onClick={() => setFinancePage((prev) => Math.max(1, prev - 1))}
                      type="button"
                    >
                      Anterior
                    </button>
                    <button
                      className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn-sm text-[#2F527D] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={financePage >= financeTotalPages}
                      onClick={() => setFinancePage((prev) => Math.min(financeTotalPages, prev + 1))}
                      type="button"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-[#C9D8EF] p-3 xl:sticky xl:top-4 xl:self-start">
              <h3 className="mb-2 text-sm font-black text-[#1E3B65]">{financeEditingBillId !== null ? "Editar conta" : "Nova conta"}</h3>
              <input
                className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm"
                onChange={(e) => setFinanceDraft((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Descrição da conta *"
                value={financeDraft.description}
              />
              <NativeSelect
                className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm"
                onChange={(e) => setFinanceDraft((prev) => ({ ...prev, category: e.target.value }))}
                value={financeDraft.category}
              >
                {FINANCE_CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </NativeSelect>
              <input
                className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm"
                onChange={(e) => setFinanceDraft((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="Valor (R$) *"
                type="number"
                min={0}
                step="0.01"
                value={financeDraft.amount}
              />
              <input
                className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm"
                onChange={(e) => setFinanceDraft((prev) => ({ ...prev, dueDate: e.target.value }))}
                type="date"
                value={financeDraft.dueDate}
              />
              <NativeSelect
                className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm"
                onChange={(e) => setFinanceDraft((prev) => ({ ...prev, recurrence: e.target.value as FinanceRecurrence }))}
                value={financeDraft.recurrence}
              >
                {(Object.keys(FINANCE_RECURRENCE_LABELS) as FinanceRecurrence[]).map((recurrence) => (
                  <option key={recurrence} value={recurrence}>
                    {FINANCE_RECURRENCE_LABELS[recurrence]}
                  </option>
                ))}
              </NativeSelect>
              <textarea
                className="mb-3 h-24 w-full rounded-xl border border-[#C9D8EF] p-2 text-sm"
                onChange={(e) => setFinanceDraft((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Observações"
                value={financeDraft.notes}
              />
              <div className="flex flex-wrap gap-2">
                <button className="axiora-chunky-btn axiora-chunky-btn--secondary axiora-admin-btn px-3 py-2 text-sm text-white" onClick={addFinanceBill} type="button">
                  {financeEditingBillId !== null ? "Salvar alterações" : "Salvar conta"}
                </button>
                <button className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn px-3 py-2 text-sm text-[#2F527D]" onClick={resetFinanceDraft} type="button">
                  {financeEditingBillId !== null ? "Cancelar edição" : "Limpar"}
                </button>
              </div>
              <p className="mt-3 text-xs font-semibold text-[#6C88AF]">
                Se a conta tiver recorrência, ao registrar pagamento a próxima cobrança é criada automaticamente.
              </p>
            </div>
          </section>
        ) : null}

        {tab === "orgs" ? (
          <section className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-[#C9D8EF] p-3">
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  className={`axiora-chunky-btn axiora-admin-btn px-3 py-2 text-sm ${orgViewTab === "clients" ? "axiora-chunky-btn--secondary text-white" : "axiora-chunky-btn--outline text-[#2F527D]"}`}
                  onClick={() => setOrgViewTab("clients")}
                  type="button"
                >
                  Clientes
                </button>
                <button
                  className={`axiora-chunky-btn axiora-admin-btn px-3 py-2 text-sm ${orgViewTab === "admin" ? "axiora-chunky-btn--secondary text-white" : "axiora-chunky-btn--outline text-[#2F527D]"}`}
                  onClick={() => setOrgViewTab("admin")}
                  type="button"
                >
                  Administrador
                </button>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                <input
                  className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm sm:min-w-[220px] sm:flex-1"
                  onChange={(e) => setTenantSearch(e.target.value)}
                  placeholder="Buscar organização por nome ou slug..."
                  value={tenantSearch}
                />
                <NativeSelect
                  className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm sm:min-w-[180px] sm:w-auto"
                  onChange={(e) => setTenantTypeFilter(e.target.value as "" | "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN")}
                  disabled={orgViewTab === "admin"}
                  value={tenantTypeFilter}
                >
                  <option value="">Todos os tipos</option>
                  <option value="FAMILY">Família</option>
                  <option value="SCHOOL">Escola</option>
                  <option value="SYSTEM_ADMIN">Sistema</option>
                </NativeSelect>
                <button className="axiora-chunky-btn axiora-chunky-btn--secondary axiora-admin-btn px-3 py-2 text-sm text-white" onClick={() => void loadBase()} type="button">
                  Filtrar
                </button>
              </div>
              <div className="max-h-[560px] overflow-auto rounded-xl border border-[#D7E2F4]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-[#F4F8FF] text-[#35567F]">
                      {orgViewTab === "admin" ? (
                        <tr>
                          <th className="px-3 py-2">Nome</th>
                          <th className="px-3 py-2">E-mail</th>
                          <th className="px-3 py-2">Tipo</th>
                          <th className="px-3 py-2">Role</th>
                          <th className="px-3 py-2">Ações</th>
                        </tr>
                      ) : (
                        <tr>
                          <th className="px-3 py-2">Nome</th>
                          <th className="px-3 py-2">Slug</th>
                          <th className="px-3 py-2">Tipo</th>
                          <th className="px-3 py-2">Consentimento</th>
                          <th className="px-3 py-2">Onboarding</th>
                          <th className="px-3 py-2">Criada em</th>
                          <th className="px-3 py-2">Ações</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {orgViewTab === "admin" ? (
                        <>
                          {filteredPlatformAdminMembers.length === 0 ? (
                            <tr>
                              <td className="px-3 py-6 text-center text-sm font-semibold text-[#6B87AC]" colSpan={5}>
                                Nenhum administrador encontrado com os filtros atuais.
                              </td>
                            </tr>
                          ) : null}
                          {filteredPlatformAdminMembers.map((member) => (
                            <tr key={member.userId} className="border-t border-[#E2EAF8]">
                              <td className="px-3 py-2 font-semibold text-[#223F68]">{member.name}</td>
                              <td className="px-3 py-2 text-[#35567F]">{member.email}</td>
                              <td className="px-3 py-2">{platformAdminTenantType === "SYSTEM_ADMIN" ? "Sistema" : platformAdminTenantType === "SCHOOL" ? "Escola" : platformAdminTenantType === "FAMILY" ? "Família" : "-"}</td>
                              <td className="px-3 py-2">{member.role.toLowerCase()}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    className="axiora-chunky-btn axiora-chunky-btn--secondary axiora-admin-btn-sm text-white"
                                    onClick={() => void startEditPlatformAdminUserMember(member.userId)}
                                    type="button"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    className="axiora-chunky-btn axiora-chunky-btn--destructive axiora-admin-btn-sm text-white"
                                    onClick={() => void removePlatformAdminUserMember(member.userId)}
                                    type="button"
                                  >
                                    Excluir
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </>
                      ) : (
                        <>
                          {clientTenants.length === 0 ? (
                            <tr>
                              <td className="px-3 py-6 text-center text-sm font-semibold text-[#6B87AC]" colSpan={7}>
                                Nenhuma organização encontrada com os filtros atuais.
                              </td>
                            </tr>
                          ) : null}
                          {clientTenants.map((tenant) => (
                            <tr key={tenant.id} className="border-t border-[#E2EAF8]">
                              {(() => {
                                const isPlatformTenant = tenant.slug === "platform-admin";
                                const consentLabel = isPlatformTenant ? "N/A" : tenant.type === "SCHOOL" || tenant.type === "SYSTEM_ADMIN" ? "N/A" : tenant.consentCompleted ? "Sim" : "Não";
                                const onboardingLabel = isPlatformTenant ? "N/A" : tenant.onboardingCompleted ? "Concluído" : "Pendente";
                                return (
                                  <>
                                    <td className="px-3 py-2 font-semibold text-[#223F68]">{tenant.name}</td>
                                    <td className="px-3 py-2 font-mono text-xs text-[#35567F]">{tenant.slug}</td>
                                    <td className="px-3 py-2">{tenant.type === "FAMILY" ? "Família" : tenant.type === "SCHOOL" ? "Escola" : tenant.type === "SYSTEM_ADMIN" ? "Sistema" : tenant.type}</td>
                                    <td className="px-3 py-2">{consentLabel}</td>
                                    <td className="px-3 py-2">{onboardingLabel}</td>
                                    <td className="px-3 py-2">{new Date(tenant.createdAt).toLocaleString("pt-BR")}</td>
                                    <td className="px-3 py-2">
                                      <div className="flex flex-wrap gap-1">
                                        <button
                                          className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn-sm text-[#2F527D]"
                                          onClick={() => void openTenantDetail(tenant.id)}
                                          type="button"
                                        >
                                          Detalhes
                                        </button>
                                        <button
                                          className="axiora-chunky-btn axiora-chunky-btn--secondary axiora-admin-btn-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                                          disabled={tenant.slug === "platform-admin"}
                                          onClick={() => void startEditTenant(tenant)}
                                          type="button"
                                        >
                                          Editar
                                        </button>
                                        <button
                                          className="axiora-chunky-btn axiora-chunky-btn--destructive axiora-admin-btn-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                                          disabled={tenant.slug === "platform-admin"}
                                          onClick={() => {
                                            setDeleteTargetTenant(tenant);
                                            setDeleteConfirmSlug("");
                                          }}
                                          type="button"
                                        >
                                          Excluir
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                );
                              })()}
                            </tr>
                          ))}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#C9D8EF] p-3 xl:sticky xl:top-4 xl:self-start">
              {orgViewTab === "clients" ? (
                <h3 className="mb-2 text-sm font-black text-[#1E3B65]">{editingTenantId ? "Editar organização" : "Nova organização de teste"}</h3>
              ) : (
                <h3 className="mb-2 text-sm font-black text-[#1E3B65]">Administrador da plataforma</h3>
              )}
              {orgViewTab === "clients" ? (
                <div className="mb-3 rounded-xl border border-[#D7E2F4] bg-[#F7FAFF] px-3 py-2 text-xs font-semibold text-[#35567F]">
                  {editingTenantId ? (
                    <>
                      <p>Edite nome, tipo e dados do administrador da organização selecionada.</p>
                      <p className="mt-1">O slug fica bloqueado na edição para evitar impacto em acessos existentes.</p>
                    </>
                  ) : (
                    <>
                      <p>Campos obrigatórios: nome da organização, slug, tipo, nome do administrador, e-mail e senha inicial.</p>
                      <p className="mt-1">Padrões: slug em minúsculas com hífen (`familia-silva`) e senha com pelo menos 10 caracteres.</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="mb-3 rounded-xl border border-[#D7E2F4] bg-[#F7FAFF] px-3 py-2 text-xs font-semibold text-[#35567F]">
                  <p>Use esta aba para gerenciar usuários administradores da organização `platform-admin`.</p>
                  <p className="mt-1">A criação de novas organizações continua disponível na aba `Clientes`.</p>
                </div>
              )}
              {orgViewTab === "clients" ? (
                <>
              <input
                className={`mb-1 w-full rounded-xl border px-3 py-2 text-sm ${tenantFieldErrors.name ? "border-[#E88983] bg-[#FFF7F6]" : "border-[#C9D8EF]"}`}
                onChange={(e) => {
                  const next = e.target.value;
                  setTenantDraft((d) => ({ ...d, name: next }));
                  setTenantFieldErrors((prev) => ({ ...prev, name: undefined }));
                }}
                placeholder="Nome da organização *"
                value={tenantDraft.name}
              />
              {tenantFieldErrors.name ? <p className="mb-2 text-xs font-semibold text-[#B54C47]">{tenantFieldErrors.name}</p> : null}
              <input
                className={`mb-1 w-full rounded-xl border px-3 py-2 text-sm font-mono ${tenantFieldErrors.slug ? "border-[#E88983] bg-[#FFF7F6]" : "border-[#C9D8EF]"}`}
                onChange={(e) => {
                  const next = e.target.value.toLowerCase();
                  setTenantDraft((d) => ({ ...d, slug: next }));
                  setTenantFieldErrors((prev) => ({ ...prev, slug: undefined }));
                }}
                placeholder="Slug * (ex.: familia-silva)"
                disabled={editingTenantId !== null}
                value={tenantDraft.slug}
              />
              {tenantFieldErrors.slug ? (
                <p className="mb-2 text-xs font-semibold text-[#B54C47]">{tenantFieldErrors.slug}</p>
              ) : editingTenantId ? (
                <p className="mb-2 text-xs font-semibold text-[#6B87AC]">Slug bloqueado durante a edição.</p>
              ) : (
                <p className="mb-2 text-xs font-semibold text-[#6B87AC]">Use apenas `a-z`, `0-9` e `-`.</p>
              )}
              <NativeSelect
                className={`mb-1 w-full rounded-xl border px-3 py-2 text-sm ${tenantFieldErrors.type ? "border-[#E88983] bg-[#FFF7F6]" : "border-[#C9D8EF]"}`}
                onChange={(e) => {
                  setTenantDraft((d) => ({ ...d, type: e.target.value as "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN" }));
                  setTenantFieldErrors((prev) => ({ ...prev, type: undefined }));
                }}
                value={tenantDraft.type}
              >
                <option value="FAMILY">Família (pais)</option>
                <option value="SCHOOL">Escola</option>
                <option value="SYSTEM_ADMIN">Sistema</option>
              </NativeSelect>
              {tenantFieldErrors.type ? <p className="mb-2 text-xs font-semibold text-[#B54C47]">{tenantFieldErrors.type}</p> : <div className="mb-2" />}
              <input
                className={`mb-1 w-full rounded-xl border px-3 py-2 text-sm ${tenantFieldErrors.adminName ? "border-[#E88983] bg-[#FFF7F6]" : "border-[#C9D8EF]"}`}
                onChange={(e) => {
                  setTenantDraft((d) => ({ ...d, adminName: e.target.value }));
                  setTenantFieldErrors((prev) => ({ ...prev, adminName: undefined }));
                }}
                placeholder="Nome do administrador *"
                value={tenantDraft.adminName}
              />
              {tenantFieldErrors.adminName ? <p className="mb-2 text-xs font-semibold text-[#B54C47]">{tenantFieldErrors.adminName}</p> : null}
              <input
                className={`mb-1 w-full rounded-xl border px-3 py-2 text-sm ${tenantFieldErrors.adminEmail ? "border-[#E88983] bg-[#FFF7F6]" : "border-[#C9D8EF]"}`}
                onChange={(e) => {
                  setTenantDraft((d) => ({ ...d, adminEmail: e.target.value }));
                  setTenantFieldErrors((prev) => ({ ...prev, adminEmail: undefined }));
                }}
                placeholder="E-mail do administrador *"
                type="email"
                autoComplete="off"
                value={tenantDraft.adminEmail}
              />
              {tenantFieldErrors.adminEmail ? <p className="mb-2 text-xs font-semibold text-[#B54C47]">{tenantFieldErrors.adminEmail}</p> : null}
              <input
                className={`mb-1 w-full rounded-xl border px-3 py-2 text-sm ${tenantFieldErrors.adminPassword ? "border-[#E88983] bg-[#FFF7F6]" : "border-[#C9D8EF]"}`}
                onChange={(e) => {
                  setTenantDraft((d) => ({ ...d, adminPassword: e.target.value }));
                  setTenantFieldErrors((prev) => ({ ...prev, adminPassword: undefined }));
                }}
                placeholder="Senha inicial do administrador *"
                type="password"
                autoComplete="new-password"
                value={tenantDraft.adminPassword}
              />
              {tenantFieldErrors.adminPassword ? (
                <p className="mb-2 text-xs font-semibold text-[#B54C47]">{tenantFieldErrors.adminPassword}</p>
              ) : (
                <p className="mb-2 text-xs font-semibold text-[#6B87AC]">
                  {editingTenantId ? "Opcional. Marque abaixo para redefinir senha (mínimo 10 caracteres)." : "Mínimo: 10 caracteres."}
                </p>
              )}

              {tenantDraft.type === "FAMILY" ? (
                <>
                  <label className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-[#2B4E79]">
                    <input
                      checked={tenantDraft.createTestChild}
                      onChange={(e) => setTenantDraft((d) => ({ ...d, createTestChild: e.target.checked }))}
                      type="checkbox"
                    />
                    Criar filho de teste
                  </label>
                  {tenantDraft.createTestChild ? (
                    <>
                      <input
                        className={`mb-1 w-full rounded-xl border px-3 py-2 text-sm ${tenantFieldErrors.testChildName ? "border-[#E88983] bg-[#FFF7F6]" : "border-[#C9D8EF]"}`}
                        onChange={(e) => {
                          setTenantDraft((d) => ({ ...d, testChildName: e.target.value }));
                          setTenantFieldErrors((prev) => ({ ...prev, testChildName: undefined }));
                        }}
                        placeholder="Nome da criança"
                        value={tenantDraft.testChildName}
                      />
                      {tenantFieldErrors.testChildName ? <p className="mb-2 text-xs font-semibold text-[#B54C47]">{tenantFieldErrors.testChildName}</p> : null}
                      <input
                        className={`mb-1 w-full rounded-xl border px-3 py-2 text-sm ${tenantFieldErrors.testChildBirthYear ? "border-[#E88983] bg-[#FFF7F6]" : "border-[#C9D8EF]"}`}
                        onChange={(e) => {
                          setTenantDraft((d) => ({ ...d, testChildBirthYear: e.target.value }));
                          setTenantFieldErrors((prev) => ({ ...prev, testChildBirthYear: undefined }));
                        }}
                        placeholder="Ano de nascimento (opcional)"
                        type="number"
                        value={tenantDraft.testChildBirthYear}
                      />
                      {tenantFieldErrors.testChildBirthYear ? <p className="mb-2 text-xs font-semibold text-[#B54C47]">{tenantFieldErrors.testChildBirthYear}</p> : null}
                    </>
                  ) : null}
                </>
              ) : null}

              <label className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#2B4E79]">
                <input
                  checked={tenantDraft.resetExistingUserPassword}
                  onChange={(e) => setTenantDraft((d) => ({ ...d, resetExistingUserPassword: e.target.checked }))}
                  type="checkbox"
                />
                {editingTenantId ? "Redefinir senha do administrador" : "Redefinir senha se usuário já existir"}
              </label>

              <div className={`flex flex-wrap items-center gap-2 ${editingTenantId ? "justify-start" : "justify-center"}`}>
                <button className="axiora-chunky-btn axiora-chunky-btn--secondary axiora-admin-btn px-3 py-2 text-sm text-white disabled:opacity-60" disabled={loading} onClick={() => void saveTenant()} type="button">
                  {editingTenantId ? "Salvar alterações" : "Criar organização"}
                </button>
                {editingTenantId ? (
                  <button
                    className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn px-3 py-2 text-sm text-[#2F527D]"
                    disabled={loading}
                    onClick={() => {
                      setEditingTenantId(null);
                      setTenantFieldErrors({});
                      setTenantOperationMessage(null);
                      setTenantDraft((prev) => ({
                        ...prev,
                        name: "",
                        slug: "",
                        type: "FAMILY",
                        adminEmail: "",
                        adminName: "",
                        adminPassword: "",
                        createTestChild: true,
                        testChildName: "Filho Teste",
                        testChildBirthYear: "",
                        resetExistingUserPassword: false,
                      }));
                    }}
                    type="button"
                  >
                    Cancelar edição
                  </button>
                ) : null}
              </div>

              {tenantOperationMessage ? (
                <div className="mt-3 rounded-xl border border-[#CBE7E4] bg-[#F1FCFA] p-3 text-xs font-semibold text-[#245A67]">
                  <p className="font-black text-[#1F4F5D]">{tenantOperationMessage}</p>
                </div>
              ) : null}

              {tenantCreateResult ? (
                <div className="mt-3 rounded-xl border border-[#CBE7E4] bg-[#F1FCFA] p-3 text-xs font-semibold text-[#245A67]">
                  <p className="font-black text-[#1F4F5D]">Organização criada com sucesso.</p>
                  <p className="mt-1">Slug: {tenantCreateResult.tenant.slug}</p>
                  <p>Admin: {tenantCreateResult.adminEmail}</p>
                  <p>Perfil criado: {tenantCreateResult.userCreated ? "sim" : "não (já existia)"}</p>
                  <p>Vínculo criado: {tenantCreateResult.membershipCreated ? "sim" : "não (já existia)"}</p>
                  <p>Filho teste: {tenantCreateResult.testChildCreated ? "sim" : "não"}</p>
                </div>
              ) : null}
                </>
              ) : (
                <>
                  <div className="mb-3 rounded-xl border border-[#D7E2F4] bg-[#F7FAFF] px-3 py-2 text-xs font-semibold text-[#35567F]">
                    <p>Cria ou vincula um usuário na organização `platform-admin` com papel `PLATFORM_ADMIN`.</p>
                    <p className="mt-1">Se o usuário já existir, marque a opção para redefinir senha.</p>
                  </div>
                  <input
                    className={`mb-1 w-full rounded-xl border px-3 py-2 text-sm font-mono ${adminUserFieldErrors.slug ? "border-[#E88983] bg-[#FFF7F6]" : "border-[#C9D8EF]"}`}
                    onChange={(e) => {
                      setPlatformAdminUserDraft((d) => ({ ...d, slug: e.target.value.toLowerCase() }));
                      setAdminUserFieldErrors((prev) => ({ ...prev, slug: undefined }));
                    }}
                    placeholder="Slug *"
                    value={platformAdminUserDraft.slug}
                  />
                  {adminUserFieldErrors.slug ? <p className="mb-2 text-xs font-semibold text-[#B54C47]">{adminUserFieldErrors.slug}</p> : null}
                  <NativeSelect
                    className={`mb-1 w-full rounded-xl border px-3 py-2 text-sm ${adminUserFieldErrors.type ? "border-[#E88983] bg-[#FFF7F6]" : "border-[#C9D8EF]"}`}
                    onChange={(e) => {
                      setPlatformAdminUserDraft((d) => ({ ...d, type: e.target.value as "FAMILY" | "SCHOOL" | "SYSTEM_ADMIN" }));
                      setAdminUserFieldErrors((prev) => ({ ...prev, type: undefined }));
                    }}
                    value={platformAdminUserDraft.type}
                  >
                    <option value="SYSTEM_ADMIN">Sistema</option>
                    <option value="SCHOOL">Escola</option>
                    <option value="FAMILY">Família</option>
                  </NativeSelect>
                  {adminUserFieldErrors.type ? (
                    <p className="mb-2 text-xs font-semibold text-[#B54C47]">{adminUserFieldErrors.type}</p>
                  ) : (
                    <div className="mb-2" />
                  )}
                  <input
                    className={`mb-1 w-full rounded-xl border px-3 py-2 text-sm ${adminUserFieldErrors.adminName ? "border-[#E88983] bg-[#FFF7F6]" : "border-[#C9D8EF]"}`}
                    onChange={(e) => {
                      setPlatformAdminUserDraft((d) => ({ ...d, adminName: e.target.value }));
                      setAdminUserFieldErrors((prev) => ({ ...prev, adminName: undefined }));
                    }}
                    placeholder="Nome do administrador *"
                    value={platformAdminUserDraft.adminName}
                  />
                  {adminUserFieldErrors.adminName ? <p className="mb-2 text-xs font-semibold text-[#B54C47]">{adminUserFieldErrors.adminName}</p> : null}
                  <input
                    className={`mb-1 w-full rounded-xl border px-3 py-2 text-sm ${adminUserFieldErrors.adminEmail ? "border-[#E88983] bg-[#FFF7F6]" : "border-[#C9D8EF]"}`}
                    onChange={(e) => {
                      setPlatformAdminUserDraft((d) => ({ ...d, adminEmail: e.target.value }));
                      setAdminUserFieldErrors((prev) => ({ ...prev, adminEmail: undefined }));
                    }}
                    placeholder="E-mail do administrador *"
                    type="email"
                    autoComplete="off"
                    value={platformAdminUserDraft.adminEmail}
                  />
                  {adminUserFieldErrors.adminEmail ? <p className="mb-2 text-xs font-semibold text-[#B54C47]">{adminUserFieldErrors.adminEmail}</p> : null}
                  <input
                    className={`mb-1 w-full rounded-xl border px-3 py-2 text-sm ${adminUserFieldErrors.adminPassword ? "border-[#E88983] bg-[#FFF7F6]" : "border-[#C9D8EF]"}`}
                    onChange={(e) => {
                      setPlatformAdminUserDraft((d) => ({ ...d, adminPassword: e.target.value }));
                      setAdminUserFieldErrors((prev) => ({ ...prev, adminPassword: undefined }));
                    }}
                    placeholder="Senha inicial *"
                    type="password"
                    autoComplete="new-password"
                    value={platformAdminUserDraft.adminPassword}
                  />
                  {adminUserFieldErrors.adminPassword ? (
                    <p className="mb-2 text-xs font-semibold text-[#B54C47]">{adminUserFieldErrors.adminPassword}</p>
                  ) : (
                    <p className="mb-2 text-xs font-semibold text-[#6B87AC]">
                      {editingPlatformAdminUserId ? "Opcional. Marque abaixo para redefinir senha (mínimo 10 caracteres)." : "Mínimo: 10 caracteres."}
                    </p>
                  )}
                  <label className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#2B4E79]">
                    <input
                      checked={platformAdminUserDraft.resetExistingUserPassword}
                      onChange={(e) => setPlatformAdminUserDraft((d) => ({ ...d, resetExistingUserPassword: e.target.checked }))}
                      type="checkbox"
                    />
                    Redefinir senha se usuário já existir
                  </label>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      className="axiora-chunky-btn axiora-chunky-btn--secondary axiora-admin-btn px-3 py-2 text-sm text-white disabled:opacity-60"
                      disabled={loading}
                      onClick={() => void savePlatformAdminUser()}
                      type="button"
                    >
                      {editingPlatformAdminUserId ? "Salvar admin da plataforma" : "Criar admin da plataforma"}
                    </button>
                    {editingPlatformAdminUserId ? (
                      <button
                        className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn px-3 py-2 text-sm text-[#2F527D]"
                        disabled={loading}
                        onClick={() => resetPlatformAdminForm()}
                        type="button"
                      >
                        Cancelar edição
                      </button>
                    ) : null}
                  </div>
                  {platformAdminUserResult ? (
                    <div className="mt-3 rounded-xl border border-[#CBE7E4] bg-[#F1FCFA] p-3 text-xs font-semibold text-[#245A67]">
                      <p className="font-black text-[#1F4F5D]">{editingPlatformAdminUserId ? "Administrador atualizado." : "Administrador criado."}</p>
                      <p className="mt-1">Slug: {platformAdminUserResult.tenantSlug}</p>
                      <p>Admin: {platformAdminUserResult.adminEmail}</p>
                      <p>Perfil criado: {platformAdminUserResult.userCreated ? "sim" : "não (já existia)"}</p>
                      <p>Vínculo criado: {platformAdminUserResult.membershipCreated ? "sim" : "não (já existia)"}</p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        ) : null}
      </div>
      {selectedTenantDetail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A1930]/45 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-[#BFD3EE] bg-white p-5 shadow-[0_14px_40px_rgba(16,48,90,0.2)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-[#17345E]">Detalhes da organização</h3>
                <p className="text-sm font-semibold text-[#5A7AA4]">{selectedTenantDetail.tenant.name} ({selectedTenantDetail.tenant.slug})</p>
              </div>
              <button
                className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn px-3 py-2 text-sm text-[#2F527D]"
                onClick={() => setSelectedTenantDetail(null)}
                type="button"
              >
                Fechar
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[#DCE6F7] bg-[#F7FAFF] p-3">
                <p className="text-[11px] font-bold uppercase text-[#6B87AC]">Tipo</p>
                <p className="text-sm font-black text-[#24456F]">{selectedTenantDetail.tenant.type === "FAMILY" ? "Família" : selectedTenantDetail.tenant.type === "SCHOOL" ? "Escola" : selectedTenantDetail.tenant.type === "SYSTEM_ADMIN" ? "Sistema" : selectedTenantDetail.tenant.type}</p>
              </div>
              <div className="rounded-xl border border-[#DCE6F7] bg-[#F7FAFF] p-3">
                <p className="text-[11px] font-bold uppercase text-[#6B87AC]">Crianças ativas</p>
                <p className="text-sm font-black text-[#24456F]">{selectedTenantDetail.activeChildrenCount} / {selectedTenantDetail.childrenCount}</p>
              </div>
              <div className="rounded-xl border border-[#DCE6F7] bg-[#F7FAFF] p-3">
                <p className="text-[11px] font-bold uppercase text-[#6B87AC]">Membros</p>
                <p className="text-sm font-black text-[#24456F]">{selectedTenantDetail.membershipsCount}</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-[#D7E2F4]">
              <div className="border-b border-[#E6EDF8] bg-[#F7FAFF] px-3 py-2 text-sm font-black text-[#22456F]">Administradores vinculados</div>
              <div className="max-h-52 overflow-auto">
                {selectedTenantDetail.adminMembers.length === 0 ? (
                  <p className="px-3 py-3 text-sm font-semibold text-[#6B87AC]">Nenhum administrador vinculado.</p>
                ) : (
                  <ul className="divide-y divide-[#E6EDF8]">
                    {selectedTenantDetail.adminMembers.map((member) => (
                      <li key={`${member.userId}-${member.role}`} className="px-3 py-2 text-sm font-semibold text-[#2E517C]">
                        {member.name} ({member.email}) - {member.role}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {deleteTargetTenant ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A1930]/45 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#F2B9B3] bg-white p-5 shadow-[0_14px_40px_rgba(16,48,90,0.2)]">
            <h3 className="text-lg font-black text-[#8A2F2A]">Excluir organização</h3>
            <p className="mt-2 text-sm font-semibold text-[#5A7AA4]">
              Esta ação desativa a organização <span className="font-black text-[#1F4F5D]">{deleteTargetTenant.name}</span> e remove o acesso dos usuários vinculados.
            </p>
            <p className="mt-2 text-sm font-semibold text-[#B54C47]">Para confirmar, digite o slug exato: <span className="font-black">{deleteTargetTenant.slug}</span></p>
            <input
              className="mt-3 w-full rounded-xl border border-[#F2B9B3] px-3 py-2 text-sm font-mono"
              onChange={(e) => setDeleteConfirmSlug(e.target.value)}
              placeholder="Digite o slug para confirmar"
              value={deleteConfirmSlug}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn px-3 py-2 text-sm text-[#2F527D]"
                onClick={() => {
                  setDeleteTargetTenant(null);
                  setDeleteConfirmSlug("");
                }}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="axiora-chunky-btn axiora-chunky-btn--destructive axiora-admin-btn px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading || deleteConfirmSlug.trim().toLowerCase() !== deleteTargetTenant.slug}
                onClick={() => void confirmDeleteTenant()}
                type="button"
              >
                Excluir agora
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showPasswordModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A1930]/45 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#BFD3EE] bg-white p-5 shadow-[0_14px_40px_rgba(16,48,90,0.2)]">
            <h3 className="text-lg font-black text-[#17345E]">Redefinir senha</h3>
            <p className="mt-1 text-sm font-semibold text-[#5A7AA4]">Atualize sua senha de acesso ao menu da plataforma.</p>
            <div className="mt-4 space-y-2">
              <input
                className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm"
                type="password"
                placeholder="Senha atual"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
              <input
                className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm"
                type="password"
                placeholder="Nova senha"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {passwordFeedback ? <p className="mt-2 text-sm font-semibold text-[#2F527D]">{passwordFeedback}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="axiora-chunky-btn axiora-chunky-btn--outline axiora-admin-btn px-3 py-2 text-sm text-[#2F527D]"
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordFeedback(null);
                  setCurrentPassword("");
                  setNewPassword("");
                }}
                type="button"
              >
                Fechar
              </button>
              <button
                className="axiora-chunky-btn axiora-chunky-btn--secondary axiora-admin-btn px-3 py-2 text-sm text-white disabled:opacity-60"
                onClick={() => void handleChangePassword()}
                type="button"
                disabled={loading}
              >
                Salvar senha
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default function AxionStudioPageWrapper() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen w-full overflow-x-clip px-4 py-6 md:px-8 xl:px-14 2xl:px-20">
          <div className="rounded-3xl border border-[#BFD3EE] bg-white p-6 text-sm font-semibold text-[#5F80AA] shadow-[0_14px_40px_rgba(16,48,90,0.08)]">
            Carregando...
          </div>
        </main>
      }
    >
      <AxionStudioPage />
    </Suspense>
  );
}



