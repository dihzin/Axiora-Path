"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Coins, Crown, Flame, Grid2x2, MapPinned, PiggyBank, Rocket, Search, Sparkles, Trophy } from "lucide-react";
import type { ComponentType } from "react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  getAchievements,
  getAxionBrief,
  getGamesCatalog,
  getLevels,
  getStoreItems,
  startGameEngineSession,
  type AchievementItem,
  type GameCatalogItem,
  type LevelResponse,
} from "@/lib/api/client";

type GameItem = {
  id: string;
  href: string;
  templateId?: string;
  playable?: boolean;
  status?: "AVAILABLE" | "COMING_SOON" | "BETA" | "LOCKED";
  title: string;
  description: string;
  skill: string;
  difficulty: "Fácil" | "Médio" | "Difícil";
  xpReward: number;
  icon: ComponentType<{ className?: string }>;
};

const GAMES: GameItem[] = [
  {
    id: "tic-tac-toe",
    href: "/child/games/tictactoe",
    title: "Jogo da Velha",
    description: "Treine lógica, antecipação e tomada de decisão em partidas rápidas.",
    skill: "Lógica e estratégia",
    difficulty: "Fácil",
    xpReward: 50,
    icon: Grid2x2,
  },
  {
    id: "word-search",
    href: "/child/games/wordsearch",
    title: "Caça-palavras",
    description: "Encontre palavras por tema em grades dinâmicas com seleção por arraste.",
    skill: "Vocabulário e foco",
    difficulty: "Médio",
    xpReward: 130,
    icon: Search,
  },
  {
    id: "finance-sim",
    href: "/child/games/finance-sim",
    title: "Mesada Inteligente",
    description: "Simule decisões financeiras em 5 rodadas com eventos surpresa.",
    skill: "Educação financeira",
    difficulty: "Médio",
    xpReward: 80,
    icon: PiggyBank,
  },
];

function difficultyLabel(difficulty: string): "Fácil" | "Médio" | "Difícil" {
  const value = difficulty.toUpperCase();
  if (value === "EASY") return "Fácil";
  if (value === "HARD") return "Difícil";
  return "Médio";
}

function iconForGame(item: GameCatalogItem): ComponentType<{ className?: string }> {
  const title = item.title.trim().toLowerCase();
  if (title === "corrida da soma") return Rocket;
  if (title === "mapa de capitais") return MapPinned;
  const subject = item.subject.toLowerCase();
  if (subject.includes("financeira")) return PiggyBank;
  if (subject.includes("portugu")) return Search;
  if (subject.includes("matem")) return Grid2x2;
  if (item.engineKey.toUpperCase() === "STRATEGY") return Grid2x2;
  if (item.engineKey.toUpperCase() === "MEMORY") return Search;
  if (item.engineKey.toUpperCase() === "SIMULATION") return PiggyBank;
  if (item.engineKey.toUpperCase() === "DRAG_DROP") return Search;
  return Grid2x2;
}

function resolveCatalogRoute(item: GameCatalogItem): string | null {
  const title = item.title.trim().toLowerCase();
  if (title === "corrida da soma") return "/child/games/quiz";
  if (title === "mapa de capitais") return "/child/games/memory";
  if (title === "mercado do troco") return "/child/games/finance-sim";
  if (title === "caça-palavras") return "/child/games/wordsearch";

  const key = item.engineKey.toUpperCase();
  if (key === "QUIZ") return "/child/games/quiz";
  if (key === "MEMORY") return "/child/games/memory";
  if (key === "SIMULATION") return "/child/games/finance-sim";
  if (key === "DRAG_DROP") return "/child/games/wordsearch";
  if (key === "STRATEGY") return "/child/games/tictactoe";

  return item.playRoute;
}

function buildPlayHref(game: GameItem): string {
  if (!game.templateId) return game.href;
  const separator = game.href.includes("?") ? "&" : "?";
  return `${game.href}${separator}templateId=${encodeURIComponent(game.templateId)}`;
}

function statusLabel(status?: GameItem["status"]): string {
  if (status === "AVAILABLE") return "Disponível";
  if (status === "BETA") return "Beta";
  if (status === "LOCKED") return "Bloqueado";
  return "Em breve";
}

