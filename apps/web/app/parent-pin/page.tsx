"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const PARENT_PIN = process.env.NEXT_PUBLIC_PARENT_PIN ?? "1234";

export default function ParentPinPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const savedPin = localStorage.getItem("axiora_parent_pin");
    const expectedPin = savedPin ?? PARENT_PIN;
    if (pin !== expectedPin) {
      setError("PIN invalido.");
      return;
    }
    sessionStorage.setItem("axiora_parent_pin_ok", "1");
    router.push("/parent");
  };

  return (
    <main className="safe-px safe-pb mx-auto flex min-h-screen w-full max-w-md items-center">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>PIN dos pais</CardTitle>
          <CardDescription>Confirme o PIN antes de acessar a area de pais.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onSubmit}>
            <Input
              placeholder="PIN"
              inputMode="numeric"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button className="w-full" type="submit">
              Continuar
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
