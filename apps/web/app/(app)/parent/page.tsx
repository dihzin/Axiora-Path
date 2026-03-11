"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Baby,
  Brain,
  Building2,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  ImagePlus,
  LogOut,
  Pencil,
  Plus,
  Save,
  Sparkles,
  TrendingUp,
  Trash2,
  UserCircle2,
  Users,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/layout/page-shell";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusNotice } from "@/components/ui/status-notice";
import {
  createChild,
  createTask,
  deleteChild,
  decideRoutine,
  deleteTask,
  getParentAxionInsights,
  getApiErrorMessage,
  getRoutineWeek,
  getTasks,
  getWalletSummary,
  getWeeklyTrend,
  listChildren,
  logout,
  trackParentActionClicked,
  updateChild,
  updateTask,
  type ChildProfileSummary,
  type ParentAxionInsightsResponse,
  type RoutineWeekLog,
  type TaskOut,
  type ThemeName,
  type WalletSummaryResponse,
  type WeeklyTrendResponse,
} from "@/lib/api/client";
import { clearTenantSlug, clearTokens } from "@/lib/api/session";
import { getSoundEnabled as getChildSoundEnabled, setSoundEnabled as setChildSoundEnabled } from "@/lib/sound-manager";
import { ChildAvatar } from "@/components/child-avatar";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: ThemeName[] = ["default", "space", "jungle", "ocean", "soccer", "capybara", "dinos", "princess", "heroes"];
const DIFFICULTY_OPTIONS: TaskOut["difficulty"][] = ["EASY", "MEDIUM", "HARD", "LEGENDARY"];

const THEME_LABELS: Record<ThemeName, string> = {
  default: "Padrão",
  space: "Espaço",
  jungle: "Selva",
  ocean: "Oceano",
  soccer: "Futebol",
  capybara: "Capivara",
  dinos: "Dinossauros",
  princess: "Princesa",
  heroes: "Heróis",
};

const DIFFICULTY_LABELS: Record<TaskOut["difficulty"], string> = {
  EASY: "Fácil",
  MEDIUM: "Médio",
  HARD: "Difícil",
  LEGENDARY: "Lendária",
};

function formatBRL(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueCents / 100);
}

