import { Flame, Grid2x2, MapPinned, PiggyBank, Rocket, Search } from "lucide-react";
import type { ComponentType } from "react";

import type { GameCatalogItem } from "@/lib/api/client";
import type { AxioraGameId } from "@/lib/games/result-contract";

export type GameItem = {
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
  estimatedMinutes?: number;
};

export const GAMES_WALLPAPER_SRC = "/axiora/games/balanced.png?v=1";

export const GAMES: GameItem[] = [
  {
    id: "local-corrida-soma",
    href: "/child/games/quiz",
    templateId: "7f9d501f-7c56-4690-9da5-bf1b95818801",
    title: "Corrida da Soma",
    description: "Desafios rápidos de soma com progressão por sessão.",
    skill: "Aritmética e soma",
    difficulty: "Fácil",
    xpReward: 20,
    icon: Rocket,
    estimatedMinutes: 3,
  },
  {
    id: "local-mapa-capitais",
    href: "/child/games/memory",
    templateId: "7ed50523-7a97-4d65-a687-d2f878f2c199",
    title: "Mapa de Capitais",
    description: "Ligue capitais e regiões em rodadas de memória visual.",
    skill: "Geografia e memória",
    difficulty: "Médio",
    xpReward: 28,
    icon: MapPinned,
    estimatedMinutes: 5,
  },
  {
    id: "local-estacao-ingles",
    href: "/child/games/quiz",
    templateId: "63b8fdd6-a512-487f-b0a4-9860904f7558",
    title: "Estação de Inglês",
    description: "Vocabulário e leitura em desafios curtos.",
    skill: "Inglês e vocabulário",
    difficulty: "Médio",
    xpReward: 24,
    icon: Search,
    estimatedMinutes: 4,
  },
  {
    id: "local-tic-tac-toe",
    href: "/child/games/tictactoe",
    title: "Jogo da Velha",
    description: "Treine lógica, antecipação e tomada de decisão em partidas rápidas.",
    skill: "Lógica e estratégia",
    difficulty: "Fácil",
    xpReward: 50,
    icon: Grid2x2,
    estimatedMinutes: 3,
  },
  {
    id: "local-tug-of-war",
    href: "/child/games/tug-of-war",
    title: "Cabo de Guerra",
    description: "Duelo matemático em tempo real: acerte para puxar a corda e vencer.",
    skill: "Aritmética e agilidade",
    difficulty: "Médio",
    xpReward: 90,
    icon: Flame,
    estimatedMinutes: 4,
  },
  {
    id: "local-word-search",
    href: "/child/games/wordsearch",
    title: "Caça-palavras",
    description: "Encontre palavras por tema em grades dinâmicas com seleção por arraste.",
    skill: "Vocabulário e foco",
    difficulty: "Médio",
    xpReward: 130,
    icon: Search,
    estimatedMinutes: 4,
  },
  {
    id: "local-finance-sim",
    href: "/child/games/finance-sim",
    title: "Mesada Inteligente",
    description: "Simule decisões financeiras em 5 rodadas com eventos surpresa.",
    skill: "Educação financeira",
    difficulty: "Médio",
    xpReward: 80,
    icon: PiggyBank,
    estimatedMinutes: 5,
  },
];

export const LOCAL_TICTACTOE_GAME: GameItem = GAMES.find((game) => game.href === "/child/games/tictactoe") ?? GAMES[0];

const CATALOG_TEMPLATE_ROUTE_MAP: Record<string, string> = {
  "0f4f06ad-3f7c-4ac3-89b8-3e6af40f7d10": "/child/games/tictactoe",
  "7f9d501f-7c56-4690-9da5-bf1b95818801": "/child/games/quiz",
  "f3db2b95-89d8-4c1c-9cda-87fd357f7f9e": "/child/games/finance-sim",
  "f80b40cf-e8a9-4f3c-a2dd-c2d3cfe6d2fd": "/child/games/quiz",
  "7ed50523-7a97-4d65-a687-d2f878f2c199": "/child/games/memory",
  "7d0b9986-f1d0-457f-936b-c6ad4cda0eba": "/child/games/quiz",
  "e2a87d87-df4c-4bb8-ac96-6fd274a469ac": "/child/games/quiz",
  "63b8fdd6-a512-487f-b0a4-9860904f7558": "/child/games/quiz",
  "f9a5d5cc-5e4d-4a42-8a07-9e4c36fc9f77": "/child/games/tug-of-war",
  "6be6b566-ae90-4f81-8998-3938f77f8f8b": "/child/games/wordsearch",
};

const CATALOG_TITLE_ROUTE_MAP: Record<string, string> = {
  "corrida da soma": "/child/games/quiz",
  "mapa de capitais": "/child/games/memory",
  "mercado do troco": "/child/games/finance-sim",
  "caça-palavras": "/child/games/wordsearch",
  "caca-palavras": "/child/games/wordsearch",
  "jogo da velha": "/child/games/tictactoe",
  "cabo de guerra": "/child/games/tug-of-war",
};

export function resolveCatalogRoute(item: GameCatalogItem): string | null {
  if (CATALOG_TEMPLATE_ROUTE_MAP[item.templateId]) return CATALOG_TEMPLATE_ROUTE_MAP[item.templateId];
  const title = item.title.trim().toLowerCase();
  if (CATALOG_TITLE_ROUTE_MAP[title]) return CATALOG_TITLE_ROUTE_MAP[title];
  if (title === "tug of war") return "/child/games/tug-of-war";
  const key = item.engineKey.toUpperCase();
  if (key === "QUIZ") return "/child/games/quiz";
  if (key === "MEMORY") return "/child/games/memory";
  if (key === "SIMULATION") return "/child/games/finance-sim";
  if (key === "DRAG_DROP") return "/child/games/wordsearch";
  return item.playRoute;
}

export function difficultyLabel(difficulty: string): "Fácil" | "Médio" | "Difícil" {
  const value = difficulty.toUpperCase();
  if (value === "EASY") return "Fácil";
  if (value === "HARD") return "Difícil";
  return "Médio";
}

export function iconForGame(item: GameCatalogItem): ComponentType<{ className?: string }> {
  const title = item.title.trim().toLowerCase();
  if (title === "corrida da soma") return Rocket;
  if (title === "mapa de capitais") return MapPinned;
  const subject = item.subject.toLowerCase();
  if (subject.includes("financeira")) return PiggyBank;
  if (subject.includes("portugu")) return Search;
  if (subject.includes("matem")) return Grid2x2;
  if (item.engineKey.toUpperCase() === "SIMULATION") return PiggyBank;
  if (item.engineKey.toUpperCase() === "MEMORY") return Search;
  return Grid2x2;
}

export function buildPlayHref(game: GameItem): string {
  if (!game.templateId) return game.href;
  const separator = game.href.includes("?") ? "&" : "?";
  return `${game.href}${separator}templateId=${encodeURIComponent(game.templateId)}`;
}

export function resolveGameIdForPersonalBest(href: string): AxioraGameId | null {
  if (href.includes("/tictactoe")) return "tictactoe";
  if (href.includes("/quiz")) return "quiz";
  if (href.includes("/memory")) return "memory";
  if (href.includes("/wordsearch")) return "wordsearch";
  if (href.includes("/finance-sim")) return "finance-sim";
  if (href.includes("/tug-of-war")) return "tug-of-war";
  return null;
}

export function statusLabel(status?: GameItem["status"]): string {
  if (status === "AVAILABLE") return "Disponível";
  if (status === "BETA") return "Beta";
  if (status === "LOCKED") return "Bloqueado";
  return "Em breve";
}
