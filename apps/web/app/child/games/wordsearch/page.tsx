"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Search, Sparkles } from "lucide-react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { ConfettiBurst } from "@/components/confetti-burst";
import { LevelUpOverlay } from "@/components/level-up-overlay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { registerGameSession, type GameSessionRegisterResponse } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type ThemeId = "FINANCAS" | "EMOCOES" | "HABITOS" | "VALORES";
type Pos = { row: number; col: number };
type Placement = { word: string; cells: Pos[] };

const GRID_SIZE = 10;
const WORD_XP = 15;
const COMPLETE_BONUS_XP = 40;

const THEME_LABELS: Record<ThemeId, string> = {
  FINANCAS: "Finanças",
  EMOCOES: "Emoções",
  HABITOS: "Hábitos",
  VALORES: "Valores",
};

const THEME_WORDS: Record<ThemeId, string[]> = {
  FINANCAS: ["POUPAR", "MESADA", "MOEDA", "COFRE", "GASTAR", "SALDO", "META", "INVESTIR", "BANCO", "PLANO"],
  EMOCOES: ["ALEGRIA", "CALMA", "FOCO", "EMPATIA", "CORAGEM", "RESPEITO", "PACIENCIA", "CARINHO", "GRATIDAO", "SERENO"],
  HABITOS: ["ROTINA", "ESTUDO", "LEITURA", "ORGANIZAR", "EXERCICIO", "HIGIENE", "DESCANSO", "REVISAR", "PRATICA", "SONO"],
  VALORES: ["ETICA", "HONESTO", "AJUDA", "UNIAO", "AMIZADE", "JUSTICA", "CUIDADO", "DIALOGO", "CONFIANCA", "BONDADE"],
};

const DIRECTIONS: Array<{ dr: number; dc: number }> = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: -1, dc: 1 },
  { dr: 0, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: -1, dc: -1 },
  { dr: 1, dc: -1 },
];

function toCellKey(pos: Pos): string {
  return `${pos.row}:${pos.col}`;
}

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function isStraightLine(a: Pos, b: Pos): boolean {
  const dr = b.row - a.row;
  const dc = b.col - a.col;
  return dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
}

function buildLine(a: Pos, b: Pos): Pos[] {
  if (!isStraightLine(a, b)) return [];
  const dr = Math.sign(b.row - a.row);
  const dc = Math.sign(b.col - a.col);
  const len = Math.max(Math.abs(b.row - a.row), Math.abs(b.col - a.col)) + 1;
  return Array.from({ length: len }, (_, i) => ({
    row: a.row + dr * i,
    col: a.col + dc * i,
  }));
}

