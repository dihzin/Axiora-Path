"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type GameResultPanelProps = {
  title?: string;
  score?: number | null;
  correctAnswers?: number | null;
  wrongAnswers?: number | null;
  streak?: number | null;
  durationSeconds?: number | null;
  xpGained?: number | null;
  coinsGained?: number | null;
  isPersonalBest?: boolean;
  personalBestType?: string | null;
  rankingPosition?: number | null;
  rankingTotalPlayers?: number | null;
  rankingInTop?: boolean;
  leagueMessage?: string | null;
  onReplay: () => void;
  onBack: () => void;
  replayLabel?: string;
  backLabel?: string;
};

function metric(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value}${suffix}`;
}

export function GameResultPanel({
  title = "Sessão concluída",
  score,
  correctAnswers,
  wrongAnswers,
  streak,
  durationSeconds,
  xpGained,
  coinsGained,
  isPersonalBest,
  personalBestType,
  rankingPosition,
  rankingTotalPlayers,
  rankingInTop,
  leagueMessage,
  onReplay,
  onBack,
  replayLabel = "Jogar novamente",
  backLabel = "Voltar ao menu",
}: GameResultPanelProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <p>Score: <strong>{metric(score)}</strong></p>
          <p>Tempo: <strong>{metric(durationSeconds, "s")}</strong></p>
          <p>Acertos: <strong>{metric(correctAnswers)}</strong></p>
          <p>Erros: <strong>{metric(wrongAnswers)}</strong></p>
          <p>Streak: <strong>{metric(streak)}</strong></p>
          <p>XP ganho: <strong>{metric(xpGained)}</strong></p>
          <p>Moedas: <strong>{metric(coinsGained)}</strong></p>
        </div>
        {isPersonalBest ? (
          <p className="rounded-xl border border-secondary/40 bg-secondary/10 px-3 py-2 text-secondary">
            Novo recorde pessoal{personalBestType ? ` (${personalBestType})` : ""}.
          </p>
        ) : null}
        {rankingPosition ? (
          <p className="rounded-xl border border-[#7DE8C6]/35 bg-[#103E4E]/20 px-3 py-2 text-[#95FFDF]">
            Você está em #{rankingPosition}
            {rankingTotalPlayers ? ` de ${rankingTotalPlayers}` : ""} nesta semana
            {rankingInTop ? ". Top 10 alcançado!" : ". Continue jogando para subir!"}
          </p>
        ) : null}
        {leagueMessage ? (
          <p className="rounded-xl border border-[#FFDCA4]/35 bg-[#4D3216]/30 px-3 py-2 text-[#FFE2B8]">
            {leagueMessage}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button onClick={onReplay}>{replayLabel}</Button>
          <Button variant="outline" onClick={onBack}>{backLabel}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
