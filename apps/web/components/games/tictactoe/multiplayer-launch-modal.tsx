"use client";

import { QrCode, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  open: boolean;
  onSolo: () => void;
  onMulti: () => void;
};

export function MultiplayerLaunchModal({ open, onSolo, onMulti }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-foreground/50 p-3 sm:items-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Como você quer jogar?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <button
            className="axiora-chunky-btn axiora-chunky-btn--outline flex w-full items-center justify-between gap-3 rounded-[24px] p-4 text-left text-foreground"
            onClick={onSolo}
            type="button"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">1 jogador</p>
              <p className="text-xs text-muted-foreground">Jogue contra o Axion</p>
            </div>
            <Users className="h-4 w-4 text-primary" />
          </button>
          <button
            className="axiora-chunky-btn axiora-chunky-btn--outline flex w-full items-center justify-between gap-3 rounded-[24px] p-4 text-left text-foreground"
            onClick={onMulti}
            type="button"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">2 jogadores</p>
              <p className="text-xs text-muted-foreground">Convite privado por QR ou código</p>
            </div>
            <QrCode className="h-4 w-4 text-secondary" />
          </button>
          <Button className="w-full" variant="outline" onClick={onSolo}>
            Começar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
