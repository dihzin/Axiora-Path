"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage, verifyParentPin } from "@/lib/api/client";

export default function ParentPinPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await verifyParentPin(pin);
      if (!result.verified) {
        setError("PIN invalido.");
        return;
      }
      sessionStorage.setItem("axiora_parent_pin_ok", "1");
      router.push("/parent");
    } catch (err) {
      setError(getApiErrorMessage(err, "Nao foi possível validar PIN agora."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="safe-px safe-pb mx-auto flex min-h-screen w-full max-w-md items-center p-4 md:p-6">
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
              disabled={loading}
              required
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Validando..." : "Continuar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
