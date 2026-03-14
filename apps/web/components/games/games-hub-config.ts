import type { AxioraGameId } from "@/lib/games/result-contract";

export type GameSkillGroupKey = "calculo" | "estrategia" | "memoria" | "financeiro";

export type GameSkillGroup = {
  key: GameSkillGroupKey;
  title: string;
  subtitle: string;
};

export type GameHubMeta = {
  skillGroup: GameSkillGroupKey;
  skillLabel: string;
  ageBand: string;
  durationLabel: string;
  playStyle: string;
  whyItMatters: string;
  shortDescription: string;
  gameId: AxioraGameId | null;
};

type HubInput = {
  title: string;
  href: string;
  description: string;
  estimatedMinutes?: number;
};

const FALLBACK_META: GameHubMeta = {
  skillGroup: "memoria",
  skillLabel: "Raciocínio e foco",
  ageBand: "7-12 anos",
  durationLabel: "4 min",
  playStyle: "Partidas curtas",
  whyItMatters: "Fortalece atenção, ritmo de estudo e confiança para desafios maiores.",
  shortDescription: "Treino rápido para manter sua mente afiada.",
  gameId: null,
};

const METADATA_BY_SLUG: Record<string, GameHubMeta> = {
  "corrida-da-soma": {
    skillGroup: "calculo",
    skillLabel: "Cálculo e rapidez",
    ageBand: "6-10 anos",
    durationLabel: "3 min",
    playStyle: "Perguntas rápidas",
    whyItMatters: "Agilidade com contas simples ajuda em compras, troco e decisões do dia a dia.",
    shortDescription: "Somas rápidas para ganhar ritmo.",
    gameId: "quiz",
  },
  "mapa-de-capitais": {
    skillGroup: "memoria",
    skillLabel: "Memória e associação",
    ageBand: "8-13 anos",
    durationLabel: "5 min",
    playStyle: "Combinação visual",
    whyItMatters: "Melhora memória de trabalho e associação, base para leitura e resolução de problemas.",
    shortDescription: "Conecte capitais e regiões com memória visual.",
    gameId: "memory",
  },
  "estacao-de-ingles": {
    skillGroup: "memoria",
    skillLabel: "Vocabulário e foco",
    ageBand: "8-14 anos",
    durationLabel: "4 min",
    playStyle: "Quiz de vocabulário",
    whyItMatters: "Vocabulário forte acelera compreensão e dá mais autonomia para aprender.",
    shortDescription: "Treine leitura e vocabulário em ritmo leve.",
    gameId: "quiz",
  },
  "jogo-da-velha": {
    skillGroup: "estrategia",
    skillLabel: "Estratégia e decisão",
    ageBand: "6-12 anos",
    durationLabel: "3 min",
    playStyle: "Duelo tático",
    whyItMatters: "Antecipar jogadas fortalece planejamento e tomada de decisão com calma.",
    shortDescription: "Pense à frente e vença com estratégia.",
    gameId: "tictactoe",
  },
  "cabo-de-guerra": {
    skillGroup: "calculo",
    skillLabel: "Cálculo e reação",
    ageBand: "7-13 anos",
    durationLabel: "4 min",
    playStyle: "Duelo em tempo real",
    whyItMatters: "Treina velocidade de raciocínio e precisão sob pressão.",
    shortDescription: "Acerte rápido para puxar a corda e vencer.",
    gameId: "tug-of-war",
  },
  "caca-palavras": {
    skillGroup: "memoria",
    skillLabel: "Memória e atenção",
    ageBand: "7-13 anos",
    durationLabel: "4 min",
    playStyle: "Busca por padrões",
    whyItMatters: "Atenção visual e foco sustentado ajudam em leitura, provas e concentração.",
    shortDescription: "Encontre palavras e melhore seu foco.",
    gameId: "wordsearch",
  },
  "mesada-inteligente": {
    skillGroup: "financeiro",
    skillLabel: "Prática financeira",
    ageBand: "9-15 anos",
    durationLabel: "5 min",
    playStyle: "Simulação por rodadas",
    whyItMatters: "Treina escolhas de curto e longo prazo para construir inteligência financeira.",
    shortDescription: "Decida como gastar, guardar e evoluir.",
    gameId: "finance-sim",
  },
};

export const GAMES_SKILL_GROUPS: GameSkillGroup[] = [
  {
    key: "calculo",
    title: "Cálculo e rapidez",
    subtitle: "Para pensar rápido, acertar mais e ganhar ritmo.",
  },
  {
    key: "estrategia",
    title: "Estratégia e decisão",
    subtitle: "Treinos de lógica, previsão e escolhas inteligentes.",
  },
  {
    key: "memoria",
    title: "Memória e atenção",
    subtitle: "Concentração e associação para aprender com confiança.",
  },
  {
    key: "financeiro",
    title: "Prática financeira",
    subtitle: "Jogos para dominar decisões de dinheiro no mundo real.",
  },
];

function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferSlugFromRoute(href: string): string | null {
  if (href.includes("/tictactoe")) return "jogo-da-velha";
  if (href.includes("/tug-of-war")) return "cabo-de-guerra";
  if (href.includes("/wordsearch")) return "caca-palavras";
  if (href.includes("/finance-sim")) return "mesada-inteligente";
  if (href.includes("/memory")) return "mapa-de-capitais";
  if (href.includes("/quiz")) return "corrida-da-soma";
  return null;
}

export function resolveGameHubMeta(input: HubInput): GameHubMeta {
  const byTitle = METADATA_BY_SLUG[toSlug(input.title)];
  const byRoute = inferSlugFromRoute(input.href);
  const resolved = byTitle ?? (byRoute ? METADATA_BY_SLUG[toSlug(byRoute)] : null) ?? FALLBACK_META;
  const minutes = typeof input.estimatedMinutes === "number" && input.estimatedMinutes > 0 ? input.estimatedMinutes : null;
  return {
    ...resolved,
    durationLabel: minutes ? `${minutes} min` : resolved.durationLabel,
    shortDescription: input.description?.trim().length > 0 ? input.description : resolved.shortDescription,
  };
}
