"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { acceptLegal, completeOnboarding, getApiErrorMessage, getTasks } from "@/lib/api/client";

const TOTAL_STEPS = 6;
const ONBOARDING_DRAFT_KEY = "axiora_onboarding_draft";

type OnboardingDraft = {
  step: number;
  childName: string;
  splitSpend: number;
  splitSave: number;
  splitDonate: number;
  allowance: string;
  legalAccepted: boolean;
  parentPin: string;
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [childName, setChildName] = useState("Child 2");
  const [splitSpend, setSplitSpend] = useState(50);
  const [splitSave, setSplitSave] = useState(30);
  const [splitDonate, setSplitDonate] = useState(20);
  const [tasks, setTasks] = useState<Array<{ id: number; title: string; difficulty: string; weight: number }>>([]);
  const [allowance, setAllowance] = useState("10000");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [parentPin, setParentPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 3) return;
    getTasks()
      .then((data) =>
        setTasks(
          data
            .filter((item) => item.is_active)
            .map((item) => ({ id: item.id, title: item.title, difficulty: item.difficulty, weight: item.weight })),
        ),
      )
      .catch(() => setTasks([]));
  }, [step]);

  const splitTotal = useMemo(() => splitSpend + splitSave + splitDonate, [splitDonate, splitSave, splitSpend]);

  useEffect(() => {
    const raw = localStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
      if (typeof parsed.step === "number" && parsed.step >= 1 && parsed.step <= TOTAL_STEPS) setStep(parsed.step);
      if (typeof parsed.childName === "string") setChildName(parsed.childName);
      if (typeof parsed.splitSpend === "number") setSplitSpend(parsed.splitSpend);
      if (typeof parsed.splitSave === "number") setSplitSave(parsed.splitSave);
      if (typeof parsed.splitDonate === "number") setSplitDonate(parsed.splitDonate);
      if (typeof parsed.allowance === "string") setAllowance(parsed.allowance);
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
      splitSpend,
      splitSave,
      splitDonate,
      allowance,
      legalAccepted,
      parentPin,
    };
    localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
  }, [allowance, childName, legalAccepted, parentPin, splitDonate, splitSave, splitSpend, step]);

  const canAdvance = (currentStep: number): boolean => {
    if (currentStep === 1) return childName.trim().length > 0;
    if (currentStep === 2) return splitTotal === 100;
    if (currentStep === 4) {
      const monthlyAllowance = Number(allowance);
      return Number.isFinite(monthlyAllowance) && monthlyAllowance >= 0;
    }
    if (currentStep === 5) return legalAccepted;
    return true;
  };

  const getStepError = (currentStep: number): string | null => {
    if (currentStep === 1 && childName.trim().length === 0) return "Informe o nome da crianca.";
    if (currentStep === 2 && splitTotal !== 100) return "A divisao precisa somar 100.";
    if (currentStep === 4) {
      const monthlyAllowance = Number(allowance);
      if (!Number.isFinite(monthlyAllowance) || monthlyAllowance < 0) return "Allowance invalido.";
    }
    if (currentStep === 5 && !legalAccepted) return "Você precisa aceitar os Termos e a Privacidade para continuar.";
    return null;
  };

  const onFinish = async () => {
    setError(null);
    if (splitTotal !== 100) {
      setError("A divisao precisa somar 100.");
      return;
    }
    const monthlyAllowance = Number(allowance);
    if (!Number.isFinite(monthlyAllowance) || monthlyAllowance < 0) {
      setError("Allowance invalido.");
      return;
    }
    if (!legalAccepted) {
      setError("Você precisa aceitar os Termos e a Privacidade para continuar.");
      return;
    }
    if (parentPin.length < 4) {
      setError("PIN precisa ter ao menos 4 digitos.");
      return;
    }

    setLoading(true);
    try {
      await acceptLegal("v1");
      await completeOnboarding({
        child_name: childName,
        reward_split: {
          spend: splitSpend,
          save: splitSave,
          donate: splitDonate,
        },
        monthly_allowance_cents: monthlyAllowance,
        parent_pin: parentPin,
      });
      sessionStorage.setItem("axiora_parent_pin_ok", "1");
      localStorage.removeItem(ONBOARDING_DRAFT_KEY);
      router.push("/parent");
    } catch (err) {
      setError(getApiErrorMessage(err, "Nao foi possível concluir onboarding."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="safe-px safe-pb mx-auto min-h-screen w-full max-w-md p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Onboarding {step}/{TOTAL_STEPS}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {step === 1 ? (
            <div className="space-y-2">
              <p>Step 1: Create child</p>
              <Input value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="Child name" />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-2">
              <p>Step 2: Choose reward split</p>
              <div className="grid grid-cols-3 gap-2">
                <Input type="number" value={splitSpend} onChange={(e) => setSplitSpend(Number(e.target.value) || 0)} />
                <Input type="number" value={splitSave} onChange={(e) => setSplitSave(Number(e.target.value) || 0)} />
                <Input type="number" value={splitDonate} onChange={(e) => setSplitDonate(Number(e.target.value) || 0)} />
              </div>
              <p className="text-xs text-muted-foreground">SPEND / SAVE / DONATE (total {splitTotal})</p>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-2">
              <p>Step 3: Review default tasks</p>
              <div className="space-y-1">
                {tasks.map((task) => (
                  <div key={task.id} className="rounded-md border border-border px-2 py-1 text-xs">
                    {task.title} • {task.difficulty} • w{task.weight}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-2">
              <p>Step 4: Set monthly allowance</p>
              <Input type="number" value={allowance} onChange={(e) => setAllowance(e.target.value)} placeholder="10000" />
              <p className="text-xs text-muted-foreground">Valor em centavos.</p>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-3">
              <p>Step 5: Terms and Privacy</p>
              <div className="space-y-2 rounded-md border border-border p-3 text-xs text-muted-foreground">
                <p>
                  Ao continuar, você confirma que leu e aceita os Termos de Uso e a Politica de Privacidade do tenant.
                </p>
                <p>Resumo: uso educacional familiar, tratamento de dados de rotina e retencao conforme politica vigente.</p>
              </div>
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={legalAccepted}
                  onChange={(e) => setLegalAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border"
                />
                <span>Li e aceito os Termos e a Politica de Privacidade.</span>
              </label>
            </div>
          ) : null}

          {step === 6 ? (
            <div className="space-y-2">
              <p>Step 6: Set Parent PIN</p>
              <Input type="password" inputMode="numeric" value={parentPin} onChange={(e) => setParentPin(e.target.value)} />
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={step === 1 || loading} onClick={() => setStep((s) => s - 1)}>
              Back
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
                Next
              </Button>
            ) : (
              <Button type="button" disabled={loading} onClick={() => void onFinish()}>
                {loading ? "Finalizando..." : "Concluir"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