function formatDateBr(isoDate: string | null | undefined): string {
  if (!isoDate) return "Não informado";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "Não informado";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function normalizeIsoDateOnly(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function CollapsibleCard({
  title,
  summary,
  collapsed,
  onToggle,
  className,
  children,
}: {
  title: string;
  summary?: string;
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("apple-panel", className)}>
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 text-left text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB07A] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          onClick={onToggle}
          aria-expanded={!collapsed}
        >
          <div className="min-w-0 flex-1">
            <CardTitle className="break-words text-[1.02rem] font-semibold leading-tight text-slate-100">{title}</CardTitle>
            {summary ? (
              <p className="mt-1 break-words text-[11px] font-medium leading-snug text-slate-400 [overflow-wrap:anywhere]">{summary}</p>
            ) : null}
          </div>
          <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition ${collapsed ? "" : "rotate-180"}`} />
        </button>
      </CardHeader>
      {!collapsed ? <CardContent className="space-y-3 text-sm text-slate-100">{children}</CardContent> : null}
    </Card>
  );
}

export default function ParentPage() {
  const router = useRouter();
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const [allowed, setAllowed] = useState(false);
  const [loadingPage, setLoadingPage] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const [children, setChildren] = useState<ChildProfileSummary[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);

  const [pendingLogs, setPendingLogs] = useState<RoutineWeekLog[]>([]);
  const [wallet, setWallet] = useState<WalletSummaryResponse | null>(null);
  const [trend, setTrend] = useState<WeeklyTrendResponse | null>(null);
  const [approvingLogId, setApprovingLogId] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [parentInsights, setParentInsights] = useState<ParentAxionInsightsResponse | null>(null);
  const [parentInsightsLoading, setParentInsightsLoading] = useState(false);
  const [parentInsightsError, setParentInsightsError] = useState<string | null>(null);
  const [loggingParentAction, setLoggingParentAction] = useState<string | null>(null);

  const [newChildName, setNewChildName] = useState("");
  const [newChildDateOfBirth, setNewChildDateOfBirth] = useState("");
  const [newChildTheme, setNewChildTheme] = useState<ThemeName>("default");
  const [newChildAvatarKey, setNewChildAvatarKey] = useState<string | null>(null);
  const [childActionError, setChildActionError] = useState<string | null>(null);
  const [creatingChild, setCreatingChild] = useState(false);
  const [showCreateChildForm, setShowCreateChildForm] = useState(false);

  const [editingChildId, setEditingChildId] = useState<number | null>(null);
  const [editingChildName, setEditingChildName] = useState("");
  const [editingChildDateOfBirth, setEditingChildDateOfBirth] = useState("");
  const [editingChildTheme, setEditingChildTheme] = useState<ThemeName>("default");
  const [editingChildAvatarKey, setEditingChildAvatarKey] = useState<string | null>(null);
  const [savingChild, setSavingChild] = useState(false);
  const [childToDelete, setChildToDelete] = useState<ChildProfileSummary | null>(null);
  const [deleteChildPin, setDeleteChildPin] = useState("");
  const [deletingChild, setDeletingChild] = useState(false);

  const [tasks, setTasks] = useState<TaskOut[]>([]);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [showCreateTaskForm, setShowCreateTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDifficulty, setNewTaskDifficulty] = useState<TaskOut["difficulty"]>("EASY");
  const [newTaskWeight, setNewTaskWeight] = useState("10");

  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [editingTaskDifficulty, setEditingTaskDifficulty] = useState<TaskOut["difficulty"]>("EASY");
  const [editingTaskWeight, setEditingTaskWeight] = useState("10");
  const [editingTaskActive, setEditingTaskActive] = useState(true);
  const [savingTask, setSavingTask] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({
    children: false,
    approvals: false,
    insights: false,
    wallet: true,
    weekly: true,
    tasks: true,
  });
  const [managementTab, setManagementTab] = useState<"children" | "tasks">("children");
  const appleFieldClassName =
    "!h-10 !rounded-2xl !border !border-white/18 !bg-slate-950/45 !text-slate-100 !shadow-none placeholder:!text-slate-400";
  const appleSelectClassName =
    "!h-10 !rounded-2xl !border !border-white/18 !bg-slate-950/45 !text-slate-100 !shadow-none";

  const clearLocalSession = (options?: { keepOrganization?: boolean }) => {
    clearTokens();
    if (!options?.keepOrganization) {
      clearTenantSlug();
    }
    localStorage.removeItem("axiora_child_id");
    localStorage.removeItem("axiora_child_name");
    sessionStorage.removeItem("axiora_parent_pin_ok");
  };

  const loadChildDashboard = useCallback(async (childId: number) => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const [routine, walletData, trendData] = await Promise.all([
        getRoutineWeek(childId, today),
        getWalletSummary(childId),
        getWeeklyTrend(childId),
      ]);
      setPendingLogs(routine.logs.filter((log) => log.status === "PENDING"));
      setWallet(walletData);
      setTrend(trendData);
      setDashboardError(null);
    } catch {
      setPendingLogs([]);
      setWallet(null);
      setTrend(null);
      setDashboardError("Não foi possível carregar os dados da criança selecionada.");
    }
  }, []);

  const loadChildrenAndContext = useCallback(async () => {
    const profiles = await listChildren();
    setChildren(profiles);

    if (profiles.length === 0) {
      setSelectedChildId(null);
      setPendingLogs([]);
      setWallet(null);
      setTrend(null);
      localStorage.removeItem("axiora_child_id");
      localStorage.removeItem("axiora_child_name");
      return;
    }

    const rawChildId = localStorage.getItem("axiora_child_id");
    const parsed = Number(rawChildId);
    const validId = Number.isFinite(parsed) && profiles.some((item) => item.id === parsed) ? parsed : profiles[0].id;
    const child = profiles.find((item) => item.id === validId) ?? profiles[0];
    setSelectedChildId(child.id);
    localStorage.setItem("axiora_child_id", String(child.id));
    localStorage.setItem("axiora_child_name", child.display_name);
    setSoundEnabled(getChildSoundEnabled(child.id));
    await loadChildDashboard(child.id);
  }, [loadChildDashboard]);

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await getTasks());
      setTaskActionError(null);
    } catch (err) {
      setTasks([]);
      setTaskActionError(getApiErrorMessage(err, "Não foi possível carregar tarefas."));
    }
  }, []);

  const loadParentInsights = useCallback(async () => {
    setParentInsightsLoading(true);
    try {
      const response = await getParentAxionInsights();
      setParentInsights(response);
      setParentInsightsError(null);
    } catch (err) {
      setParentInsights(null);
      setParentInsightsError(getApiErrorMessage(err, "Não foi possível carregar os insights Axion."));
    } finally {
      setParentInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    const ok = sessionStorage.getItem("axiora_parent_pin_ok");
    if (ok !== "1") {
      router.replace("/parent-pin");
      return;
    }
    setAllowed(true);
  }, [router]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const init = async () => {
      setLoadingPage(true);
      try {
        await Promise.all([loadChildrenAndContext(), loadTasks(), loadParentInsights()]);
      } finally {
        setLoadingPage(false);
      }
    };
    void init();
  }, [allowed, loadChildrenAndContext, loadParentInsights, loadTasks]);

  const onGoChildMode = () => {
    if (selectedChildId === null) {
      router.push("/select-child");
      return;
    }
    const selected = children.find((item) => item.id === selectedChildId);
    if (!selected) {
      router.push("/select-child");
      return;
    }
    localStorage.setItem("axiora_child_id", String(selected.id));
    localStorage.setItem("axiora_child_name", selected.display_name);
    router.push("/child");
  };

  const onSwitchOrganization = () => {
    setProfileMenuOpen(false);
    sessionStorage.removeItem("axiora_parent_pin_ok");
    localStorage.removeItem("axiora_child_id");
    localStorage.removeItem("axiora_child_name");
    router.push("/select-tenant");
  };

  const onLogout = async () => {
    setProfileMenuOpen(false);
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // even if API fails, clear local session
    } finally {
      clearLocalSession();
      router.replace("/login");
      setLoggingOut(false);
    }
  };

  const onSelectChild = async (child: ChildProfileSummary) => {
    setSelectedChildId(child.id);
    localStorage.setItem("axiora_child_id", String(child.id));
    localStorage.setItem("axiora_child_name", child.display_name);
    setSoundEnabled(getChildSoundEnabled(child.id));
    await Promise.all([loadChildDashboard(child.id), loadParentInsights()]);
  };

  const onParentActionClick = async (actionLabel: string) => {
    setLoggingParentAction(actionLabel);
    try {
      await trackParentActionClicked({
        actionLabel,
        context: "parent_dashboard",
        childId: selectedChildId,
        decisionId: parentInsights?.decisionId ?? null,
      });
    } catch {
      // interaction tracking should never block the dashboard UX
    } finally {
      setLoggingParentAction(null);
    }
  };

  const onToggleSound = () => {
    if (selectedChildId === null) return;
    setSoundEnabled((prev) => {
      const next = !prev;
      setChildSoundEnabled(selectedChildId, next);
      return next;
    });
  };

  const onApproveWithRollback = async (logId: number) => {
    const previousLogs = pendingLogs;
    setApprovingLogId(logId);
    setPendingLogs((current) => current.filter((item) => item.id !== logId));
    try {
      await decideRoutine(logId, "APPROVE");
      if (selectedChildId !== null) {
        await loadChildDashboard(selectedChildId);
      }
    } catch (err) {
      setPendingLogs(previousLogs);
      setDashboardError(getApiErrorMessage(err, "Falha ao aprovar tarefa pendente."));
    } finally {
      setApprovingLogId(null);
    }
  };

  const onAvatarFileChange = (file: File | null, target: "new" | "edit") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setChildActionError("Selecione um arquivo de imagem válido.");
      return;
    }
    if (file.size > 1_000_000) {
      setChildActionError("A foto deve ter até 1MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result || !result.startsWith("data:image/")) {
        setChildActionError("Não foi possível processar a foto.");
        return;
      }
      if (target === "new") setNewChildAvatarKey(result);
      if (target === "edit") setEditingChildAvatarKey(result);
      setChildActionError(null);
    };
    reader.onerror = () => setChildActionError("Falha ao carregar a foto selecionada.");
    reader.readAsDataURL(file);
  };

  const onCreateChild = async () => {
    setChildActionError(null);
    if (!newChildName.trim()) {
      setChildActionError("Informe o nome da criança.");
      return;
    }
    const isoDateOfBirth = normalizeIsoDateOnly(newChildDateOfBirth);
    if (!isoDateOfBirth) {
      setChildActionError("Informe a data de nascimento da criança.");
      return;
    }
    setCreatingChild(true);
    try {
      await createChild({
        display_name: newChildName.trim(),
        date_of_birth: isoDateOfBirth,
        theme: newChildTheme,
        avatar_key: newChildAvatarKey,
      });
      setNewChildName("");
      setNewChildDateOfBirth("");
      setNewChildTheme("default");
      setNewChildAvatarKey(null);
      setShowCreateChildForm(false);
      await loadChildrenAndContext();
    } catch (err) {
      setChildActionError(getApiErrorMessage(err, "Não foi possível criar perfil infantil."));
    } finally {
      setCreatingChild(false);
    }
  };

  const startEditChild = (child: ChildProfileSummary) => {
    setManagementTab("children");
    setEditingChildId(child.id);
    setEditingChildName(child.display_name);
    setEditingChildDateOfBirth(child.date_of_birth ?? "");
    setEditingChildTheme(child.theme);
    setEditingChildAvatarKey(child.avatar_key ?? null);
    setChildActionError(null);
  };

  const onSaveChild = async () => {
    if (editingChildId === null) return;
    setChildActionError(null);
    if (!editingChildName.trim()) {
      setChildActionError("Informe o nome da criança.");
      return;
    }
    const isoDateOfBirth = normalizeIsoDateOnly(editingChildDateOfBirth);
    if (!isoDateOfBirth) {
      setChildActionError("Informe a data de nascimento da criança.");
      return;
    }
    setSavingChild(true);
    try {
      const updated = await updateChild(editingChildId, {
        display_name: editingChildName.trim(),
        date_of_birth: isoDateOfBirth,
        theme: editingChildTheme,
        avatar_key: editingChildAvatarKey,
      });
      setChildren((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedChildId === updated.id) {
        localStorage.setItem("axiora_child_name", updated.display_name);
      }
      setEditingChildId(null);
    } catch (err) {
      setChildActionError(getApiErrorMessage(err, "Não foi possível salvar alterações da criança."));
    } finally {
      setSavingChild(false);
    }
  };

  const onDeleteChild = async () => {
    if (!childToDelete) return;
    setChildActionError(null);
    if (!/^\d{4,6}$/.test(deleteChildPin)) {
      setChildActionError("Informe o PIN dos pais com 4 a 6 números para confirmar.");
      return;
    }
    setDeletingChild(true);
    try {
      await deleteChild(childToDelete.id, deleteChildPin);
      setChildToDelete(null);
      setDeleteChildPin("");
      await loadChildrenAndContext();
    } catch (err) {
      setChildActionError(getApiErrorMessage(err, "Não foi possível excluir a criança."));
    } finally {
      setDeletingChild(false);
    }
  };

  const parseTaskWeight = (value: string): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
  };

  const onCreateTask = async () => {
    setTaskActionError(null);
    if (!newTaskTitle.trim()) {
      setTaskActionError("Informe o título da tarefa.");
      return;
    }
    setCreatingTask(true);
    try {
      const created = await createTask({
        title: newTaskTitle.trim(),
        difficulty: newTaskDifficulty,
        weight: parseTaskWeight(newTaskWeight),
      });
      setTasks((prev) => [...prev, created]);
      setNewTaskTitle("");
      setNewTaskDifficulty("EASY");
      setNewTaskWeight("10");
      setShowCreateTaskForm(false);
    } catch (err) {
      setTaskActionError(getApiErrorMessage(err, "Não foi possível criar tarefa."));
    } finally {
      setCreatingTask(false);
    }
  };

  const startEditTask = (task: TaskOut) => {
    setManagementTab("tasks");
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
    setEditingTaskDifficulty(task.difficulty);
    setEditingTaskWeight(String(task.weight));
    setEditingTaskActive(task.is_active);
    setTaskActionError(null);
  };

  const onSaveTask = async () => {
    if (editingTaskId === null) return;
    setTaskActionError(null);
    if (!editingTaskTitle.trim()) {
      setTaskActionError("Informe o título da tarefa.");
      return;
    }
    setSavingTask(true);
    try {
      const updated = await updateTask(editingTaskId, {
        title: editingTaskTitle.trim(),
        difficulty: editingTaskDifficulty,
        weight: parseTaskWeight(editingTaskWeight),
        is_active: editingTaskActive,
      });
      setTasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditingTaskId(null);
    } catch (err) {
      setTaskActionError(getApiErrorMessage(err, "Não foi possível salvar tarefa."));
    } finally {
      setSavingTask(false);
    }
  };

  const onDeleteTask = async (taskId: number) => {
    setTaskActionError(null);
    try {
      await deleteTask(taskId);
      setTasks((prev) => prev.filter((task) => task.id !== taskId));
      if (editingTaskId === taskId) {
        setEditingTaskId(null);
      }
    } catch (err) {
      setTaskActionError(getApiErrorMessage(err, "Não foi possível excluir tarefa."));
    }
  };

  if (!allowed || loadingPage) {
    return (
      <PageShell tone="parent" width="full" className="axiora-brand-page relative">
        <div className="axiora-brand-content mx-auto mt-16 w-full max-w-2xl rounded-3xl border border-[#E5D5C0]/20 bg-[#21433C]/40 p-6 text-slate-100 shadow-[0_20px_60px_rgba(7,20,17,0.34)]">
          <p className="axiora-kicker">Área dos pais</p>
          <p className="mt-2 text-lg font-semibold">Preparando seu painel familiar...</p>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#17322F]/65">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[#F1C56B]/75" />
          </div>
        </div>
      </PageShell>
    );
  }

  const selectedChild = children.find((child) => child.id === selectedChildId) ?? null;
  const heroMomentumLabel =
    trend && trend.completion_delta_percent > 0
      ? "Ritmo em aceleração"
      : trend && trend.completion_delta_percent < 0
        ? "Semana pede reforço"
        : "Ritmo em retomada";
  const heroFamilyStatus =
    pendingLogs.length === 0
      ? "Família em equilíbrio hoje"
      : `${pendingLogs.length} pendência(s) pedem sua atenção`;
  const activeTasksCount = tasks.filter((task) => task.is_active).length;
  const selectedThemeLabel = selectedChild ? THEME_LABELS[selectedChild.theme] : "Sem tema definido";
  const rhythmSummary =
    parentInsights?.learningRhythm.summary ??
    "Pequenos ajustes de rotina e constância nas tarefas ajudam a manter a semana em um ritmo positivo.";
  const familyActions = [
    {
      label: pendingLogs.length > 0 ? "Resolver pendências" : "Abrir modo criança",
      description: pendingLogs.length > 0 ? `${pendingLogs.length} item(ns) aguardando aprovação.` : "Entrar na experiência infantil com o perfil em foco.",
      onClick: pendingLogs.length > 0 ? () => toggleSection("insights") : onGoChildMode,
    },
    {
      label: showCreateChildForm ? "Fechar criação" : "Adicionar perfil",
      description: "Cadastre uma nova criança quando a família precisar ampliar o acompanhamento.",
      onClick: () => {
        setManagementTab("children");
        setEditingChildId(null);
        setShowCreateChildForm((prev) => !prev);
        setShowCreateTaskForm(false);
      },
    },
    {
      label: "Organizar tarefas",
      description: `${activeTasksCount} tarefa(s) ativa(s) moldam a rotina atual da família.`,
      onClick: () => {
        setManagementTab("tasks");
        setShowCreateChildForm(false);
      },
    },
  ];
  const toggleSection = (key: keyof typeof collapsedSections) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <PageShell tone="parent" width="full" className="apple-parent-page relative [font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif]">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-20%,rgba(148,163,184,0.12),transparent_62%),linear-gradient(180deg,#071427_0%,#091a34_100%)]" />

      <header className="axiora-brand-content mb-6 flex flex-wrap items-center gap-3 sm:flex-nowrap sm:justify-between">
        <div className="order-2 min-w-0 flex-1 basis-full sm:order-1 sm:basis-auto">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-400">Area dos pais</p>
            <span className="parent-luxe-badge inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold text-[#FFF2E4]">
              <Sparkles className="h-3 w-3" />
              Axion Family Console
            </span>
          </div>
          <h1 className="mt-1 break-words text-[30px] font-semibold leading-[1.08] text-slate-100">Centro familiar</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Um painel mais calmo para acompanhar a rotina, ajustar a família e agir rápido quando houver pendências.
          </p>
        </div>
        <div className="order-1 ml-auto flex shrink-0 items-center gap-2 sm:order-2 sm:ml-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="apple-btn-primary !h-10 !px-4 !text-sm !tracking-normal"
            onClick={onGoChildMode}
          >
            <Baby className="mr-1 h-4 w-4" />
            Ver modo criança
          </Button>
          <div className="relative" ref={profileMenuRef}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              className="apple-btn-subtle !h-10 !w-10 !p-0"
              onClick={() => setProfileMenuOpen((prev) => !prev)}
            >
              <UserCircle2 className="h-4 w-4 text-slate-100" />
            </Button>
            {profileMenuOpen ? (
              <div className="axiora-glass-soft absolute right-0 top-11 z-20 w-52 rounded-xl p-1 text-slate-100 shadow-md" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB07A] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                  onClick={onSwitchOrganization}
                >
                  <Building2 className="h-4 w-4" />
                  Trocar organização
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB07A] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:opacity-50"
                  onClick={() => void onLogout()}
                  disabled={loggingOut}
                >
                  <LogOut className="h-4 w-4" />
                  {loggingOut ? "Saindo..." : "Sair"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <Card className="axiora-brand-content apple-panel parent-hero-panel mb-5 text-slate-100">
        <CardContent className="grid gap-4 p-4 md:p-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)] xl:items-center">
          <div className="parent-hero-grid min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="parent-chip rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.06em] text-slate-300">Perfil em foco</span>
              <span className="parent-chip rounded-full px-3 py-1 text-[11px] font-semibold text-slate-400">
                {selectedChild ? `Tema ${THEME_LABELS[selectedChild.theme]}` : "Sem criança ativa"}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-start gap-4 lg:flex-nowrap">
              <div className="parent-avatar-stage flex items-center gap-3 rounded-[28px] px-4 py-4">
                <ChildAvatar name={selectedChild?.display_name ?? "Criança"} avatarKey={selectedChild?.avatar_key ?? null} size={74} />
                <div className="min-w-0">
                  <p className="text-[30px] font-semibold leading-tight text-slate-50">{selectedChild?.display_name ?? "Nenhuma criança ativa"}</p>
                  <p className="mt-1 text-sm text-slate-300">
                    {selectedChild ? `Nascimento ${formatDateBr(selectedChild.date_of_birth)}` : "Selecione ou crie um perfil infantil"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="parent-luxe-badge inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold text-[#FFF2E4]">
                      <GraduationCap className="h-3 w-3" />
                      Rotina orientada por aprendizado
                    </span>
                    <span className="parent-chip rounded-full px-2.5 py-1 text-[10px] font-semibold text-slate-300">
                      {parentInsights?.learningRhythm.title ?? "Ritmo em observação"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="parent-spotlight min-w-[240px] flex-1 rounded-[28px] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F7DEC0]/80">Leitura Axion</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {parentInsights?.learningRhythm.title ?? "Semana pronta para pequenas vitórias"}
                </p>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-200/78">
                  {parentInsights?.learningRhythm.summary ??
                    "Use este painel para acompanhar pendências, revisar tarefas e atualizar perfis sem navegar por blocos separados."}
                </p>
              </div>
            </div>
            <div className="parent-week-ribbon mt-4 rounded-[28px] px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F7DEC0]/72">Panorama da semana</p>
                  <p className="mt-2 text-base font-semibold text-white">{heroMomentumLabel}</p>
                  <p className="mt-1 text-sm text-slate-200/72">{heroFamilyStatus}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="parent-family-cluster flex items-center gap-2 rounded-full px-3 py-2">
                    <div className="flex -space-x-2">
                      {children.slice(0, 3).map((child) => (
                        <div key={child.id} className="rounded-full ring-2 ring-[#0B1B35]">
                          <ChildAvatar name={child.display_name} avatarKey={child.avatar_key} size={34} />
                        </div>
                      ))}
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Família ativa</p>
                      <p className="text-sm font-semibold text-slate-100">{children.length} perfil(is) acompanhados</p>
                    </div>
                  </div>
                  <div className="parent-focus-pill rounded-full px-3 py-2 text-sm font-semibold text-slate-100">
                    {parentInsights?.dropoutRisk.title ?? "Acompanhamento estável"}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-2">
            <div className="parent-stat-card rounded-[24px] px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold tracking-[0.08em] text-slate-400">Pendencias</p>
                <Sparkles className="h-4 w-4 text-[#F1C56B]" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-slate-100">{pendingLogs.length}</p>
              <p className="mt-1 text-[11px] text-slate-400">itens aguardando ação</p>
            </div>
            <div className="parent-stat-card rounded-[24px] px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold tracking-[0.08em] text-slate-400">Carteira</p>
                <Wallet className="h-4 w-4 text-emerald-300" />
              </div>
              <p className="mt-3 text-xl font-semibold text-slate-100">{wallet ? formatBRL(wallet.total_balance_cents) : "—"}</p>
              <p className="mt-1 text-[11px] text-slate-400">saldo total da criança</p>
            </div>
            <div className="parent-stat-card rounded-[24px] px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold tracking-[0.08em] text-slate-400">Conclusao</p>
                <TrendingUp className="h-4 w-4 text-violet-300" />
              </div>
              <p className="mt-3 text-xl font-semibold text-slate-100">{trend ? `${trend.completion_delta_percent >= 0 ? "+" : ""}${trend.completion_delta_percent.toFixed(1)}%` : "—"}</p>
              <p className="mt-1 text-[11px] text-slate-400">variação da semana</p>
            </div>
            <div className="parent-stat-card rounded-[24px] px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold tracking-[0.08em] text-slate-400">Criancas</p>
                <Users className="h-4 w-4 text-amber-300" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-slate-100">{children.length}</p>
              <p className="mt-1 text-[11px] text-slate-400">perfis na família</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="axiora-brand-content grid items-start gap-4 lg:grid-cols-12">
        <CollapsibleCard
          title="Gestão da família"
          summary={`${children.length} criança(s) cadastrada(s) • ${tasks.length} tarefa(s) registradas`}
          collapsed={collapsedSections.children}
          onToggle={() => toggleSection("children")}
          className="self-start lg:col-span-8 apple-panel"
        >
          <div className="parent-management-shell rounded-[28px] p-4 md:p-5">
            <div className="flex flex-col gap-3 border-b border-white/8 pb-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Workspace da família</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="parent-chip rounded-full px-3 py-1 text-[11px] font-semibold text-slate-200">
                    Ativa: {selectedChild?.display_name ?? "nenhuma"}
                  </span>
                  <span className="parent-chip rounded-full px-3 py-1 text-[11px] font-semibold text-slate-400">
                    {managementTab === "children" ? `${children.length} perfis` : `${tasks.length} tarefas`}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#17322F]/45 p-1">
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                      managementTab === "children" ? "bg-[#FF9A48] text-white" : "text-slate-300 hover:bg-white/6",
                    )}
                    onClick={() => setManagementTab("children")}
                  >
                    Perfis
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                      managementTab === "tasks" ? "bg-[#FF9A48] text-white" : "text-slate-300 hover:bg-white/6",
                    )}
                    onClick={() => setManagementTab("tasks")}
                  >
                    Tarefas
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="apple-btn-subtle"
                  onClick={() => {
                    if (managementTab === "children") {
                      setEditingChildId(null);
                      setShowCreateChildForm((prev) => !prev);
                      setShowCreateTaskForm(false);
                      return;
                    }
                    setEditingTaskId(null);
                    setShowCreateTaskForm((prev) => !prev);
                    setShowCreateChildForm(false);
                  }}
                >
                  {managementTab === "children"
                    ? showCreateChildForm
                      ? "Fechar criação"
                      : "Nova criança"
                    : showCreateTaskForm
                      ? "Fechar criação"
                      : "Nova tarefa"}
                </Button>
              </div>
            </div>
            <div className="pt-4">
            {managementTab === "children" ? (
              <>
            {children.length === 0 ? <StatusNotice tone="warning">Nenhuma criança cadastrada ainda.</StatusNotice> : null}
            {showCreateChildForm ? (
            <div className="parent-editor-panel mb-4 rounded-[24px] p-4">
              <p className="mb-1 text-sm font-semibold text-slate-100">Novo perfil infantil</p>
              <p className="mb-4 text-xs text-slate-400">Cadastre um novo perfil apenas quando a família realmente precisar.</p>
              <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                <div className="parent-editor-aside rounded-[22px] p-4">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <ChildAvatar name={newChildName || "Criança"} avatarKey={newChildAvatarKey} size={68} />
                    <div className="space-y-1">
                      <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#F7DEC0]">
                        <ImagePlus className="h-3.5 w-3.5" />
                        Enviar foto
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => onAvatarFileChange(e.target.files?.[0] ?? null, "new")}
                        />
                      </label>
                      {newChildAvatarKey ? (
                        <button
                          type="button"
                          className="block text-xs font-semibold text-rose-300"
                          onClick={() => setNewChildAvatarKey(null)}
                        >
                          Remover foto
                        </button>
                      ) : (
                        <p className="text-[11px] font-medium leading-5 text-slate-400">Sem foto, usamos um avatar amigável.</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Input className={appleFieldClassName} placeholder="Nome da criança" value={newChildName} onChange={(e) => setNewChildName(e.target.value)} />
                  </div>
                  <Input className={appleFieldClassName} type="date" required value={newChildDateOfBirth} onChange={(e) => setNewChildDateOfBirth(e.target.value)} />
                  <NativeSelect className={appleSelectClassName} value={newChildTheme} onChange={(e) => setNewChildTheme(e.target.value as ThemeName)}>
                    {THEME_OPTIONS.map((theme) => (
                      <option key={theme} value={theme}>
                        {THEME_LABELS[theme]}
                      </option>
                    ))}
                  </NativeSelect>
                  <div className="md:col-span-2 flex flex-wrap items-center gap-2">
                    <Button size="sm" className="apple-btn-primary" onClick={() => void onCreateChild()} disabled={creatingChild}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {creatingChild ? "Criando..." : "Criar perfil da criança"}
                    </Button>
                    <p className="text-[11px] font-medium text-slate-400">A data de nascimento é obrigatória.</p>
                  </div>
                </div>
              </div>
            </div>
            ) : null}
            <div className="parent-profile-grid grid gap-3 2xl:grid-cols-2">
            {children.map((child) => (
              <div
                key={child.id}
                className={cn(
                  "parent-profile-card rounded-[24px] px-4 py-4",
                  selectedChildId === child.id ? "border-[#FFB07A]/35 bg-[#8D552E]/14 shadow-[0_16px_28px_rgba(7,20,17,0.18)]" : "",
                )}
              >
                <div className="flex items-start gap-3">
                  <ChildAvatar name={child.display_name} avatarKey={child.avatar_key} size={46} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words text-base font-semibold leading-tight text-slate-100 [overflow-wrap:anywhere]">
                        {child.display_name}
                      </p>
                      {selectedChildId === child.id ? <span className="parent-luxe-badge rounded-full px-2 py-0.5 text-[10px] font-semibold text-[#FFF2E4]">ativa</span> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                      <span className="parent-chip rounded-full px-2.5 py-1">
                        Nascimento: {formatDateBr(child.date_of_birth)}
                      </span>
                      <span className="parent-chip rounded-full px-2.5 py-1">
                        Tema: {THEME_LABELS[child.theme]}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <Button size="sm" variant="outline" className="apple-btn-subtle" onClick={() => void onSelectChild(child)}>
                    Selecionar
                  </Button>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="apple-btn-subtle apple-icon-btn" onClick={() => startEditChild(child)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="apple-btn-subtle apple-icon-btn"
                      onClick={() => {
                        setChildActionError(null);
                        setDeleteChildPin("");
                        setChildToDelete(child);
                      }}
                      aria-label={`Excluir ${child.display_name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    {selectedChildId === child.id ? <CheckCircle2 className="h-4 w-4 text-[#F1C56B]" /> : null}
                  </div>
                </div>
              </div>
            ))}
            </div>

            {!showCreateChildForm && !editingChildId && children.length > 0 ? (
              <div className="parent-story-grid mt-4">
                <div className="parent-story-panel rounded-[28px] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F7DEC0]/78">Perfil em destaque</p>
                      <div className="mt-3 flex items-start gap-3">
                        <ChildAvatar
                          name={selectedChild?.display_name ?? "Criança"}
                          avatarKey={selectedChild?.avatar_key ?? null}
                          size={58}
                        />
                        <div className="min-w-0">
                          <p className="text-2xl font-semibold text-slate-50">{selectedChild?.display_name ?? "Selecione uma criança"}</p>
                          <p className="mt-1 text-sm text-slate-300/80">
                            {selectedChild ? `Nascimento ${formatDateBr(selectedChild.date_of_birth)} • Tema ${selectedThemeLabel}` : "Sem contexto infantil ativo no momento."}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="parent-chip rounded-full px-3 py-1.5 text-[11px] font-semibold text-slate-200">
                      {heroMomentumLabel}
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                    <div className="parent-soft-block rounded-[24px] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Leitura da semana</p>
                      <p className="mt-2 text-lg font-semibold text-white">{parentInsights?.learningRhythm.title ?? "Semana em observação"}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300/82">{rhythmSummary}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="parent-focus-pill rounded-full px-3 py-1.5 text-xs font-semibold text-slate-100">
                          {pendingLogs.length > 0 ? `${pendingLogs.length} aprovação(ões) pendentes` : "Sem aprovações pendentes"}
                        </span>
                        <span className="parent-chip rounded-full px-3 py-1.5 text-xs font-semibold text-slate-300">
                          {activeTasksCount} tarefa(s) ativa(s)
                        </span>
                      </div>
                    </div>
                    <div className="parent-quickrail rounded-[24px] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Ações rápidas</p>
                      <div className="mt-3 space-y-2.5">
                        {familyActions.map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            className="parent-soft-block flex w-full items-start justify-between gap-3 rounded-[18px] px-3 py-3 text-left transition hover:border-[#FFB07A]/20 hover:bg-[#17322F]/60"
                            onClick={item.onClick}
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-100">{item.label}</p>
                              <p className="mt-1 text-xs leading-5 text-slate-400">{item.description}</p>
                            </div>
                            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#F1C56B]" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="parent-story-panel rounded-[28px] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F7DEC0]/78">Visão da família</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="parent-soft-block rounded-[22px] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Perfis acompanhados</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-50">{children.length}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300/78">Cada perfil mantém tema, histórico e seleção rápida sem sair do painel.</p>
                    </div>
                    <div className="parent-soft-block rounded-[22px] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Carteira em foco</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-50">{wallet ? formatBRL(wallet.total_balance_cents) : "—"}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300/78">Saldo consolidado da criança ativa para recompensas e combinados da rotina.</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {editingChildId ? (
              <div className="parent-soft-block-strong rounded-2xl p-4">
                <p className="mb-2 text-xs font-semibold text-slate-300">Editar criança</p>
                <div className="grid grid-cols-1 gap-3">
                  <div className="parent-soft-block flex items-center gap-3 rounded-xl p-3">
                    <ChildAvatar name={editingChildName || "Criança"} avatarKey={editingChildAvatarKey} size={54} />
                    <div className="space-y-1">
                      <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#F7DEC0]">
                        <ImagePlus className="h-3.5 w-3.5" />
                        Trocar foto
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => onAvatarFileChange(e.target.files?.[0] ?? null, "edit")}
                        />
                      </label>
                      {editingChildAvatarKey ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-rose-300"
                          onClick={() => setEditingChildAvatarKey(null)}
                        >
                          Remover foto
                        </button>
                    ) : (
                      <p className="max-w-[17rem] break-words text-[11px] font-semibold leading-snug text-slate-400 [overflow-wrap:anywhere]">
                        Sem foto, usamos um avatar amigável.
                      </p>
                    )}
                  </div>
                </div>
                  <Input className={appleFieldClassName} placeholder="Nome da criança" value={editingChildName} onChange={(e) => setEditingChildName(e.target.value)} />
                  <Input className={appleFieldClassName} type="date" required value={editingChildDateOfBirth} onChange={(e) => setEditingChildDateOfBirth(e.target.value)} />
                  <p className="text-[11px] font-medium text-slate-400">Data de nascimento obrigatória.</p>
                  <NativeSelect className={appleSelectClassName} value={editingChildTheme} onChange={(e) => setEditingChildTheme(e.target.value as ThemeName)}>
                    {THEME_OPTIONS.map((theme) => (
                      <option key={theme} value={theme}>
                        {THEME_LABELS[theme]}
                      </option>
                    ))}
                  </NativeSelect>
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="apple-btn-primary" onClick={() => void onSaveChild()} disabled={savingChild}>
                      <Save className="mr-1 h-3.5 w-3.5" />
                      {savingChild ? "Salvando..." : "Salvar criança"}
                    </Button>
                    <Button size="sm" variant="outline" className="apple-btn-subtle" onClick={() => setEditingChildId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

              </>
            ) : null}

            {managementTab === "tasks" ? (
              <>
            {showCreateTaskForm ? (
            <div className="parent-editor-panel mb-4 rounded-[24px] p-4">
              <p className="mb-1 text-sm font-semibold text-slate-100">Criar tarefa</p>
              <p className="mb-4 text-xs text-slate-400">Use poucas tarefas bem definidas para manter a rotina clara.</p>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,0.7fr)_auto]">
                <Input className={appleFieldClassName} placeholder="Título da tarefa" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} />
                <NativeSelect className={appleSelectClassName} value={newTaskDifficulty} onChange={(e) => setNewTaskDifficulty(e.target.value as TaskOut["difficulty"])}>
                  {DIFFICULTY_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {DIFFICULTY_LABELS[item]}
                    </option>
                  ))}
                </NativeSelect>
                <Input className={appleFieldClassName} inputMode="numeric" placeholder="Peso" value={newTaskWeight} onChange={(e) => setNewTaskWeight(e.target.value)} />
                <Button size="sm" className="apple-btn-primary md:self-stretch" onClick={() => void onCreateTask()} disabled={creatingTask}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {creatingTask ? "Criando..." : "Criar"}
                </Button>
              </div>
            </div>
            ) : null}

            <div className="parent-task-grid grid gap-3 xl:grid-cols-2">
            {tasks.map((task) => (
              <div key={task.id} className="parent-profile-card rounded-[24px] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-slate-100 [overflow-wrap:anywhere]">{task.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                      <span className="parent-chip rounded-full px-2.5 py-1">{DIFFICULTY_LABELS[task.difficulty]}</span>
                      <span className="parent-chip rounded-full px-2.5 py-1">Peso {task.weight}</span>
                      <span className="parent-chip rounded-full px-2.5 py-1">{task.is_active ? "Ativa" : "Inativa"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="apple-btn-subtle apple-icon-btn" onClick={() => startEditTask(task)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="apple-btn-subtle apple-icon-btn" onClick={() => void onDeleteTask(task.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {editingTaskId === task.id ? (
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <Input className={appleFieldClassName} value={editingTaskTitle} onChange={(e) => setEditingTaskTitle(e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <NativeSelect className={appleSelectClassName} value={editingTaskDifficulty} onChange={(e) => setEditingTaskDifficulty(e.target.value as TaskOut["difficulty"])}>
                        {DIFFICULTY_OPTIONS.map((item) => (
                          <option key={item} value={item}>
                            {DIFFICULTY_LABELS[item]}
                          </option>
                        ))}
                      </NativeSelect>
                      <Input className={appleFieldClassName} value={editingTaskWeight} onChange={(e) => setEditingTaskWeight(e.target.value)} inputMode="numeric" />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-400">
                      <input type="checkbox" checked={editingTaskActive} onChange={(e) => setEditingTaskActive(e.target.checked)} />
                      Tarefa ativa
                    </label>
                    <div className="flex items-center gap-2">
                      <Button size="sm" className="apple-btn-primary" onClick={() => void onSaveTask()} disabled={savingTask}>
                        <Save className="mr-1 h-3.5 w-3.5" />
                        {savingTask ? "Salvando..." : "Salvar tarefa"}
                      </Button>
                      <Button size="sm" variant="outline" className="apple-btn-subtle" onClick={() => setEditingTaskId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            </div>

            {tasks.length === 0 ? <StatusNotice tone="info">Nenhuma tarefa cadastrada ainda.</StatusNotice> : null}
            {taskActionError ? <StatusNotice tone="error">{taskActionError}</StatusNotice> : null}
              </>
            ) : null}
            {childActionError ? <div role="alert" aria-live="polite"><StatusNotice tone="error">{childActionError}</StatusNotice></div> : null}
            </div>
          </div>
        </CollapsibleCard>

        <div className="space-y-4 self-start lg:sticky lg:top-6 lg:col-span-4">
        <CollapsibleCard
          title="Pulse Axion"
          summary={selectedChild ? `Leitura e operação de ${selectedChild.display_name}` : "Leitura e operação da família"}
          collapsed={collapsedSections.insights}
          onToggle={() => toggleSection("insights")}
          className="apple-panel"
        >
            {parentInsightsLoading ? <StatusNotice tone="info">Atualizando insights inteligentes...</StatusNotice> : null}
            {parentInsightsError ? <StatusNotice tone="error">{parentInsightsError}</StatusNotice> : null}
            {parentInsights ? (
              <div className="space-y-3">
                <div className="parent-spotlight rounded-[26px] px-4 py-4">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-[#F1C56B]" />
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-[#F7DEC0]/82">Risco de queda de consistência</p>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-100">{parentInsights.dropoutRisk.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-200/78">{parentInsights.dropoutRisk.summary}</p>
                </div>
                <div className="parent-soft-block rounded-2xl px-3 py-3">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-violet-300" />
                    <p className="text-[11px] font-semibold tracking-[0.06em] text-slate-400">Insight semanal</p>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-100">{parentInsights.learningRhythm.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{parentInsights.learningRhythm.summary}</p>
                </div>
                <div className="parent-soft-block rounded-2xl px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-300" />
                    <p className="text-[11px] font-semibold tracking-[0.06em] text-slate-400">Ações recomendadas</p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {parentInsights.suggestedParentalActions.slice(0, 3).map((action) => (
                      <button
                        key={action}
                        type="button"
                        className="parent-soft-block w-full rounded-xl px-3 py-2.5 text-left text-xs font-medium text-slate-100 transition hover:bg-[#17322F]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB07A] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                        onClick={() => void onParentActionClick(action)}
                        disabled={loggingParentAction === action}
                      >
                        {loggingParentAction === action ? "Registrando..." : action}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            {!parentInsightsLoading && !parentInsightsError && !parentInsights ? (
              <StatusNotice tone="info">Sem insights disponíveis para este perfil no momento.</StatusNotice>
            ) : null}
            <div className="h-px bg-gradient-to-r from-transparent via-[#E5D5C0]/20 to-transparent" />
            <div className="parent-operations-panel rounded-[24px] p-4">
              <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Aprovações pendentes</p>
                <p className="mt-1 text-xs text-slate-400">
                  {pendingLogs.length > 0 ? `${pendingLogs.length} item(ns) aguardando sua decisão.` : "Sem pendências para a criança ativa."}
                </p>
              </div>
              <button
                type="button"
                aria-label="Alternar som"
                className="parent-chip rounded-full px-3 py-1.5 text-xs font-semibold text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
                onClick={onToggleSound}
              >
                Som {soundEnabled ? "ligado" : "desligado"}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="parent-stat-card rounded-2xl px-3 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold tracking-[0.08em] text-slate-400">Pendências</p>
                  <Sparkles className="h-4 w-4 text-[#F1C56B]" />
                </div>
                <p className="mt-1 text-base font-semibold text-slate-100">{pendingLogs.length}</p>
              </div>
              <div className="parent-stat-card rounded-2xl px-3 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold tracking-[0.08em] text-slate-400">Ganhos</p>
                  <TrendingUp className="h-4 w-4 text-emerald-300" />
                </div>
                <p className="mt-1 text-base font-semibold text-slate-100">
                  {trend ? `${trend.earnings_delta_percent >= 0 ? "+" : ""}${trend.earnings_delta_percent.toFixed(1)}%` : "—"}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
            {pendingLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="parent-soft-block flex items-center justify-between gap-3 rounded-2xl px-3 py-3 text-xs">
                <span className="text-slate-300">
                  Tarefa #{log.task_id} • {log.date}
                </span>
                <Button size="sm" className="apple-btn-subtle" onClick={() => void onApproveWithRollback(log.id)} disabled={approvingLogId === log.id}>
                  {approvingLogId === log.id ? "..." : "Aprovar"}
                </Button>
              </div>
            ))}
            </div>
            {pendingLogs.length === 0 && !dashboardError ? (
              <div className="mt-3">
                <StatusNotice tone="info">Sem pendências de aprovação para a criança ativa.</StatusNotice>
              </div>
            ) : null}
            {dashboardError ? <div role="alert" aria-live="polite" className="mt-3"><StatusNotice tone="error">{dashboardError}</StatusNotice></div> : null}
            </div>
        </CollapsibleCard>
        </div>
      </section>

      {childToDelete ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0A1930]/45 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-[#BFD3EE] bg-white p-5 shadow-[0_14px_40px_rgba(16,48,90,0.2)]">
            <h3 className="text-lg font-black text-[#17345E]">Excluir criança</h3>
            <p className="mt-1 text-sm font-semibold text-[#5A7AA4]">
              Você está prestes a excluir <strong>{childToDelete.display_name}</strong>. Esta ação exige confirmação com PIN.
            </p>
            <div className="mt-3 space-y-2">
              <Input
                className={appleFieldClassName}
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="PIN dos pais (4 a 6 números)"
                value={deleteChildPin}
                onChange={(e) => setDeleteChildPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <p className="text-xs text-muted-foreground">Apenas números. Exemplo: 1234</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="apple-btn-subtle"
                onClick={() => {
                  setChildToDelete(null);
                  setDeleteChildPin("");
                }}
                disabled={deletingChild}
              >
                Cancelar
              </Button>
              <Button type="button" className="apple-btn-primary !bg-[#ef4444] !text-white hover:!bg-[#dc2626]" onClick={() => void onDeleteChild()} disabled={deletingChild}>
                {deletingChild ? "Excluindo..." : "Confirmar exclusão"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

