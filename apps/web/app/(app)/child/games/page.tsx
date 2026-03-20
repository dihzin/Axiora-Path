"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Sparkles, Trophy } from "lucide-react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { ChildDesktopShell } from "@/components/child-desktop-shell";
import { GamesBadgeStrip } from "@/components/games/games-badge-strip";
import { GameHubCard } from "@/components/games/game-hub-card";
import { GamesMissionCard } from "@/components/games/games-mission-card";
import { GameOnboardingModal } from "@/components/games/onboarding/game-onboarding-modal";
import { GamesRankingCard } from "@/components/games/games-ranking-card";
import { GamesLeagueCard } from "@/components/games/games-league-card";
import { GameSkillSection } from "@/components/games/game-skill-section";
import {
  GAMES_SKILL_GROUPS,
  resolveGameHubMeta,
  type GameSkillGroupKey,
} from "@/components/games/games-hub-config";
import {
  GAMES,
  GAMES_WALLPAPER_SRC,
  LOCAL_TICTACTOE_GAME,
  buildPlayHref,
  difficultyLabel,
  iconForGame,
  resolveCatalogRoute,
  resolveGameIdForPersonalBest,
  statusLabel,
  type GameItem,
} from "@/components/games/games-hub-data";
import { GamesHero } from "@/components/games/games-hero";
import { GamesProgressPanel } from "@/components/games/games-progress-panel";
import { GamesRecommendationCard } from "@/components/games/games-recommendation-card";
import { GamesStreakCard } from "@/components/games/games-streak-card";
import { PersonalBestHighlight } from "@/components/games/personal-best-highlight";
import { PageShell } from "@/components/layout/page-shell";
import { TopStatsBar } from "@/components/trail/TopStatsBar";
import { Button } from "@/components/ui/button";
import {
  claimGamesMetagameMission,
  claimGamesLeagueReward,
  getGameWeeklyRanking,
  getAprenderLearningProfile,
  getAchievements,
  getGamePersonalBests,
  getGamesCatalog,
  getGamesMetagameSummary,
  getGamesLeagueSummary,
  getMyGamesRanking,
  getLevels,
  getStoreItems,
  getStreak,
  startGameEngineSession,
  trackAxionSessionStarted,
  type AchievementItem,
  type GamePersonalRankingResponse,
  type GameWeeklyRankingResponse,
  type GameLeagueSummaryResponse,
  type GameMetagameSummaryResponse,
  type GamePersonalBestResponse,
  type LevelResponse,
} from "@/lib/api/client";
import { buildOnboardingLaunchParams, mergeHrefWithParams, type GameOnboardingConfig } from "@/lib/games/onboarding";

type HubGame = GameItem & {
  meta: ReturnType<typeof resolveGameHubMeta>;
  playHref: string;
  personalBest: GamePersonalBestResponse | null;
};

function isTicTacToeGame(game: Pick<GameItem, "href" | "title">): boolean {
  return game.href === "/child/games/tictactoe" || game.title.trim().toLowerCase() === "jogo da velha";
}

