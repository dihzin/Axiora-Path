"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Baby,
  Building2,
  LogOut,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createChild,
  createTask,
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
  const [childActionError, setChildActionError] = useState<string | null>(null);
  const [creatingChild, setCreatingChild] = useState(false);

  const [editingChildId, setEditingChildId] = useState<number | null>(null);
  const [editingChildName, setEditingChildName] = useState("");
  const [editingChildBirthYear, setEditingChildBirthYear] = useState("");
  const [editingChildTheme, setEditingChildTheme] = useState<ThemeName>("default");
  const [savingChild, setSavingChild] = useState(false);

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

  const clearLocalSession = (options?: { keepOrganization?: boolean }) => {
    clearTokens();
    if (!options?.keepOrganization) {
      clearTenantSlug();
    }
    localStorage.removeItem("axiora_child_id");
    localStorage.removeItem("axiora_child_name");
    sessionStorage.removeItem("axiora_parent_pin_ok");
  };

  const loadChildDashboard = async (childId: number) => {
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
  };

  const loadChildrenAndContext = async () => {
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
  };

  const loadTasks = async () => {
    try {
      setTasks(await getTasks());
      setTaskActionError(null);
    } catch (err) {
      setTasks([]);
      setTaskActionError(getApiErrorMessage(err, "Não foi possível carregar tarefas."));
    }
  };

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
  }, [allowed]);

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
      });
      setNewChildName("");
      setNewChildBirthYear("");
      setNewChildTheme("default");
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

  return (
    <main className="safe-px safe-pb mx-auto min-h-screen w-full max-w-md p-4 md:p-6">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Área dos pais</h1>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onGoChildMode}>
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

      <section className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crianças vinculadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {children.length === 0 ? <p className="text-muted-foreground">Nenhuma criança cadastrada ainda.</p> : null}
            {children.map((child) => (
              <div
                key={child.id}
                className={`rounded-md border px-2 py-2 ${selectedChildId === child.id ? "border-secondary bg-secondary/10" : "border-border"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{child.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Ano nascimento: {child.birth_year ?? "Não informado"} • Tema: {THEME_LABELS[child.theme]}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => void onSelectChild(child)}>
                      Selecionar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => startEditChild(child)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {editingChildId ? (
              <div className="rounded-md border border-border p-2">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Editar criança</p>
                <div className="grid grid-cols-1 gap-2">
                  <Input placeholder="Nome da criança" value={editingChildName} onChange={(e) => setEditingChildName(e.target.value)} />
                  <Input
                    placeholder="Ano de nascimento (opcional)"
                    inputMode="numeric"
                    value={editingChildBirthYear}
                    onChange={(e) => setEditingChildBirthYear(e.target.value)}
                  />
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editingChildTheme}
                    onChange={(e) => setEditingChildTheme(e.target.value as ThemeName)}
                  >
                    {THEME_OPTIONS.map((theme) => (
                      <option key={theme} value={theme}>
                        {THEME_LABELS[theme]}
                      </option>
                    ))}
                  </select>
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
                <Input placeholder="Nome da criança" value={newChildName} onChange={(e) => setNewChildName(e.target.value)} />
                <Input
                  placeholder="Ano de nascimento (opcional)"
                  inputMode="numeric"
                  value={newChildBirthYear}
                  onChange={(e) => setNewChildBirthYear(e.target.value)}
                />
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newChildTheme}
                  onChange={(e) => setNewChildTheme(e.target.value as ThemeName)}
                >
                  {THEME_OPTIONS.map((theme) => (
                    <option key={theme} value={theme}>
                      {THEME_LABELS[theme]}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={() => void onCreateChild()} disabled={creatingChild}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {creatingChild ? "Criando..." : "Criar acesso da criança"}
                </Button>
              </div>
            </div>
            {childActionError ? <p className="text-xs text-destructive">{childActionError}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aprovacoes pendentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
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
            {dashboardError ? <p className="text-xs text-destructive">{dashboardError}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo da carteira</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Total: {wallet ? `R$ ${(wallet.total_balance_cents / 100).toFixed(2)}` : "—"}</p>
            <p className="text-muted-foreground">Gastar: {wallet ? `R$ ${(wallet.pot_balances_cents.SPEND / 100).toFixed(2)}` : "—"}</p>
            <p className="text-muted-foreground">Guardar: {wallet ? `R$ ${(wallet.pot_balances_cents.SAVE / 100).toFixed(2)}` : "—"}</p>
            <p className="text-muted-foreground">Doar: {wallet ? `R$ ${(wallet.pot_balances_cents.DONATE / 100).toFixed(2)}` : "—"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo semanal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Conclusão</span>
              <TrendIndicator value={trend?.completion_delta_percent ?? 0} />
            </div>
            <div className="flex items-center justify-between">
              <span>Ganhos</span>
              <TrendIndicator value={trend?.earnings_delta_percent ?? 0} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cadastro de tarefas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="rounded-md border border-border p-2">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Criar tarefa</p>
              <div className="grid grid-cols-1 gap-2">
                <Input placeholder="Título da tarefa" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={newTaskDifficulty}
                    onChange={(e) => setNewTaskDifficulty(e.target.value as TaskOut["difficulty"])}
                  >
                    {DIFFICULTY_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {DIFFICULTY_LABELS[item]}
                      </option>
                    ))}
                  </select>
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
                    <Button size="sm" variant="outline" onClick={() => startEditTask(task)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void onDeleteTask(task.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {editingTaskId === task.id ? (
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    <Input value={editingTaskTitle} onChange={(e) => setEditingTaskTitle(e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={editingTaskDifficulty}
                        onChange={(e) => setEditingTaskDifficulty(e.target.value as TaskOut["difficulty"])}
                      >
                        {DIFFICULTY_OPTIONS.map((item) => (
                          <option key={item} value={item}>
                            {DIFFICULTY_LABELS[item]}
                          </option>
                        ))}
                      </select>
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

            {taskActionError ? <p className="text-xs text-destructive">{taskActionError}</p> : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
