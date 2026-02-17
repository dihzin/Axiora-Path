"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { completeOnboarding, getTasks } from "@/lib/api/client";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [childName, setChildName] = useState("Child 2");
  const [splitSpend, setSplitSpend] = useState(50);
  const [splitSave, setSplitSave] = useState(30);
  const [splitDonate, setSplitDonate] = useState(20);
  const [tasks, setTasks] = useState<Array<{ id: number; title: string; difficulty: string; weight: number }>>([]);
  const [allowance, setAllowance] = useState("10000");
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
    if (parentPin.length < 4) {
      setError("PIN precisa ter ao menos 4 digitos.");
      return;
    }

    setLoading(true);
    try {
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
      localStorage.setItem("axiora_parent_pin", parentPin);
      sessionStorage.setItem("axiora_parent_pin_ok", "1");
      router.push("/parent");
    } catch {
      setError("Nao foi possivel concluir onboarding.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="safe-px safe-pb mx-auto min-h-screen w-full max-w-md py-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Onboarding {step}/5</CardTitle>
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
            <div className="space-y-2">
              <p>Step 5: Set Parent PIN</p>
              <Input type="password" inputMode="numeric" value={parentPin} onChange={(e) => setParentPin(e.target.value)} />
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={step === 1 || loading} onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
            {step < 5 ? (
              <Button type="button" disabled={loading} onClick={() => setStep((s) => s + 1)}>
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