export default function ChildGamesPage() {
  const router = useRouter();
  const [childId, setChildId] = useState<number | null>(null);
  const [levelData, setLevelData] = useState<LevelResponse | null>(null);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [axionCoins, setAxionCoins] = useState(0);
  const [dailyXp, setDailyXp] = useState(0);
  const [weeklyXp, setWeeklyXp] = useState(0);
  const [catalogGames, setCatalogGames] = useState<GameItem[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "remote" | "fallback">("loading");
  const [startingId, setStartingId] = useState<string | null>(null);
  const weeklyGoal = 350;

  useEffect(() => {
    void getAxionBrief({ context: "games_tab" }).catch(() => undefined);
  }, []);

  const refreshLocalXpMetrics = useCallback((activeChildId: number) => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const dailyRaw = localStorage.getItem(`axiora_game_daily_xp_${activeChildId}_${todayIso}`);
    const parsedDaily = Number(dailyRaw ?? "0");
    setDailyXp(Number.isFinite(parsedDaily) ? Math.max(0, parsedDaily) : 0);

    const rawWeekly = localStorage.getItem(`axiora_game_weekly_xp_${activeChildId}`);
    if (!rawWeekly) {
      setWeeklyXp(0);
      return;
    }
    try {
      const parsed = JSON.parse(rawWeekly) as { weekStart: string; xp: number };
      const now = new Date();
      const day = (now.getDay() + 6) % 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - day);
      monday.setHours(0, 0, 0, 0);
      const currentWeekStart = monday.toISOString().slice(0, 10);
      if (parsed.weekStart !== currentWeekStart) {
        setWeeklyXp(0);
        return;
      }
      setWeeklyXp(Number.isFinite(parsed.xp) ? Math.max(0, parsed.xp) : 0);
    } catch {
      setWeeklyXp(0);
    }
  }, []);

  const refreshRemoteStats = useCallback((activeChildId: number) => {
    void getLevels(activeChildId)
      .then((data) => setLevelData(data))
      .catch(() => setLevelData(null));

    void getAchievements(activeChildId)
      .then((data) => setAchievements(data.achievements.filter((item) => item.unlocked)))
      .catch(() => setAchievements([]));

    void getStoreItems()
      .then((data) => setAxionCoins(data.coins))
      .catch(() => setAxionCoins(0));
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("axiora_child_id");
    const parsed = Number(raw);
    if (!raw || !Number.isFinite(parsed)) return;
    setChildId(parsed);
    refreshLocalXpMetrics(parsed);
    refreshRemoteStats(parsed);
  }, [refreshLocalXpMetrics, refreshRemoteStats]);

  useEffect(() => {
    if (childId === null) return;
    const onFocus = () => {
      refreshLocalXpMetrics(childId);
      refreshRemoteStats(childId);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        onFocus();
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key) return;
      if (event.key.startsWith(`axiora_game_daily_xp_${childId}_`) || event.key === `axiora_game_weekly_xp_${childId}`) {
        refreshLocalXpMetrics(childId);
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, [childId, refreshLocalXpMetrics, refreshRemoteStats]);

  useEffect(() => {
    let active = true;
    setCatalogState("loading");
    void getGamesCatalog({ limit: 12 })
      .then((response) => {
        if (!active) return;
        const mapped = response.items.reduce<GameItem[]>((acc, item) => {
          const href = resolveCatalogRoute(item);
          acc.push({
            id: item.templateId,
            href: href ?? "#",
            templateId: item.templateId,
            playable: item.status === "AVAILABLE" && href !== null,
            status: item.status,
            title: item.title,
            description: item.description,
            skill: item.tags.length > 0 ? item.tags.slice(0, 2).join(" • ") : item.subject,
            difficulty: difficultyLabel(item.difficulty),
            xpReward: item.xpReward,
            icon: iconForGame(item),
          });
          return acc;
        }, []);
        setCatalogGames(mapped);
        setCatalogState(mapped.length > 0 ? "remote" : "fallback");
      })
      .catch(() => {
        if (!active) return;
        setCatalogGames([]);
        setCatalogState("fallback");
      });
    return () => {
      active = false;
    };
  }, []);

  const games = catalogState === "remote" ? catalogGames : catalogState === "fallback" ? GAMES : [];
  const availableGames = games.filter((game) => game.playable !== false);
  const upcomingGames = games.filter((game) => game.playable === false);

  return (
    <PageShell tone="child" width="wide">
      <Card className="mb-4 overflow-hidden border-border bg-[radial-gradient(circle_at_85%_15%,rgba(255,107,61,0.18),transparent_50%),linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] shadow-[0_2px_0_rgba(184,200,239,0.7),0_14px_28px_rgba(34,63,107,0.12)]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg">Arena de Jogos</CardTitle>
            <span className="inline-flex items-center gap-1 rounded-full border border-secondary/30 bg-secondary/10 px-2 py-0.5 text-xs font-semibold text-secondary">
              <Crown className="h-3.5 w-3.5" />
              Nível {levelData?.level ?? 1}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-2xl border border-border bg-white/90 p-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Progresso de XP</span>
              <span className="font-semibold text-foreground">{Math.round(levelData?.level_progress_percent ?? 0)}%</span>
            </div>
            <ProgressBar value={levelData?.level_progress_percent ?? 0} tone="secondary" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-border bg-white/90 p-3">
              <p className="text-xs text-muted-foreground">XP de hoje</p>
              <p className="mt-1 text-lg font-extrabold text-foreground">{dailyXp}</p>
              <p className="mt-1 text-[10px] font-semibold text-muted-foreground">Atualiza ao concluir partidas</p>
            </div>
            <div className="rounded-2xl border border-border bg-white/90 p-3">
              <p className="text-xs text-muted-foreground">Meta semanal</p>
              <p className="mt-1 text-lg font-extrabold text-foreground">{weeklyXp}/{weeklyGoal}</p>
              <ProgressBar value={(weeklyXp / weeklyGoal) * 100} tone="secondary" />
            </div>
            <div className="rounded-2xl border border-accent/35 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,245,236,0.96)_100%)] p-3">
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Coins className="h-3.5 w-3.5 text-accent-foreground" />
                AxionCoins
              </p>
              <p className="mt-1 text-lg font-extrabold text-accent-foreground">{axionCoins}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="mb-4 rounded-3xl border border-border bg-[linear-gradient(105deg,rgba(14,165,164,0.16),rgba(255,255,255,0.92)_35%,rgba(255,107,61,0.16))] p-4 shadow-[0_2px_0_rgba(184,200,239,0.68)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Desafio da semana</p>
            <p className="mt-1 text-sm font-bold text-foreground">Conquiste 350 XP em jogos educativos</p>
          </div>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-border bg-white/90">
            <Flame className="h-4 w-4 text-accent" />
          </span>
        </div>
        <div className="mt-3">
          <ProgressBar value={(weeklyXp / weeklyGoal) * 100} tone="primary" />
        </div>
      </section>

      <section className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-secondary" />
          <p className="text-sm font-bold text-foreground">Conquistas</p>
        </div>
        <div className="games-achievements-scroll">
          {(achievements.length > 0 ? achievements : [{ id: -1, title: "Primeira vitória", description: "Ganhe uma partida no Jogo da Velha", slug: "", icon_key: "", unlocked: false, unlocked_at: null }]).map((achievement) => (
            <article key={achievement.id} className="games-achievement-pill">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-secondary/15 text-xs font-extrabold text-secondary">
                {(achievement.title || "A").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{achievement.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">{achievement.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3 pb-24">
        {catalogState === "loading" ? (
          <article className="rounded-2xl border border-border bg-white/85 p-3 text-xs text-muted-foreground">
            Carregando catálogo de jogos...
          </article>
        ) : null}
        {catalogState === "fallback" ? (
          <article className="rounded-2xl border border-border bg-white/85 p-3 text-xs text-muted-foreground">
            Catálogo online indisponível no momento. Exibindo jogos locais para você continuar.
          </article>
        ) : null}
        {availableGames.length > 0 ? <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Disponíveis agora</p> : null}
        {availableGames.map((game) => {
          const Icon = game.icon;
          return (
            <article key={game.id} className="games-gradient-shell games-gradient-shell--brand">
              <div className="games-gradient-shell__inner">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-white shadow-[0_2px_0_rgba(184,200,239,0.72)]">
                    <Icon className="h-5 w-5 stroke-[2.6] text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-foreground">{game.title}</p>
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{game.difficulty}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{game.description}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-secondary/30 bg-secondary/10 px-2 py-0.5 text-[10px] font-semibold text-secondary">
                        <Sparkles className="h-3 w-3" />
                        +{game.xpReward} XP
                      </span>
                      <span className="truncate text-[11px] font-medium text-foreground/80">{game.skill}</span>
                    </div>
                    <Button
                      className="games-play-button mt-3 w-full"
                      size="sm"
                      disabled={startingId === game.id}
                      onClick={async () => {
                        const nextHref = buildPlayHref(game);
                        if (!game.templateId) {
                          router.push(nextHref);
                          return;
                        }
                        localStorage.setItem(
                          "axiora_active_game_engine_session",
                          JSON.stringify({
                            sessionId: null,
                            templateId: game.templateId,
                            title: game.title,
                            href: game.href,
                            startedAt: new Date().toISOString(),
                          }),
                        );
                        try {
                          setStartingId(game.id);
                          const started = await startGameEngineSession({ templateId: game.templateId });
                          localStorage.setItem(
                            "axiora_active_game_engine_session",
                            JSON.stringify({
                              sessionId: started.sessionId,
                              templateId: game.templateId,
                              title: game.title,
                              href: game.href,
                              startedAt: new Date().toISOString(),
                            }),
                          );
                        } catch {
                          // fallback: mantém navegação para rota já mapeada pelo backend
                        } finally {
                          setStartingId(null);
                          router.push(nextHref);
                        }
                      }}
                    >
                      Jogar
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
        {upcomingGames.length > 0 ? <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Em breve</p> : null}
        {upcomingGames.map((game) => {
          const Icon = game.icon;
          return (
            <article key={game.id} className="games-gradient-shell games-gradient-shell--brand games-gradient-shell--muted">
              <div className="games-gradient-shell__inner">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-white shadow-[0_2px_0_rgba(184,200,239,0.72)]">
                    <Icon className="h-5 w-5 stroke-[2.6] text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-foreground">{game.title}</p>
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{statusLabel(game.status)}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{game.description}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-secondary/30 bg-secondary/10 px-2 py-0.5 text-[10px] font-semibold text-secondary">
                        <Sparkles className="h-3 w-3" />
                        +{game.xpReward} XP
                      </span>
                      <span className="truncate text-[11px] font-medium text-foreground/80">{game.skill}</span>
                    </div>
                    <Button
                      className="games-play-button mt-3 w-full"
                      size="sm"
                      disabled
                    >
                      Em breve
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <ChildBottomNav />
    </PageShell>
  );
}
