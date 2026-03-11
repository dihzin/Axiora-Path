"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChildAvatar } from "@/components/child-avatar";
import { Input } from "@/components/ui/input";
import { ApiError, acceptLegal, completeOnboarding, getApiErrorMessage, getTasks, updateTask } from "@/lib/api/client";

const TOTAL_STEPS = 6;
const ONBOARDING_DRAFT_KEY = "axiora_onboarding_draft";
const STEP_TITLES = [
  "Perfil infantil",
  "Divisão de recompensas",
  "Revisão de tarefas",
  "Mesada mensal",
  "Termos e privacidade",
  "PIN dos pais",
] as const;

type OnboardingDraft = {
  step: number;
  childName: string;
  childAvatarKey: string | null;
  splitSpend: number;
  splitSave: number;
  splitDonate: number;
  allowance: string;
  legalAccepted: boolean;
  parentPin: string;
};

function parseBrlToCents(input: string): number | null {
  const normalized = input.replace(/\s/g, "").replace("R$", "").replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function formatCentsToBrl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function normalizeAllowanceInput(input: string): string {
  const stripped = input.replace(/[^\d,.\sR$]/g, "");
  return stripped;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [childName, setChildName] = useState("Criança 2");
  const [childAvatarKey, setChildAvatarKey] = useState<string | null>(null);
  const [splitSpend, setSplitSpend] = useState(50);
  const [splitSave, setSplitSave] = useState(30);
  const [splitDonate, setSplitDonate] = useState(20);
  const [tasks, setTasks] = useState<Array<{ id: number; title: string; difficulty: string; weight: number }>>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDifficulty, setEditingDifficulty] = useState<"EASY" | "MEDIUM" | "HARD" | "LEGENDARY">("EASY");
  const [editingWeight, setEditingWeight] = useState(10);
  const [savingTaskId, setSavingTaskId] = useState<number | null>(null);
  const [allowance, setAllowance] = useState("100,00");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [parentPin, setParentPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFocusStep = step === 5 || step === 6;
  const progressPercent = Math.max(0, Math.min(100, Math.round((step / TOTAL_STEPS) * 100)));

  const loadTasksForStep = () => {
    setTasksLoading(true);
    setTasksError(null);
    getTasks()
      .then((data) => {
        setTasks(
          data
            .filter((item) => item.is_active)
            .map((item) => ({ id: item.id, title: item.title, difficulty: item.difficulty, weight: item.weight, is_active: item.is_active })),
        );
        setEditingTaskId(null);
      })
      .catch((err: unknown) => {
        setTasks([]);
        if (err instanceof ApiError && err.status === 403) {
          setTasksError("As tarefas serão liberadas após validar os termos no passo 5.");
          return;
        }
        setTasksError(getApiErrorMessage(err, "Não foi possível carregar as tarefas padrão."));
      })
      .finally(() => {
        setTasksLoading(false);
      });
  };

  useEffect(() => {
    if (step !== 3) return;
    loadTasksForStep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const splitTotal = useMemo(() => splitSpend + splitSave + splitDonate, [splitDonate, splitSave, splitSpend]);

  const startTaskEdit = (task: { id: number; title: string; difficulty: string; weight: number }) => {
    setTasksError(null);
    setEditingTaskId(task.id);
    setEditingTitle(task.title);
    setEditingDifficulty(task.difficulty as "EASY" | "MEDIUM" | "HARD" | "LEGENDARY");
    setEditingWeight(task.weight);
  };

  const cancelTaskEdit = () => {
    setEditingTaskId(null);
    setEditingTitle("");
    setEditingDifficulty("EASY");
    setEditingWeight(10);
  };

  const saveTaskEdit = async (taskId: number) => {
    const trimmedTitle = editingTitle.trim();
    if (!trimmedTitle) {
      setTasksError("O título da tarefa não pode ficar vazio.");
      return;
    }
    if (!Number.isFinite(editingWeight) || editingWeight <= 0) {
      setTasksError("O peso da tarefa precisa ser maior que zero.");
      return;
    }

    const target = tasks.find((task) => task.id === taskId);
    if (!target) return;

    setSavingTaskId(taskId);
    setTasksError(null);
    try {
      const updated = await updateTask(taskId, {
        title: trimmedTitle,
        difficulty: editingDifficulty,
        weight: Math.round(editingWeight),
        is_active: true,
      });
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? { ...task, title: updated.title, difficulty: updated.difficulty, weight: updated.weight, is_active: updated.is_active }
            : task,
        ),
      );
      cancelTaskEdit();
    } catch (err) {
      setTasksError(getApiErrorMessage(err, "Não foi possível salvar a tarefa."));
    } finally {
      setSavingTaskId(null);
    }
  };

  useEffect(() => {
    const raw = localStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
      if (typeof parsed.step === "number" && parsed.step >= 1 && parsed.step <= TOTAL_STEPS) setStep(parsed.step);
      if (typeof parsed.childName === "string") setChildName(parsed.childName);
      if (typeof parsed.childAvatarKey === "string" || parsed.childAvatarKey === null) setChildAvatarKey(parsed.childAvatarKey ?? null);
      if (typeof parsed.splitSpend === "number") setSplitSpend(parsed.splitSpend);
      if (typeof parsed.splitSave === "number") setSplitSave(parsed.splitSave);
      if (typeof parsed.splitDonate === "number") setSplitDonate(parsed.splitDonate);
      if (typeof parsed.allowance === "string") {
        const raw = parsed.allowance.trim();
        if (/^\d+$/.test(raw) && raw.length >= 3) {
          // Compatibilidade com rascunho antigo salvo em centavos (ex.: "10000").
          setAllowance((Number(raw) / 100).toFixed(2).replace(".", ","));
        } else {
          setAllowance(raw);
        }
      }
      if (typeof parsed.legalAccepted === "boolean") setLegalAccepted(parsed.legalAccepted);
      if (typeof parsed.parentPin === "string") setParentPin(parsed.parentPin);
    } catch {
      localStorage.removeItem(ONBOARDING_DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    const draft: OnboardingDraft = {
      step,
      childName,
      childAvatarKey,
      splitSpend,
      splitSave,
      splitDonate,
      allowance,
      legalAccepted,
      parentPin,
    };
    localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
  }, [allowance, childAvatarKey, childName, legalAccepted, parentPin, splitDonate, splitSave, splitSpend, step]);

  const onAvatarFileChange = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem válido.");
      return;
    }
    if (file.size > 1_000_000) {
      setError("A foto deve ter até 1MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result || !result.startsWith("data:image/")) {
        setError("Não foi possível processar a foto.");
        return;
      }
      setChildAvatarKey(result);
      setError(null);
    };
    reader.onerror = () => setError("Falha ao carregar a foto selecionada.");
    reader.readAsDataURL(file);
  };

  const canAdvance = (currentStep: number): boolean => {
    if (currentStep === 1) return childName.trim().length > 0;
    if (currentStep === 2) return splitTotal === 100;
    if (currentStep === 4) {
      const monthlyAllowanceCents = parseBrlToCents(allowance);
      return monthlyAllowanceCents !== null;
    }
    if (currentStep === 5) return legalAccepted;
    if (currentStep === 6) return /^\d{4,6}$/.test(parentPin);
    return true;
  };

  const getStepError = (currentStep: number): string | null => {
    if (currentStep === 1 && childName.trim().length === 0) return "Informe o nome da criança.";
    if (currentStep === 2 && splitTotal !== 100) return "A divisao precisa somar 100.";
    if (currentStep === 4) {
      const monthlyAllowanceCents = parseBrlToCents(allowance);
      if (monthlyAllowanceCents === null) return "Mesada inválida. Exemplo: 100,00";
    }
    if (currentStep === 5 && !legalAccepted) return "Você precisa aceitar os Termos e a Privacidade para continuar.";
    if (currentStep === 6 && !/^\d{4,6}$/.test(parentPin)) return "Defina um PIN com 4 a 6 números.";
    return null;
  };

  const onFinish = async () => {
    setError(null);
    if (splitTotal !== 100) {
      setError("A divisao precisa somar 100.");
      return;
    }
    const monthlyAllowanceCents = parseBrlToCents(allowance);
    if (monthlyAllowanceCents === null) {
      setError("Mesada inválida. Exemplo: 100,00");
      return;
    }
    if (!legalAccepted) {
      setError("Você precisa aceitar os Termos e a Privacidade para continuar.");
      return;
    }
    if (!/^\d{4,6}$/.test(parentPin)) {
      setError("PIN inválido. Use 4 a 6 números.");
      return;
    }

    setLoading(true);
    try {
      await acceptLegal("v1");
      await completeOnboarding({
        child_name: childName,
        child_avatar_key: childAvatarKey,
        reward_split: {
          spend: splitSpend,
          save: splitSave,
          donate: splitDonate,
        },
        monthly_allowance_cents: monthlyAllowanceCents,
        parent_pin: parentPin,
      });
      sessionStorage.setItem("axiora_parent_pin_ok", "1");
      localStorage.removeItem(ONBOARDING_DRAFT_KEY);
      router.push("/parent");
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível concluir onboarding."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className={`axiora-brand-page safe-px safe-pb flex min-h-screen w-full max-w-none justify-center overflow-x-clip p-4 md:px-6 md:py-6 lg:px-8 ${
        isFocusStep ? "items-center" : "items-start"
      }`}
    >
      <div className="axiora-brand-content mx-auto flex w-full max-w-6xl justify-center">
      <Card
        className={`axiora-glass-card mx-auto w-full text-[#FFF4E7] ${
          isFocusStep ? "max-w-2xl shadow-[0_12px_32px_rgba(36,67,63,0.16)]" : "max-w-4xl"
        }`}
      >
        <CardHeader>
          <div className="space-y-2">
            <p className="axiora-kicker">Configuração inicial</p>
            <CardTitle className="break-words text-base leading-tight text-[#FFF4E7] [overflow-wrap:anywhere] md:text-xl">
              Passo {step}/{TOTAL_STEPS}: {STEP_TITLES[step - 1]}
            </CardTitle>
            <div
              role="progressbar"
              aria-label="Progresso do onboarding"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              className="h-2 w-full overflow-hidden rounded-full bg-[#19322F]/70"
            >
              <div className="h-full rounded-full bg-gradient-to-r from-[#FFBE85] via-[#FF7A2F] to-[#4F9D8A] transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm md:space-y-5 md:text-base">
          {step === 1 ? (
            <div className="space-y-2">
              <p className="break-words font-semibold leading-snug">Passo 1: Criar perfil infantil</p>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-white p-2">
                <ChildAvatar name={childName || "Criança"} avatarKey={childAvatarKey} size={56} />
                <div className="space-y-1">
                  <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#FFD8B8]">
                    <ImagePlus className="h-3.5 w-3.5" />
                    Enviar foto da criança
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onAvatarFileChange(e.target.files?.[0] ?? null)} />
                  </label>
                  {childAvatarKey ? (
                    <button type="button" className="text-xs font-semibold text-[#FF9A72]" onClick={() => setChildAvatarKey(null)}>
                      Remover foto
                    </button>
                  ) : (
                    <p className="break-words text-[11px] font-semibold text-muted-foreground [overflow-wrap:anywhere]">Opcional. Sem foto, usamos avatar amigável.</p>
                  )}
                </div>
              </div>
              <Input value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="Nome da criança" />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-2">
              <p className="break-words font-semibold leading-snug">Passo 2: Definir divisão de recompensas</p>
              <div className="grid grid-cols-3 gap-2">
                <Input type="number" aria-label="Percentual para gastar" value={splitSpend} onChange={(e) => setSplitSpend(Number(e.target.value) || 0)} />
                <Input type="number" aria-label="Percentual para guardar" value={splitSave} onChange={(e) => setSplitSave(Number(e.target.value) || 0)} />
                <Input type="number" aria-label="Percentual para doar" value={splitDonate} onChange={(e) => setSplitDonate(Number(e.target.value) || 0)} />
              </div>
              <p className="break-words text-xs text-[#E6D8C7]">GASTAR / GUARDAR / DOAR (total {splitTotal})</p>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-2">
              <p className="break-words font-semibold leading-snug">Passo 3: Revisar tarefas padrão</p>
              {tasksLoading ? <p role="status" aria-live="polite" className="text-xs text-[#E6D8C7]">Carregando tarefas...</p> : null}
              {tasksError ? (
                <div className="rounded-md border border-[#F4C5C2] bg-[#FFF2F1] p-2 text-xs text-[#B54C47]">
                  <p>{tasksError}</p>
                  <button
                    className="mt-2 rounded-md border border-[#F0A79F] bg-white px-2 py-1 font-semibold"
                    onClick={() => loadTasksForStep()}
                    type="button"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : null}
              {!tasksLoading && !tasksError && tasks.length === 0 ? <p className="text-xs text-[#E6D8C7]">Nenhuma tarefa ativa encontrada para esta organização.</p> : null}
              {!tasksLoading && tasks.length > 0 ? (
                <div className="space-y-1">
                  {tasks.map((task) => (
                    <div key={task.id} className="rounded-md border border-border p-2 text-xs break-words [overflow-wrap:anywhere]">
                      {editingTaskId === task.id ? (
                        <div className="space-y-2">
                          <Input value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)} placeholder="Título da tarefa" />
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={editingDifficulty}
                              onChange={(e) => setEditingDifficulty(e.target.value as "EASY" | "MEDIUM" | "HARD" | "LEGENDARY")}
                              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                            >
                              <option value="EASY">EASY</option>
                              <option value="MEDIUM">MEDIUM</option>
                              <option value="HARD">HARD</option>
                              <option value="LEGENDARY">LEGENDARY</option>
                            </select>
                            <Input
                              type="number"
                              min={1}
                              value={editingWeight}
                              onChange={(e) => setEditingWeight(Number(e.target.value) || 0)}
                              placeholder="Peso"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" disabled={savingTaskId === task.id} onClick={() => void saveTaskEdit(task.id)}>
                              {savingTaskId === task.id ? "Salvando..." : "Salvar"}
                            </Button>
                            <Button type="button" size="sm" variant="outline" disabled={savingTaskId === task.id} onClick={cancelTaskEdit}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs break-words [overflow-wrap:anywhere]">
                            {task.title} • {task.difficulty} • w{task.weight}
                          </p>
                          <Button type="button" size="sm" variant="outline" onClick={() => startTaskEdit(task)}>
                            Editar
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-2">
              <p className="break-words font-semibold leading-snug">Passo 4: Definir mesada mensal</p>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3">
                <span className="text-sm font-bold text-[#34557F]">R$</span>
                <Input
                  className="border-0 px-0 shadow-none focus-visible:ring-0"
                  inputMode="decimal"
                  value={allowance}
                  onChange={(e) => setAllowance(normalizeAllowanceInput(e.target.value))}
                  placeholder="100,00"
                />
              </div>
              <p className="break-words text-xs text-[#E6D8C7]">Digite o valor mensal em reais. Exemplo: 100,00</p>
              <p className="break-words text-xs font-semibold text-[#FFD8B8]">
                Valor informado: {parseBrlToCents(allowance) !== null ? formatCentsToBrl(parseBrlToCents(allowance) ?? 0) : "—"}
              </p>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#44605C] bg-[rgba(255,255,255,0.06)] p-3">
                <p className="break-words text-base font-black leading-tight text-[#FFF4E7]">Passo 5: Termos e Privacidade</p>
                <p className="mt-1 text-sm leading-relaxed text-[#E6D8C7]">
                  Antes de continuar, confirme o aceite dos termos para uso da plataforma no contexto familiar.
                </p>
              </div>
              <div className="space-y-2 rounded-lg border border-border bg-[rgba(255,255,255,0.04)] p-3 text-sm leading-relaxed text-[#EDE0D1]">
                <p>
                  Ao continuar, você confirma que leu e aceita os Termos de Uso e a Política de Privacidade da organização.
                </p>
                <p className="font-semibold">Resumo: uso educacional familiar, tratamento de dados de rotina e retenção conforme política vigente.</p>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#44605C] bg-[rgba(255,255,255,0.05)] p-3 text-sm font-semibold text-[#FFF0E1]">
                <input
                  type="checkbox"
                  checked={legalAccepted}
                  onChange={(e) => setLegalAccepted(e.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded border-border"
                />
                <span>Li e aceito os Termos e a Política de Privacidade.</span>
              </label>
            </div>
          ) : null}

          {step === 6 ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-[#44605C] bg-[rgba(255,255,255,0.06)] p-3">
                <p className="break-words text-base font-black leading-tight text-[#FFF4E7]">Passo 6: Definir PIN dos pais</p>
                <p className="mt-1 text-sm leading-relaxed text-[#E6D8C7]">Esse PIN protege ações sensíveis no app dos responsáveis.</p>
              </div>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                placeholder="Digite 4 a 6 números"
                value={parentPin}
                onChange={(e) => {
                  const digitsOnly = e.target.value.replace(/\D/g, "");
                  setParentPin(digitsOnly.slice(0, 6));
                }}
              />
              <p className="text-xs text-[#E6D8C7]">Padrão esperado: apenas números, com 4 a 6 dígitos.</p>
            </div>
          ) : null}

          {error ? <p role="alert" aria-live="polite" className="text-sm text-rose-300">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={step === 1 || loading} onClick={() => setStep((s) => s - 1)}>
              Voltar
            </Button>
            {step < TOTAL_STEPS ? (
              <Button
                type="button"
                disabled={loading || !canAdvance(step)}
                onClick={() => {
                  const stepError = getStepError(step);
                  if (stepError) {
                    setError(stepError);
                    return;
                  }
                  setError(null);
                  setStep((s) => s + 1);
                }}
              >
                Próximo
              </Button>
            ) : (
              <Button type="button" disabled={loading} onClick={() => void onFinish()}>
                {loading ? "Finalizando..." : "Concluir"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      </div>
    </main>
  );
}