function samePath(a: Pos[], b: Pos[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((pos, idx) => pos.row === b[idx].row && pos.col === b[idx].col);
}

function reversePath(path: Pos[]): Pos[] {
  return [...path].reverse();
}

function generateBoard(theme: ThemeId): { grid: string[][]; placements: Placement[] } {
  const grid: string[][] = Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => ""));
  const words = shuffle(THEME_WORDS[theme]).slice(0, 6);
  const placements: Placement[] = [];

  for (const word of words) {
    let placed = false;
    for (let attempt = 0; attempt < 140 && !placed; attempt += 1) {
      const direction = DIRECTIONS[randomInt(DIRECTIONS.length)];
      const start = { row: randomInt(GRID_SIZE), col: randomInt(GRID_SIZE) };
      const endRow = start.row + direction.dr * (word.length - 1);
      const endCol = start.col + direction.dc * (word.length - 1);
      if (endRow < 0 || endRow >= GRID_SIZE || endCol < 0 || endCol >= GRID_SIZE) continue;

      const cells: Pos[] = [];
      let fits = true;
      for (let i = 0; i < word.length; i += 1) {
        const row = start.row + direction.dr * i;
        const col = start.col + direction.dc * i;
        const current = grid[row][col];
        const nextChar = word[i];
        if (current !== "" && current !== nextChar) {
          fits = false;
          break;
        }
        cells.push({ row, col });
      }
      if (!fits) continue;

      for (let i = 0; i < cells.length; i += 1) {
        const { row, col } = cells[i];
        grid[row][col] = word[i];
      }
      placements.push({ word, cells });
      placed = true;
    }
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < GRID_SIZE; r += 1) {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      if (!grid[r][c]) {
        grid[r][c] = alphabet[randomInt(alphabet.length)];
      }
    }
  }

  return { grid, placements };
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentWeekStartIso(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

type RewardModalProps = {
  open: boolean;
  wordsFound: number;
  baseXp: number;
  bonusXp: number;
  apiResult: GameSessionRegisterResponse | null;
  onClose: () => void;
};

function RewardModal({ open, wordsFound, baseXp, bonusXp, apiResult, onClose }: RewardModalProps) {
  if (!open) return null;
  const requestedXp = baseXp + bonusXp;
  const grantedXp = apiResult?.dailyLimit.grantedXp ?? requestedXp;
  const coins = apiResult?.session.coinsEarned ?? 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-secondary" />
            Tabuleiro completo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Palavras encontradas: {wordsFound}</p>
          <p>XP por palavras: {baseXp}</p>
          <p>Bônus conclusão: +{bonusXp}</p>
          <p>XP aplicado: {grantedXp}</p>
          <p>Moedas recebidas: {coins}</p>
          <Button className="mt-2 w-full" onClick={onClose}>
            Continuar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function WordSearchPage() {
  const [childId, setChildId] = useState<number | null>(null);
  const [theme, setTheme] = useState<ThemeId>("FINANCAS");
  const [grid, setGrid] = useState<string[][]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [foundWords, setFoundWords] = useState<Set<string>>(new Set());
  const [foundCells, setFoundCells] = useState<Set<string>>(new Set());
  const [dragStart, setDragStart] = useState<Pos | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Pos | null>(null);
  const [selectedPath, setSelectedPath] = useState<Pos[]>([]);
  const [tapStart, setTapStart] = useState<Pos | null>(null);
  const [sessionResult, setSessionResult] = useState<GameSessionRegisterResponse | null>(null);
  const [rewardOpen, setRewardOpen] = useState(false);
  const [levelUpLevel, setLevelUpLevel] = useState<number | null>(null);
  const [levelUpReward, setLevelUpReward] = useState<string | null>(null);
  const [confettiTrigger, setConfettiTrigger] = useState(0);

  useEffect(() => {
    const raw = localStorage.getItem("axiora_child_id");
    const parsed = Number(raw);
    if (raw && Number.isFinite(parsed)) {
      setChildId(parsed);
    }
  }, []);

  const createBoard = (nextTheme: ThemeId) => {
    const generated = generateBoard(nextTheme);
    setGrid(generated.grid);
    setPlacements(generated.placements);
    setFoundWords(new Set());
    setFoundCells(new Set());
    setDragStart(null);
    setDragCurrent(null);
    setSelectedPath([]);
    setTapStart(null);
    setSessionResult(null);
    setRewardOpen(false);
  };

  useEffect(() => {
    createBoard(theme);
  }, [theme]);

  const baseXp = foundWords.size * WORD_XP;
  const completed = placements.length > 0 && foundWords.size === placements.length;

  const persistLevel = (next: number) => {
    if (childId === null) return;
    localStorage.setItem(`axiora_game_level_${childId}`, String(next));
  };

  const getStoredLevel = (): number => {
    if (childId === null) return 0;
    const raw = localStorage.getItem(`axiora_game_level_${childId}`);
    const parsed = Number(raw ?? "0");
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };

  const persistEarnedXp = (earnedXp: number) => {
    if (childId === null || earnedXp <= 0) return;
    const dailyKey = `axiora_game_daily_xp_${childId}_${todayIsoDate()}`;
    const currentDaily = Number(localStorage.getItem(dailyKey) ?? "0");
    const safeDaily = Number.isFinite(currentDaily) ? Math.max(0, currentDaily) : 0;
    localStorage.setItem(dailyKey, String(safeDaily + earnedXp));

    const weeklyKey = `axiora_game_weekly_xp_${childId}`;
    const weekStart = currentWeekStartIso();
    const rawWeekly = localStorage.getItem(weeklyKey);
    let weeklyXp = 0;
    if (rawWeekly) {
      try {
        const parsed = JSON.parse(rawWeekly) as { weekStart: string; xp: number };
        if (parsed.weekStart === weekStart && Number.isFinite(parsed.xp)) {
          weeklyXp = Math.max(0, parsed.xp);
        }
      } catch {
        weeklyXp = 0;
      }
    }
    localStorage.setItem(weeklyKey, JSON.stringify({ weekStart, xp: weeklyXp + earnedXp }));
  };

  const registerSession = async () => {
    const totalXp = baseXp + COMPLETE_BONUS_XP;
    try {
      const response = await registerGameSession({
        gameType: "WORDSEARCH",
        score: totalXp * 10,
      });
      setSessionResult(response);
      persistEarnedXp(response.dailyLimit.grantedXp);
      const previousLevel = getStoredLevel();
      if (previousLevel > 0 && response.profile.level > previousLevel) {
        setLevelUpLevel(response.profile.level);
        setLevelUpReward(response.unlockedAchievements?.[0] ?? null);
      }
      persistLevel(response.profile.level);
    } catch {
      setSessionResult(null);
    } finally {
      setRewardOpen(true);
      setConfettiTrigger((prev) => prev + 1);
    }
  };

  useEffect(() => {
    if (!completed || rewardOpen) return;
    void registerSession();
  }, [completed]);

  const evaluatePath = (path: Pos[]) => {
    if (path.length < 2) return;
    const match = placements.find((placement) => samePath(path, placement.cells) || samePath(path, reversePath(placement.cells)));
    if (!match) return;
    if (foundWords.has(match.word)) return;

    setFoundWords((prev) => {
      const next = new Set(prev);
      next.add(match.word);
      return next;
    });
    setFoundCells((prev) => {
      const next = new Set(prev);
      for (const cell of match.cells) {
        next.add(toCellKey(cell));
      }
      return next;
    });
  };

  const onPointerDown = (pos: Pos) => {
    setDragStart(pos);
    setDragCurrent(pos);
    setSelectedPath([pos]);
  };

  const onPointerEnter = (pos: Pos) => {
    if (!dragStart) return;
    setDragCurrent(pos);
    setSelectedPath(buildLine(dragStart, pos));
  };

  const onPointerUp = () => {
    if (dragStart && dragCurrent) {
      evaluatePath(buildLine(dragStart, dragCurrent));
    }
    setDragStart(null);
    setDragCurrent(null);
    setSelectedPath([]);
  };

  const onCellClick = (pos: Pos) => {
    // Fallback para ambientes onde drag no modo responsivo do navegador é inconsistente.
    if (tapStart === null) {
      setTapStart(pos);
      setSelectedPath([pos]);
      return;
    }
    const path = buildLine(tapStart, pos);
    evaluatePath(path);
    setTapStart(null);
    setSelectedPath([]);
  };

  const selectedCellSet = useMemo(() => new Set(selectedPath.map((cell) => toCellKey(cell))), [selectedPath]);

  return (
    <>
      <ConfettiBurst trigger={confettiTrigger} />
      {levelUpLevel !== null ? (
        <LevelUpOverlay
          level={levelUpLevel}
          unlockedReward={levelUpReward}
          onDismiss={() => {
            setLevelUpLevel(null);
            setLevelUpReward(null);
          }}
        />
      ) : null}
      <RewardModal
        open={rewardOpen}
        wordsFound={foundWords.size}
        baseXp={baseXp}
        bonusXp={COMPLETE_BONUS_XP}
        apiResult={sessionResult}
        onClose={() => setRewardOpen(false)}
      />

      <main className="safe-px safe-pb mx-auto min-h-screen w-full max-w-md overflow-x-clip p-4 pb-52 md:max-w-4xl md:p-6 md:pb-40 xl:max-w-5xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link
            className="inline-flex items-center gap-1.5 rounded-2xl border-2 border-border bg-white px-2.5 py-1.5 text-sm font-semibold text-muted-foreground shadow-[0_2px_0_rgba(184,200,239,0.7)] transition hover:bg-muted"
            href="/child/games"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-muted">
              <ArrowLeft className="h-4 w-4 stroke-[2.6]" />
            </span>
            Voltar aos jogos
          </Link>
        </div>

        <Card className="mb-3 overflow-hidden border-border bg-[radial-gradient(circle_at_15%_20%,rgba(14,165,164,0.2),transparent_55%),linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="h-5 w-5 text-secondary" />
              Caça-palavras
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(THEME_LABELS) as ThemeId[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    "rounded-2xl border px-3 py-2 text-sm font-semibold transition",
                    theme === option
                      ? "border-secondary/40 bg-secondary/10 text-secondary"
                      : "border-border bg-white text-muted-foreground hover:bg-muted",
                  )}
                  onClick={() => setTheme(option)}
                >
                  {THEME_LABELS[option]}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border bg-white px-3 py-2 text-sm">
              <span className="text-muted-foreground">Palavras encontradas</span>
              <span className="font-bold text-foreground">
                {foundWords.size}/{placements.length}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-3">
          <CardContent className="p-3">
            <div
              className="grid touch-none gap-1 rounded-2xl border border-border bg-[linear-gradient(180deg,#edf4ff_0%,#e7f7f4_100%)] p-2"
              style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              {grid.map((row, rowIndex) =>
                row.map((letter, colIndex) => {
                  const key = toCellKey({ row: rowIndex, col: colIndex });
                  const isSelected = selectedCellSet.has(key);
                  const isFound = foundCells.has(key);
                  const isTapStart = tapStart !== null && tapStart.row === rowIndex && tapStart.col === colIndex;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={cn(
                        "aspect-square rounded-xl border text-sm font-extrabold shadow-[0_2px_0_rgba(184,200,239,0.62)] transition",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary",
                        isFound && "border-secondary/55 bg-secondary/20 text-secondary",
                        isTapStart && !isFound && "border-primary bg-primary/20 text-primary scale-[1.03]",
                        !isFound && isSelected && "border-primary/60 bg-primary/20 text-primary scale-[1.03]",
                        !isFound && !isSelected && "border-border bg-white text-foreground hover:bg-muted",
                      )}
                      onPointerDown={() => onPointerDown({ row: rowIndex, col: colIndex })}
                      onPointerEnter={() => onPointerEnter({ row: rowIndex, col: colIndex })}
                      onClick={() => onCellClick({ row: rowIndex, col: colIndex })}
                    >
                      {letter}
                    </button>
                  );
                }),
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Palavras do tema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              {placements.map((item) => {
                const found = foundWords.has(item.word);
                return (
                  <div
                    key={item.word}
                    className={cn(
                      "rounded-xl border px-2 py-1.5 font-semibold transition",
                      found ? "border-secondary/45 bg-secondary/10 text-secondary" : "border-border bg-muted/40 text-muted-foreground",
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {found ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                      {item.word}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="rounded-xl border border-border bg-white px-3 py-2 text-xs text-muted-foreground">
              Cada palavra: +{WORD_XP} XP • Tabuleiro completo: +{COMPLETE_BONUS_XP} XP
            </div>
            <Button className="w-full" variant="outline" onClick={() => createBoard(theme)}>
              Novo tabuleiro
            </Button>
          </CardContent>
        </Card>

        <ChildBottomNav />
      </main>
    </>
  );
}
