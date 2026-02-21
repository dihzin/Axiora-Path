"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Baby,
  Building2,
  CheckCircle2,
  ChevronDown,
  ImagePlus,
  LogOut,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserCircle2,
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
  getApiErrorMessage,
  getRoutineWeek,
  getTasks,
  getWalletSummary,
  getWeeklyTrend,
  listChildren,
  logout,
  updateChild,
  updateTask,
  type ChildProfileSummary,
  type RoutineWeekLog,
  type TaskOut,
  type ThemeName,
  type WalletSummaryResponse,
  type WeeklyTrendResponse,
} from "@/lib/api/client";
import { clearTenantSlug, clearTokens } from "@/lib/api/session";
import { getSoundEnabled as getChildSoundEnabled, setSoundEnabled as setChildSoundEnabled } from "@/lib/sound-manager";
import { ChildAvatar } from "@/components/child-avatar";

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

function TrendIndicator({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-secondary" : "text-destructive"}`}>
      {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function formatBRL(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueCents / 100);
}

function CollapsibleCard({
  title,
  summary,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 text-left"
          onClick={onToggle}
          aria-expanded={!collapsed}
        >
          <div className="min-w-0 flex-1">
            <CardTitle className="break-words text-base leading-tight">{title}</CardTitle>
            {summary ? (
              <p className="mt-1 break-words text-xs font-medium leading-snug text-muted-foreground [overflow-wrap:anywhere]">{summary}</p>
            ) : null}
          </div>
          <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition ${collapsed ? "" : "rotate-180"}`} />
        </button>
      </CardHeader>
      {!collapsed ? <CardContent className="space-y-2 text-sm">{children}</CardContent> : null}
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

  const [newChildName, setNewChildName] = useState("");
  const [newChildBirthYear, setNewChildBirthYear] = useState("");
  const [newChildTheme, setNewChildTheme] = useState<ThemeName>("default");
  const [newChildAvatarKey, setNewChildAvatarKey] = useState<string | null>(null);
  const [childActionError, setChildActionError] = useState<string | null>(null);
  const [creatingChild, setCreatingChild] = useState(false);

  const [editingChildId, setEditingChildId] = useState<number | null>(null);
  const [editingChildName, setEditingChildName] = useState("");
  const [editingChildBirthYear, setEditingChildBirthYear] = useState("");
  const [editingChildTheme, setEditingChildTheme] = useState<ThemeName>("default");
  const [editingChildAvatarKey, setEditingChildAvatarKey] = useState<string | null>(null);
  const [savingChild, setSavingChild] = useState(false);
  const [childToDelete, setChildToDelete] = useState<ChildProfileSummary | null>(null);
  const [deleteChildPin, setDeleteChildPin] = useState("");
  const [deletingChild, setDeletingChild] = useState(false);

  const [tasks, setTasks] = useState<TaskOut[]>([]);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
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
    children: true,
    approvals: true,
    wallet: true,
    weekly: true,
    tasks: true,
  });

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
        await Promise.all([loadChildrenAndContext(), loadTasks()]);
      } finally {
        setLoadingPage(false);
      }
    };
    void init();
  }, [allowed, loadChildrenAndContext, loadTasks]);

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
    await loadChildDashboard(child.id);
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

  const parseBirthYear = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return Math.floor(parsed);
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
    setCreatingChild(true);
    try {
      await createChild({
        display_name: newChildName.trim(),
        birth_year: parseBirthYear(newChildBirthYear),
        theme: newChildTheme,
        avatar_key: newChildAvatarKey,
      });
      setNewChildName("");
      setNewChildBirthYear("");
      setNewChildTheme("default");
      setNewChildAvatarKey(null);
      await loadChildrenAndContext();
    } catch (err) {
      setChildActionError(getApiErrorMessage(err, "Não foi possível criar perfil infantil."));
    } finally {
      setCreatingChild(false);
    }
  };

  const startEditChild = (child: ChildProfileSummary) => {
    setEditingChildId(child.id);
    setEditingChildName(child.display_name);
    setEditingChildBirthYear(child.birth_year ? String(child.birth_year) : "");
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
    setSavingChild(true);
    try {
      const updated = await updateChild(editingChildId, {
        display_name: editingChildName.trim(),
        birth_year: parseBirthYear(editingChildBirthYear),
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
    } catch (err) {
      setTaskActionError(getApiErrorMessage(err, "Não foi possível criar tarefa."));
    } finally {
      setCreatingTask(false);
    }
  };

  const startEditTask = (task: TaskOut) => {
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
    return null;
  }

  const selectedChild = children.find((child) => child.id === selectedChildId) ?? null;
  const toggleSection = (key: keyof typeof collapsedSections) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <PageShell tone="parent" width="wide">
      <header className="mb-3 flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-between">
        <h1 className="order-2 min-w-0 flex-1 basis-full break-words text-lg font-semibold leading-tight sm:order-1 sm:basis-auto">Área dos pais</h1>
        <div className="order-1 ml-auto flex shrink-0 items-center gap-2 sm:order-2 sm:ml-0">
          <Button type="button" size="sm" variant="outline" className="whitespace-nowrap px-2 text-xs sm:px-3 sm:text-sm" onClick={onGoChildMode}>
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
              className="duo-icon-button h-10 w-10 border-0 p-0"
              onClick={() => setProfileMenuOpen((prev) => !prev)}
            >
              <UserCircle2 className="h-4 w-4" />
            </Button>
            {profileMenuOpen ? (
              <div className="absolute right-0 top-11 z-20 w-52 rounded-xl border border-border bg-card p-1 shadow-md" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={onSwitchOrganization}
                >
                  <Building2 className="h-4 w-4" />
                  Trocar organização
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
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

      {selectedChild ? (
        <div className="mb-3">
          <StatusNotice tone="info" className="min-w-0">
            <span className="block min-w-0 break-words leading-snug [overflow-wrap:anywhere]">
              Perfil ativo: <strong className="ml-1 inline">{selectedChild.display_name}</strong>
            </span>
          </StatusNotice>
        </div>
      ) : null}

      <section className="space-y-3">
        <CollapsibleCard
          title="Crianças vinculadas"
          summary={`${children.length} criança(s) • ativa: ${selectedChild?.display_name ?? "nenhuma"}`}
          collapsed={collapsedSections.children}
          onToggle={() => toggleSection("children")}
        >
            {children.length === 0 ? <StatusNotice tone="warning">Nenhuma criança cadastrada ainda.</StatusNotice> : null}
            {children.map((child) => (
              <div
                key={child.id}
                className={`rounded-md border px-2 py-2 ${selectedChildId === child.id ? "border-secondary bg-secondary/10" : "border-border"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ChildAvatar name={child.display_name} avatarKey={child.avatar_key} size={42} />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium leading-tight [overflow-wrap:anywhere]">
                        {child.display_name}
                        {selectedChildId === child.id ? <span className="ml-2 text-xs text-secondary">ativa</span> : null}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                        <span className="rounded-full border border-border/80 bg-white/80 px-2 py-0.5">
                          Nascimento: {child.birth_year ?? "Não informado"}
                        </span>
                        <span className="rounded-full border border-border/80 bg-white/80 px-2 py-0.5">
                          Tema: {THEME_LABELS[child.theme]}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="ml-auto flex w-full shrink-0 flex-wrap items-center justify-end gap-1 sm:w-auto">
                    <Button size="sm" variant="outline" onClick={() => void onSelectChild(child)}>
                      Selecionar
                    </Button>
                    <Button size="sm" variant="outline" className="duo-icon-button h-9 w-9 border-0 p-0" onClick={() => startEditChild(child)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="duo-icon-button h-9 w-9 border-0 p-0"
                      onClick={() => {
                        setChildActionError(null);
                        setDeleteChildPin("");
                        setChildToDelete(child);
                      }}
                      aria-label={`Excluir ${child.display_name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    {selectedChildId === child.id ? <CheckCircle2 className="h-4 w-4 text-secondary" /> : null}
                  </div>
                </div>
              </div>
            ))}

            {editingChildId ? (
              <div className="rounded-md border border-border p-2">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Editar criança</p>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center gap-3 rounded-md border border-border p-2">
                    <ChildAvatar name={editingChildName || "Criança"} avatarKey={editingChildAvatarKey} size={54} />
                    <div className="space-y-1">
                      <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#2F527D]">
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
                          className="text-xs font-semibold text-[#B8574B]"
                          onClick={() => setEditingChildAvatarKey(null)}
                        >
                          Remover foto
                        </button>
                    ) : (
                      <p className="max-w-[17rem] break-words text-[11px] font-semibold leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                        Sem foto, usamos um avatar amigável.
                      </p>
                    )}
                  </div>
                </div>
                  <Input placeholder="Nome da criança" value={editingChildName} onChange={(e) => setEditingChildName(e.target.value)} />
                  <Input
                    placeholder="Ano de nascimento (opcional)"
                    inputMode="numeric"
                    value={editingChildBirthYear}
                    onChange={(e) => setEditingChildBirthYear(e.target.value)}
                  />
                  <NativeSelect value={editingChildTheme} onChange={(e) => setEditingChildTheme(e.target.value as ThemeName)}>
                    {THEME_OPTIONS.map((theme) => (
                      <option key={theme} value={theme}>
                        {THEME_LABELS[theme]}
                      </option>
                    ))}
                  </NativeSelect>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => void onSaveChild()} disabled={savingChild}>
                      <Save className="mr-1 h-3.5 w-3.5" />
                      {savingChild ? "Salvando..." : "Salvar criança"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingChildId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-md border border-border p-2">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Adicionar nova criança</p>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center gap-3 rounded-md border border-border p-2">
                  <ChildAvatar name={newChildName || "Criança"} avatarKey={newChildAvatarKey} size={54} />
                  <div className="space-y-1">
                    <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#2F527D]">
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
                        className="text-xs font-semibold text-[#B8574B]"
                        onClick={() => setNewChildAvatarKey(null)}
                      >
                        Remover foto
                      </button>
                    ) : (
                      <p className="max-w-[17rem] break-words text-[11px] font-semibold leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                        Opcional. Sem foto, aplicamos um avatar amigável.
                      </p>
                    )}
                  </div>
                </div>
                <Input placeholder="Nome da criança" value={newChildName} onChange={(e) => setNewChildName(e.target.value)} />
                <Input
                  placeholder="Ano de nascimento (opcional)"
                  inputMode="numeric"
                  value={newChildBirthYear}
                  onChange={(e) => setNewChildBirthYear(e.target.value)}
                />
                <NativeSelect value={newChildTheme} onChange={(e) => setNewChildTheme(e.target.value as ThemeName)}>
                  {THEME_OPTIONS.map((theme) => (
                    <option key={theme} value={theme}>
                      {THEME_LABELS[theme]}
                    </option>
                  ))}
                </NativeSelect>
                <Button size="sm" onClick={() => void onCreateChild()} disabled={creatingChild}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {creatingChild ? "Criando..." : "Criar acesso da criança"}
                </Button>
              </div>
            </div>
            {childActionError ? <StatusNotice tone="error">{childActionError}</StatusNotice> : null}
        </CollapsibleCard>

        <CollapsibleCard
          title="Aprovações pendentes"
          summary={`Pendentes: ${pendingLogs.length} • Som: ${soundEnabled ? "ligado" : "desligado"}`}
          collapsed={collapsedSections.approvals}
          onToggle={() => toggleSection("approvals")}
        >
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">Pendentes: {pendingLogs.length}</p>
              <button
                type="button"
                aria-label="Alternar som"
                className="text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
                onClick={onToggleSound}
              >
                Som: {soundEnabled ? "ligado" : "desligado"}
              </button>
            </div>
            {pendingLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs">
                <span>
                  Tarefa #{log.task_id} • {log.date}
                </span>
                <Button size="sm" onClick={() => void onApproveWithRollback(log.id)} disabled={approvingLogId === log.id}>
                  {approvingLogId === log.id ? "..." : "Aprovar"}
                </Button>
              </div>
            ))}
            {pendingLogs.length === 0 && !dashboardError ? (
              <StatusNotice tone="info">Sem pendências de aprovação para a criança ativa.</StatusNotice>
            ) : null}
            {dashboardError ? <StatusNotice tone="error">{dashboardError}</StatusNotice> : null}
        </CollapsibleCard>

        <CollapsibleCard
          title="Resumo da carteira"
          summary={`Total: ${wallet ? formatBRL(wallet.total_balance_cents) : "—"}`}
          collapsed={collapsedSections.wallet}
          onToggle={() => toggleSection("wallet")}
        >
            <p>Total: {wallet ? formatBRL(wallet.total_balance_cents) : "—"}</p>
            <p className="text-muted-foreground">Gastar: {wallet ? formatBRL(wallet.pot_balances_cents.SPEND) : "—"}</p>
            <p className="text-muted-foreground">Guardar: {wallet ? formatBRL(wallet.pot_balances_cents.SAVE) : "—"}</p>
            <p className="text-muted-foreground">Doar: {wallet ? formatBRL(wallet.pot_balances_cents.DONATE) : "—"}</p>
        </CollapsibleCard>

        <CollapsibleCard
          title="Resumo semanal"
          summary={`Conclusão ${trend ? `${trend.completion_delta_percent >= 0 ? "+" : ""}${trend.completion_delta_percent.toFixed(1)}%` : "—"} • Ganhos ${
            trend ? `${trend.earnings_delta_percent >= 0 ? "+" : ""}${trend.earnings_delta_percent.toFixed(1)}%` : "—"
          }`}
          collapsed={collapsedSections.weekly}
          onToggle={() => toggleSection("weekly")}
        >
            <div className="flex items-center justify-between">
              <span>Conclusão</span>
              <TrendIndicator value={trend?.completion_delta_percent ?? 0} />
            </div>
            <div className="flex items-center justify-between">
              <span>Ganhos</span>
              <TrendIndicator value={trend?.earnings_delta_percent ?? 0} />
            </div>
        </CollapsibleCard>

        <CollapsibleCard
          title="Cadastro de tarefas"
          summary={`${tasks.length} tarefa(s) cadastrada(s)`}
          collapsed={collapsedSections.tasks}
          onToggle={() => toggleSection("tasks")}
        >
            <div className="rounded-md border border-border p-2">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Criar tarefa</p>
              <div className="grid grid-cols-1 gap-2">
                <Input placeholder="Título da tarefa" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <NativeSelect value={newTaskDifficulty} onChange={(e) => setNewTaskDifficulty(e.target.value as TaskOut["difficulty"])}>
                    {DIFFICULTY_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {DIFFICULTY_LABELS[item]}
                      </option>
                    ))}
                  </NativeSelect>
                  <Input inputMode="numeric" placeholder="Peso" value={newTaskWeight} onChange={(e) => setNewTaskWeight(e.target.value)} />
                </div>
                <Button size="sm" onClick={() => void onCreateTask()} disabled={creatingTask}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {creatingTask ? "Criando..." : "Criar tarefa"}
                </Button>
              </div>
            </div>

            {tasks.map((task) => (
              <div key={task.id} className="rounded-md border border-border p-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {DIFFICULTY_LABELS[task.difficulty]} • peso {task.weight} • {task.is_active ? "ativa" : "inativa"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="duo-icon-button h-9 w-9 border-0 p-0" onClick={() => startEditTask(task)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="duo-icon-button h-9 w-9 border-0 p-0" onClick={() => void onDeleteTask(task.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {editingTaskId === task.id ? (
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    <Input value={editingTaskTitle} onChange={(e) => setEditingTaskTitle(e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <NativeSelect value={editingTaskDifficulty} onChange={(e) => setEditingTaskDifficulty(e.target.value as TaskOut["difficulty"])}>
                        {DIFFICULTY_OPTIONS.map((item) => (
                          <option key={item} value={item}>
                            {DIFFICULTY_LABELS[item]}
                          </option>
                        ))}
                      </NativeSelect>
                      <Input value={editingTaskWeight} onChange={(e) => setEditingTaskWeight(e.target.value)} inputMode="numeric" />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={editingTaskActive} onChange={(e) => setEditingTaskActive(e.target.checked)} />
                      Tarefa ativa
                    </label>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => void onSaveTask()} disabled={savingTask}>
                        <Save className="mr-1 h-3.5 w-3.5" />
                        {savingTask ? "Salvando..." : "Salvar tarefa"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingTaskId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}

            {tasks.length === 0 ? <StatusNotice tone="info">Nenhuma tarefa cadastrada ainda.</StatusNotice> : null}
            {taskActionError ? <StatusNotice tone="error">{taskActionError}</StatusNotice> : null}
        </CollapsibleCard>
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
                onClick={() => {
                  setChildToDelete(null);
                  setDeleteChildPin("");
                }}
                disabled={deletingChild}
              >
                Cancelar
              </Button>
              <Button type="button" className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void onDeleteChild()} disabled={deletingChild}>
                {deletingChild ? "Excluindo..." : "Confirmar exclusão"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