export default function ChildGamesPage() {
  const router = useRouter();
  const sessionStartedLoggedRef = useRef<string | null>(null);
  const recommendationRef = useRef<HTMLDivElement | null>(null);
  const [childId, setChildId] = useState<number | null>(null);
  const [axionDecisionId, setAxionDecisionId] = useState<string | null>(null);
  const [levelData, setLevelData] = useState<LevelResponse | null>(null);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [axionCoins, setAxionCoins] = useState(0);
  const [metagame, setMetagame] = useState<GameMetagameSummaryResponse | null>(null);
  const [weeklyRanking, setWeeklyRanking] = useState<GameWeeklyRankingResponse | null>(null);
  const [personalRanking, setPersonalRanking] = useState<GamePersonalRankingResponse | null>(null);
  const [leagueSummary, setLeagueSummary] = useState<GameLeagueSummaryResponse | null>(null);
  const [personalBests, setPersonalBests] = useState<GamePersonalBestResponse[]>([]);
  const [catalogGames, setCatalogGames] = useState<GameItem[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "remote" | "fallback">("loading");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [onboardingGame, setOnboardingGame] = useState<HubGame | null>(null);
  const [catalogFilter, setCatalogFilter] = useState<"all" | "available" | "upcoming">("all");
  const [activeSessionHint, setActiveSessionHint] = useState<{ href?: string; title?: string; templateId?: string | null } | null>(null);
  const [claimingScope, setClaimingScope] = useState<"daily" | "weekly" | null>(null);
  const [claimingLeague, setClaimingLeague] = useState(false);
  const [shellStreak, setShellStreak] = useState(0);
  const [shellGems, setShellGems] = useState(0);
  const [shellXpPercent, setShellXpPercent] = useState(0);

  const refreshRemoteStats = useCallback((activeChildId: number) => {
    void getLevels(activeChildId).then(setLevelData).catch(() => setLevelData(null));
    void getAchievements(activeChildId)
      .then((data) => setAchievements(data.achievements.filter((item) => item.unlocked)))
      .catch(() => setAchievements([]));
    void getStoreItems().then((data) => setAxionCoins(data.coins)).catch(() => setAxionCoins(0));
    void getGamePersonalBests(activeChildId).then(setPersonalBests).catch(() => setPersonalBests([]));
    void getGamesMetagameSummary(activeChildId).then(setMetagame).catch(() => setMetagame(null));
    void getMyGamesRanking(activeChildId, 5).then(setPersonalRanking).catch(() => setPersonalRanking(null));
    const browserTimezone =
      typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
    void getGamesLeagueSummary(activeChildId, browserTimezone).then(setLeagueSummary).catch(() => setLeagueSummary(null));
    void getStreak(activeChildId)
      .then((data) => setShellStreak(Math.max(0, data.current)))
      .catch(() => setShellStreak(0));
    void getAprenderLearningProfile()
      .then((data) => {
        setShellGems(Math.max(0, Math.round(data.axionCoins ?? 0)));
        setShellXpPercent(Math.max(0, Math.min(100, Math.round(data.xpLevelPercent ?? 0))));
      })
      .catch(() => {
        setShellGems(0);
        setShellXpPercent(0);
      });
  }, []);

  const refreshActiveSessionHint = useCallback(() => {
    try {
      const raw = localStorage.getItem("axiora_active_game_engine_session");
      if (!raw) {
        setActiveSessionHint(null);
        return;
      }
      const parsed = JSON.parse(raw) as { href?: string; title?: string; templateId?: string | null };
      setActiveSessionHint(parsed);
    } catch {
      setActiveSessionHint(null);
    }
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem("axiora_child_id");
    const parsed = Number(raw);
    if (!raw || !Number.isFinite(parsed)) return;
    const fromQuery = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("decision_id") : null;
    const stored = localStorage.getItem("axion_active_decision_id") || sessionStorage.getItem("axion_active_decision_id");
    const resolvedDecisionId = fromQuery?.trim() || stored?.trim() || null;
    if (resolvedDecisionId) setAxionDecisionId(resolvedDecisionId);
    setChildId(parsed);
    refreshRemoteStats(parsed);
    refreshActiveSessionHint();
  }, [refreshActiveSessionHint, refreshRemoteStats]);

  useEffect(() => {
    if (!axionDecisionId) return;
    if (sessionStartedLoggedRef.current === axionDecisionId) return;
    sessionStartedLoggedRef.current = axionDecisionId;
    void trackAxionSessionStarted({
      decisionId: axionDecisionId,
      destination: "games",
      context: "child_tab",
    }).catch(() => {
      sessionStartedLoggedRef.current = null;
    });
  }, [axionDecisionId]);

  useEffect(() => {
    if (childId === null) return;
    const onFocus = () => {
      refreshRemoteStats(childId);
      refreshActiveSessionHint();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key) return;
      if (
        event.key === "axiora_active_game_engine_session"
      ) {
        refreshActiveSessionHint();
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
  }, [childId, refreshActiveSessionHint, refreshRemoteStats]);

  useEffect(() => {
    let active = true;
    setCatalogState("loading");
    setCatalogGames([]);
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
            estimatedMinutes: item.estimatedMinutes,
          });
          return acc;
        }, []);
        if (mapped.length === 0) {
          setCatalogGames([]);
          setCatalogState("fallback");
          return;
        }
        const remoteByTitle = new Set(mapped.map((game) => game.title.toLowerCase()));
        const merged = [...mapped, ...GAMES.filter((game) => !remoteByTitle.has(game.title.toLowerCase()))];
        const normalized = merged.filter((game) => !isTicTacToeGame(game));
        const remoteTicTacToe = merged.find((game) => isTicTacToeGame(game) && game.playable !== false);
        const tictactoe = remoteTicTacToe
          ? { ...remoteTicTacToe, href: "/child/games/tictactoe", playable: true as const }
          : LOCAL_TICTACTOE_GAME;
        const withTicTacToe = [tictactoe, ...normalized];
        const deduped = withTicTacToe.filter(
          (game, index, list) =>
            list.findIndex((candidate) => candidate.id === game.id || (candidate.title === game.title && candidate.href === game.href)) ===
            index,
        );
        setCatalogGames(deduped);
        setCatalogState("remote");
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

  const games = useMemo(
    () => (catalogState === "remote" ? catalogGames : catalogState === "fallback" ? GAMES : []),
    [catalogGames, catalogState],
  );

  const personalBestByGameId = useMemo(() => {
    return personalBests.reduce<Record<string, GamePersonalBestResponse>>((acc, item) => {
      acc[item.gameId] = item;
      return acc;
    }, {});
  }, [personalBests]);

  const hubGames = useMemo<HubGame[]>(
    () =>
      games.map((game) => {
        const meta = resolveGameHubMeta({
          title: game.title,
          href: game.href,
          description: game.description,
          estimatedMinutes: game.estimatedMinutes,
        });
        const gameId = meta.gameId ?? resolveGameIdForPersonalBest(game.href);
        return {
          ...game,
          playHref: buildPlayHref(game),
          meta: { ...meta, gameId },
          personalBest: gameId ? (personalBestByGameId[gameId] ?? null) : null,
        };
      }),
    [games, personalBestByGameId],
  );

  const availableGames = useMemo(() => hubGames.filter((game) => game.playable !== false), [hubGames]);
  const upcomingGames = useMemo(() => hubGames.filter((game) => game.playable === false), [hubGames]);
  const visibleAvailable = catalogFilter === "upcoming" ? [] : availableGames;
  const visibleUpcoming = catalogFilter === "available" ? [] : upcomingGames;

  const activeSessionGame = useMemo(() => {
    if (!activeSessionHint) return null;
    return availableGames.find((game) => {
      if (activeSessionHint.templateId && game.templateId && activeSessionHint.templateId === game.templateId) return true;
      if (activeSessionHint.href && activeSessionHint.href === game.href) return true;
      if (activeSessionHint.title && activeSessionHint.title.trim().toLowerCase() === game.title.trim().toLowerCase()) return true;
      return false;
    });
  }, [activeSessionHint, availableGames]);

  const gameTitleById = useMemo(() => {
    return availableGames.reduce<Record<string, string>>((acc, game) => {
      if (game.meta.gameId) acc[game.meta.gameId] = game.title;
      return acc;
    }, {});
  }, [availableGames]);

  const favoriteGameId = metagame?.stats.favoriteGameId ?? null;
  const favoriteGameLabel = favoriteGameId ? (gameTitleById[favoriteGameId] ?? null) : null;
  const dailyXp = metagame?.stats.xpToday ?? 0;
  const weeklyXp = metagame?.stats.xpWeek ?? 0;
  const weeklyGoal = metagame?.weeklyMission.metric === "xp" ? metagame.weeklyMission.target : 350;
  const totalSessionsLabelValue = metagame ? metagame.stats.totalSessions : null;

  const recommendedGame = useMemo(() => {
    if (activeSessionGame) {
      return { game: activeSessionGame, reason: "Continue de onde parou para manter sua sequência.", ctaLabel: "Continuar partida" };
    }
    const bestToBeat = availableGames.find((game) => game.personalBest !== null);
    if (bestToBeat) {
      return { game: bestToBeat, reason: "Você já tem recorde aqui. Tente bater sua melhor marca.", ctaLabel: "Bater recorde" };
    }
    const quickGame = [...availableGames].sort((a, b) => (a.estimatedMinutes ?? 4) - (b.estimatedMinutes ?? 4))[0] ?? null;
    if (quickGame) {
      return { game: quickGame, reason: "Partida rápida para aquecer seu raciocínio agora.", ctaLabel: "Partida rápida" };
    }
    return null;
  }, [activeSessionGame, availableGames]);

  useEffect(() => {
    if (childId === null) return;
    const gameId = recommendedGame?.game.meta.gameId ?? availableGames[0]?.meta.gameId ?? null;
    if (!gameId) {
      setWeeklyRanking(null);
      return;
    }
    const browserTimezone =
      typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
    void getGameWeeklyRanking(gameId, childId, 10, browserTimezone)
      .then(setWeeklyRanking)
      .catch(() => setWeeklyRanking(null));
  }, [availableGames, childId, recommendedGame]);

  const groupedAvailableGames = useMemo(() => {
    return visibleAvailable.reduce<Record<GameSkillGroupKey, HubGame[]>>(
      (acc, game) => {
        acc[game.meta.skillGroup].push(game);
        return acc;
      },
      { calculo: [], estrategia: [], memoria: [], financeiro: [] },
    );
  }, [visibleAvailable]);

  const bestPersonalBest = useMemo(() => {
    if (personalBests.length === 0) return null;
    return [...personalBests].sort((a, b) => {
      const aScore = a.bestScore ?? -1;
      const bScore = b.bestScore ?? -1;
      if (aScore !== bScore) return bScore - aScore;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })[0];
  }, [personalBests]);

  const recentPersonalBest = useMemo(() => {
    if (personalBests.length === 0) return null;
    return [...personalBests].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  }, [personalBests]);

  const openOnboarding = useCallback((game: HubGame) => {
    if (game.playable === false) return;
    setOnboardingGame(game);
  }, []);

  const launchGameFromOnboarding = useCallback(
    async (game: HubGame, config: GameOnboardingConfig) => {
      if (game.playable === false) return;
      const launchParams = buildOnboardingLaunchParams(game.meta.gameId, config);
      const nextHref = mergeHrefWithParams(game.playHref, launchParams);
      if (!game.templateId) {
        setOnboardingGame(null);
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
        // fallback: mantém navegação para rota mapeada pelo backend
      } finally {
        setStartingId(null);
        setOnboardingGame(null);
        router.push(nextHref);
      }
    },
    [router],
  );

  const claimMissionReward = useCallback(
    async (scope: "daily" | "weekly") => {
      if (!childId || !metagame) return;
      const mission = scope === "daily" ? metagame.dailyMission : metagame.weeklyMission;
      setClaimingScope(scope);
      try {
        await claimGamesMetagameMission({
          childId,
          missionScope: scope,
          missionId: mission.id,
        });
        refreshRemoteStats(childId);
      } finally {
        setClaimingScope(null);
      }
    },
    [childId, metagame, refreshRemoteStats],
  );

  const claimLeagueReward = useCallback(async () => {
    if (!childId) return;
    setClaimingLeague(true);
    try {
      await claimGamesLeagueReward(childId);
      refreshRemoteStats(childId);
    } finally {
      setClaimingLeague(false);
    }
  }, [childId, refreshRemoteStats]);

  const recommendationText = recommendedGame ? `Jogue ${recommendedGame.game.title} agora.` : "Escolha um jogo curto para manter sua evolução.";
  const recordsCount = personalBests.length;
  const bestGameLabel = bestPersonalBest ? (gameTitleById[bestPersonalBest.gameId] ?? bestPersonalBest.gameId) : null;
  const bestScoreLabel =
    bestPersonalBest && typeof bestPersonalBest.bestScore === "number"
      ? `${bestPersonalBest.bestScore} pontos`
      : bestPersonalBest && typeof bestPersonalBest.bestStreak === "number"
        ? `Sequencia ${bestPersonalBest.bestStreak}`
        : null;
  const recentRecordLabel = recentPersonalBest ? `Recorde recente em ${gameTitleById[recentPersonalBest.gameId] ?? recentPersonalBest.gameId}` : null;

  return (
    <ChildDesktopShell
      activeNav="jogos"
      menuSkin="trail"
      topBar={
        <TopStatsBar
          streak={shellStreak}
          gems={shellGems}
          xp={shellXpPercent}
          xpTotal={levelData?.xp_total ?? 0}
          variant="global"
          className="w-full"
        />
      }
      rightRail={
        <div className="rounded-[26px] border border-white/10 bg-[linear-gradient(160deg,rgba(28,54,48,0.88)_0%,rgba(24,48,43,0.84)_55%,rgba(18,39,35,0.92)_100%)] p-4 shadow-[0_10px_28px_rgba(7,20,17,0.32),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-[#CDBAA6]">Consistência</p>
          <p className="mt-1 text-lg font-black text-[#FFF4E7]">
            {metagame ? `${metagame.streak.current} dias em sequência` : "Você está indo bem!"}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#E6D8C7]">
            {metagame?.motivationMessage ?? "Continue explorando para evoluir no Axiora."}
          </p>
        </div>
      }
    >
      <PageShell tone="child" width="wide" className="relative z-0 overflow-hidden">
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.88]"
            style={{ backgroundImage: `url('${GAMES_WALLPAPER_SRC}')` }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,19,32,0.38)_0%,rgba(8,19,32,0.7)_100%)]" />
        </div>

        <div className="relative z-10 pb-24">
          <header className="mb-2 lg:hidden">
            <TopStatsBar
              streak={shellStreak}
              gems={shellGems}
              xp={shellXpPercent}
              className="w-full"
            />
          </header>

          <div className="mb-3">
            <Link
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#C9D8EF] bg-white/95 px-3 py-1.5 text-sm font-black text-[#4A5E7D] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
              href="/child"
            >
              Voltar
            </Link>
          </div>

          <GamesHero
            level={levelData?.level ?? 1}
            xpTotal={levelData?.xp_total ?? 0}
            availableCount={availableGames.length}
            recordsCount={recordsCount}
            onPrimaryAction={() => {
              if (recommendedGame) {
                openOnboarding(recommendedGame.game);
                return;
              }
              recommendationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />

          <section ref={recommendationRef} className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[1.08fr_1fr]">
            {recommendedGame ? (
              <GamesRecommendationCard
                title={recommendedGame.game.title}
                subtitle={recommendedGame.game.meta.shortDescription}
                reason={recommendedGame.reason}
                ctaLabel={recommendedGame.ctaLabel}
                icon={recommendedGame.game.icon}
                disabled={startingId === recommendedGame.game.id}
                infoChips={[
                  `${recommendedGame.game.meta.durationLabel} de sessão`,
                  recommendedGame.game.meta.skillLabel,
                  recommendedGame.game.meta.playStyle,
                ]}
                onPlay={() => {
                  openOnboarding(recommendedGame.game);
                }}
              />
            ) : (
              <article className="rounded-[24px] border border-[#C8E7DD]/80 bg-white/90 p-4 text-sm font-semibold text-[#356476]">
                Nenhum jogo disponível agora. Tente novamente em instantes.
              </article>
            )}

            <GamesProgressPanel
              dailyXp={dailyXp}
              weeklyXp={weeklyXp}
              weeklyGoal={weeklyGoal}
              totalSessions={totalSessionsLabelValue}
              xpTotal={levelData?.xp_total ?? 0}
              coins={axionCoins}
              recordsCount={recordsCount}
              favoriteGame={favoriteGameLabel}
              recommendation={recommendationText}
            />
          </section>

          <section className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {([
              { id: "all", label: "Todos" },
              { id: "available", label: `Disponíveis ${availableGames.length}` },
              { id: "upcoming", label: `Em breve ${upcomingGames.length}` },
            ] as const).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setCatalogFilter(option.id)}
                className={`min-h-[40px] rounded-full border px-3 text-xs font-black transition ${
                  catalogFilter === option.id ? "border-[#36C8B5] bg-[#E8FBF8] text-[#129A8A]" : "border-[#D6E0EE] bg-white text-[#6A7F9D]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </section>

          {metagame ? (
            <section className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr]">
              <GamesMissionCard
                mission={metagame.dailyMission}
                title="Missão de hoje"
                subtitle="Seu objetivo agora"
                onPlayNow={() => {
                  if (!recommendedGame) return;
                  openOnboarding(recommendedGame.game);
                }}
                onClaim={() => {
                  void claimMissionReward("daily");
                }}
                claimLoading={claimingScope === "daily"}
              />
              <GamesMissionCard
                mission={metagame.weeklyMission}
                title="Missão da semana"
                subtitle="Construindo seu ritmo"
                actionLabel="Continuar semana"
                onPlayNow={() => {
                  if (!recommendedGame) return;
                  openOnboarding(recommendedGame.game);
                }}
                onClaim={() => {
                  void claimMissionReward("weekly");
                }}
                claimLoading={claimingScope === "weekly"}
              />
            </section>
          ) : null}

          {metagame ? (
            <section className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[1.05fr_1fr]">
              <GamesStreakCard
                currentStreak={metagame.streak.current}
                bestStreak={metagame.streak.best}
                weeklySessions={metagame.stats.weeklySessions}
                totalSessions={metagame.stats.totalSessions}
                message={metagame.motivationMessage}
              />
              <GamesBadgeStrip badges={metagame.badges} />
            </section>
          ) : (
            <section className="mt-4">
              <div className="mb-2 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-[#F7BE53]" />
                <p className="text-sm font-bold text-[#E9F3FF]">Conquistas desbloqueadas</p>
              </div>
              <div className="games-achievements-scroll">
                {(achievements.length > 0
                  ? achievements
                  : [{ id: -1, title: "Primeira vitória", description: "Ganhe uma partida no Jogo da Velha", slug: "", icon_key: "", unlocked: false, unlocked_at: null }]
                ).map((achievement) => (
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
          )}

          <section className="mt-4">
            <GamesRankingCard weekly={weeklyRanking} personal={personalRanking} />
          </section>

          <section className="mt-4">
            <GamesLeagueCard
              league={leagueSummary}
              claimLoading={claimingLeague}
              onClaim={() => {
                void claimLeagueReward();
              }}
              onPlayNow={() => {
                if (recommendedGame) openOnboarding(recommendedGame.game);
              }}
            />
          </section>

          <section className="mt-5 space-y-5">
            {catalogState === "loading" && hubGames.length === 0 ? (
              <article className="rounded-2xl border border-[#D6E2F1] bg-white/90 p-3 text-xs font-semibold text-[#607E9E]">
                Carregando catálogo de jogos...
              </article>
            ) : null}
            {catalogState === "fallback" ? (
              <article className="rounded-2xl border border-[#D6E2F1] bg-white/90 p-3 text-xs font-semibold text-[#607E9E]">
                Catálogo online indisponível no momento. Exibindo jogos locais para você continuar.
              </article>
            ) : null}
            {GAMES_SKILL_GROUPS.map((group) => {
              const groupGames = groupedAvailableGames[group.key];
              if (groupGames.length === 0) return null;
              return (
                <GameSkillSection key={group.key} title={group.title} subtitle={group.subtitle}>
                  {groupGames.map((game) => {
                    const state =
                      recommendedGame?.game.id === game.id
                        ? "Jogar agora"
                        : game.personalBest
                          ? "Seu recorde"
                          : favoriteGameId && favoriteGameId === game.meta.gameId
                            ? "Favorito"
                            : "Pronto para jogar";
                    return (
                      <GameHubCard
                        key={game.id}
                        title={game.title}
                        description={game.meta.shortDescription}
                        skillLabel={game.meta.skillLabel}
                        durationLabel={game.meta.durationLabel}
                        ageBand={game.meta.ageBand}
                        playStyle={game.meta.playStyle}
                        whyItMatters={game.meta.whyItMatters}
                        xpReward={game.xpReward}
                        available
                        stateLabel={state}
                        isRecommended={recommendedGame?.game.id === game.id}
                        isFavorite={Boolean(favoriteGameId && favoriteGameId === game.meta.gameId)}
                        personalBest={
                          game.personalBest
                            ? {
                                bestScore: game.personalBest.bestScore,
                                bestStreak: game.personalBest.bestStreak,
                                bestDurationSeconds: game.personalBest.bestDurationSeconds,
                              }
                            : null
                        }
                        icon={game.icon}
                        disabled={startingId === game.id}
                        onPlay={() => {
                          openOnboarding(game);
                        }}
                      />
                    );
                  })}
                </GameSkillSection>
              );
            })}
          </section>

          <section className="mt-5">
            <PersonalBestHighlight
              recordsCount={recordsCount}
              bestGameLabel={bestGameLabel}
              bestScoreLabel={bestScoreLabel}
              recentRecordLabel={recentRecordLabel}
              replayLabel={recommendedGame ? `Jogar ${recommendedGame.game.title}` : "Escolher jogo para recorde"}
              disabled={recommendedGame ? startingId === recommendedGame.game.id : false}
              onReplay={() => {
                if (recommendedGame) {
                  openOnboarding(recommendedGame.game);
                  return;
                }
                recommendationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          </section>

          {visibleUpcoming.length > 0 ? (
            <section className="mt-5 space-y-3">
              <header>
                <h2 className="text-lg font-black text-[#E8F3FF]">Em breve no hub</h2>
                <p className="text-xs font-semibold text-[#AFC5DE]">Novas práticas para continuar sua evolução.</p>
              </header>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {visibleUpcoming.map((game) => (
                  <GameHubCard
                    key={game.id}
                    title={game.title}
                    description={game.meta.shortDescription}
                    skillLabel={game.meta.skillLabel}
                    durationLabel={game.meta.durationLabel}
                    ageBand={game.meta.ageBand}
                    playStyle={game.meta.playStyle}
                    whyItMatters={game.meta.whyItMatters}
                    xpReward={game.xpReward}
                    available={false}
                    stateLabel={statusLabel(game.status)}
                    icon={game.icon}
                    onPlay={() => undefined}
                    disabled
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-5 rounded-[24px] border border-[#D2E2F4]/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.97)_0%,rgba(242,250,255,0.95)_100%)] p-4 shadow-[0_10px_24px_rgba(17,45,77,0.12)] sm:p-5">
            <p className="text-xs font-black uppercase tracking-[0.09em] text-[#6382A2]">Evolução Axiora</p>
            <h2 className="mt-1 text-lg font-black text-[#153A55]">Jogar hoje acelera seu progresso amanhã</h2>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-[#426684]">
              Jogos rápidos treinam sua mente para aprender mais rápido nas trilhas e tomar decisões financeiras melhores no dia a dia.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {recommendedGame ? (
                <Button
                  onClick={() => {
                    openOnboarding(recommendedGame.game);
                  }}
                  disabled={startingId === recommendedGame.game.id}
                >
                  Praticar agora
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : null}
              <Button asChild variant="outline" className="border-[#BCD3E8] bg-white/92 text-[#264A68] hover:bg-white">
                <Link href="/child/aprender">
                  Continuar aprender
                  <Sparkles className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </section>

          <GameOnboardingModal
            open={Boolean(onboardingGame)}
            game={
              onboardingGame
                ? {
                    title: onboardingGame.title,
                    description: onboardingGame.meta.shortDescription,
                    icon: onboardingGame.icon,
                    meta: {
                      gameId: onboardingGame.meta.gameId,
                      skillLabel: onboardingGame.meta.skillLabel,
                      ageBand: onboardingGame.meta.ageBand,
                      durationLabel: onboardingGame.meta.durationLabel,
                      playStyle: onboardingGame.meta.playStyle,
                      whyItMatters: onboardingGame.meta.whyItMatters,
                    },
                    personalBest: onboardingGame.personalBest
                      ? {
                          bestScore: onboardingGame.personalBest.bestScore,
                          bestStreak: onboardingGame.personalBest.bestStreak,
                          bestDurationSeconds: onboardingGame.personalBest.bestDurationSeconds,
                        }
                      : null,
                  }
                : null
            }
            loading={Boolean(onboardingGame && startingId === onboardingGame.id)}
            onClose={() => {
              if (startingId) return;
              setOnboardingGame(null);
            }}
            onConfirm={(config) => {
              if (!onboardingGame) return;
              void launchGameFromOnboarding(onboardingGame, config);
            }}
          />

          <ChildBottomNav />
        </div>
      </PageShell>
    </ChildDesktopShell>
  );
}
