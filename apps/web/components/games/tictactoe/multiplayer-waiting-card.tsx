"use client";

import { Copy, QrCode } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  joinCode: string;
  joinUrl: string;
  waiting: boolean;
  onRefresh: () => void;
};

function qrUrl(value: string): string {
  const data = encodeURIComponent(value);
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${data}`;
}

export function MultiplayerWaitingCard({ joinCode, joinUrl, waiting, onRefresh }: Props) {
  return (
    <Card className="mb-3">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <QrCode className="h-4 w-4 text-secondary" />
          Convide o segundo jogador
        </div>
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-muted/30 p-3">
          <div className="relative h-[160px] w-[160px] overflow-hidden rounded-xl border border-border bg-white p-2">
            <Image alt="QR da partida" src={qrUrl(joinUrl)} fill sizes="160px" className="object-contain p-2" unoptimized />
          </div>
          <p className="text-xs text-muted-foreground">Escaneie o QR para entrar na partida</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Código manual</p>
          <p className="text-lg font-extrabold tracking-[0.2em] text-foreground">{joinCode}</p>
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(joinCode);
            }}
          >
            <Copy className="mr-1 h-4 w-4" />
            Copiar código
          </Button>
          <Button className="flex-1" type="button" onClick={onRefresh}>
            {waiting ? "Aguardando jogador..." : "Atualizar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
