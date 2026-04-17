"use client";

import { useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Calculator, Divide, Home, Scale, Zap, Sigma, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  createToolsCheckout,
  createToolsCheckoutV2,
  useAnonCredit as consumeAnonCredit,
  useToolsCredit as consumeToolsCredit,
} from "@/lib/api/client";
import { useToolsIdentity } from "@/context/tools-identity-context";
import { PaywallModal } from "@/components/tools/paywall-modal";
import { track } from "@/lib/tools/analytics";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type BlockType = "aritmetica" | "fracoes" | "equacoes" | "potenciacao" | "expressoes";
type GabaritoMode = "sem" | "mesma" | "proxima";
type FontSize = "P" | "M" | "G";

interface BlockConfig {
  quantidade: number;
  // aritmetica
  operacao?: string;
  digitos1?: number;
  digitos2?: number;
  formato?: "armada" | "linear";
  permitirResto?: boolean;
  negativos?: string;
  // fracoes
  denomMax?: number;
  semprePropria?: boolean;
  simplificar?: boolean;
  denominadorComum?: boolean;
  resultadoPositivo?: boolean;
  numerosMistos?: boolean;
  // equacoes
  tipo?: string;
  coefMax?: number;
  respMax?: number;
  respNegativa?: boolean;
  // potenciacao
  baseMax?: number;
  expMax?: number;
  somentePerfeitasRaiz?: boolean;
  // expressoes
  complexidade?: "simples" | "media" | "avancada";
  termos?: number;
  operacoes?: string[];
  usarParenteses?: boolean;
  nivelAgrupamento?: number;
}

interface Block {
  id: number;
  type: BlockType;
  active: boolean;
  config: BlockConfig;
}

function cloneBlock(block: Block): Block {
  return {
    ...block,
    config: {
      ...block.config,
      operacoes: block.config.operacoes ? [...block.config.operacoes] : undefined,
    },
  };
}

interface GlobalConfig {
  title: string;
  subtitle: string;
  turma: string;
  tempo: string;
  cols: number;
  fontSize: FontSize;
  gabarito: GabaritoMode;
  spacing: number;
  embaralhar: boolean;
  showNome: boolean;
  numerar: boolean;
  showPontuacao: boolean;
  repeatHeader: boolean;
}

type LightConfig = Pick<GlobalConfig, "title" | "subtitle" | "turma" | "tempo">;
type HeavyConfig = Omit<GlobalConfig, keyof LightConfig>;

const DEFAULT_LIGHT_CONFIG: LightConfig = {
  title: "Folha de Exercícios",
  subtitle: "Resolva todos os exercícios.",
  turma: "",
  tempo: "",
};

const DEFAULT_HEAVY_CONFIG: HeavyConfig = {
  cols: 2,
  fontSize: "M",
  gabarito: "proxima",
  spacing: 8,
  embaralhar: false,
  showNome: true,
  numerar: true,
  showPontuacao: false,
  repeatHeader: false,
};

const TITLE_SUBTITLE_DEBOUNCE_MS = 300;

interface ExerciseItem {
  blockId: number;
  type: BlockType;
  html: string;
  answer: string | number;
}

// BLOCK TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const BLOCK_META: Record<
  BlockType,
  { name: string; Icon: LucideIcon; color: string; accent: string; defaults: BlockConfig }
> = {
  aritmetica: {
    name: "Aritmética",
    Icon: Calculator,
    color: "rgba(59,130,246,0.15)",
    accent: "#3b82f6",
    defaults: {
      operacao: "multiplicacao",
      digitos1: 3,
      digitos2: 3,
      formato: "armada",
      quantidade: 10,
    },
  },
  fracoes: {
    name: "Frações",
    Icon: Divide,
    color: "rgba(168,85,247,0.15)",
    accent: "#a855f7",
    defaults: { operacao: "soma", denomMax: 10, quantidade: 8 },
  },
  equacoes: {
    name: "Equações 1º Grau",
    Icon: Scale,
    color: "rgba(238,135,72,0.15)",
    accent: "#ee8748",
    defaults: { tipo: "misto", coefMax: 9, respMax: 20, quantidade: 6 },
  },
  potenciacao: {
    name: "Potenciação e Radiciação",
    Icon: Zap,
    color: "rgba(239,68,68,0.15)",
    accent: "#ef4444",
    defaults: { tipo: "misto", baseMax: 12, expMax: 3, quantidade: 8 },
  },
  expressoes: {
    name: "Expressões Numéricas",
    Icon: Sigma,
    color: "rgba(20,184,166,0.15)",
    accent: "#14b8a6",
    defaults: {
      complexidade: "media",
      termos: 4,
      operacoes: ["adicao", "subtracao", "multiplicacao"],
      usarParenteses: true,
      nivelAgrupamento: 2,
      quantidade: 6,
    },
  },
};

interface GuidedStageOption {
  id: string;
  group: string;
  stage: string;
  title: string;
  summary: string;
  rationale: string;
  color: string;
}

interface GuidedBlockSuggestion {
  id: string;
  stageId: string;
  objective: string;
  focus: string;
  summary: string;
  rationale: string;
  type: BlockType;
  config: Partial<BlockConfig>;
}

const GUIDED_STAGE_OPTIONS: GuidedStageOption[] = [
  {
    id: "fase-2ano",
    group: "Construção de Base",
    stage: "2º ano",
    title: "Primeiras operações",
    summary: "Fase ideal para consolidar soma, subtração e leitura de contas simples.",
    rationale: "Priorizamos repertório básico com baixa carga cognitiva e bastante repetição produtiva.",
    color: "#3b82f6",
  },
  {
    id: "fase-3ano",
    group: "Construção de Base",
    stage: "3º ano",
    title: "Tabuada e estruturas multiplicativas",
    summary: "Aqui faz sentido introduzir grupos iguais e primeiras divisões simples.",
    rationale: "A criança costuma começar a sair do cálculo aditivo e ganhar fluência em multiplicação.",
    color: "#2563eb",
  },
  {
    id: "fase-4ano",
    group: "Ampliação de Estratégias",
    stage: "4º ano",
    title: "Algoritmos operatórios",
    summary: "Boa etapa para fortalecer contas armadas e leitura mais estruturada de divisão.",
    rationale: "O foco passa a ser precisão, organização do cálculo e autonomia no algoritmo.",
    color: "#0f766e",
  },
  {
    id: "fase-5ano",
    group: "Ampliação de Estratégias",
    stage: "5º ano",
    title: "Frações e combinações",
    summary: "Fase de ampliar repertório para frações e misturar operações com mais intenção.",
    rationale: "Já vale propor leitura de partes, comparação e primeiras composições com frações.",
    color: "#7c3aed",
  },
  {
    id: "fase-6ano",
    group: "Autonomia Matemática",
    stage: "6º ano",
    title: "Prioridade de operações",
    summary: "Entram expressões mais organizadas, parênteses e leitura em etapas.",
    rationale: "O ganho aqui é menos decorar e mais organizar o raciocínio matemático.",
    color: "#ee8748",
  },
  {
    id: "fase-7ano",
    group: "Autonomia Matemática",
    stage: "7º ano",
    title: "Pensamento algébrico inicial",
    summary: "Boa fase para migrar de conta para relação entre quantidades e incógnitas.",
    rationale: "A criança já suporta melhor abstração leve, especialmente com equações de 1º grau.",
    color: "#dc2626",
  },
  {
    id: "fase-8ano",
    group: "Autonomia Matemática",
    stage: "8º ano",
    title: "Símbolos e padrões",
    summary: "Potências, raízes e equações mais firmes entram com mais naturalidade aqui.",
    rationale: "A proposta passa a exigir leitura simbólica mais madura e autonomia de estratégia.",
    color: "#b91c1c",
  },
  {
    id: "fase-9ano",
    group: "Autonomia Matemática",
    stage: "9º ano",
    title: "Revisão algébrica",
    summary: "Etapa boa para revisar expressões densas e equações com mais exigência.",
    rationale: "A ideia aqui é preparar transição, consolidando raciocínio algébrico e fluência simbólica.",
    color: "#7f1d1d",
  },
];

const GUIDED_BLOCK_SUGGESTIONS: GuidedBlockSuggestion[] = [
  {
    id: "fase-2ano-adicao",
    stageId: "fase-2ano",
    objective: "Consolidar soma",
    focus: "Adição com 2 dígitos",
    summary: "Fortalece composição, decomposição e cálculo mental inicial.",
    rationale: "Bom ponto de partida para crianças que já reconhecem números e estão consolidando operações básicas.",
    type: "aritmetica",
    config: { operacao: "adicao", digitos1: 2, digitos2: 2, formato: "linear", quantidade: 12 },
  },
  {
    id: "fase-2ano-subtracao",
    stageId: "fase-2ano",
    objective: "Iniciar subtração",
    focus: "Subtração sem reagrupamento pesado",
    summary: "Trabalha retirada, comparação e leitura de contas simples.",
    rationale: "Ajuda a introduzir subtração sem jogar a criança cedo demais em contas complexas.",
    type: "aritmetica",
    config: { operacao: "subtracao", digitos1: 2, digitos2: 1, formato: "linear", quantidade: 12 },
  },
  {
    id: "fase-3ano-multiplicacao",
    stageId: "fase-3ano",
    objective: "Treinar tabuada",
    focus: "Multiplicação introdutória",
    summary: "Treino de tabuada e primeiras estruturas multiplicativas.",
    rationale: "Ajuda quando a criança já soma com segurança e começa a perceber padrões de grupos iguais.",
    type: "aritmetica",
    config: { operacao: "multiplicacao", digitos1: 1, digitos2: 1, formato: "linear", quantidade: 12 },
  },
  {
    id: "fase-3ano-divisao",
    stageId: "fase-3ano",
    objective: "Começar divisão",
    focus: "Divisão exata por repartição",
    summary: "Apresenta divisão simples com quociente inteiro e baixa carga visual.",
    rationale: "É um primeiro passo seguro para conectar divisão ao que já foi aprendido em multiplicação.",
    type: "aritmetica",
    config: {
      operacao: "divisao",
      digitos1: 2,
      digitos2: 1,
      formato: "linear",
      permitirResto: false,
      quantidade: 10,
    },
  },
  {
    id: "fase-4ano-divisao",
    stageId: "fase-4ano",
    objective: "Dominar divisão armada",
    focus: "Divisão armada",
    summary: "Trabalha repartição, quociente e leitura da conta armada.",
    rationale: "Boa sugestão para crianças que já dominam multiplicação e estão avançando para algoritmos mais estruturados.",
    type: "aritmetica",
    config: {
      operacao: "divisao",
      digitos1: 3,
      digitos2: 1,
      formato: "armada",
      permitirResto: false,
      quantidade: 8,
    },
  },
  {
    id: "fase-4ano-multiplicacao",
    stageId: "fase-4ano",
    objective: "Fixar conta armada",
    focus: "Multiplicação armada",
    summary: "Fortalece alinhamento, valor posicional e cálculo escrito.",
    rationale: "Ajuda a consolidar organização espacial do algoritmo antes de tarefas ainda mais densas.",
    type: "aritmetica",
    config: { operacao: "multiplicacao", digitos1: 2, digitos2: 1, formato: "armada", quantidade: 10 },
  },
  {
    id: "fase-5ano-fracoes",
    stageId: "fase-5ano",
    objective: "Entrar em frações",
    focus: "Frações com mesmo denominador",
    summary: "Introduz leitura de partes e comparação com menor carga cognitiva.",
    rationale: "Mantém o foco no conceito de fração sem misturar muitos elementos novos ao mesmo tempo.",
    type: "fracoes",
    config: {
      operacao: "soma",
      denomMax: 8,
      denominadorComum: true,
      semprePropria: true,
      quantidade: 8,
    },
  },
  {
    id: "fase-5ano-fracoes-mistas",
    stageId: "fase-5ano",
    objective: "Misturar leitura de frações",
    focus: "Frações em soma e subtração",
    summary: "Alterna soma e subtração mantendo denominadores controlados.",
    rationale: "É uma boa progressão para quem já começou a entender parte-todo e comparação.",
    type: "fracoes",
    config: {
      operacao: "misto",
      denomMax: 10,
      denominadorComum: true,
      semprePropria: true,
      quantidade: 8,
    },
  },
  {
    id: "fase-6ano-expressoes",
    stageId: "fase-6ano",
    objective: "Organizar o raciocínio",
    focus: "Expressões numéricas simples",
    summary: "Treina prioridade de operações e leitura organizada.",
    rationale: "Fase boa para integrar soma, subtração e multiplicação em desafios de múltiplas etapas.",
    type: "expressoes",
    config: {
      complexidade: "simples",
      termos: 3,
      operacoes: ["adicao", "subtracao", "multiplicacao"],
      usarParenteses: true,
      nivelAgrupamento: 1,
      quantidade: 6,
    },
  },
  {
    id: "fase-6ano-expressoes-media",
    stageId: "fase-6ano",
    objective: "Aumentar a complexidade",
    focus: "Expressões com parênteses",
    summary: "Introduz agrupamento e mais passos de resolução sem exagerar no tamanho.",
    rationale: "Boa evolução para sair de contas isoladas e trabalhar processo de resolução.",
    type: "expressoes",
    config: {
      complexidade: "media",
      termos: 4,
      operacoes: ["adicao", "subtracao", "multiplicacao"],
      usarParenteses: true,
      nivelAgrupamento: 1,
      quantidade: 6,
    },
  },
  {
    id: "fase-7ano-equacoes",
    stageId: "fase-7ano",
    objective: "Começar equações",
    focus: "Equações de 1º grau",
    summary: "Começa a formalizar pensamento algébrico de forma progressiva.",
    rationale: "Ideal quando a criança já lida melhor com operações e pode migrar para relações com incógnitas.",
    type: "equacoes",
    config: { tipo: "misto", coefMax: 10, respMax: 20, quantidade: 6 },
  },
  {
    id: "fase-7ano-expressoes",
    stageId: "fase-7ano",
    objective: "Ganhar autonomia em etapas",
    focus: "Expressões médias",
    summary: "Combina agrupamento e múltiplas operações em uma trilha intermediária.",
    rationale: "Reforça leitura matemática estruturada antes de aumentar muito a abstração.",
    type: "expressoes",
    config: {
      complexidade: "media",
      termos: 4,
      operacoes: ["adicao", "subtracao", "multiplicacao", "divisao"],
      usarParenteses: true,
      nivelAgrupamento: 2,
      quantidade: 6,
    },
  },
  {
    id: "fase-8ano-potencias",
    stageId: "fase-8ano",
    objective: "Ler símbolos com segurança",
    focus: "Potências e raízes",
    summary: "Aprofunda padrões numéricos e leitura simbólica com mais autonomia.",
    rationale: "Boa entrada para estudantes que já dominam operações e começam a lidar com potências e radicais.",
    type: "potenciacao",
    config: { tipo: "misto", baseMax: 12, expMax: 3, somentePerfeitasRaiz: true, quantidade: 8 },
  },
  {
    id: "fase-8ano-equacoes",
    stageId: "fase-8ano",
    objective: "Fortalecer álgebra",
    focus: "Equações com coeficientes maiores",
    summary: "Eleva o desafio das equações sem mudar a natureza do conteúdo.",
    rationale: "Ajuda a ganhar fluência algébrica antes de revisões mais densas do 9º ano.",
    type: "equacoes",
    config: { tipo: "misto", coefMax: 15, respMax: 40, quantidade: 6 },
  },
  {
    id: "fase-9ano-equacoes",
    stageId: "fase-9ano",
    objective: "Revisar álgebra",
    focus: "Equações algébricas",
    summary: "Prioriza incógnitas, coeficientes maiores e leitura mais madura da expressão.",
    rationale: "Faz mais sentido para 9º ano começar com uma trilha algébrica mais direta.",
    type: "equacoes",
    config: { tipo: "misto", coefMax: 20, respMax: 60, quantidade: 6 },
  },
  {
    id: "fase-9ano-expressoes",
    stageId: "fase-9ano",
    objective: "Consolidar revisão numérica",
    focus: "Expressões avançadas",
    summary: "Consolida leitura de estruturas maiores e preparo para desafios mais completos.",
    rationale: "Boa alternativa quando o objetivo é revisar processo e organização de resolução.",
    type: "expressoes",
    config: {
      complexidade: "avancada",
      termos: 5,
      operacoes: ["adicao", "subtracao", "multiplicacao", "divisao"],
      usarParenteses: true,
      nivelAgrupamento: 2,
      quantidade: 6,
    },
  },
];

function renderStageBadge(stage: string): React.ReactNode {
  const match = stage.match(/^(\d+)[ºo]\s+(ano)$/i);
  if (!match) return stage;

  return (
    <span className="inline-flex items-baseline gap-[1px]">
      <span>{match[1]}</span>
      <sup className="relative top-0 text-[0.92em] font-black leading-none">º</sup>
      <span className="ml-1">{match[2]}</span>
    </span>
  );
}

const DEFAULT_BLOCKS: Omit<Block, "id">[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// EXERCISE GENERATORS (ported from FolhaMath v8)
// ─────────────────────────────────────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

let activeRandom: () => number = Math.random;

function rand(): number {
  return activeRandom();
}

function rnd(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function nDigits(n: number): number {
  if (n <= 0) return rnd(1, 9);
  const lo = Math.pow(10, n - 1);
  const hi = Math.pow(10, n) - 1;
  return rnd(lo, hi);
}

function fracHTML(num: number, den: number): string {
  // Inline styles garantem o layout correto no html2canvas do iOS WebKit,
  // que às vezes não aplica CSS classes corretamente em elementos off-screen.
  const FRAC_WRAP = 'display:inline-block;text-align:center;line-height:1;vertical-align:middle;';
  const FRAC_NUM  = 'display:block;padding:0 4px 1px;text-align:center;min-width:16px;line-height:1.1;font-weight:500;color:#0F172A;';
  const FRAC_BAR  = 'display:block;width:100%;min-width:16px;height:1.5px;background-color:#374151;margin:0;padding:0;border:0;line-height:0;font-size:0;';
  const FRAC_DEN  = 'display:block;padding:1px 4px 0;text-align:center;min-width:16px;line-height:1.1;font-weight:500;color:#0F172A;';
  return `<span class="ex-frac" style="${FRAC_WRAP}"><span class="ex-frac-num" style="${FRAC_NUM}">${num}</span><span class="ex-frac-bar" style="${FRAC_BAR}"></span><span class="ex-frac-den" style="${FRAC_DEN}">${den}</span></span>`;
}

function genAritmetica(c: BlockConfig): { html: string; answer: string | number } {
  let op = c.operacao || "multiplicacao";
  if (op === "misto") {
    const mixedOps = ["adicao", "subtracao", "multiplicacao", "divisao"] as const;
    op = mixedOps[rnd(0, mixedOps.length - 1)];
  }
  const opSymbols: Record<string, string> = {
    adicao: "+",
    subtracao: "−",
    multiplicacao: "×",
    divisao: "÷",
  };
  const sym = opSymbols[op] || "×";

  if (op === "divisao") {
    const divisor = nDigits(c.digitos2 ?? 2);
    let dividendo: number, quotient: number, resto: number;

    if (c.permitirResto) {
      let attempts = 0;
      do {
        dividendo = nDigits(c.digitos1 ?? 3);
        quotient = Math.floor(dividendo / divisor);
        resto = dividendo % divisor;
        if (quotient < 1) {
          dividendo = divisor * 2 + rnd(0, divisor - 1);
          quotient = Math.floor(dividendo / divisor);
          resto = dividendo % divisor;
        }
        attempts++;
      } while (dividendo === divisor && attempts < 20);
    } else {
      const loD = Math.pow(10, (c.digitos1 ?? 3) - 1);
      const hiD = Math.pow(10, c.digitos1 ?? 3) - 1;
      const loQ = Math.max(2, Math.ceil(loD / divisor));
      const hiQ = Math.floor(hiD / divisor);
      quotient =
        loQ <= hiQ ? rnd(loQ, hiQ) : Math.max(2, rnd(2, Math.max(2, Math.floor(hiD / divisor))));
      dividendo = divisor * quotient;
      resto = 0;
    }

    const answer = resto > 0 ? `${quotient} r${resto}` : `${quotient}`;
    if (c.formato === "linear") {
      return {
        html: `<span class="ex-linear">${dividendo} ${sym} ${divisor} =</span>`,
        answer,
      };
    }

    return {
      answer,
      html: `<div class="ex-divisao-armada">
      <span class="ex-divisao-dividendo">${dividendo}</span>
      <div class="ex-divisao-right">
        <span class="ex-divisao-divisor">${divisor}</span>
        <span class="ex-divisao-quociente"></span>
      </div>
    </div>`,
    };
  }

  if (c.formato === "linear") {
    let a = nDigits(c.digitos1 ?? 3),
      b = nDigits(c.digitos2 ?? 3);
    if (op === "subtracao" && !c.negativos && a < b) {
      const t = a;
      a = b;
      b = t;
    }
    let ans: string | number;
    if (op === "adicao") ans = a + b;
    else if (op === "subtracao") ans = a - b;
    else if (op === "multiplicacao") ans = a * b;
    else ans = "";
    return { html: `<span class="ex-linear">${a} ${sym} ${b} =</span>`, answer: ans };
  }

  let a = nDigits(c.digitos1 ?? 3),
    b = nDigits(c.digitos2 ?? 3);
  if (op === "subtracao" && a < b) {
    const t = a;
    a = b;
    b = t;
  }
  let ans: number;
  if (op === "adicao") ans = a + b;
  else if (op === "subtracao") ans = a - b;
  else ans = a * b;
  const symLabel = op === "multiplicacao" ? "×" : op === "adicao" ? "+" : "−";
  return {
    answer: ans,
    html: `<div class="ex-mult-armada">
      <div class="ex-mult-row"><span class="ex-mult-op-symbol" style="visibility:hidden">${symLabel}</span><span>${a}</span></div>
      <div class="ex-mult-row"><span class="ex-mult-op-symbol">${symLabel}</span><span>${b}</span></div>
      <div class="ex-mult-line"></div>
    </div>`,
  };
}

function genFracoes(c: BlockConfig): { html: string; answer: string | number } {
  const denomMax = Math.max(2, c.denomMax ?? 10);
  const forceDenomComum = c.denominadorComum ?? false;
  const resultadoPositivo = c.resultadoPositivo !== false;
  const semprePropria = c.semprePropria !== false;

  let d1: number, d2: number;
  if (forceDenomComum) {
    d1 = d2 = rnd(2, denomMax);
  } else {
    d1 = rnd(2, denomMax);
    d2 = rnd(2, denomMax);
  }

  const maxN1 = semprePropria ? d1 - 1 : d1 + Math.floor(d1 / 2);
  const maxN2 = semprePropria ? d2 - 1 : d2 + Math.floor(d2 / 2);
  let n1 = rnd(1, Math.max(1, maxN1)),
    n2 = rnd(1, Math.max(1, maxN2));

  let op = c.operacao || "soma";
  if (op === "misto") op = rand() < 0.5 ? "soma" : "subtracao";

  if (op === "subtracao" && resultadoPositivo) {
    if (n1 * d2 < n2 * d1) {
      [n1, n2] = [n2, n1];
      [d1, d2] = [d2, d1];
    }
    if (n1 * d2 === n2 * d1) {
      d2 = d1 + 1;
      n2 = 1;
    }
  }

  const sym = op === "subtracao" ? "−" : "+";
  const mmc = (a: number, b: number): number => {
    let x = a,
      y = b;
    while (y) {
      const t = y;
      y = x % y;
      x = t;
    }
    return (a * b) / x;
  };
  const mdc = (a: number, b: number): number => (b ? mdc(b, a % b) : a);
  const lcd = mmc(d1, d2);
  const resN =
    op === "subtracao" ? n1 * (lcd / d1) - n2 * (lcd / d2) : n1 * (lcd / d1) + n2 * (lcd / d2);
  const g = mdc(Math.abs(resN), lcd);
  const rNum = resN / g,
    rDen = lcd / g;

  let ansStr: string;
  if (rDen === 1) {
    ansStr = `${rNum}`;
  } else if (c.numerosMistos && Math.abs(rNum) > rDen) {
    const intPart = Math.trunc(rNum / rDen);
    const fracPart = Math.abs(rNum % rDen);
    ansStr = `${intPart} ${fracPart}/${rDen}`;
  } else {
    ansStr = `${rNum}/${rDen}`;
  }

  return {
    answer: ansStr,
    html: `<span class="ex-fracao-expr">${fracHTML(n1, d1)}<span class="ex-frac-op">${sym}</span>${fracHTML(n2, d2)}<span class="ex-frac-result"> =</span></span>`,
  };
}

function genEquacoes(c: BlockConfig): { html: string; answer: string | number } {
  const coefMax = c.coefMax ?? 9,
    respMax = c.respMax ?? 20;
  let tipo = c.tipo ?? "misto";
  if (tipo === "misto") {
    const opts = ["ax+b=c", "ax-b=c", "x/a+b=c"];
    tipo = opts[rnd(0, opts.length - 1)];
  }
  const a = rnd(2, coefMax);
  const b = rnd(1, Math.min(10, respMax - 1));
  let lhs = "",
    sol = 0,
    rhs = 0;

  if (tipo === "ax+b=c") {
    sol = rnd(1, Math.floor(respMax / a));
    rhs = a * sol + b;
    lhs = `<span class="ex-eq-coef">${a}</span><span class="ex-eq-var">x</span> <span class="ex-eq-op">+</span> <span class="ex-eq-num">${b}</span>`;
  } else if (tipo === "ax-b=c") {
    const solMin = Math.floor(b / a) + 1;
    const solMax = Math.max(solMin, Math.floor(respMax / a));
    sol = rnd(solMin, solMax);
    rhs = a * sol - b;
    lhs = `<span class="ex-eq-coef">${a}</span><span class="ex-eq-var">x</span> <span class="ex-eq-op">−</span> <span class="ex-eq-num">${b}</span>`;
  } else {
    const xaMax = Math.max(1, Math.floor(respMax / a));
    sol = a * rnd(1, xaMax);
    rhs = sol / a + b;
    lhs = `<span class="ex-eq-frac-wrap" style="display:inline-block;text-align:center;line-height:1;vertical-align:middle;margin:0 2px;"><span class="ex-eq-frac-top" style="display:block;padding:0 2px 1px;text-align:center;min-width:14px;line-height:1;font-style:italic;font-weight:500;color:#0F172A;">x</span><span class="ex-eq-frac-bar" style="display:block;width:100%;min-width:14px;height:1.5px;background-color:#374151;margin:0;padding:0;border:0;line-height:0;font-size:0;"></span><span class="ex-eq-frac-bot" style="display:block;padding:1px 2px 0;text-align:center;line-height:1;font-weight:500;color:#0F172A;">${a}</span></span> <span class="ex-eq-op">+</span> <span class="ex-eq-num">${b}</span>`;
  }

  return {
    answer: `x = ${sol}`,
    html: `<span class="ex-equacao">${lhs}<span class="ex-eq-equals"> = </span><span class="ex-eq-num">${rhs}</span></span>`,
  };
}

function genPotenciacao(c: BlockConfig): { html: string; answer: string | number } {
  let tipo = c.tipo ?? "misto";
  if (tipo === "misto") tipo = rand() < 0.5 ? "potencia" : "raiz";

  if (tipo === "raiz") {
    const expMax = Math.min(c.expMax ?? 3, 3);
    const n = rnd(2, expMax);
    const base = rnd(2, Math.min(c.baseMax ?? 12, 12));
    const val = Math.pow(base, n);
    const raizSym = `<span class="ex-raiz-sign">√</span>`;
    const idxHtml =
      n > 2
        ? `<span class="ex-raiz-idx">${n}</span><span class="ex-raiz-sign">√</span>`
        : raizSym;
    return {
      answer: base,
      html: `<span style="display:inline-flex;align-items:center;gap:4px"><span class="ex-raiz">${idxHtml}<span class="ex-raiz-val">${val}</span></span><span class="ex-pot-result"> =</span></span>`,
    };
  }

  const base = rnd(2, c.baseMax ?? 12),
    exp = rnd(2, c.expMax ?? 3);
  return {
    answer: Math.pow(base, exp),
    html: `<span class="ex-pot"><span class="ex-pot-base">${base}</span><span class="ex-pot-exp">${exp}</span><span class="ex-pot-result"> =</span></span>`,
  };
}

type ASTNode =
  | { type: "num"; val: number }
  | { type: "pot"; base: number; exp: number }
  | { type: "raiz"; val: number }
  | { type: "frac"; num: number; den: number }
  | { type: "mod"; inner: ASTNode }
  | { type: "op"; op: string; left: ASTNode; right: ASTNode; paren: boolean; groupLevel?: number };

function evalNode(node: ASTNode): number {
  if (node.type === "num") return node.val;
  if (node.type === "pot") return Math.pow(node.base, node.exp);
  if (node.type === "raiz") return Math.sqrt(node.val);
  if (node.type === "frac") return node.num / node.den;
  if (node.type === "mod") return Math.abs(evalNode(node.inner));
  const l = evalNode(node.left),
    r = evalNode(node.right);
  if (node.op === "adicao") return l + r;
  if (node.op === "subtracao") return l - r;
  if (node.op === "multiplicacao") return l * r;
  if (node.op === "divisao") return r !== 0 ? l / r : NaN;
  return l;
}

function validateTree(
  node: ASTNode,
  opts?: { onlyIntegers?: boolean },
): { ok: boolean; value: number } {
  if (node.type === "num") return { ok: true, value: node.val };
  if (node.type === "pot") {
    const v = Math.pow(node.base, node.exp);
    return { ok: Number.isFinite(v), value: v };
  }
  if (node.type === "raiz") {
    const v = Math.sqrt(node.val);
    return { ok: Number.isFinite(v) && v >= 0, value: v };
  }
  if (node.type === "frac")
    return node.den !== 0 ? { ok: true, value: node.num / node.den } : { ok: false, value: NaN };
  if (node.type === "mod") {
    const inner = validateTree(node.inner, opts);
    return inner.ok ? { ok: true, value: Math.abs(inner.value) } : inner;
  }
  const left = validateTree(node.left, opts);
  if (!left.ok) return left;
  const right = validateTree(node.right, opts);
  if (!right.ok) return right;
  const l = left.value,
    r = right.value;
  let value: number;
  if (node.op === "adicao") value = l + r;
  else if (node.op === "subtracao") value = l - r;
  else if (node.op === "multiplicacao") value = l * r;
  else if (node.op === "divisao") {
    if (r === 0) return { ok: false, value: NaN };
    value = l / r;
    if (opts?.onlyIntegers && !Number.isInteger(value)) return { ok: false, value };
  } else value = l;
  if (!Number.isFinite(value)) return { ok: false, value };
  return { ok: true, value };
}

function renderNode(node: ASTNode, opsSyms: Record<string, string>): string {
  if (node.type === "num") return `<span class="ex-expr-term">${node.val}</span>`;
  if (node.type === "pot")
    return `<span class="ex-expr-term" style="display:inline;white-space:nowrap"><span>${node.base}</span><span style="font-size:0.6em;vertical-align:super;line-height:1;margin-left:1px">${node.exp}</span></span>`;
  if (node.type === "raiz") {
    return `<span class="ex-raiz"><span class="ex-raiz-sign">√</span><span class="ex-raiz-val">${node.val}</span></span>`;
  }
  if (node.type === "frac")
    return `<span class="ex-expr-term" style="display:inline-flex;flex-direction:column;align-items:center;line-height:1.1;vertical-align:middle;margin:0 2px"><span style="border-bottom:1.5px solid #111;padding:0 2px 1px;font-size:0.85em">${node.num}</span><span style="padding:1px 2px 0;font-size:0.85em">${node.den}</span></span>`;
  if (node.type === "mod")
    return `<span class="ex-expr-op">|</span>${renderNode(node.inner, opsSyms)}<span class="ex-expr-op">|</span>`;
  const sym = opsSyms[node.op] || "+";
  const left = renderNode(node.left, opsSyms);
  const right = renderNode(node.right, opsSyms);
  const inner = `${left} <span class="ex-expr-op">${sym}</span> ${right}`;
  if (node.paren) {
    const GROUPS: [string, string][] = [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ];
    const level = Math.min(node.groupLevel ?? 0, GROUPS.length - 1);
    const [open, close] = GROUPS[level];
    return `<span class="ex-expr-op">${open}</span>${inner}<span class="ex-expr-op">${close}</span>`;
  }
  return inner;
}

function genExpressoes(c: BlockConfig): { html: string; answer: string | number } {
  const opsKeys = c.operacoes && c.operacoes.length > 0 ? c.operacoes : ["adicao", "subtracao"];
  const opsSyms: Record<string, string> = {
    adicao: "+",
    subtracao: "−",
    multiplicacao: "×",
    divisao: "÷",
    potenciacao: "^",
    radiciacao: "√",
    fracao: "/",
    modulo: "|",
  };
  const termos = Math.max(2, c.termos ?? 3);
  const maxVal = c.complexidade === "simples" ? 9 : c.complexidade === "avancada" ? 99 : 20;
  const somenteInteiros = true;
  const ATOM_OPS = ["potenciacao", "radiciacao", "fracao", "modulo"];
  const atomOpsSet = new Set(opsKeys.filter((k) => ATOM_OPS.includes(k)));
  const binOps = opsKeys.filter((k) => !ATOM_OPS.includes(k));
  const binOpsEfetivos = binOps.length > 0 ? binOps : ["adicao"];
  const QUADRADOS = [4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144];
  const FRACOES_SIMPLES: [number, number][] = [
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 5],
    [2, 3],
    [3, 4],
    [2, 5],
    [3, 5],
    [4, 5],
  ];
  const HIGH_PREC = new Set(["multiplicacao", "divisao"]);
  const maxNivel = c.nivelAgrupamento ?? (c.usarParenteses ? 1 : 0);

  function buildPrecedenceTree(atoms: ASTNode[], ops: string[]): ASTNode {
    const termNodes: ASTNode[] = [atoms[0]];
    const lowOps: string[] = [];
    for (let i = 0; i < ops.length; i++) {
      if (HIGH_PREC.has(ops[i])) {
        const left = termNodes[termNodes.length - 1];
        termNodes[termNodes.length - 1] = {
          type: "op",
          op: ops[i],
          left,
          right: atoms[i + 1],
          paren: false,
        };
      } else {
        termNodes.push(atoms[i + 1]);
        lowOps.push(ops[i]);
      }
    }
    let t: ASTNode = termNodes[0];
    for (let i = 0; i < lowOps.length; i++) {
      t = { type: "op", op: lowOps[i], left: t, right: termNodes[i + 1], paren: false };
    }
    return t;
  }

  function buildFullTree(atoms: ASTNode[], ops: string[], nivel: number): ASTNode {
    if (nivel >= 1 && termos >= 3) {
      const groupSize = Math.min(termos, nivel + 2);
      const linearSize = termos - groupSize;
      const groupAtoms = atoms.slice(linearSize);
      const groupOps = ops.slice(linearSize);
      let inner: ASTNode = {
        type: "op",
        op: groupOps[groupOps.length - 1],
        left: groupAtoms[groupAtoms.length - 2],
        right: groupAtoms[groupAtoms.length - 1],
        paren: true,
        groupLevel: 0,
      };
      for (let gi = groupOps.length - 2; gi >= 0; gi--) {
        const level = Math.min(groupOps.length - 1 - gi, nivel - 1);
        inner = {
          type: "op",
          op: groupOps[gi],
          left: groupAtoms[gi],
          right: inner,
          paren: true,
          groupLevel: level,
        };
      }
      if (linearSize > 0) {
        const linAtoms = [...atoms.slice(0, linearSize), inner];
        const linOps = ops.slice(0, linearSize);
        return buildPrecedenceTree(linAtoms, linOps);
      } else {
        (inner as Extract<ASTNode, { type: "op" }>).paren = false;
        return inner;
      }
    }
    return buildPrecedenceTree(atoms, ops);
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    function gerarAtomo(allowAtom: boolean): ASTNode {
      if (allowAtom && atomOpsSet.size > 0 && rand() < 0.45) {
        const atomTipos = [...atomOpsSet];
        const tipo = atomTipos[rnd(0, atomTipos.length - 1)];
        if (tipo === "potenciacao") {
          const base = rnd(2, maxVal <= 9 ? 4 : 9);
          const exp = rnd(2, maxVal <= 9 ? 2 : 3);
          return { type: "pot", base, exp };
        }
        if (tipo === "radiciacao") {
          const q = QUADRADOS[rnd(0, Math.min(QUADRADOS.length - 1, maxVal <= 9 ? 2 : 7))];
          return { type: "raiz", val: q };
        }
        if (tipo === "fracao") {
          const [num, den] = FRACOES_SIMPLES[rnd(0, FRACOES_SIMPLES.length - 1)];
          return { type: "frac", num, den };
        }
        if (tipo === "modulo") {
          const a = rnd(1, maxVal);
          const b = rnd(1, maxVal);
          const innerNode: ASTNode = {
            type: "op",
            op: "subtracao",
            left: { type: "num", val: Math.min(a, b) },
            right: { type: "num", val: Math.max(a, b) },
            paren: false,
          };
          return { type: "mod", inner: innerNode };
        }
      }
      return { type: "num", val: rnd(1, maxVal) };
    }

    const atomNodes: ASTNode[] = Array.from({ length: termos }, (_, i) => gerarAtomo(i > 0));
    atomNodes[0] = { type: "num", val: rnd(1, maxVal) };
    const opList: string[] = Array.from(
      { length: termos - 1 },
      () => binOpsEfetivos[rnd(0, binOpsEfetivos.length - 1)],
    );

    if (somenteInteiros) {
      for (let i = 0; i < opList.length; i++) {
        if (opList[i] === "divisao") {
          if (atomNodes[i].type !== "num" || atomNodes[i + 1].type !== "num") {
            opList[i] = "multiplicacao";
            continue;
          }
          const divisor = rnd(2, Math.min(9, maxVal));
          const q = rnd(1, Math.max(1, Math.floor(maxVal / divisor)));
          (atomNodes[i] as Extract<ASTNode, { type: "num" }>).val = divisor * q;
          (atomNodes[i + 1] as Extract<ASTNode, { type: "num" }>).val = divisor;
        }
      }
    }

    const tree = buildFullTree(atomNodes, opList, maxNivel);
    const validation = validateTree(tree, { onlyIntegers: somenteInteiros });
    if (!validation.ok) continue;
    const result = Math.round(validation.value * 1000) / 1000;
    const parts = renderNode(tree, opsSyms);
    return {
      answer: result,
      html: `<span class="ex-expressao">${parts}&nbsp;<span class="ex-expr-eq">=</span></span>`,
    };
  }

  const a = rnd(1, maxVal),
    b = rnd(1, maxVal);
  return {
    answer: a + b,
    html: `<span class="ex-expressao"><span class="ex-expr-term">${a}</span> <span class="ex-expr-op">+</span> <span class="ex-expr-term">${b}</span>&nbsp;<span class="ex-expr-eq">=</span></span>`,
  };
}

const GENERATORS: Record<BlockType, (c: BlockConfig) => { html: string; answer: string | number }> =
  {
    aritmetica: genAritmetica,
    fracoes: genFracoes,
    equacoes: genEquacoes,
    potenciacao: genPotenciacao,
    expressoes: genExpressoes,
  };

function generateAllExercises(blocks: Block[], shuffle: boolean, seed: number): ExerciseItem[] {
  const prevRandom = activeRandom;
  activeRandom = seededRandom(seed);
  try {
    const seen = new Set<string>();
    const all: ExerciseItem[] = [];
    for (const block of blocks) {
      if (!block.active) continue;
      const fn = GENERATORS[block.type];
      if (!fn) continue;
      let generated = 0,
        attempts = 0;
      while (generated < block.config.quantidade && attempts < block.config.quantidade * 10) {
        attempts++;
        const r = fn(block.config);
        const key = `${block.type}|${r.html}`;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push({ blockId: block.id, type: block.type, html: r.html, answer: r.answer });
        generated++;
      }
    }
    if (shuffle) {
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }
    }
    return all;
  } finally {
    activeRandom = prevRandom;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION TOKEN
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// PRINT HTML BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildPrintHTML(
  exercises: ExerciseItem[],
  blocks: Block[],
  cfg: GlobalConfig,
  seed: number,
): string {
  const fzMap: Record<FontSize, string> = { P: "12px", M: "14px", G: "18px" };
  const fz = fzMap[cfg.fontSize];
  const fzSm = cfg.fontSize === "P" ? "10px" : cfg.fontSize === "G" ? "14px" : "11px";
  const fzTitle = cfg.fontSize === "P" ? "16px" : cfg.fontSize === "G" ? "24px" : "18px";

  const cols = cfg.cols;
  const numerar = cfg.numerar;
  const showNome = cfg.showNome;

  const FONT = `Inter,system-ui,-apple-system,sans-serif`;
  const S = {
    // Título: tracking um pouco mais aberto, peso levemente reduzido — elegante sem ser pesado
    title: `font-family:${FONT};font-size:18px;font-weight:600;text-align:center;letter-spacing:1.2px;color:#0F172A;margin-bottom:10px;`,
    // Dupla linha substituída por uma linha única mais espessa — mais limpa
    rule2: `height:1.5px;background:#D1D5DB;margin:0 0 4px;`,
    rule1: `display:none;`,
    // Separador pós-campos: leve
    ruleGray: `height:1px;background:#F3F4F6;margin:8px 0 10px;`,
    // Linha de info do aluno: text menor, mais ar
    infoRow: `font-family:${FONT};font-size:12px;color:#1F2937;padding:4px 0;letter-spacing:0.04em;`,
    // Seção: tracking mais generoso, margem superior maior para respirar
    secHead: `font-family:${FONT};font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.14em;margin:16px 0 6px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;`,
    // Número: discreto, não compete com o exercício
    exNum: `font-family:${FONT};font-size:${fz};color:#9CA3AF;white-space:nowrap;flex-shrink:0;min-width:28px;line-height:1.3;`,
    // Conteúdo: levemente mais espaçado verticalmente
    exBody: `font-family:${FONT};font-size:${fz};color:#1F2937;line-height:1.3;flex:1;min-width:0;`,
    page: `font-family:${FONT};font-size:${fz};color:#1F2937;line-height:1.3;`,
    footer: `font-family:${FONT};font-size:${fzSm};color:#9CA3AF;letter-spacing:0.04em;line-height:1.25;`,
  };

  const labelStyle = `font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#9CA3AF;white-space:nowrap;flex-shrink:0;`;
  const fillLine = `border-bottom:1px solid #9CA3AF;display:inline-block;vertical-align:bottom;`;
  const nomeLine = showNome
    ? `
    <div style="${S.infoRow} display:flex;align-items:baseline;gap:8px;">
      <span style="${labelStyle}">Nome</span>
      <span style="${fillLine} flex:1;min-width:120px;">&nbsp;</span>
      <span style="${labelStyle} margin-left:24px;">Data</span>
      <span style="${fillLine} min-width:28px;">&nbsp;</span><span style="color:#9CA3AF;padding:0 1px;">/</span><span style="${fillLine} min-width:28px;">&nbsp;</span><span style="color:#9CA3AF;padding:0 1px;">/</span><span style="${fillLine} min-width:40px;">&nbsp;</span>
    </div>
    <div style="${S.infoRow} display:flex;align-items:baseline;gap:8px;margin-top:8px;">
      <span style="${labelStyle}">Turma</span>
      <span style="${fillLine} min-width:80px;">${cfg.turma ? "&nbsp;" + cfg.turma : "&nbsp;"}</span>
      <span style="flex:1;"></span>
      <span style="${labelStyle}">Nota</span>
      <span style="${fillLine} min-width:60px;">&nbsp;</span>
      ${cfg.tempo ? `<span style="${labelStyle} margin-left:16px;">Tempo</span><span style="${fillLine} min-width:60px;"><strong style="color:#1F2937;">${cfg.tempo}</strong></span>` : ""}
    </div>`
    : "";

  const header = `
    <div style="${S.title}">${cfg.title || "Folha de Exercícios"}</div>
    <div style="${S.rule1}"></div>
    ${nomeLine}
    ${showNome ? `<div style="${S.ruleGray}"></div>` : ""}
  `;

  if (cfg.subtitle) {
    // subtitle handled after header
  }

  // Build section headers map
  const activeBlocks = blocks.filter((b) => b.active);
  const blockNameMap: Record<number, string> = {};
  activeBlocks.forEach((b) => {
    blockNameMap[b.id] = BLOCK_META[b.type].name;
  });
  const sectionHeaders: Record<number, string> = {};
  if (!cfg.embaralhar) {
    const byBlockExs = new Map<number, number[]>();
    exercises.forEach((ex, idx) => {
      if (!byBlockExs.has(ex.blockId)) byBlockExs.set(ex.blockId, []);
      byBlockExs.get(ex.blockId)!.push(idx);
    });
    activeBlocks.forEach((b) => {
      const indices = byBlockExs.get(b.id);
      if (indices && indices.length > 0) sectionHeaders[indices[0]] = blockNameMap[b.id] ?? b.type;
    });
  }

  // Build exercise grid
  const gridStyle = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px 24px;align-items:start;`;
  let exRows = "";
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    const isArmada = ex.type === "aritmetica";
    const numSpan = numerar ? `<span style="${S.exNum}">${i + 1})</span>` : "";
    if (sectionHeaders[i]) {
      exRows += `<div style="grid-column:1/-1;${S.secHead}">${sectionHeaders[i]}</div>`;
    }
    if (isArmada) {
      exRows += `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:10px;break-inside:avoid;page-break-inside:avoid;">${numSpan}<div style="${S.exBody}">${ex.html}</div></div>`;
    } else {
      exRows += `<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:10px;break-inside:avoid;page-break-inside:avoid;">${numSpan}<div style="${S.exBody}">${ex.html}</div></div>`;
    }
  }

  const exSection = `<div style="${gridStyle}">${exRows}</div>`;

  // Gabarito
  let gabSection = "";
  if (cfg.gabarito !== "sem") {
    const ansItems = exercises.map((ex, i) => {
      const num = numerar ? `${i + 1})` : "";
      const val = ex.answer !== undefined && ex.answer !== null ? String(ex.answer) : "—";
      return `<div style="font-family:${FONT};font-size:${fz};color:#1F2937;line-height:1.3;">${num}&nbsp;${val}</div>`;
    });
    const gabGrid = `display:grid;grid-template-columns:repeat(2,1fr);gap:10px 24px;`;
    if (cfg.gabarito === "proxima") {
      gabSection = `
        <div style="page-break-before:always;break-before:page;${S.page}">
          <div style="${S.title}">Gabarito</div>
          <div style="${S.rule1} margin-bottom:10px;"></div>
          <div style="${gabGrid}">${ansItems.join("")}</div>
        </div>`;
    } else {
      gabSection = `
        <div style="margin-top:16px;">
          <div style="${S.rule2}"></div>
          <div style="${S.rule1} margin-bottom:8px;"></div>
          <div style="font-family:${FONT};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#374151;margin-bottom:6px;">Gabarito</div>
          <div style="${gabGrid}">${ansItems.join("")}</div>
        </div>`;
    }
  }

const footerHtml = `<div style="margin-top:0;padding-top:6mm;padding-bottom:${PRINT_FOOTER_SAFE_PAD}px;line-height:1.25;border-top:1px solid #ddd;display:flex;justify-content:center;${S.footer}"><span>Axiora Tools</span></div>`;

  const subtitleHtml = cfg.subtitle
    ? `<p style="font-family:${FONT};font-size:${fz};color:#6B7280;margin:0 0 10px;padding:4px 0;border-bottom:1px solid #E5E7EB;">${cfg.subtitle}</p>`
    : "";

  /* Monospace preservado apenas nas classes de alinhamento de cálculo armado */
  const NUMBER_FONT = FONT;
  const exStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
    html,body{background:#fff;font-family:${FONT};font-size:${fz};color:#1F2937;line-height:1.3;-webkit-text-size-adjust:100%;text-size-adjust:100%;font-synthesis-weight:none;}
    @page{size:A4 portrait;margin:0;}
    @media print{
      html,body{background:#fff;width:${A4_W_MM};height:auto;}
      .no-print{display:none!important;}
      .print-sheet{width:${A4_W_MM}!important;height:${A4_H_MM}!important;min-height:${A4_H_MM}!important;max-height:${A4_H_MM}!important;page-break-after:always;break-after:page;overflow:hidden;}
      .print-sheet:last-child{page-break-after:auto;break-after:auto;}
    }
    /* — Aritmética armada: monospace para alinhamento de colunas — */
    .ex-mult-armada{display:inline-flex;flex-direction:column;align-items:flex-end;font-family:${NUMBER_FONT};font-size:${fz};font-weight:500;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;gap:2px;color:#0F172A;}
    .ex-mult-row{display:flex;align-items:center;gap:6px;white-space:nowrap;}
    .ex-mult-op-symbol{min-width:16px;text-align:right;color:#0F172A;}
    .ex-mult-line{width:100%;height:0;border-top:1.5px solid #374151;margin:2px 0 0;}
    .ex-divisao-armada{display:inline-flex;align-items:flex-start;font-family:${NUMBER_FONT};font-size:${fz};font-weight:500;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;color:#0F172A;}
    .ex-divisao-dividendo{white-space:nowrap;padding-right:4px;line-height:1.5;}
    .ex-divisao-right{display:flex;flex-direction:column;}
    .ex-divisao-divisor{white-space:nowrap;padding:0 2px 3px 6px;border-left:1px solid #374151;border-bottom:1px solid #374151;}
    .ex-divisao-quociente{min-height:1.8em;padding:2px 2px 0 6px;}
    /* — Exercícios lineares e expressões — */
    .ex-linear{font-family:${FONT};font-size:${fz};white-space:normal;word-break:break-word;}
    .ex-frac{display:inline-block;text-align:center;line-height:1;vertical-align:middle;}
    .ex-frac-num{display:block;padding:0 4px 1px;text-align:center;min-width:16px;line-height:1.1;font-size:${fz};font-weight:500;color:#0F172A;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;}
    .ex-frac-bar{display:block;width:100%;min-width:16px;height:1.5px;background-color:#374151;padding:0;margin:0;border:0;line-height:0;font-size:0;}
    .ex-frac-den{display:block;padding:1px 4px 0;text-align:center;min-width:16px;line-height:1.1;font-size:${fz};font-weight:500;color:#0F172A;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;}
    .ex-frac-op{font-size:${fz};padding:0 2px;align-self:center;color:#0F172A;}
    .ex-frac-result{align-self:center;font-size:${fz};color:#0F172A;}
    .ex-fracao-expr{display:inline-flex;align-items:center;gap:10px;font-family:${FONT};font-size:${fz};}
    .ex-equacao{font-family:${FONT};font-size:${fz};display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px;}
    .ex-eq-var{font-style:italic;font-size:${fz};color:#1F2937;}
    .ex-eq-op,.ex-eq-equals,.ex-eq-num,.ex-eq-coef{font-size:${fz};color:#0F172A;font-weight:500;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;}
    .ex-eq-frac-wrap{display:inline-block;text-align:center;line-height:1;vertical-align:middle;margin:0 2px;}
    .ex-eq-frac-top{display:block;font-style:italic;font-size:calc(${fz} * 0.85);padding:0 2px 1px;line-height:1;min-width:14px;text-align:center;}
    .ex-eq-frac-bar{display:block;width:100%;min-width:14px;height:1.5px;background-color:#374151;padding:0;margin:0;border:0;line-height:0;font-size:0;}
    .ex-eq-frac-bot{display:block;font-size:calc(${fz} * 0.85);padding:1px 2px 0;line-height:1;text-align:center;}
    .ex-pot{font-family:${FONT};font-size:${fz};white-space:nowrap;display:inline;}
    .ex-pot-base{font-size:${fz};color:#0F172A;font-weight:500;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;}
    .ex-pot-exp{font-size:.6em;vertical-align:super;line-height:1;margin-left:1px;}
    .ex-pot-result{font-size:${fz};margin-left:6px;color:#0F172A;font-weight:500;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;}
    .ex-raiz{display:inline-flex;align-items:flex-start;font-family:${FONT};font-size:${fz};gap:0;vertical-align:middle;line-height:1;}
    .ex-raiz-sign{display:inline-block;font-size:1.2em;line-height:1;margin-right:1px;transform:translateY(0.1em);}
    .ex-raiz-val{display:inline-block;border-top:1.5px solid #374151;padding:0.1em 4px 0 2px;font-size:${fz};line-height:1.18;color:#0F172A;font-weight:500;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;}
    .ex-raiz-idx{display:inline-block;font-size:0.52em;line-height:1;vertical-align:super;margin-right:1px;transform:translateY(-0.2em);font-family:${FONT};}
    .ex-expressao{font-family:${FONT};font-size:${fz};display:inline-flex;align-items:center;flex-wrap:wrap;gap:5px;}
    .ex-expr-term,.ex-expr-op,.ex-expr-eq{font-size:${fz};}
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<title>${cfg.title || "Folha de Exercícios"}</title>
<style>${exStyles}</style>
</head><body style="padding:0;margin:0;">
<div class="print-sheet" style="${S.page} padding:${PAGE_PY}px ${PAGE_PX}px; box-sizing:border-box; display:flex; flex-direction:column; overflow:hidden;">
  ${header}
  ${subtitleHtml}
  ${exSection}
  ${cfg.gabarito === "mesma" ? gabSection : ""}
  ${footerHtml}
</div>
${cfg.gabarito === "proxima" ? gabSection : ""}
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATION ENGINE — Canva / Google Docs model
// Each page is an exact A4 document (794 × 1123 px). JS distributes exercises.
// No CSS cutting, no overflow hacks, no scale tricks.
// ─────────────────────────────────────────────────────────────────────────────

const A4_W = 794;
const A4_H = 1123;
const A4_W_MM = "210mm";
const A4_H_MM = "297mm";
const PAGE_PX = 32; // horizontal padding (matches print margins)
const PAGE_PY = 24; // vertical padding   (matches print margins)
const PRINT_FOOTER_SAFE_PAD = 8;

interface PageSlice {
  exIndexes: number[]; // which exercise indices belong on this page
  isFirstPage: boolean;
}

interface PageLayoutAdjustment {
  extraRowGap: number;
  extraSectionGap: number;
}

interface PageContentMetrics {
  differencePx: number;
  usableMainHeight: number;
}

function getPdfViewportTuning(cfg: GlobalConfig) {
  if (typeof window === "undefined" || !window.matchMedia("(max-width: 767px)").matches) {
    return {
      docScale: 1,
      lineHeight: 1.3,
      rowGapBias: 0,
      sectionGapBias: 0,
    } as const;
  }

  if (cfg.repeatHeader) {
    return {
      docScale: 0.992,
      lineHeight: 1.285,
      rowGapBias: -1,
      sectionGapBias: -1,
    } as const;
  }

  return {
    docScale: 0.974,
    lineHeight: 1.275,
    rowGapBias: -1,
    sectionGapBias: -1,
  } as const;
}

interface MeasuredExerciseLayout {
  exerciseHeights: Record<number, number>;
  sectionHeights: Record<number, { mid: number; top: number }>;
  headerHeight: number;
  subtitleHeight: number;
  footerHeight: number;
}

function buildPreviewPagesFromSlices(
  pageSlices: PageSlice[],
  answerPageSlices: ExerciseItem[][],
  generatedExercises: ExerciseItem[],
  blocks: Block[],
  cfg: GlobalConfig,
  seed: number,
  pageLayoutAdjustments: PageLayoutAdjustment[] = [],
): string[] {
  if (!pageSlices.length || !generatedExercises.length) return [];

  const sectionHeaders = buildSectionHeaderMap(generatedExercises, blocks, cfg);
  const pages = pageSlices
    .map((slice) => ({
      isFirstPage: slice.isFirstPage,
      items: slice.exIndexes
        .map((index) => ({ index, item: generatedExercises[index] }))
        .filter((entry): entry is { index: number; item: ExerciseItem } => Boolean(entry.item)),
    }))
    .filter((page) => page.items.length > 0);

  const htmlPages = pages.map((page, index) =>
    buildOnePageHTML(
      page.items,
      cfg,
      seed,
      page.isFirstPage,
      sectionHeaders,
      pageLayoutAdjustments[index] ?? { extraRowGap: 0, extraSectionGap: 0 },
    ),
  );

  if (cfg.gabarito === "proxima") {
    const answerPages = answerPageSlices.length > 0 ? answerPageSlices : [generatedExercises];
    let answerOffset = 0;
    htmlPages.push(
      ...answerPages.map((pageExercises) => {
        const html = buildAnswerPageHTML(pageExercises, cfg, seed, answerOffset);
        answerOffset += pageExercises.length;
        return html;
      }),
    );
  }

  return htmlPages;
}

function buildPrintDocumentFromPages(
  pages: string[],
  cfg: GlobalConfig,
): string {
  const isIOSWebKit = isIOSWebKitBrowser();
  const sharedPrintCss = buildPrintCss(cfg);
  const printBottomPadPx = PAGE_PY + PRINT_FOOTER_SAFE_PAD;
  const iosFooterReservePx = 44;
  const iosHeightSafetyPx = 2;

  const pagesHtml = pages
    .map((page, index) => {
      const normalized = normalizePrintPageHtml(stripInlineDocStyle(page));
      if (!hasMeaningfulPrintContent(normalized)) return "";
      return `<div class="print-page${index > 0 ? " print-page--next" : ""}">${normalized}</div>`;
    })
    .filter(Boolean)
    .join("");

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${
    cfg.title || "Folha de Exercícios"
  }</title>
        <style>
          @page{size:A4 portrait;margin:0;}
          ${sharedPrintCss}
          html,body{margin:0;padding:0;background:#fff;width:210mm;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;-webkit-text-size-adjust:100%;text-size-adjust:100%;}
          /* ── iOS WebKit print fix — history:
             v1 — min-height:1063px + break-before:page → 3 pages per logical page.
                  iOS uses 72dpi for print: 1063px ≈ 375mm >> A4.
             v2 — height:297mm + break-before:page → 2 pages per logical page.
                  height:297mm ends exactly at page boundary; break-before fires again
                  on that same boundary → double break → blank page between every pair.
             v3 — height:297mm, no break-before → blank trailing page.
                  iOS generates an extra page after the last 297mm block.
             v4 — height:297mm + :last-child{height:auto} + height:100% on .sheet-root
                  → footer overflows to new page on full pages. iOS does not honour
                  overflow:hidden in print; clipped content becomes a new physical page.
             v4.1 — reverted .sheet-root height → footer rises (no fixed flex height).
                    Blank page reappears with many pages (4×297mm hits page boundary).
             v5 (current) — no fixed height on .print-page; break-before:page for page
                  separation; min-height:calc(297mm - Xpx) on .preview-page.
                  calc() mixes mm (DPI-independent) and px (scales with DPI), so the
                  result is the exact available content area at any print DPI. Footer
                  stays at bottom via flex + margin-top:auto on non-full pages.
                  break-before only fires after natural content height (never at an
                  exact 297mm boundary) → no double-break blank pages. ── */
          .print-page{
            width:210mm;
            box-sizing:border-box;
            padding:${PAGE_PY}px ${PAGE_PX}px ${printBottomPadPx}px ${PAGE_PX}px;
            ${isIOSWebKit ? "break-after:page;page-break-after:always;" : ""}
          }
          .print-page:last-child{
            ${isIOSWebKit ? "break-after:auto;page-break-after:auto;" : ""}
          }
          .print-page--next{
            ${isIOSWebKit ? "" : "break-before:page;page-break-before:always;"}
          }
          .print-page .sheet-root{
            width:100% !important;
          }
          .print-page .sheet-root .preview-page{
            width:100% !important;
            box-sizing:border-box;
            padding:0 !important;
            ${isIOSWebKit ? "display:block !important;" : "display:flex !important;flex-direction:column !important;"}
            ${isIOSWebKit ? "min-height:0 !important;" : `min-height:calc(297mm - ${PAGE_PY}px - ${printBottomPadPx}px${
              isIOSWebKit ? ` - ${iosFooterReservePx}px - ${iosHeightSafetyPx}px` : ""
            }) !important;`}
          }
          .print-page .sheet-root .main{
            display:block !important;
            overflow:visible !important;
            min-height:0 !important;
            ${isIOSWebKit ? `padding-bottom:${iosFooterReservePx}px !important;break-inside:avoid !important;page-break-inside:avoid !important;` : ""}
          }
          .print-page .sheet-root [data-axiora-print-footer="1"]{
            ${isIOSWebKit ? "margin-top:0 !important;break-inside:avoid !important;page-break-inside:avoid !important;" : "margin-top:auto !important;"}
          }
        </style>
      </head><body>${pagesHtml}</body></html>`;
}

function buildPrintCss(cfg: GlobalConfig): string {
  return buildDocCSS(cfg)
    .replace(/^\s*@import url\([^)]+\);\s*/m, "")
    .replace(/font-synthesis-weight:none;?/g, "")
    // Remove the entire .sheet-root .preview-page{...} block from print CSS.
    // That block sets width:794px, height:1123px, padding:24px 32px — screen-only
    // values. In the print popup, @page margin + print-specific rules handle all
    // sizing. Keeping this block forces iOS browsers to resolve a conflict between
    // px-based screen values and mm/%-based print !important overrides, which they
    // handle inconsistently. Removing it means the print rules are the ONLY source
    // of truth — no conflict, no iOS-specific override failure.
    .replace(/\.sheet-root\s+\.preview-page\s*\{[^}]*\}/g, "")
    // Also remove the box-sizing line that only applies to .preview-page
    .replace(/\.sheet-root\s+\.preview-page\s*,\.sheet-root\s+\.preview-page[^{]*\{[^}]*box-sizing[^}]*\}/g, "")
    .trim();
}

function stripInlineDocStyle(page: string): string {
  return page.replace(/^<style>[\s\S]*?<\/style>/, "");
}

function normalizePrintPageHtml(pageHtml: string): string {
  const normalizedMain = pageHtml.replace(
    /<div class="main"([^>]*)style="[^"]*"/gi,
    '<div class="main"$1 style="display:block;min-height:0;overflow:visible;"',
  );

  return normalizedMain.replace(
    /<div([^>]*)style="([^"]*border-top:[^"]*)">([\s\S]*?Axiora\s*Tools[\s\S]*?)<\/div>/gi,
    (_match, attrs: string, style: string, body: string) =>
      `<div${attrs} data-axiora-print-footer="1" style="${style};margin-top:auto;padding-bottom:${PRINT_FOOTER_SAFE_PAD}px;line-height:1.25;">${body}</div>`,
  );
}

function hasMeaningfulPrintContent(pageHtml: string): boolean {
  const withoutFooter = pageHtml.replace(
    /<div[^>]*border-top[^>]*>[\s\S]*?Axiora\s*Tools[\s\S]*?<\/div>/gi,
    "",
  );
  const textOnly = withoutFooter
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return textOnly.length > 0;
}

function isIOSWebKitBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iP(hone|ad|od)/i.test(ua);
  const isWebKit = /AppleWebKit/i.test(ua);
  const isChromeOrSafari = /CriOS|Safari/i.test(ua);
  return isIOS && isWebKit && isChromeOrSafari;
}

async function downloadPdfFromPreviewPages(
  pages: string[],
  cfg: GlobalConfig,
): Promise<void> {
  const printBottomPadPx = PAGE_PY + PRINT_FOOTER_SAFE_PAD;
  const printablePages = pages
    .map((page) => normalizePrintPageHtml(stripInlineDocStyle(page)))
    .filter((page) => hasMeaningfulPrintContent(page));

  if (!printablePages.length) {
    throw new Error("no_printable_pages");
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const host = document.createElement("div");
  // iOS WebKit não computa layout de elementos muito fora da viewport (left:-100000px).
  // Com opacity:0 + position:fixed na viewport, o layout é computado corretamente
  // e html2canvas consegue ler getBoundingClientRect() com valores corretos.
  host.style.position = "fixed";
  host.style.left = "0";
  host.style.top = "0";
  host.style.opacity = "0";
  host.style.width = `${A4_W}px`;
  host.style.pointerEvents = "none";
  host.style.background = "#ffffff";
  host.style.zIndex = "-1";

  host.innerHTML = `
    <style>
      ${buildPrintCss(cfg)}
      .export-page{
        width:${A4_W}px;
        min-height:${A4_H}px;
        box-sizing:border-box;
        padding:${PAGE_PY}px ${PAGE_PX}px ${printBottomPadPx}px ${PAGE_PX}px;
        background:#fff;
      }
      .export-page .sheet-root{width:100% !important;}
      .export-page .sheet-root .preview-page{
        width:100% !important;
        min-height:${A4_H - PAGE_PY - printBottomPadPx}px !important;
        box-sizing:border-box;
        padding:0 !important;
        display:flex !important;
        flex-direction:column !important;
      }
      .export-page .sheet-root .main{
        display:block !important;
        min-height:0 !important;
        overflow:visible !important;
      }
    </style>
    ${printablePages.map((page) => `<div class="export-page">${page}</div>`).join("")}
  `;

  const simplifyMathForCanvasExport = (root: ParentNode) => {
    const doc = root instanceof Document ? root : root.ownerDocument;
    if (!doc) return;

    // html2canvas on iOS may distort stacked-fraction/radical layouts.
    // Normalize to text math for stable canvas export.
    const fracNodes = Array.from(root.querySelectorAll<HTMLElement>(".ex-frac"));
    for (const frac of fracNodes) {
      const num = (frac.querySelector(".ex-frac-num")?.textContent || "").trim();
      const den = (frac.querySelector(".ex-frac-den")?.textContent || "").trim();
      if (!num || !den) continue;
      const flat = doc.createElement("span");
      flat.className = "ex-frac-flat";
      flat.style.display = "inline-block";
      flat.style.whiteSpace = "nowrap";
      flat.style.fontWeight = "600";
      flat.textContent = `${num}/${den}`;
      frac.replaceWith(flat);
    }

    const rootNodes = Array.from(root.querySelectorAll<HTMLElement>(".ex-raiz"));
    for (const radical of rootNodes) {
      const idx = (radical.querySelector(".ex-raiz-idx")?.textContent || "").trim();
      const val = (radical.querySelector(".ex-raiz-val")?.textContent || "").trim();
      if (!val) continue;
      const flat = doc.createElement("span");
      flat.className = "ex-raiz-flat";
      flat.style.display = "inline-block";
      flat.style.whiteSpace = "nowrap";
      flat.style.fontWeight = "600";
      if (!idx || idx === "2") {
        flat.textContent = `√${val}`;
      } else if (idx === "3") {
        flat.textContent = `∛${val}`;
      } else if (idx === "4") {
        flat.textContent = `∜${val}`;
      } else {
        flat.textContent = `${idx}√${val}`;
      }
      radical.replaceWith(flat);
    }

    const eqFracNodes = Array.from(root.querySelectorAll<HTMLElement>(".ex-eq-frac-wrap"));
    for (const eqFrac of eqFracNodes) {
      const top = (eqFrac.querySelector(".ex-eq-frac-top")?.textContent || "").trim();
      const bot = (eqFrac.querySelector(".ex-eq-frac-bot")?.textContent || "").trim();
      if (!top || !bot) continue;
      const flat = doc.createElement("span");
      flat.className = "ex-eq-frac-flat";
      flat.style.display = "inline-block";
      flat.style.whiteSpace = "nowrap";
      flat.style.fontWeight = "600";
      flat.textContent = `${top}/${bot}`;
      eqFrac.replaceWith(flat);
    }

    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const replacements: Array<[string, string]> = [
      ["−", "-"],
      ["×", "x"],
      ["÷", "/"],
    ];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const original = node.nodeValue || "";
      let normalized = original;
      for (const [from, to] of replacements) {
        normalized = normalized.split(from).join(to);
      }
      if (normalized !== original) {
        node.nodeValue = normalized;
      }
    }
  };

  simplifyMathForCanvasExport(host);
  document.body.appendChild(host);

  try {
    try {
      if ("fonts" in document && document.fonts?.ready) {
        await document.fonts.ready;
      }
    } catch {}

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const nodes = Array.from(host.querySelectorAll<HTMLElement>(".export-page"));
    if (!nodes.length) {
      throw new Error("no_export_nodes");
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const renderScale = Math.max(3, Math.ceil(window.devicePixelRatio || 1));

    for (let i = 0; i < nodes.length; i += 1) {
      const canvas = await html2canvas(nodes[i], {
        scale: renderScale,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 0,
      });
      if (i > 0) doc.addPage("a4", "portrait");
      doc.addImage(canvas, "PNG", 0, 0, 210, 297, undefined, "FAST");
    }

    const safeTitle =
      (cfg.title || "Folha de Exercícios")
        .replace(/[\\/:*?"<>|]+/g, "")
        .trim()
        .slice(0, 80) || "Folha de Exercícios";
    const fileName = `${safeTitle}.pdf`;

    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } finally {
    host.remove();
  }
}

/**
 * Splits exercises into A4 page slices using conservative estimated heights.
 * Fully synchronous — no DOM measurement, no hidden iframes, no setTimeout.
 */
function paginateSimple(
  exercises: ExerciseItem[],
  blocks: Block[],
  cfg: GlobalConfig,
): PageSlice[] {
  if (!exercises.length) return [];

  const rowGap = Math.max(cfg.spacing, 8);
  const cols = cfg.cols;
  const secHeaders = buildSectionHeaderMap(exercises, blocks, cfg);
  const fontScale = cfg.fontSize === "P" ? 0.92 : cfg.fontSize === "G" ? 1.14 : 1;

  // Conservative height estimates (px).
  // These are deliberately larger than actual rendered heights so pages never overflow.
  // Actual CSS: section header = margin(36+14) + content(27) + gap_after(18) = 95px
  //             armada mult/div = monospace rows ~120-150px
  //             frac/raiz = inline fraction ~65-80px
  //             linear = single text row ~50px
  function estimateExH(ex: ExerciseItem): number {
    if (ex.html.includes("ex-mult-armada") || ex.html.includes("ex-divisao-armada"))
      return Math.round(80 * fontScale);
    if (ex.html.includes("ex-frac") || ex.html.includes("ex-raiz"))
      return Math.round(50 * fontScale);
    if (ex.html.includes("ex-equacao")) return Math.round(34 * fontScale);
    return Math.round(28 * fontScale); // equacoes, potenciacao, expressoes, linear aritmetica
  }

  // Fixed UI chrome heights (px) — all over-estimated for safety
  // title(54) + rule(6) + nome(70) + ruleGray(29) = ~159px; subtitle ~56px; footer ~60px
  const HEADER1_H = Math.round((cfg.showNome ? 114 : 41) * fontScale);
  const SUBTITLE1_H = cfg.subtitle ? Math.round(26 * fontScale) : 0;
  const FOOTER_H = Math.round(22 * fontScale);
  const REPEATED_HEADER_H = cfg.repeatHeader ? HEADER1_H + SUBTITLE1_H : 0;
  const footerHeight = FOOTER_H;
  const PAGE_SAFETY_BUFFER_H = Math.round((cfg.repeatHeader ? 48 : 24) * fontScale);
  const SAFE_MARGIN = 28;
  // Section header: margin:36px 0 14px + content:27px + gap_after:18px = 95px
  // Use 100px as the safe value for mid-page.
  // At page-top for non-first pages suppressTopMargin removes the 36px, but we still
  // use 100px conservatively so we never accidentally put too many items on a page.
  const SEC_H_MID = Math.round(26 * fontScale);
  const SEC_H_TOP = Math.round(16 * fontScale);
  const BALANCE_THRESHOLD = 0;

  const p1Avail =
    A4_H - 2 * PAGE_PY - HEADER1_H - SUBTITLE1_H - footerHeight - PAGE_SAFETY_BUFFER_H;
  const pnAvail =
    A4_H -
    2 * PAGE_PY -
    footerHeight -
    REPEATED_HEADER_H -
    PAGE_SAFETY_BUFFER_H;

  // Build logical grid rows: group exercises cols-at-a-time, split on section headers
  interface GridRow {
    exIndexes: number[];
    rowH: number; // max exercise height in this row
    startsWithSec: boolean;
    secH: number; // height of section header, if any precedes this row
  }
  const gridRows: GridRow[] = [];
  let pending: number[] = [];
  let pendingH = 0;
  let pendingSecH = 0;
  let pendingStartsSec = false;

  const pushPending = () => {
    if (!pending.length) return;
    gridRows.push({
      exIndexes: [...pending],
      rowH: pendingH,
      startsWithSec: pendingStartsSec,
      secH: pendingSecH,
    });
    pending = [];
    pendingH = 0;
    pendingSecH = 0;
    pendingStartsSec = false;
  };

  for (let i = 0; i < exercises.length; i++) {
    if (secHeaders[i]) {
      pushPending();
      // Section header goes on the NEXT row's metadata
      pendingStartsSec = true;
      pendingSecH = SEC_H_MID; // will be corrected to SEC_H_TOP if this row starts a page
    }
    const h = estimateExH(exercises[i]);
    pendingH = Math.max(pendingH, h);
    pending.push(i);
    if (pending.length >= cols) pushPending();
  }
  pushPending();

  // Greedy bin rows into pages
  const slices: PageSlice[] = [];
  let pageExes: number[] = [];
  let usedH = 0;
  let avail = p1Avail;
  let isFirstPage = true;

  for (let rowIndex = 0; rowIndex < gridRows.length; rowIndex++) {
    const row = gridRows[rowIndex];
    const rowsLeftIncludingCurrent = gridRows.length - rowIndex;
    const calcRowTotal = (baseUsedH: number) => {
      const secH =
        baseUsedH === 0 && row.startsWithSec ? SEC_H_TOP : row.startsWithSec ? SEC_H_MID : 0;
      const rowGapNow = baseUsedH > 0 ? rowGap : 0;
      return rowGapNow + secH + row.rowH;
    };
    let rowTotal = calcRowTotal(usedH);

    // Balance rule: if this row would leave a tiny tail and we still have more rows,
    // force a new page before placing it.
    const remainingAfterRow = avail - SAFE_MARGIN - (usedH + rowTotal);
    const singleExerciseRow = row.exIndexes.length === 1;
    if (
      pageExes.length > 0 &&
      rowsLeftIncludingCurrent > 1 &&
      remainingAfterRow > 0 &&
      remainingAfterRow < BALANCE_THRESHOLD
    ) {
      slices.push({ exIndexes: pageExes, isFirstPage });
      pageExes = [];
      usedH = 0;
      avail = pnAvail;
      isFirstPage = false;
      rowTotal = calcRowTotal(usedH);
    }

    // If this would end a page with a single-exercise line while there are more rows,
    // move this row to the next page for better visual balance.
    if (
      pageExes.length > 0 &&
      rowsLeftIncludingCurrent > 1 &&
      singleExerciseRow &&
      avail - (usedH + rowTotal) < BALANCE_THRESHOLD
    ) {
      slices.push({ exIndexes: pageExes, isFirstPage });
      pageExes = [];
      usedH = 0;
      avail = pnAvail;
      isFirstPage = false;
      rowTotal = calcRowTotal(usedH);
    }

    // Avoid single orphan exercise on page tail when more content exists.
    const wouldLeaveSingleOrphan =
      pageExes.length === 1 &&
      rowsLeftIncludingCurrent > 1 &&
      usedH + rowTotal > avail - SAFE_MARGIN;

    if ((usedH + rowTotal > avail - SAFE_MARGIN && pageExes.length > 0) || wouldLeaveSingleOrphan) {
      // This row doesn't fit — flush current page
      slices.push({ exIndexes: pageExes, isFirstPage });
      pageExes = [];
      usedH = 0;
      avail = pnAvail;
      isFirstPage = false;
      // Re-compute for fresh page start
      const secHStart = row.startsWithSec ? SEC_H_TOP : 0;
      usedH += secHStart + row.rowH;
    } else {
      usedH += rowTotal;
    }

    pageExes.push(...row.exIndexes);
  }

  if (pageExes.length > 0) slices.push({ exIndexes: pageExes, isFirstPage });

  return slices.filter((s) => s.exIndexes.length > 0);
}

function buildExerciseRows(
  exercises: ExerciseItem[],
  blocks: Block[],
  cfg: GlobalConfig,
): number[][] {
  const cols = Math.max(1, cfg.cols);
  const sectionHeaders = buildSectionHeaderMap(exercises, blocks, cfg);
  const rows: number[][] = [];
  let pending: number[] = [];

  const flushPending = () => {
    if (!pending.length) return;
    rows.push([...pending]);
    pending = [];
  };

  for (let index = 0; index < exercises.length; index += 1) {
    if (sectionHeaders[index]) {
      flushPending();
    }
    pending.push(index);
    if (pending.length >= cols) {
      flushPending();
    }
  }

  flushPending();
  return rows;
}

function analyzePageGapTargets(
  pageItems: Array<{ index: number; item: ExerciseItem }>,
  sectionHeaders: Record<number, string>,
  cols: number,
): { rowGapCount: number; sectionGapCount: number; sectionCount: number; totalRowCount: number } {
  if (!pageItems.length) {
    return { rowGapCount: 0, sectionGapCount: 0, sectionCount: 0, totalRowCount: 0 };
  }

  const sectionItemCounts: number[] = [];
  let currentSectionCount = 0;

  for (const { index } of pageItems) {
    if (sectionHeaders[index] && currentSectionCount > 0) {
      sectionItemCounts.push(currentSectionCount);
      currentSectionCount = 0;
    }
    currentSectionCount += 1;
  }

  if (currentSectionCount > 0) {
    sectionItemCounts.push(currentSectionCount);
  }

  const rowGapCount = sectionItemCounts.reduce((total, itemCount) => {
    const rows = Math.ceil(itemCount / Math.max(1, cols));
    return total + Math.max(0, rows - 1);
  }, 0);
  const totalRowCount = sectionItemCounts.reduce(
    (total, itemCount) => total + Math.ceil(itemCount / Math.max(1, cols)),
    0,
  );
  const sectionCount = sectionItemCounts.length;

  return {
    rowGapCount,
    sectionGapCount: Math.max(0, sectionCount - 1),
    sectionCount,
    totalRowCount,
  };
}

async function rebalancePageSlicesByMeasurement(
  slices: PageSlice[],
  exercises: ExerciseItem[],
  cfg: GlobalConfig,
  sectionHeaders: Record<number, string>,
): Promise<PageSlice[]> {
  const MIN_FILL_RATIO = 0.82;
  const MIN_ROWS_PER_PAGE = 2;
  const SAFE_REBALANCE_BUFFER = 14;
  const cols = Math.max(1, cfg.cols);
  const nextSlices = slices.map((slice) => ({
    ...slice,
    exIndexes: [...slice.exIndexes],
  }));

  const pageItemsFromIndexes = (indexes: number[]) =>
    indexes
      .map((index) => ({ index, item: exercises[index] }))
      .filter((entry): entry is { index: number; item: ExerciseItem } => Boolean(entry.item));

  const rowCountFromIndexes = (indexes: number[]) => Math.ceil(indexes.length / cols);

  for (let pageIndex = 0; pageIndex < nextSlices.length - 1; pageIndex++) {
    const current = nextSlices[pageIndex];
    const next = nextSlices[pageIndex + 1];
    if (!current.exIndexes.length || !next.exIndexes.length) continue;

    let currentMetrics = await measurePageContentMetrics(
      pageItemsFromIndexes(current.exIndexes),
      cfg,
      current.isFirstPage,
      sectionHeaders,
    );
    let currentFill =
      currentMetrics.usableMainHeight > 0
        ? 1 - currentMetrics.differencePx / currentMetrics.usableMainHeight
        : 1;

    while (
      next.exIndexes.length > 0 &&
      currentFill < MIN_FILL_RATIO &&
      rowCountFromIndexes(current.exIndexes) >= MIN_ROWS_PER_PAGE
    ) {
      const movedIndexes = next.exIndexes.slice(0, Math.min(cols, next.exIndexes.length));
      const candidateIndexes = [...current.exIndexes, ...movedIndexes];
      const candidateMetrics = await measurePageContentMetrics(
        pageItemsFromIndexes(candidateIndexes),
        cfg,
        current.isFirstPage,
        sectionHeaders,
      );

      if (candidateMetrics.differencePx < SAFE_REBALANCE_BUFFER) {
        break;
      }

      current.exIndexes.push(...movedIndexes);
      next.exIndexes.splice(0, movedIndexes.length);

      currentMetrics = candidateMetrics;
      currentFill =
        currentMetrics.usableMainHeight > 0
          ? 1 - currentMetrics.differencePx / currentMetrics.usableMainHeight
          : 1;
    }
  }

  return nextSlices.filter((slice) => slice.exIndexes.length > 0);
}

async function measureExerciseLayout(
  exercises: ExerciseItem[],
  blocks: Block[],
  cfg: GlobalConfig,
): Promise<MeasuredExerciseLayout | null> {
  if (typeof window === "undefined" || !exercises.length) return null;

  const html = buildMeasurementDoc(exercises, blocks, cfg);

  return await new Promise<MeasuredExerciseLayout | null>((resolve) => {
    let settled = false;
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.position = "fixed";
    host.style.left = "-10000px";
    host.style.top = "0";
    host.style.width = `${A4_W}px`;
    host.style.opacity = "0";
    host.style.pointerEvents = "none";
    host.style.overflow = "hidden";

    const cleanup = (value: MeasuredExerciseLayout | null) => {
      if (settled) return;
      settled = true;
      host.remove();
      resolve(value);
    };

    const boxHeight = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      const marginTop = parseFloat(styles.marginTop || "0");
      const marginBottom = parseFloat(styles.marginBottom || "0");
      return rect.height + marginTop + marginBottom;
    };

    const measure = async () => {
      try {
        if ("fonts" in document && document.fonts?.ready) {
          await document.fonts.ready;
        }

        const exerciseHeights: Record<number, number> = {};
        const sectionHeights: Record<number, { mid: number; top: number }> = {};

        host.querySelectorAll<HTMLElement>('[id^="sg-ex-"]').forEach((element) => {
          const match = element.id.match(/^sg-ex-(\d+)$/);
          if (!match) return;
          exerciseHeights[Number(match[1])] = boxHeight(element);
        });

        host.querySelectorAll<HTMLElement>('[id^="sg-sec-"]').forEach((element) => {
          const match = element.id.match(/^sg-sec-(\d+)$/);
          if (!match) return;
          const styles = window.getComputedStyle(element);
          const marginTop = parseFloat(styles.marginTop || "0");
          const fullHeight = boxHeight(element);
          sectionHeights[Number(match[1])] = {
            mid: fullHeight,
            top: Math.max(0, fullHeight - marginTop),
          };
        });

        const header = host.querySelector<HTMLElement>("#sg-header");
        const subtitle = host.querySelector<HTMLElement>("#sg-subtitle");
        const footer = host.querySelector<HTMLElement>("#sg-footer");

        cleanup({
          exerciseHeights,
          sectionHeights,
          headerHeight: header ? boxHeight(header) : 0,
          subtitleHeight: subtitle ? boxHeight(subtitle) : 0,
          footerHeight: footer ? boxHeight(footer) : 0,
        });
      } catch {
        cleanup(null);
      }
    };

    host.innerHTML = html;
    document.body.appendChild(host);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        void measure();
      });
    });

    window.setTimeout(() => cleanup(null), 3000);
  });
}

function paginateMeasured(
  exercises: ExerciseItem[],
  blocks: Block[],
  cfg: GlobalConfig,
  measured: MeasuredExerciseLayout,
): PageSlice[] {
  if (!exercises.length) return [];

  const rowGap = Math.max(cfg.spacing, 8);
  const cols = cfg.cols;
  const sectionHeaders = buildSectionHeaderMap(exercises, blocks, cfg);
  const fontScale = cfg.fontSize === "P" ? 0.92 : cfg.fontSize === "G" ? 1.14 : 1;
    const headerHeight = measured.headerHeight || Math.round((cfg.showNome ? 114 : 41) * fontScale);
    const subtitleHeight = measured.subtitleHeight || (cfg.subtitle ? Math.round(26 * fontScale) : 0);
    const footerHeight = measured.footerHeight || Math.round(22 * fontScale);
    const repeatedHeaderHeight = cfg.repeatHeader ? headerHeight + subtitleHeight : 0;
    const safetyBuffer = Math.round((cfg.repeatHeader ? 48 : 24) * fontScale);
    const SAFE_MARGIN = 28;
    const p1Avail =
      A4_H -
      2 * PAGE_PY -
      headerHeight -
      subtitleHeight -
      footerHeight -
      safetyBuffer;
    const pnAvail = A4_H - 2 * PAGE_PY - footerHeight - repeatedHeaderHeight - safetyBuffer;

  interface GridRow {
    exIndexes: number[];
    rowH: number;
    startsWithSec: boolean;
    secHMid: number;
    secHTop: number;
  }

  const rows: GridRow[] = [];
  let pending: number[] = [];
  let pendingH = 0;
  let pendingStartsSec = false;
  let pendingSecHMid = 0;
  let pendingSecHTop = 0;

  const flushPending = () => {
    if (!pending.length) return;
    rows.push({
      exIndexes: [...pending],
      rowH: pendingH,
      startsWithSec: pendingStartsSec,
      secHMid: pendingSecHMid,
      secHTop: pendingSecHTop,
    });
    pending = [];
    pendingH = 0;
    pendingStartsSec = false;
    pendingSecHMid = 0;
    pendingSecHTop = 0;
  };

  for (let index = 0; index < exercises.length; index += 1) {
    if (sectionHeaders[index]) {
      flushPending();
      pendingStartsSec = true;
      const sectionHeight = measured.sectionHeights[index] ?? { mid: 26, top: 16 };
      pendingSecHMid = sectionHeight.mid;
      pendingSecHTop = sectionHeight.top;
    }
    pending.push(index);
    pendingH = Math.max(pendingH, measured.exerciseHeights[index] ?? 0);
    if (pending.length >= cols) {
      flushPending();
    }
  }
  flushPending();

  const slices: PageSlice[] = [];
  let pageItems: number[] = [];
  let usedH = 0;
  let avail = p1Avail;
  let isFirstPage = true;

  for (const row of rows) {
    const secH = usedH === 0 ? row.secHTop : row.secHMid;
    const rowTotal = (usedH > 0 ? rowGap : 0) + (row.startsWithSec ? secH : 0) + row.rowH;

    if (pageItems.length > 0 && usedH + rowTotal > avail - SAFE_MARGIN) {
      slices.push({ exIndexes: pageItems, isFirstPage });
      pageItems = [];
      usedH = 0;
      avail = pnAvail;
      isFirstPage = false;
    }

    const freshSecH = pageItems.length === 0 && row.startsWithSec ? row.secHTop : row.startsWithSec ? row.secHMid : 0;
    usedH += (pageItems.length > 0 ? rowGap : 0) + freshSecH + row.rowH;
    pageItems.push(...row.exIndexes);
  }

  if (pageItems.length > 0) {
    slices.push({ exIndexes: pageItems, isFirstPage });
  }

  return slices.filter((slice) => slice.exIndexes.length > 0);
}

// ── Shared style builders ─────────────────────────────────────────────────────

function buildDocCSS(cfg: GlobalConfig): string {
  const baseFzMap: Record<FontSize, number> = { P: 12, M: 14, G: 18 };
  const tuning = getPdfViewportTuning(cfg);
  const fz = `${(baseFzMap[cfg.fontSize] * tuning.docScale).toFixed(2)}px`;
  const FONT = `Inter,system-ui,-apple-system,sans-serif`;
  const NUMBER_FONT = FONT;
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    @keyframes previewPageFade {
      from { opacity: 0; transform: scale(0.992); }
      to { opacity: 1; transform: scale(1); }
    }
    .sheet-root .preview-page{
      all:initial;
      width:${A4_W}px;
      height:${A4_H}px;
      background:#fff;
      margin:0 auto;
      box-shadow:none;
      padding:${PAGE_PY}px ${PAGE_PX}px;
      overflow:hidden;
      display:flex;
      flex-direction:column;
      justify-content:flex-start;
      font-family:${FONT};
      font-size:${fz};
      color:#1F2937;
      line-height:${tuning.lineHeight};
      -webkit-text-size-adjust:100%;
      text-size-adjust:100%;
      font-synthesis-weight:none;
    }
    .sheet-root .preview-page,.sheet-root .preview-page *,.sheet-root .preview-page *::before,.sheet-root .preview-page *::after{box-sizing:border-box;}
    .sheet-root .preview-page .ex-mult-armada{display:inline-flex;flex-direction:column;align-items:flex-end;font-family:${NUMBER_FONT};font-size:${fz};font-weight:500;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;gap:2px;color:#0F172A;}
    .sheet-root .preview-page .ex-mult-row{display:flex;align-items:center;gap:6px;white-space:nowrap;}
    .sheet-root .preview-page .ex-mult-op-symbol{min-width:16px;text-align:right;color:#0F172A;}
    .sheet-root .preview-page .ex-mult-line{width:100%;height:0;border-top:1.5px solid #374151;margin:2px 0 0;}
    .sheet-root .preview-page .ex-divisao-armada{display:inline-flex;align-items:flex-start;font-family:${NUMBER_FONT};font-size:${fz};font-weight:500;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;color:#0F172A;}
    .sheet-root .preview-page .ex-divisao-dividendo{white-space:nowrap;padding-right:4px;line-height:1.5;}
    .sheet-root .preview-page .ex-divisao-right{display:flex;flex-direction:column;}
    .sheet-root .preview-page .ex-divisao-divisor{white-space:nowrap;padding:0 2px 3px 6px;border-left:1px solid #374151;border-bottom:1px solid #374151;}
    .sheet-root .preview-page .ex-divisao-quociente{min-height:1.8em;padding:2px 2px 0 6px;}
    .sheet-root .preview-page .ex-linear{font-family:${FONT};font-size:${fz};white-space:normal;word-break:break-word;}
    .sheet-root .preview-page .ex-frac{display:inline-block;text-align:center;line-height:1;vertical-align:middle;}
    .sheet-root .preview-page .ex-frac-num{display:block;padding:0 4px 1px;text-align:center;min-width:16px;line-height:1.1;font-size:${fz};font-weight:500;color:#0F172A;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;}
    .sheet-root .preview-page .ex-frac-bar{display:block;width:100%;min-width:16px;height:1.5px;background-color:#374151;padding:0;margin:0;border:0;line-height:0;font-size:0;}
    .sheet-root .preview-page .ex-frac-den{display:block;padding:1px 4px 0;text-align:center;min-width:16px;line-height:1.1;font-size:${fz};font-weight:500;color:#0F172A;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;}
    .sheet-root .preview-page .ex-frac-op{font-size:${fz};padding:0 2px;align-self:center;color:#0F172A;}
    .sheet-root .preview-page .ex-frac-result{align-self:center;font-size:${fz};color:#0F172A;}
    .sheet-root .preview-page .ex-fracao-expr{display:inline-flex;align-items:center;gap:10px;font-family:${FONT};font-size:${fz};}
    .sheet-root .preview-page .ex-equacao{font-family:${FONT};font-size:${fz};display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px;}
    .sheet-root .preview-page .ex-eq-var{font-style:italic;font-size:${fz};color:#1F2937;}
    .sheet-root .preview-page .ex-eq-op,.sheet-root .preview-page .ex-eq-equals,.sheet-root .preview-page .ex-eq-num,.sheet-root .preview-page .ex-eq-coef{font-size:${fz};color:#0F172A;font-weight:500;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;}
    .sheet-root .preview-page .ex-eq-frac-wrap{display:inline-block;text-align:center;line-height:1;vertical-align:middle;margin:0 2px;}
    .sheet-root .preview-page .ex-eq-frac-top{display:block;font-style:italic;font-size:calc(${fz} * 0.85);padding:0 2px 1px;line-height:1;min-width:14px;text-align:center;}
    .sheet-root .preview-page .ex-eq-frac-bar{display:block;width:100%;min-width:14px;height:1.5px;background-color:#374151;padding:0;margin:0;border:0;line-height:0;font-size:0;}
    .sheet-root .preview-page .ex-eq-frac-bot{display:block;font-size:calc(${fz} * 0.85);padding:1px 2px 0;line-height:1;text-align:center;}
    .sheet-root .preview-page .ex-pot{font-family:${FONT};font-size:${fz};white-space:nowrap;display:inline;}
    .sheet-root .preview-page .ex-pot-base{font-size:${fz};color:#0F172A;font-weight:500;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;}
    .sheet-root .preview-page .ex-pot-exp{font-size:.6em;vertical-align:super;line-height:1;margin-left:1px;}
    .sheet-root .preview-page .ex-pot-result{font-size:${fz};margin-left:6px;color:#0F172A;font-weight:500;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;}
    .sheet-root .preview-page .ex-raiz{display:inline-flex;align-items:flex-start;font-family:${FONT};font-size:${fz};gap:0;vertical-align:middle;line-height:1;}
    .sheet-root .preview-page .ex-raiz-sign{display:inline-block;font-size:1.2em;line-height:1;margin-right:1px;transform:translateY(0.1em);}
    .sheet-root .preview-page .ex-raiz-val{display:inline-block;border-top:1.5px solid #374151;padding:0.1em 4px 0 2px;font-size:${fz};line-height:1.18;color:#0F172A;font-weight:500;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;}
    .sheet-root .preview-page .ex-raiz-idx{display:inline-block;font-size:0.52em;line-height:1;vertical-align:super;margin-right:1px;transform:translateY(-0.2em);}
    .sheet-root .preview-page .ex-expressao{font-family:${FONT};font-size:${fz};display:inline-flex;align-items:center;flex-wrap:wrap;gap:5px;}
    .sheet-root .preview-page .ex-expr-term,.sheet-root .preview-page .ex-expr-op,.sheet-root .preview-page .ex-expr-eq{font-size:${fz};}
  `;
}

function buildDocStyles(cfg: GlobalConfig) {
  const baseFzMap: Record<FontSize, number> = { P: 12, M: 14, G: 18 };
  const baseFzSmMap: Record<FontSize, number> = { P: 10, M: 11, G: 14 };
  const tuning = getPdfViewportTuning(cfg);
  const toPx = (value: number) => `${(value * tuning.docScale).toFixed(2)}px`;
  const fz = toPx(baseFzMap[cfg.fontSize]);
  const fzSm = toPx(baseFzSmMap[cfg.fontSize]);
  const FONT = `Inter,system-ui,-apple-system,sans-serif`;
  const S = {
    title: `font-family:${FONT};font-size:${toPx(18)};font-weight:700;text-align:center;letter-spacing:0.8px;color:#0F172A;margin-bottom:${(10 * tuning.docScale).toFixed(2)}px;`,
    rule2: `height:1.5px;background:#D1D5DB;margin:0 0 4px;`,
    ruleGray: `height:1px;background:#F3F4F6;margin:6px 0 8px;`,
    infoRow: `font-family:${FONT};font-size:${toPx(12)};color:#0F172A;padding:${(3 * tuning.docScale).toFixed(2)}px 0;letter-spacing:0.04em;`,
    secHead: `font-family:${FONT};font-size:${toPx(11)};font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.12em;margin:${(8 * tuning.docScale).toFixed(2)}px 0 ${(3 * tuning.docScale).toFixed(2)}px;padding-bottom:${(3 * tuning.docScale).toFixed(2)}px;border-bottom:1px solid #E5E7EB;`,
    exNum: `font-family:${FONT};font-size:${fz};color:#9CA3AF;white-space:nowrap;flex-shrink:0;min-width:${(28 * tuning.docScale).toFixed(2)}px;line-height:${tuning.lineHeight};`,
    exBody: `font-family:${FONT};font-size:${fz};color:#1F2937;line-height:${tuning.lineHeight};flex:1;min-width:0;`,
    page: `font-family:${FONT};font-size:${fz};color:#1F2937;line-height:${tuning.lineHeight};`,
    footer: `font-family:${FONT};font-size:${fzSm};color:#9CA3AF;letter-spacing:0.04em;`,
  };
  const lbl = `font-size:${toPx(10)};font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#0F172A;white-space:nowrap;flex-shrink:0;`;
  const ln = `border-bottom:1px solid #0F172A;display:inline-block;vertical-align:bottom;`;
  return { fz, fzSm, FONT, S, lbl, ln };
}

/** Returns sectionHeaders map: first-exercise-index → block name */
function buildSectionHeaderMap(
  exercises: ExerciseItem[],
  blocks: Block[],
  cfg: GlobalConfig,
): Record<number, string> {
  const map: Record<number, string> = {};
  if (cfg.embaralhar) return map;
  const active = blocks.filter((b) => b.active);
  const nameMap: Record<number, string> = {};
  active.forEach((b) => {
    nameMap[b.id] = BLOCK_META[b.type].name;
  });
  const byBlock = new Map<number, number[]>();
  exercises.forEach((ex, idx) => {
    if (!byBlock.has(ex.blockId)) byBlock.set(ex.blockId, []);
    byBlock.get(ex.blockId)!.push(idx);
  });
  let previousSectionTitle: string | null = null;
  active.forEach((b) => {
    const idxs = byBlock.get(b.id);
    const sectionTitle = nameMap[b.id] ?? b.type;
    if (idxs?.length && sectionTitle !== previousSectionTitle) {
      map[idxs[0]] = sectionTitle;
    }
    previousSectionTitle = sectionTitle;
  });
  return map;
}

function buildStudentRowHTML(
  cfg: GlobalConfig,
  S: ReturnType<typeof buildDocStyles>["S"],
  lbl: string,
  ln: string,
): string {
  if (!cfg.showNome) return "";
  const nomeLine = `
    <div style="${S.infoRow} display:flex;align-items:baseline;gap:8px;">
      <span style="${lbl}">Nome</span>
      <span style="${ln} flex:1;min-width:120px;">&nbsp;</span>
      <span style="${lbl} margin-left:24px;">Data</span>
      <span style="${ln} min-width:28px;">&nbsp;</span><span style="color:#9CA3AF;padding:0 1px;">/</span><span style="${ln} min-width:28px;">&nbsp;</span><span style="color:#9CA3AF;padding:0 1px;">/</span><span style="${ln} min-width:40px;">&nbsp;</span>
    </div>
    <div style="${S.infoRow} display:flex;align-items:baseline;gap:8px;margin-top:8px;">
      <span style="${lbl}">Turma</span>
      <span style="${ln} min-width:80px;">${cfg.turma ? "&nbsp;" + cfg.turma : "&nbsp;"}</span>
      <span style="flex:1;"></span>
      <span style="${lbl}">Nota</span>
      <span style="${ln} min-width:60px;">&nbsp;</span>
      ${cfg.tempo ? `<span style="${lbl} margin-left:16px;">Tempo</span><span style="${ln} min-width:60px;"><strong style="color:#1F2937;">${cfg.tempo}</strong></span>` : ""}
    </div>`;
  return nomeLine;
}

/** Measurement-only HTML: all exercises in a single long scroll, each element has an id. */
function buildMeasurementDoc(
  exercises: ExerciseItem[],
  blocks: Block[],
  cfg: GlobalConfig,
): string {
  const { fz, FONT, S, lbl, ln } = buildDocStyles(cfg);
  const css = buildDocCSS(cfg);
  const sectionHeaders = buildSectionHeaderMap(exercises, blocks, cfg);
  const tuning = getPdfViewportTuning(cfg);
  const rowGap = Math.max(6, Math.max(cfg.spacing, 8) + tuning.rowGapBias);
  const colGap = 24;
  const nomeLine = buildStudentRowHTML(cfg, S, lbl, ln);
  const headerHTML = `
    <div style="${S.title}">${cfg.title || "Folha de Exercícios"}</div>
    ${nomeLine}
    ${cfg.showNome ? `<div style="${S.ruleGray}"></div>` : ""}
  `;
  const subtitleHTML = cfg.subtitle
    ? `<p style="font-family:${FONT};font-size:${fz};color:#6B7280;margin:0 0 10px;padding:4px 0;border-bottom:1px solid #E5E7EB;">${cfg.subtitle}</p>`
    : "";

  let gridItems = "";
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    if (sectionHeaders[i]) {
      gridItems += `<div id="sg-sec-${i}" style="grid-column:1/-1;${S.secHead}">${sectionHeaders[i]}</div>`;
    }
    const numSpan = cfg.numerar ? `<span style="${S.exNum}">${i + 1})</span>` : "";
    const align = ex.type === "aritmetica" ? "flex-start" : "baseline";
    gridItems += `<div id="sg-ex-${i}" style="display:flex;align-items:${align};gap:6px;margin-bottom:4px;">${numSpan}<div style="${S.exBody}">${ex.html}</div></div>`;
  }

  return (
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>${css}</style></head>` +
    `<body style="margin:0;padding:${PAGE_PY}px ${PAGE_PX}px;box-sizing:border-box;width:${A4_W}px;">` +
    `<div id="sg-header">${headerHTML}</div>` +
    (subtitleHTML ? `<div id="sg-subtitle">${subtitleHTML}</div>` : "") +
    `<div style="display:grid;grid-template-columns:repeat(${cfg.cols},1fr);gap:${rowGap}px ${colGap}px;align-items:start;">${gridItems}</div>` +
    `<div id="sg-footer" style="${S.footer} padding-top:10px;padding-bottom:${PRINT_FOOTER_SAFE_PAD}px;line-height:1.25;border-top:1px solid #E5E7EB;display:flex;justify-content:center;">` +
    `<span>Axiora Tools</span><span>Reprodução livre para fins pedagógicos</span></div>` +
    `</body></html>`
  );
}

// Removed gap-redistribution helper: page closing now uses exact bottom spacer measurement.

/** Builds a standalone A4 HTML page for preview (exact 794 × 1123 px). */
function buildOnePageHTML(
  pageItems: Array<{ index: number; item: ExerciseItem }>,
  cfg: GlobalConfig,
  seed: number,
  isFirstPage: boolean,
  sectionHeaders: Record<number, string>,
  layoutAdjustment: PageLayoutAdjustment = { extraRowGap: 0, extraSectionGap: 0 },
  measurement = false,
): string {
  const { fz, FONT, S, lbl, ln } = buildDocStyles(cfg);
  const css = buildDocCSS(cfg);
  const tuning = getPdfViewportTuning(cfg);
  const rowGap = Math.max(6, Math.max(cfg.spacing, 8) + tuning.rowGapBias + layoutAdjustment.extraRowGap);
  const sectionGap = Math.max(6, Math.max(cfg.spacing, 8) + tuning.sectionGapBias + layoutAdjustment.extraSectionGap);
  const colGap = 24;

  const pageSections: Record<number, string> = {};
  const shouldShowHeader = isFirstPage || cfg.repeatHeader;
  for (const { index } of pageItems) {
    if (sectionHeaders[index]) pageSections[index] = sectionHeaders[index];
  }

  const groupedSections: Array<{
    title: string | null;
    suppressTopMargin: boolean;
    items: string[];
  }> = [];
  let currentSection: { title: string | null; suppressTopMargin: boolean; items: string[] } | null =
    null;

  const pushSection = () => {
    if (currentSection && currentSection.items.length > 0) {
      groupedSections.push(currentSection);
    }
  };

  for (const { index: exIdx, item: ex } of pageItems) {
    if (!ex) continue;
    if (!currentSection || pageSections[exIdx]) {
      pushSection();
      currentSection = {
        title: pageSections[exIdx] ?? null,
        suppressTopMargin: !shouldShowHeader && !isFirstPage && exIdx === pageItems[0]?.index,
        items: [],
      };
    }
    const numSpan = cfg.numerar ? `<span style="${S.exNum}">${exIdx + 1})</span>` : "";
    const align = ex.type === "aritmetica" ? "flex-start" : "baseline";
    currentSection.items.push(
      `<div style="display:flex;align-items:${align};gap:6px;margin-bottom:4px;">${numSpan}<div style="${S.exBody}">${ex.html}</div></div>`,
    );
  }
  pushSection();

  const sectionsHTML = groupedSections
    .map((section) => {
      const secStyle = section.title
        ? `grid-column:1/-1;${S.secHead}${section.suppressTopMargin ? "margin-top:0;" : ""}`
        : "";
      const titleHTML = section.title ? `<div style="${secStyle}">${section.title}</div>` : "";
      return `<section style="display:flex;flex-direction:column;gap:4px;">${titleHTML}<div style="display:grid;grid-template-columns:repeat(${cfg.cols},1fr);gap:${rowGap}px ${colGap}px;align-items:start;">${section.items.join("")}</div></section>`;
    })
    .join("");

  let pageHeaderHTML = "";
  if (shouldShowHeader) {
    const nomeLine = buildStudentRowHTML(cfg, S, lbl, ln);
    pageHeaderHTML = `
      <div style="${S.title}">${cfg.title || "Folha de Exercícios"}</div>
      ${nomeLine}
      ${cfg.showNome ? `<div style="${S.ruleGray}"></div>` : ""}
    `;
  }
  const subtitleHTML =
    shouldShowHeader && cfg.subtitle
      ? `<p style="font-family:${FONT};font-size:${fz};color:#6B7280;margin:0 0 10px;padding:4px 0;border-bottom:1px solid #E5E7EB;">${cfg.subtitle}</p>`
      : "";
  // Footer em fluxo normal com flex-shrink:0 — position:absolute cria camadas
  // separadas em Safari/iOS que viram páginas em branco no PDF.
  const footerHTML = `<div style="${S.footer} flex-shrink:0;padding-top:10px;padding-bottom:${PRINT_FOOTER_SAFE_PAD}px;line-height:1.25;border-top:1px solid #E5E7EB;display:flex;justify-content:center;"><span>Axiora Tools</span></div>`;
  const mainId = measurement ? ` id="sg-main"` : "";
  const sectionsId = measurement ? ` id="sg-sections"` : "";

  return (
    `<style>${css}</style>` +
    `<div class="sheet-root"><div class="preview-page" style="${S.page}display:flex;flex-direction:column;">` +
    pageHeaderHTML +
    subtitleHTML +
    `<div class="main"${mainId} style="flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;">` +
    `<div${sectionsId} style="display:flex;flex-direction:column;justify-content:flex-start;gap:${sectionGap}px;overflow:visible;">` +
    sectionsHTML +
    `</div></div>` +
    footerHTML +
    `</div></div>`
  );
}

// Removed gap-redistribution measurement: page closing now uses exact bottom spacer measurement.

async function measurePageContentMetrics(
  pageItems: Array<{ index: number; item: ExerciseItem }>,
  cfg: GlobalConfig,
  isFirstPage: boolean,
  sectionHeaders: Record<number, string>,
  layoutAdjustment: PageLayoutAdjustment = { extraRowGap: 0, extraSectionGap: 0 },
): Promise<PageContentMetrics> {
  if (typeof window === "undefined" || !pageItems.length) {
    return { differencePx: 0, usableMainHeight: 0 };
  }

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head><body style="margin:0;">${buildOnePageHTML(
    pageItems,
    cfg,
    0,
    isFirstPage,
    sectionHeaders,
    layoutAdjustment,
    true,
  )}</body></html>`;

  return await new Promise<PageContentMetrics>((resolve) => {
    let settled = false;
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.left = "-10000px";
    frame.style.top = "0";
    frame.style.width = `${A4_W}px`;
    frame.style.height = `${A4_H}px`;
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    frame.style.overflow = "hidden";
    frame.style.border = "0";
    frame.style.background = "#fff";

    const cleanup = (metrics: PageContentMetrics) => {
      if (settled) return;
      settled = true;
      frame.remove();
      resolve(metrics);
    };

    const measure = async () => {
      try {
        const frameWindow = frame.contentWindow;
        const frameDocument = frame.contentDocument;
        if (!frameWindow || !frameDocument) {
          cleanup({ differencePx: 0, usableMainHeight: 0 });
          return;
        }

        if ("fonts" in frameDocument && frameDocument.fonts?.ready) {
          await frameDocument.fonts.ready;
        }

        const main = frameDocument.querySelector<HTMLElement>("#sg-main");
        const sections = frameDocument.querySelector<HTMLElement>("#sg-sections");
        const HTMLElementCtor = (
          frameWindow as Window & typeof globalThis & { HTMLElement?: typeof HTMLElement }
        ).HTMLElement;
        if (
          !HTMLElementCtor ||
          !(main instanceof HTMLElementCtor) ||
          !(sections instanceof HTMLElementCtor)
        ) {
          cleanup({ differencePx: 0, usableMainHeight: 0 });
          return;
        }
        const mainStyles = frameWindow.getComputedStyle(main);
        const mainPaddingTop = parseFloat(mainStyles.paddingTop || "0");
        const mainPaddingBottom = parseFloat(mainStyles.paddingBottom || "0");
        const usableMainHeight = main.clientHeight - mainPaddingTop - mainPaddingBottom;
        const contentHeight = sections.scrollHeight;
        const difference = usableMainHeight - contentHeight;

        cleanup({
          differencePx: Number(difference.toFixed(2)),
          usableMainHeight: Number(usableMainHeight.toFixed(2)),
        });
      } catch {
        cleanup({ differencePx: 0, usableMainHeight: 0 });
      }
    };

    const handleLoad = () => {
      if (settled) return;

      const frameWindow = frame.contentWindow;
      const frameDocument = frame.contentDocument;
      if (!frameWindow || !frameDocument) {
        cleanup({ differencePx: 0, usableMainHeight: 0 });
        return;
      }

      const continueAfterFonts = async () => {
        try {
          if ("fonts" in frameDocument && frameDocument.fonts?.ready) {
            await frameDocument.fonts.ready;
          }
        } catch {
          // Keep going even if the iframe font promise is unavailable.
        }

        frameWindow.requestAnimationFrame(() => {
          frameWindow.requestAnimationFrame(() => {
            void measure();
          });
        });
      };

      void continueAfterFonts();
    };

    frame.srcdoc = html;
    frame.addEventListener("load", handleLoad, { once: true });
    document.body.appendChild(frame);

    window.setTimeout(() => cleanup({ differencePx: 0, usableMainHeight: 0 }), 3000);
  });
}

async function paginatePrecisely(
  exercises: ExerciseItem[],
  blocks: Block[],
  cfg: GlobalConfig,
): Promise<PageSlice[]> {
  if (typeof window === "undefined" || !exercises.length) {
    return paginateSimple(exercises, blocks, cfg);
  }

  const isMobileLayout =
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const SAFE_MARGIN = isMobileLayout ? (cfg.repeatHeader ? 24 : 34) : 28;
  // Merge pages only when there is a clearly large spare area.
  // Fractions/roots have taller glyph boxes and can clip near the footer if we merge too aggressively.
  const MERGE_SAFE_MARGIN = isMobileLayout
    ? cfg.repeatHeader
      ? 44
      : 64
    : cfg.repeatHeader
      ? 52
      : 72;
  const MIN_ROWS_PER_PAGE = 2;
  const rows = buildExerciseRows(exercises, blocks, cfg);
  const sectionHeaders = buildSectionHeaderMap(exercises, blocks, cfg);
  const isSparseGap = (differencePx: number) => differencePx > (cfg.repeatHeader ? 150 : 210);
  const getTargetMaxGap = (sparseGap: boolean) =>
    isMobileLayout
      ? cfg.repeatHeader
        ? sparseGap
          ? 22
          : 28
        : sparseGap
          ? 42
          : 60
      : cfg.repeatHeader
        ? sparseGap
          ? 24
          : 34
        : sparseGap
          ? 44
          : 52;
  const getMaxDonorGap = (sparseGap: boolean) =>
    isMobileLayout
      ? cfg.repeatHeader
        ? sparseGap
          ? 360
          : 220
        : sparseGap
          ? 260
          : 120
      : cfg.repeatHeader
        ? sparseGap
          ? 360
          : 240
        : sparseGap
          ? 280
          : 132;

  const pageItemsFromRows = (rowSlice: number[][]) =>
    rowSlice
      .flat()
      .map((index) => ({ index, item: exercises[index] }))
      .filter((entry): entry is { index: number; item: ExerciseItem } => Boolean(entry.item));

  const measureRowRange = async (
    startRow: number,
    endRow: number,
    isFirstPage: boolean,
  ) =>
    measurePageContentMetrics(
      pageItemsFromRows(rows.slice(startRow, endRow)),
      cfg,
      isFirstPage,
      sectionHeaders,
    );

  const pageRanges: Array<{ startRow: number; endRow: number; isFirstPage: boolean }> = [];
  let rowCursor = 0;
  let isFirstPage = true;

  while (rowCursor < rows.length) {
    let low = 1;
    let high = rows.length - rowCursor;
    let bestCount = 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const metrics = await measureRowRange(rowCursor, rowCursor + mid, isFirstPage);

      const fits = metrics.usableMainHeight > 0 && metrics.differencePx >= SAFE_MARGIN;

      if (fits) {
        bestCount = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    pageRanges.push({
      startRow: rowCursor,
      endRow: rowCursor + bestCount,
      isFirstPage,
    });

    rowCursor += bestCount;
    isFirstPage = false;
  }

  for (let pageIndex = 0; pageIndex < pageRanges.length - 1; pageIndex += 1) {
    let current = pageRanges[pageIndex];
    let next = pageRanges[pageIndex + 1];
    let currentMetrics = await measureRowRange(
      current.startRow,
      current.endRow,
      current.isFirstPage,
    );

    while (
      currentMetrics.usableMainHeight > 0 &&
      currentMetrics.differencePx > getTargetMaxGap(isSparseGap(currentMetrics.differencePx)) &&
      next.endRow - next.startRow > MIN_ROWS_PER_PAGE
    ) {
      const nextMetricsCurrent = await measureRowRange(
        next.startRow,
        next.endRow,
        next.isFirstPage,
      );
      const currentWorstGap = Math.max(
        currentMetrics.differencePx,
        nextMetricsCurrent.differencePx,
      );
      const currentGapScore =
        currentMetrics.differencePx ** 2 + nextMetricsCurrent.differencePx ** 2;
      const sparsePair =
        isSparseGap(currentMetrics.differencePx) || isSparseGap(nextMetricsCurrent.differencePx);

      let bestCandidate:
        | {
            moveCount: number;
            currentMetrics: PageContentMetrics;
            nextMetrics: PageContentMetrics;
            worstGap: number;
            gapScore: number;
          }
        | null = null;

      const maxMoveCount = Math.min(
        sparsePair ? 18 : 6,
        next.endRow - next.startRow - MIN_ROWS_PER_PAGE + 1,
      );
      for (let moveCount = 1; moveCount <= maxMoveCount; moveCount += 1) {
        const currentMetricsCandidate = await measureRowRange(
          current.startRow,
          current.endRow + moveCount,
          current.isFirstPage,
        );
        const nextMetrics = await measureRowRange(
          next.startRow + moveCount,
          next.endRow,
          next.isFirstPage,
        );

        if (
          currentMetricsCandidate.differencePx < SAFE_MARGIN ||
          nextMetrics.differencePx < SAFE_MARGIN
        ) {
          break;
        }

        const candidateWorstGap = Math.max(
          currentMetricsCandidate.differencePx,
          nextMetrics.differencePx,
        );
        const candidateGapScore =
          currentMetricsCandidate.differencePx ** 2 + nextMetrics.differencePx ** 2;

        const improvesWorstGap = sparsePair
          ? candidateWorstGap < currentWorstGap
          : candidateWorstGap + (cfg.repeatHeader ? 0 : 2) < currentWorstGap;
        const improvesPairScore = sparsePair
          ? candidateGapScore < currentGapScore
          : candidateGapScore + (cfg.repeatHeader ? 8 : 16) < currentGapScore;
        const improvesReceiver =
          currentMetricsCandidate.differencePx +
            (sparsePair ? (cfg.repeatHeader ? 0 : 2) : cfg.repeatHeader ? 6 : 10) <
            currentMetrics.differencePx &&
          nextMetrics.differencePx <=
            getMaxDonorGap(sparsePair) +
              (sparsePair ? (cfg.repeatHeader ? 160 : 120) : cfg.repeatHeader ? 180 : 120);
        if (!improvesWorstGap && !improvesPairScore && !improvesReceiver) {
          continue;
        }

        if (
          !bestCandidate ||
          candidateGapScore < bestCandidate.gapScore ||
          (candidateGapScore === bestCandidate.gapScore &&
            candidateWorstGap < bestCandidate.worstGap)
        ) {
          bestCandidate = {
            moveCount,
            currentMetrics: currentMetricsCandidate,
            nextMetrics,
            worstGap: candidateWorstGap,
            gapScore: candidateGapScore,
          };
        }
      }

      if (!bestCandidate) {
        break;
      }

      current = { ...current, endRow: current.endRow + bestCandidate.moveCount };
      next = { ...next, startRow: next.startRow + bestCandidate.moveCount };
      pageRanges[pageIndex] = current;
      pageRanges[pageIndex + 1] = next;
      currentMetrics = bestCandidate.currentMetrics;
    }
  }

  for (let pageIndex = pageRanges.length - 1; pageIndex > 0; pageIndex -= 1) {
    let current = pageRanges[pageIndex];
    let previous = pageRanges[pageIndex - 1];
    let currentMetrics = await measureRowRange(
      current.startRow,
      current.endRow,
      current.isFirstPage,
    );

    while (
      currentMetrics.usableMainHeight > 0 &&
      currentMetrics.differencePx > getTargetMaxGap(isSparseGap(currentMetrics.differencePx)) &&
      previous.endRow - previous.startRow > MIN_ROWS_PER_PAGE
    ) {
      const previousMetricsCurrent = await measureRowRange(
        previous.startRow,
        previous.endRow,
        previous.isFirstPage,
      );
      const currentWorstGap = Math.max(
        previousMetricsCurrent.differencePx,
        currentMetrics.differencePx,
      );
      const currentGapScore =
        previousMetricsCurrent.differencePx ** 2 + currentMetrics.differencePx ** 2;
      const sparsePair =
        isSparseGap(currentMetrics.differencePx) || isSparseGap(previousMetricsCurrent.differencePx);

      let bestCandidate:
        | {
            moveCount: number;
            previousMetrics: PageContentMetrics;
            currentMetrics: PageContentMetrics;
            worstGap: number;
            gapScore: number;
          }
        | null = null;

      const maxMoveCount = Math.min(
        sparsePair ? 18 : 6,
        previous.endRow - previous.startRow - MIN_ROWS_PER_PAGE + 1,
      );
      for (let moveCount = 1; moveCount <= maxMoveCount; moveCount += 1) {
        const previousMetrics = await measureRowRange(
          previous.startRow,
          previous.endRow - moveCount,
          previous.isFirstPage,
        );
        const currentMetricsCandidate = await measureRowRange(
          current.startRow - moveCount,
          current.endRow,
          current.isFirstPage,
        );

        if (
          previousMetrics.differencePx < SAFE_MARGIN ||
          currentMetricsCandidate.differencePx < SAFE_MARGIN
        ) {
          break;
        }

        const candidateWorstGap = Math.max(
          previousMetrics.differencePx,
          currentMetricsCandidate.differencePx,
        );
        const candidateGapScore =
          previousMetrics.differencePx ** 2 + currentMetricsCandidate.differencePx ** 2;

        const improvesWorstGap = sparsePair
          ? candidateWorstGap < currentWorstGap
          : candidateWorstGap + (cfg.repeatHeader ? 0 : 2) < currentWorstGap;
        const improvesPairScore = sparsePair
          ? candidateGapScore < currentGapScore
          : candidateGapScore + (cfg.repeatHeader ? 8 : 16) < currentGapScore;
        const improvesRecipient =
          currentMetricsCandidate.differencePx +
            (sparsePair ? (cfg.repeatHeader ? 0 : 2) : cfg.repeatHeader ? 6 : 10) <
            currentMetrics.differencePx &&
          previousMetrics.differencePx <= getMaxDonorGap(sparsePair);
        if (!improvesWorstGap && !improvesPairScore && !improvesRecipient) {
          continue;
        }

        if (
          !bestCandidate ||
          candidateGapScore < bestCandidate.gapScore ||
          (candidateGapScore === bestCandidate.gapScore &&
            candidateWorstGap < bestCandidate.worstGap)
        ) {
          bestCandidate = {
            moveCount,
            previousMetrics,
            currentMetrics: currentMetricsCandidate,
            worstGap: candidateWorstGap,
            gapScore: candidateGapScore,
          };
        }
      }

      if (!bestCandidate) {
        break;
      }

      previous = { ...previous, endRow: previous.endRow - bestCandidate.moveCount };
      current = { ...current, startRow: current.startRow - bestCandidate.moveCount };
      pageRanges[pageIndex - 1] = previous;
      pageRanges[pageIndex] = current;
      currentMetrics = bestCandidate.currentMetrics;
    }
  }

  // Final squeeze pass: if two adjacent pages fit together by real measurement,
  // merge them to avoid unnecessary sparse pages in preview/PDF.
  let squeezeIndex = 0;
  while (squeezeIndex < pageRanges.length - 1) {
    const current = pageRanges[squeezeIndex];
    const next = pageRanges[squeezeIndex + 1];
    const mergedMetrics = await measureRowRange(
      current.startRow,
      next.endRow,
      current.isFirstPage,
    );

    const canMerge =
      mergedMetrics.usableMainHeight > 0 && mergedMetrics.differencePx >= MERGE_SAFE_MARGIN;

    if (canMerge) {
      pageRanges[squeezeIndex] = {
        startRow: current.startRow,
        endRow: next.endRow,
        isFirstPage: current.isFirstPage,
      };
      pageRanges.splice(squeezeIndex + 1, 1);
      continue;
    }

    squeezeIndex += 1;
  }

  const slices: PageSlice[] = pageRanges.map((range) => ({
    exIndexes: pageItemsFromRows(rows.slice(range.startRow, range.endRow)).map(
      ({ index }) => index,
    ),
    isFirstPage: range.isFirstPage,
  }));

  return slices.filter((slice) => slice.exIndexes.length > 0);
}

async function measurePageContentDifference(
  pageItems: Array<{ index: number; item: ExerciseItem }>,
  cfg: GlobalConfig,
  isFirstPage: boolean,
  sectionHeaders: Record<number, string>,
  layoutAdjustment: PageLayoutAdjustment = { extraRowGap: 0, extraSectionGap: 0 },
): Promise<number> {
  const metrics = await measurePageContentMetrics(
    pageItems,
    cfg,
    isFirstPage,
    sectionHeaders,
    layoutAdjustment,
  );
  return metrics.differencePx;
}

async function measurePageLayoutAdjustment(
  pageItems: Array<{ index: number; item: ExerciseItem }>,
  cfg: GlobalConfig,
  isFirstPage: boolean,
  sectionHeaders: Record<number, string>,
): Promise<PageLayoutAdjustment> {
  const difference = await measurePageContentDifference(
    pageItems,
    cfg,
    isFirstPage,
    sectionHeaders,
  );
  // Measurement iframe: preview-page inner height = A4_H - 2*PAGE_PY = 1075px.
  // Print: preview-page min-height = A4_H - PAGE_PY - printBottomPadPx - PRINT_HEIGHT_SAFETY_PX = 1063px.
  // Discrepancy = 12px. Buffer must be ≥ 12 + 10 = 22 to keep ≥10px safety in real print.
  const SAFE_BOTTOM_BUFFER = 22;
  if (difference <= 0) {
    return { extraRowGap: 0, extraSectionGap: 0 };
  }

  const { rowGapCount, sectionGapCount, sectionCount, totalRowCount } = analyzePageGapTargets(
    pageItems,
    sectionHeaders,
    cfg.cols,
  );
  const distributableGapCount = rowGapCount + sectionGapCount;

  if (distributableGapCount <= 0) {
    return { extraRowGap: 0, extraSectionGap: 0 };
  }

  const distributableSpace = Math.max(0, difference - SAFE_BOTTOM_BUFFER);
  if (distributableSpace <= 0) {
    return { extraRowGap: 0, extraSectionGap: 0 };
  }

  const sparsePage = totalRowCount <= (cfg.repeatHeader ? 10 : 12);
  const verySparsePage = totalRowCount <= (cfg.repeatHeader ? 7 : 9);
  const multiSectionPage = sectionCount >= 2;
  const rowGapWeight = verySparsePage
    ? multiSectionPage
      ? 1.7
      : 1.5
    : sparsePage
      ? multiSectionPage
        ? 1.45
        : 1.25
      : 1;
  const sectionGapWeight = multiSectionPage
    ? verySparsePage
      ? 0.55
      : sparsePage
        ? 0.7
        : 0.9
    : 0.75;
  const distributableUnits =
    rowGapCount * rowGapWeight + sectionGapCount * sectionGapWeight;
  if (distributableUnits <= 0) {
    return { extraRowGap: 0, extraSectionGap: 0 };
  }

  const buildAdjustment = (scale: number): PageLayoutAdjustment => {
    const extraPerUnit = (distributableSpace / distributableUnits) * scale;
    return {
      extraRowGap: rowGapCount > 0 ? extraPerUnit * rowGapWeight : 0,
      extraSectionGap: sectionGapCount > 0 ? extraPerUnit * sectionGapWeight : 0,
    };
  };

  let low = 0;
  let high = 1;
  let best = buildAdjustment(0);

  for (let step = 0; step < 7; step += 1) {
    const mid = (low + high) / 2;
    const candidate = buildAdjustment(mid);
    const adjustedDifference = await measurePageContentDifference(
      pageItems,
      cfg,
      isFirstPage,
      sectionHeaders,
      candidate,
    );

    if (adjustedDifference >= SAFE_BOTTOM_BUFFER) {
      best = candidate;
      low = mid;
    } else {
      high = mid;
    }
  }

  return best;
}

async function computePageLayoutAdjustments(
  pageSlices: PageSlice[],
  exercises: ExerciseItem[],
  blocks: Block[],
  cfg: GlobalConfig,
): Promise<PageLayoutAdjustment[]> {
  if (typeof window === "undefined" || !pageSlices.length || !exercises.length) {
    return pageSlices.map(() => ({ extraRowGap: 0, extraSectionGap: 0 }));
  }

  const sectionHeaders = buildSectionHeaderMap(exercises, blocks, cfg);
  const baseRowGapCap = cfg.repeatHeader ? 12 : 8;
  const baseSectionGapCap = cfg.repeatHeader ? 16 : 10;

  const adjustments = await Promise.all(
    pageSlices.map(async (slice) => {
      const pageItems = slice.exIndexes
        .map((index) => ({ index, item: exercises[index] }))
        .filter((entry): entry is { index: number; item: ExerciseItem } => Boolean(entry.item));

      if (!pageItems.length) {
        return { extraRowGap: 0, extraSectionGap: 0 };
      }

      const gapTargets = analyzePageGapTargets(pageItems, sectionHeaders, cfg.cols);
      const sparsePage = gapTargets.totalRowCount <= (cfg.repeatHeader ? 10 : 12);
      const verySparsePage = gapTargets.totalRowCount <= (cfg.repeatHeader ? 7 : 9);
      const ultraSparsePage = gapTargets.totalRowCount <= (cfg.repeatHeader ? 5 : 7);
      const multiSectionPage = gapTargets.sectionCount >= 2;
      const rowGapCap =
        baseRowGapCap +
        (ultraSparsePage
          ? cfg.repeatHeader
            ? 34
            : 92
          : verySparsePage
            ? cfg.repeatHeader
              ? 22
              : 64
            : sparsePage
              ? cfg.repeatHeader
                ? 12
                : 40
              : 0);
      const sectionGapCap =
        baseSectionGapCap +
        (ultraSparsePage
          ? multiSectionPage
            ? cfg.repeatHeader
              ? 30
              : 88
            : cfg.repeatHeader
              ? 20
              : 48
          : verySparsePage
            ? multiSectionPage
              ? cfg.repeatHeader
                ? 22
                : 64
              : cfg.repeatHeader
                ? 14
                : 30
            : sparsePage
              ? multiSectionPage
                ? cfg.repeatHeader
                  ? 16
                  : 44
                : cfg.repeatHeader
                  ? 10
                  : 22
              : multiSectionPage
                ? 2
                : 0);

      const adjustment = await measurePageLayoutAdjustment(
        pageItems,
        cfg,
        slice.isFirstPage,
        sectionHeaders,
      );

      let extraRowGap = Math.min(adjustment.extraRowGap, rowGapCap);
      const extraSectionGap = Math.min(adjustment.extraSectionGap, sectionGapCap);
      const clippedSectionSpace =
        gapTargets.sectionGapCount > 0
          ? Math.max(0, adjustment.extraSectionGap - extraSectionGap) * gapTargets.sectionGapCount
          : 0;

      if (clippedSectionSpace > 0 && gapTargets.rowGapCount > 0 && extraRowGap < rowGapCap) {
        extraRowGap = Math.min(
          rowGapCap,
          extraRowGap + clippedSectionSpace / gapTargets.rowGapCount,
        );
      }

      return {
        extraRowGap,
        extraSectionGap,
      };
    }),
  );

  return adjustments;
}

/** Builds the gabarito (answer key) page. */
function buildAnswerPageHTML(
  exercises: ExerciseItem[],
  cfg: GlobalConfig,
  seed: number,
  startIndex = 0,
  measurement = false,
): string {
  const { FONT, S } = buildDocStyles(cfg);
  const css = buildDocCSS(cfg);
  const ansItems = exercises.map((ex, i) => {
    const num = cfg.numerar ? `${startIndex + i + 1})` : "";
    const val = ex.answer !== undefined && ex.answer !== null ? String(ex.answer) : "—";
    return `<div style="font-family:${FONT};font-size:13px;color:#1F2937;line-height:1.45;">${num}&nbsp;${val}</div>`;
  });
  const footerHTML = `<div style="${S.footer} flex-shrink:0;padding-top:10px;padding-bottom:${PRINT_FOOTER_SAFE_PAD}px;line-height:1.25;border-top:1px solid #E5E7EB;display:flex;justify-content:center;"><span>Axiora Tools</span></div>`;
  const mainId = measurement ? ` id="sg-answer-main"` : "";
  const itemsId = measurement ? ` id="sg-answer-items"` : "";
  return (
    `<style>${css}</style>` +
    `<div class="sheet-root"><div class="preview-page" style="${S.page}display:flex;flex-direction:column;">` +
    `<div style="${S.title}">Gabarito</div>` +
    `<div class="main"${mainId} style="flex:1;display:flex;flex-direction:column;justify-content:flex-start;min-height:0;overflow:hidden;">` +
    `<div${itemsId} style="margin-top:10px;display:grid;grid-template-columns:repeat(2,1fr);gap:8px 24px;align-content:start;">${ansItems.join("")}</div></div>` +
    footerHTML +
    `</div></div>`
  );
}

function getAnswerPageCapacity(cfg: GlobalConfig): number {
  switch (cfg.fontSize) {
    case "P":
      return 88;
    case "G":
      return 56;
    case "M":
    default:
      return 72;
  }
}

function paginateAnswerPages(
  exercises: ExerciseItem[],
  cfg: GlobalConfig,
): ExerciseItem[][] {
  if (!exercises.length) return [];

  const answersPerPage = Math.max(2, getAnswerPageCapacity(cfg));
  const pages: ExerciseItem[][] = [];

  for (let index = 0; index < exercises.length; index += answersPerPage) {
    const slice = exercises.slice(index, index + answersPerPage);
    if (slice.length > 0) {
      pages.push(slice);
    }
  }

  return pages;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESETS
// ─────────────────────────────────────────────────────────────────────────────

function applyPreset(key: string, setBlocks: (b: Block[]) => void, idRef: { current: number }) {
  const mk = (type: BlockType, extra: Partial<BlockConfig> = {}): Block => ({
    id: idRef.current++,
    type,
    active: true,
    config: { ...BLOCK_META[type].defaults, ...extra },
  });
  switch (key) {
    // ── Anos Iniciais ──────────────────────────────────────────────────────
    case "2ano":
      setBlocks([
        mk("aritmetica", { operacao: "adicao", digitos1: 2, digitos2: 2, quantidade: 8 }),
        mk("aritmetica", { operacao: "subtracao", digitos1: 2, digitos2: 2, quantidade: 8 }),
      ]);
      break;
    case "2ano-avancado":
      setBlocks([
        mk("aritmetica", { operacao: "adicao", digitos1: 3, digitos2: 2, quantidade: 8 }),
        mk("aritmetica", { operacao: "subtracao", digitos1: 3, digitos2: 2, quantidade: 8 }),
        mk("aritmetica", {
          operacao: "multiplicacao",
          digitos1: 1,
          digitos2: 1,
          formato: "linear",
          quantidade: 6,
        }),
      ]);
      break;
    case "3ano":
      setBlocks([
        mk("aritmetica", { operacao: "multiplicacao", digitos1: 2, digitos2: 1, quantidade: 8 }),
        mk("aritmetica", { operacao: "divisao", formato: "armada", quantidade: 6 }),
      ]);
      break;
    case "3ano-tabuada":
      setBlocks([
        mk("aritmetica", {
          operacao: "multiplicacao",
          digitos1: 1,
          digitos2: 1,
          formato: "linear",
          quantidade: 12,
        }),
        mk("aritmetica", {
          operacao: "divisao",
          digitos1: 2,
          digitos2: 1,
          formato: "linear",
          quantidade: 10,
        }),
      ]);
      break;
    case "4ano":
      setBlocks([
        mk("aritmetica", { operacao: "multiplicacao", digitos1: 3, digitos2: 2, quantidade: 6 }),
        mk("fracoes", { operacao: "soma", denomMax: 8, quantidade: 6 }),
        mk("fracoes", { operacao: "subtracao", denomMax: 8, quantidade: 4 }),
      ]);
      break;
    case "4ano-divisao":
      setBlocks([
        mk("aritmetica", {
          operacao: "divisao",
          digitos1: 3,
          digitos2: 2,
          formato: "armada",
          permitirResto: true,
          quantidade: 8,
        }),
        mk("aritmetica", { operacao: "multiplicacao", digitos1: 3, digitos2: 2, quantidade: 6 }),
      ]);
      break;
    case "5ano-fracoes":
      setBlocks([
        mk("fracoes", { operacao: "soma", denomMax: 12, denominadorComum: true, quantidade: 6 }),
        mk("fracoes", {
          operacao: "subtracao",
          denomMax: 12,
          denominadorComum: true,
          quantidade: 6,
        }),
        mk("fracoes", { operacao: "misto", denomMax: 10, quantidade: 4 }),
      ]);
      break;
    case "5ano-completo":
      setBlocks([
        mk("aritmetica", { operacao: "multiplicacao", digitos1: 3, digitos2: 2, quantidade: 4 }),
        mk("aritmetica", {
          operacao: "divisao",
          digitos1: 4,
          digitos2: 2,
          formato: "armada",
          quantidade: 4,
        }),
        mk("fracoes", { operacao: "soma", denomMax: 10, quantidade: 4 }),
        mk("fracoes", { operacao: "subtracao", denomMax: 10, quantidade: 4 }),
      ]);
      break;
    // ── Anos Finais ────────────────────────────────────────────────────────
    case "6ano":
      setBlocks([
        mk("equacoes", { tipo: "misto", coefMax: 9, respMax: 20, quantidade: 6 }),
        mk("expressoes", {
          complexidade: "media",
          termos: 4,
          operacoes: ["adicao", "subtracao", "multiplicacao"],
          quantidade: 6,
        }),
      ]);
      break;
    case "6ano-expressoes":
      setBlocks([
        mk("expressoes", {
          complexidade: "simples",
          termos: 3,
          operacoes: ["adicao", "subtracao"],
          quantidade: 6,
        }),
        mk("expressoes", {
          complexidade: "media",
          termos: 4,
          operacoes: ["adicao", "subtracao", "multiplicacao"],
          usarParenteses: true,
          quantidade: 6,
        }),
      ]);
      break;
    case "6ano-fracoes-avancado":
      setBlocks([
        mk("fracoes", { operacao: "misto", denomMax: 15, numerosMistos: true, quantidade: 6 }),
        mk("fracoes", { operacao: "soma", denomMax: 12, simplificar: true, quantidade: 6 }),
        mk("equacoes", { tipo: "misto", coefMax: 5, quantidade: 4 }),
      ]);
      break;
    case "7ano-equacoes":
      setBlocks([
        mk("equacoes", {
          tipo: "misto",
          coefMax: 15,
          respMax: 30,
          respNegativa: true,
          quantidade: 8,
        }),
        mk("expressoes", {
          complexidade: "media",
          termos: 4,
          operacoes: ["adicao", "subtracao", "multiplicacao", "divisao"],
          usarParenteses: true,
          quantidade: 6,
        }),
      ]);
      break;
    case "7ano-potencias":
      setBlocks([
        mk("potenciacao", { tipo: "potencia", baseMax: 10, expMax: 3, quantidade: 8 }),
        mk("potenciacao", {
          tipo: "raiz",
          baseMax: 144,
          expMax: 2,
          somentePerfeitasRaiz: true,
          quantidade: 8,
        }),
      ]);
      break;
    case "8ano-completo":
      setBlocks([
        mk("equacoes", {
          tipo: "misto",
          coefMax: 20,
          respMax: 50,
          respNegativa: true,
          quantidade: 6,
        }),
        mk("potenciacao", { tipo: "misto", baseMax: 15, expMax: 4, quantidade: 6 }),
        mk("expressoes", {
          complexidade: "avancada",
          termos: 5,
          operacoes: ["adicao", "subtracao", "multiplicacao", "divisao"],
          usarParenteses: true,
          nivelAgrupamento: 2,
          quantidade: 4,
        }),
      ]);
      break;
    case "9ano-revisao":
      setBlocks([
        mk("equacoes", {
          tipo: "misto",
          coefMax: 25,
          respMax: 100,
          respNegativa: true,
          quantidade: 6,
        }),
        mk("potenciacao", { tipo: "misto", baseMax: 20, expMax: 4, quantidade: 6 }),
        mk("expressoes", {
          complexidade: "avancada",
          termos: 6,
          operacoes: ["adicao", "subtracao", "multiplicacao", "divisao"],
          usarParenteses: true,
          nivelAgrupamento: 3,
          quantidade: 4,
        }),
      ]);
      break;
    // ── Temáticos ─────────────────────────────────────────────────────────
    case "so-adicao":
      setBlocks([
        mk("aritmetica", { operacao: "adicao", digitos1: 2, digitos2: 2, quantidade: 8 }),
        mk("aritmetica", { operacao: "adicao", digitos1: 3, digitos2: 2, quantidade: 6 }),
        mk("aritmetica", { operacao: "adicao", digitos1: 3, digitos2: 3, quantidade: 4 }),
      ]);
      break;
    case "so-multiplicacao":
      setBlocks([
        mk("aritmetica", {
          operacao: "multiplicacao",
          digitos1: 1,
          digitos2: 1,
          formato: "linear",
          quantidade: 10,
        }),
        mk("aritmetica", { operacao: "multiplicacao", digitos1: 2, digitos2: 1, quantidade: 8 }),
        mk("aritmetica", { operacao: "multiplicacao", digitos1: 3, digitos2: 2, quantidade: 6 }),
      ]);
      break;
    case "so-divisao":
      setBlocks([
        mk("aritmetica", {
          operacao: "divisao",
          digitos1: 2,
          digitos2: 1,
          formato: "armada",
          quantidade: 8,
        }),
        mk("aritmetica", {
          operacao: "divisao",
          digitos1: 3,
          digitos2: 2,
          formato: "armada",
          quantidade: 6,
        }),
        mk("aritmetica", {
          operacao: "divisao",
          digitos1: 4,
          digitos2: 2,
          formato: "armada",
          permitirResto: true,
          quantidade: 4,
        }),
      ]);
      break;
    case "so-fracoes":
      setBlocks([
        mk("fracoes", { operacao: "soma", denomMax: 8, quantidade: 6 }),
        mk("fracoes", { operacao: "subtracao", denomMax: 8, quantidade: 6 }),
        mk("fracoes", { operacao: "misto", denomMax: 12, quantidade: 6 }),
      ]);
      break;
    case "so-potencias":
      setBlocks([
        mk("potenciacao", { tipo: "potencia", baseMax: 12, expMax: 3, quantidade: 8 }),
        mk("potenciacao", {
          tipo: "raiz",
          baseMax: 196,
          expMax: 2,
          somentePerfeitasRaiz: true,
          quantidade: 6,
        }),
        mk("potenciacao", { tipo: "misto", baseMax: 10, expMax: 4, quantidade: 6 }),
      ]);
      break;
    case "revisao-geral":
      setBlocks([
        mk("aritmetica", { operacao: "multiplicacao", digitos1: 3, digitos2: 2, quantidade: 4 }),
        mk("aritmetica", {
          operacao: "divisao",
          digitos1: 3,
          digitos2: 2,
          formato: "armada",
          quantidade: 4,
        }),
        mk("fracoes", { operacao: "misto", denomMax: 10, quantidade: 4 }),
        mk("equacoes", { tipo: "misto", coefMax: 9, quantidade: 4 }),
        mk("potenciacao", { tipo: "misto", baseMax: 10, expMax: 3, quantidade: 4 }),
      ]);
      break;
    case "avaliacao-trimestral":
      setBlocks([
        mk("aritmetica", { operacao: "misto", digitos1: 3, digitos2: 2, quantidade: 6 }),
        mk("fracoes", { operacao: "misto", denomMax: 12, quantidade: 4 }),
        mk("equacoes", {
          tipo: "misto",
          coefMax: 12,
          respMax: 30,
          respNegativa: true,
          quantidade: 4,
        }),
        mk("expressoes", {
          complexidade: "media",
          termos: 4,
          operacoes: ["adicao", "subtracao", "multiplicacao"],
          usarParenteses: true,
          quantidade: 4,
        }),
      ]);
      break;
    case "limpar":
      setBlocks([]);
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK META TEXT
// ─────────────────────────────────────────────────────────────────────────────

function createGuidedBlock(suggestion: GuidedBlockSuggestion, idRef: { current: number }): Block {
  return {
    id: idRef.current++,
    type: suggestion.type,
    active: true,
    config: { ...BLOCK_META[suggestion.type].defaults, ...suggestion.config },
  };
}

function blockMetaText(block: Block): string {
  const c = block.config;
  switch (block.type) {
    case "aritmetica": {
      const opNames: Record<string, string> = {
        adicao: "Adição",
        subtracao: "Subtração",
        multiplicacao: "Multiplicação",
        divisao: "Divisão",
      };
      opNames.misto = "Misto";
      const fmt = c.formato === "armada" ? "Armada" : "Linear";
      return `${opNames[c.operacao ?? ""] ?? c.operacao} · ${c.digitos1}×${c.digitos2} dígitos · ${fmt}`;
    }
    case "fracoes": {
      const opNames: Record<string, string> = {
        soma: "Soma",
        subtracao: "Subtração",
        misto: "Misto",
      };
      return `${opNames[c.operacao ?? ""] ?? c.operacao} · Denom. máx. ${c.denomMax}`;
    }
    case "equacoes":
      return `${c.tipo === "misto" ? "Misto" : c.tipo} · Coef. até ${c.coefMax}`;
    case "potenciacao": {
      const t = c.tipo === "misto" ? "Misto" : c.tipo === "potencia" ? "Potência" : "Raiz";
      return `${t} · Base até ${c.baseMax} · Exp. até ${c.expMax}`;
    }
    case "expressoes": {
      const cNames: Record<string, string> = {
        simples: "Simples",
        media: "Média",
        avancada: "Avançada",
      };
      return `${cNames[c.complexidade ?? ""] ?? c.complexidade} · ${c.termos} termos`;
    }
    default:
      return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function SheetGeneratorTool() {
  const router = useRouter();
  const nextId = useRef(1);
  const [blocks, setBlocks] = useState<Block[]>(() =>
    DEFAULT_BLOCKS.map((b) => ({ ...b, id: nextId.current++ })),
  );
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [seed, setSeed] = useState<number>(10000);
  const [snapshot, setSnapshot] = useState<ExerciseItem[] | null>(null);
  const [lightCfg, setLightCfg] = useState<LightConfig>(DEFAULT_LIGHT_CONFIG);
  const [debouncedLightCfg, setDebouncedLightCfg] = useState<LightConfig>(DEFAULT_LIGHT_CONFIG);
  const [heavyCfg, setHeavyCfg] = useState<HeavyConfig>(DEFAULT_HEAVY_CONFIG);
  const cfg = useMemo<GlobalConfig>(
    () => ({
      ...heavyCfg,
      ...lightCfg,
      title: debouncedLightCfg.title,
      subtitle: debouncedLightCfg.subtitle,
    }),
    [heavyCfg, lightCfg.turma, lightCfg.tempo, debouncedLightCfg.title, debouncedLightCfg.subtitle],
  );
  const [mobileTab, setMobileTab] = useState<"config" | "blocks" | "detail">("blocks");
  const [editorTab, setEditorTab] = useState<"config" | "blocos">("blocos");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["cabecalho"]));
  const toggleSection = useCallback(
    (id: string) =>
      setOpenSections((prev) => {
        const s = new Set(prev);
        s.has(id) ? s.delete(id) : s.add(id);
        return s;
      }),
    [],
  );
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [addBlockModalOpen, setAddBlockModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [guidedStageId, setGuidedStageId] = useState<string | null>(null);
  const [layoutModalOpen, setLayoutModalOpen] = useState(false);
  const [opcoesModalOpen, setOpcoesModalOpen] = useState(false);
  const [blockDetailModalOpen, setBlockDetailModalOpen] = useState(false);
  const [blockDraft, setBlockDraft] = useState<Block | null>(null);
  const [settingsLightDraft, setSettingsLightDraft] = useState<LightConfig | null>(null);
  const [settingsHeavyDraft, setSettingsHeavyDraft] = useState<HeavyConfig | null>(null);
  const [layoutDraft, setLayoutDraft] = useState<HeavyConfig | null>(null);
  const [optionsDraft, setOptionsDraft] = useState<HeavyConfig | null>(null);
  const [presetSelectionDraft, setPresetSelectionDraft] = useState<{
    key: string;
    label: string;
  } | null>(null);
  const [previewWindowState, setPreviewWindowState] = useState<
    "closed" | "normal" | "maximized" | "minimized"
  >("closed");
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  // ── Identidade global (context) ───────────────────────────────────────────
  const identity = useToolsIdentity();
  const anonId = identity.anonymousId;
  const isAnonUser = identity.isAnonUser;
  const creditsLoading = identity.initializing;
  // credits: soma de gerações grátis + créditos pagos; null enquanto inicializa
  const credits = identity.initializing
    ? null
    : identity.freeGenerationsRemaining + identity.paidGenerationsAvailable;

  const [creditsFxTick, setCreditsFxTick] = useState(0);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // ── Preview: auto-fit + zoom (Canva-like) ─────────────────────────────────
  const previewCanvasRef = useRef<HTMLDivElement>(null);
  const [autoFitScale, setAutoFitScale] = useState(1);
  const [zoom, setZoom] = useState(0.75);
  const [portalReady, setPortalReady] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const previewWindowOpen =
    previewWindowState === "normal" || previewWindowState === "maximized";
  const renderPortal = useCallback(
    (node: ReactNode) => (portalReady ? createPortal(node, document.body) : null),
    [portalReady],
  );
  useEffect(() => {
    setPortalReady(true);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);
  useEffect(() => {
    const el = previewCanvasRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const canvasPaddingX = isMobileViewport ? 0 : previewWindowState === "maximized" ? 144 : 96;
      const availableW = Math.max(0, rect.width - canvasPaddingX);
      const fit = Math.min(availableW / A4_W, 1);
      const next = fit > 0 ? fit : 1;
      setAutoFitScale((prev) => (Math.abs(prev - next) > 0.001 ? next : prev));
    };
    let raf1 = 0;
    let raf2 = 0;
    const scheduleUpdate = () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      raf1 = requestAnimationFrame(() => {
        update();
        raf2 = requestAnimationFrame(update);
      });
    };
    scheduleUpdate();
    const obs = new ResizeObserver(scheduleUpdate);
    obs.observe(el);
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", scheduleUpdate);
      obs.disconnect();
    };
  }, [isMobileViewport, previewWindowOpen, previewWindowState]);
  const clampedZoom = Math.min(1, Math.max(0.5, zoom));
  const previewScale = isMobileViewport ? autoFitScale : Math.min(1, autoFitScale * clampedZoom);

  // ── Pagination state ────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedLightCfg((prev) => ({
        ...prev,
        title: lightCfg.title,
        subtitle: lightCfg.subtitle,
      }));
    }, TITLE_SUBTITLE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [lightCfg.title, lightCfg.subtitle]);


  // Post-checkout: detecta retorno do Stripe e atualiza créditos
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("upgrade")) return;
    const timer = window.setTimeout(() => {
      void identity.refresh();
    }, 1500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generatedExercises = useMemo<ExerciseItem[]>(() => {
    if (!blocks.some((b) => b.active)) return [];
    return generateAllExercises(blocks, cfg.embaralhar, seed);
  }, [blocks, cfg.embaralhar, seed]);

  const [pageSlices, setPageSlices] = useState<PageSlice[]>([]);
  const [answerPageSlices, setAnswerPageSlices] = useState<ExerciseItem[][]>([]);
  const [pageLayoutAdjustments, setPageLayoutAdjustments] = useState<PageLayoutAdjustment[]>([]);
  const [isPaginating, setIsPaginating] = useState(false);
  const [previewOpenPending, setPreviewOpenPending] = useState(false);

  const settingsDraftCfg = useMemo<GlobalConfig>(
    () => ({
      ...(settingsHeavyDraft ?? heavyCfg),
      ...(settingsLightDraft ?? lightCfg),
      title: (settingsLightDraft ?? lightCfg).title,
      subtitle: (settingsLightDraft ?? lightCfg).subtitle,
    }),
    [settingsHeavyDraft, heavyCfg, settingsLightDraft, lightCfg],
  );

  const hasSettingsParentContext = settingsModalOpen || mobileTab === "config";

  const resetSettingsDraftState = useCallback(() => {
    setSettingsLightDraft(null);
    setSettingsHeavyDraft(null);
    setLayoutDraft(null);
    setOptionsDraft(null);
    setPresetSelectionDraft(null);
  }, []);

  const startSettingsEditing = useCallback(() => {
    setSettingsLightDraft({ ...lightCfg });
    setSettingsHeavyDraft({ ...heavyCfg });
    setLayoutDraft(null);
    setOptionsDraft(null);
    setPresetSelectionDraft(null);
  }, [heavyCfg, lightCfg]);

  const closeSettingsFlow = useCallback(() => {
    setSettingsModalOpen(false);
    setMobileTab((prev) => (prev === "config" ? "blocks" : prev));
    resetSettingsDraftState();
  }, [resetSettingsDraftState]);

  const confirmSettingsFlow = useCallback(() => {
    if (settingsLightDraft) {
      setLightCfg(settingsLightDraft);
      setDebouncedLightCfg(settingsLightDraft);
    }
    if (settingsHeavyDraft) {
      setHeavyCfg(settingsHeavyDraft);
    }
    setSnapshot(null);
    setSettingsModalOpen(false);
    setMobileTab((prev) => (prev === "config" ? "blocks" : prev));
    resetSettingsDraftState();
  }, [resetSettingsDraftState, settingsHeavyDraft, settingsLightDraft]);

  const updateSettingsDraft = useCallback(
    (key: keyof GlobalConfig, val: GlobalConfig[keyof GlobalConfig]) => {
      if (key === "title" || key === "subtitle" || key === "turma" || key === "tempo") {
        setSettingsLightDraft((prev) => ({ ...(prev ?? lightCfg), [key]: val }) as LightConfig);
        return;
      }
      setSettingsHeavyDraft((prev) => ({ ...(prev ?? heavyCfg), [key]: val }) as HeavyConfig);
    },
    [heavyCfg, lightCfg],
  );

  const openDesktopSettings = useCallback(() => {
    startSettingsEditing();
    setSettingsModalOpen(true);
  }, [startSettingsEditing]);

  const openMobileSettings = useCallback(() => {
    startSettingsEditing();
    setMobileTab("config");
  }, [startSettingsEditing]);

  const openSettingsSubview = useCallback(
    (view: "preset" | "layout" | "options") => {
      if (view === "preset") {
        setPresetSelectionDraft(null);
        setPresetModalOpen(true);
      }
      if (view === "layout") {
        setLayoutDraft({ ...(settingsHeavyDraft ?? heavyCfg) });
        setLayoutModalOpen(true);
      }
      if (view === "options") {
        setOptionsDraft({ ...(settingsHeavyDraft ?? heavyCfg) });
        setOpcoesModalOpen(true);
      }
    },
    [heavyCfg, settingsHeavyDraft],
  );

  useEffect(() => {
    let cancelled = false;

    if (!generatedExercises.length) {
      setPageSlices([]);
      setAnswerPageSlices([]);
      setPageLayoutAdjustments([]);
      setIsPaginating(false);
      return () => {
        cancelled = true;
      };
    }

    const run = async () => {
      setIsPaginating(true);
      const finalSlices =
        typeof window === "undefined"
          ? paginateSimple(generatedExercises, blocks, cfg)
          : await paginatePrecisely(generatedExercises, blocks, cfg);
      const finalAdjustments =
        typeof window === "undefined"
          ? finalSlices.map(() => ({ extraRowGap: 0, extraSectionGap: 0 }))
          : await computePageLayoutAdjustments(finalSlices, generatedExercises, blocks, cfg);

      if (cancelled) return;

      setPageSlices(finalSlices);
      setPageLayoutAdjustments(finalAdjustments);
      setAnswerPageSlices(
        cfg.gabarito === "proxima" ? paginateAnswerPages(generatedExercises, cfg) : [],
      );
      setIsPaginating(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    generatedExercises,
    blocks,
    cfg.cols,
    cfg.fontSize,
    cfg.gabarito,
    cfg.numerar,
    cfg.repeatHeader,
    cfg.showNome,
    cfg.spacing,
    cfg.subtitle,
    cfg.title,
    cfg.turma,
    cfg.tempo,
  ]);

  const previewPages = useMemo<string[]>(() => {
    return buildPreviewPagesFromSlices(
      pageSlices,
      answerPageSlices,
      generatedExercises,
      blocks,
      cfg,
      seed,
      pageLayoutAdjustments,
    );
  }, [
    pageSlices,
    pageLayoutAdjustments,
    answerPageSlices,
    generatedExercises,
    blocks,
    seed,
    cfg.title,
    cfg.subtitle,
    cfg.turma,
    cfg.tempo,
    cfg.cols,
    cfg.fontSize,
    cfg.gabarito,
    cfg.spacing,
    cfg.embaralhar,
    cfg.showNome,
    cfg.numerar,
    cfg.showPontuacao,
    cfg.repeatHeader,
  ]);

  useEffect(() => {
    setCurrentPage(0);
  }, [previewPages]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 0);
    return () => window.clearTimeout(id);
  }, [previewPages.length, zoom, mobileTab, previewWindowOpen, previewWindowState]);

  useEffect(() => {
    if (!previewOpenPending) return;
    const hasActiveBlocks = blocks.some((b) => b.active);
    if (hasActiveBlocks && (isPaginating || previewPages.length === 0)) return;
    setPreviewWindowState((prev) => (prev === "maximized" ? "maximized" : "normal"));
    setPreviewOpenPending(false);
  }, [blocks, isPaginating, previewOpenPending, previewPages.length]);

  const showToast = useCallback((msg: string) => {
    toast(msg);
  }, []);

  const showMobileAddToast = useCallback(
    (msg: string) => {
      toast(msg, {
        position: isMobileViewport ? "top-center" : "bottom-center",
      });
    },
    [isMobileViewport],
  );

  const invalidate = useCallback(() => setSnapshot(null), []);

  const closeLayoutModal = useCallback(() => {
    setLayoutDraft(null);
    setLayoutModalOpen(false);
  }, []);

  const confirmLayoutModal = useCallback(() => {
    if (layoutDraft) {
      if (hasSettingsParentContext) {
        setSettingsHeavyDraft(layoutDraft);
      } else {
        setHeavyCfg(layoutDraft);
        invalidate();
      }
    }
    closeLayoutModal();
  }, [closeLayoutModal, hasSettingsParentContext, invalidate, layoutDraft]);

  const updateLayoutDraft = useCallback(
    (key: keyof HeavyConfig, val: HeavyConfig[keyof HeavyConfig]) => {
      setLayoutDraft((prev) => ({ ...(prev ?? settingsHeavyDraft ?? heavyCfg), [key]: val }));
    },
    [heavyCfg, settingsHeavyDraft],
  );

  const closeOptionsModal = useCallback(() => {
    setOptionsDraft(null);
    setOpcoesModalOpen(false);
  }, []);

  const confirmOptionsModal = useCallback(() => {
    if (optionsDraft) {
      if (hasSettingsParentContext) {
        setSettingsHeavyDraft(optionsDraft);
      } else {
        setHeavyCfg(optionsDraft);
        invalidate();
      }
    }
    closeOptionsModal();
  }, [closeOptionsModal, hasSettingsParentContext, invalidate, optionsDraft]);

  const updateOptionsDraft = useCallback(
    (key: keyof HeavyConfig, val: HeavyConfig[keyof HeavyConfig]) => {
      setOptionsDraft((prev) => ({ ...(prev ?? settingsHeavyDraft ?? heavyCfg), [key]: val }));
    },
    [heavyCfg, settingsHeavyDraft],
  );

  const closePresetModal = useCallback(() => {
    setPresetSelectionDraft(null);
    setPresetModalOpen(false);
  }, []);

  const confirmPresetSelection = useCallback(() => {
    if (!presetSelectionDraft) {
      closePresetModal();
      return;
    }

    applyPreset(presetSelectionDraft.key, setBlocks, nextId);
    setSelectedBlockId(null);
    setSeed(Math.floor(10000 + Math.random() * 90000));
    setSnapshot(null);
    closePresetModal();
    showToast(
      presetSelectionDraft.key === "limpar"
        ? "Blocos removidos"
        : `Preset "${presetSelectionDraft.label}" aplicado`,
    );
  }, [closePresetModal, presetSelectionDraft, showToast]);

  const closeAddBlockModal = useCallback(() => {
    setAddBlockModalOpen(false);
    setGuidedStageId(null);
  }, []);

  const focusNewMobileBlock = useCallback(
    (blockId: number) => {
      if (!isMobileViewport || typeof window === "undefined") return;

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const blockCard = document.getElementById(`sheet-block-card-${blockId}`);
          blockCard?.scrollIntoView({
            block: "center",
            behavior: "smooth",
          });
        });
      });
    },
    [isMobileViewport],
  );

  const openCategoryModal = useCallback(() => {
    setCategoryModalOpen(true);
  }, []);

  const triggerTapHaptic = useCallback(() => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(14);
    }
  }, []);

  const openCategoryModalWithHaptic = useCallback(() => {
    triggerTapHaptic();
    openCategoryModal();
  }, [openCategoryModal, triggerTapHaptic]);

  const openPreviewWindow = useCallback(() => {
    const hasActiveBlocks = blocks.some((b) => b.active);
    if (hasActiveBlocks && (isPaginating || previewPages.length === 0)) {
      setPreviewOpenPending(true);
      return;
    }
    setPreviewOpenPending(false);
    setPreviewWindowState((prev) => (prev === "maximized" ? "maximized" : "normal"));
  }, [blocks, isPaginating, previewPages.length]);

  const closePreviewWindow = useCallback(() => {
    setPreviewOpenPending(false);
    setPreviewWindowState("closed");
  }, []);

  const minimizePreviewWindow = useCallback(() => {
    setPreviewOpenPending(false);
    setPreviewWindowState("minimized");
  }, []);

  const togglePreviewWindowSize = useCallback(() => {
    setPreviewWindowState((prev) => (prev === "maximized" ? "normal" : "maximized"));
  }, []);

  const addBlock = useCallback(() => {
    setGuidedStageId(null);
    setAddBlockModalOpen(true);
  }, []);

  const addBlockWithHaptic = useCallback(() => {
    triggerTapHaptic();
    addBlock();
  }, [addBlock, triggerTapHaptic]);

  const removeBlock = useCallback(
    (id: number) => {
      setBlocks((prev) => prev.filter((b) => b.id !== id));
      setSelectedBlockId((prev) => (prev === id ? null : prev));
      showToast("Bloco removido");
      invalidate();
    },
    [showToast, invalidate],
  );

  const toggleBlock = useCallback(
    (id: number) => {
      setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, active: !b.active } : b)));
      invalidate();
    },
    [invalidate],
  );

  const updateBlockConfig = useCallback(
    (id: number, key: keyof BlockConfig, val: unknown) => {
      setBlocks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, config: { ...b.config, [key]: val } } : b)),
      );
      invalidate();
    },
    [invalidate],
  );

  const changeBlockType = useCallback(
    (id: number, type: BlockType) => {
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                type,
                config: { ...BLOCK_META[type].defaults, quantidade: b.config.quantidade },
              }
            : b,
        ),
      );
      invalidate();
    },
    [invalidate],
  );

  const rerollSeed = useCallback(() => {
    setSeed(Math.floor(10000 + Math.random() * 90000));
    invalidate();
    showToast("Exercícios atualizados — clique em Imprimir para ver a nova versão");
  }, [invalidate, showToast]);

  const reseedExercises = useCallback(() => {
    setSeed(Math.floor(10000 + Math.random() * 90000));
    invalidate();
  }, [invalidate]);

  const handleSelectCategory = useCallback(
    (type: BlockType) => {
      const newBlock: Block = {
        id: nextId.current++,
        type,
        active: true,
        config: { ...BLOCK_META[type].defaults },
      };

      setBlocks((prev) => [...prev, newBlock]);
      setEditorTab("blocos");
      setMobileTab("blocks");
      setSelectedBlockId(newBlock.id);
      setCategoryModalOpen(false);
      reseedExercises();
      focusNewMobileBlock(newBlock.id);
      showMobileAddToast(`${BLOCK_META[type].name} adicionado`);
    },
    [focusNewMobileBlock, reseedExercises, showMobileAddToast],
  );

  const handleAddGuidedBlock = useCallback(
    (suggestionId: string) => {
      const suggestion = GUIDED_BLOCK_SUGGESTIONS.find((item) => item.id === suggestionId);
      if (!suggestion) return;
      const stageOption = GUIDED_STAGE_OPTIONS.find((item) => item.id === suggestion.stageId);

      const newBlock = createGuidedBlock(suggestion, nextId);
      setBlocks((prev) => [...prev, newBlock]);
      setEditorTab("blocos");
      setMobileTab("blocks");
      setSelectedBlockId(newBlock.id);
      closeAddBlockModal();
      reseedExercises();
      focusNewMobileBlock(newBlock.id);
      showMobileAddToast(
        `${BLOCK_META[newBlock.type].name} sugerido para ${stageOption?.stage ?? "a fase selecionada"}`,
      );
    },
    [closeAddBlockModal, focusNewMobileBlock, reseedExercises, showMobileAddToast],
  );


  // handleBuyCredits é passado ao PaywallModal — lança em caso de erro
  // para que o modal exiba a mensagem inline sem fechar.
  const handleBuyCredits = useCallback(async () => {
    track("checkout_started");
    const checkout = isAnonUser
      ? await createToolsCheckoutV2({
          anonymous_id: anonId,
          fingerprint_id: identity.fingerprintId || undefined,
          package_type: "pack_30",
        })
      : await createToolsCheckout({ plan_code: "credits_30" });
    window.location.assign(checkout.checkout_url);
  }, [isAnonUser, anonId, identity.fingerprintId]);

  const handlePrint = useCallback(async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    if (credits === null) {
      showToast("Não foi possível validar seus créditos. Tente novamente.");
      setIsPrinting(false);
      return;
    }
    if (credits <= 0) {
      track("generation_blocked", { reason: "no_credits" });
      setPaywallOpen(true);
      setIsPrinting(false);
      return;
    }

    track("click_generate", {
      active_blocks: blocks.filter((b) => b.active).length,
      total_exercises: blocks.filter((b) => b.active).reduce((s, b) => s + b.config.quantidade, 0),
    });

    const sourceExercises = generatedExercises.length
      ? generatedExercises
      : generateAllExercises(blocks, cfg.embaralhar, seed);
    if (!sourceExercises.length) {
      showToast("Nenhum exercício ativo — adicione blocos");
      setIsPrinting(false);
      return;
    }

    if (isPaginating || previewPages.length === 0) {
      showToast("Aguarde a pré-visualização terminar de atualizar.");
      setIsPrinting(false);
      return;
    }

    if (isIOSWebKitBrowser()) {
      try {
        await downloadPdfFromPreviewPages(previewPages, cfg);
      } catch {
        showToast("Não foi possível gerar o PDF. Tente novamente.");
        setIsPrinting(false);
        return;
      }

      try {
        let remaining: number;
        if (isAnonUser) {
          const result = await consumeAnonCredit(anonId);
          remaining = result.remaining_free_generations + result.paid_credits_remaining;
        } else {
          const result = await consumeToolsCredit();
          remaining = Math.max(0, Number(result.credits) || 0);
        }
        void identity.refresh();
        setCreditsFxTick((v) => v + 1);
        track("generation_success", {
          consumption_type: isAnonUser ? "free" : "paid",
          remaining_after: remaining,
        });
        if (remaining === 0) {
          showToast("Lista gerada! Você usou suas 3 gerações gratuitas.");
        } else if (remaining === 1) {
          showToast("Lista gerada · Última geração gratuita disponível");
        } else {
          showToast(`Lista gerada · ${remaining} gerações restantes`);
        }
      } catch (err: unknown) {
        const isPaywallError = err instanceof ApiError && (err as ApiError).status === 402;
        if (isPaywallError) {
          track("generation_blocked", { reason: "paywall_402" });
          setPaywallOpen(true);
        } else {
          showToast("Ocorreu um erro ao gerar a lista. Tente novamente.");
        }
        setIsPrinting(false);
        return;
      }

      setIsPrinting(false);
      return;
    }

    const openedWindow = window.open("", "_blank", "width=860,height=750");
    if (!openedWindow) {
      showToast("Permita popups para gerar o PDF");
      setIsPrinting(false);
      return;
    }
    const win = openedWindow;

    try {
      win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Gerando PDF</title><style>html,body{margin:0;padding:0;background:#fff;font-family:Inter,system-ui,-apple-system,sans-serif;color:#0f172a;}body{display:flex;min-height:100vh;align-items:center;justify-content:center;}.status{display:flex;flex-direction:column;align-items:center;gap:10px;font-size:14px;font-weight:600;}.spinner{width:24px;height:24px;border-radius:999px;border:3px solid #fde5d0;border-top-color:#ee8748;animation:spin .8s linear infinite;}@keyframes spin{to{transform:rotate(360deg);}}</style></head><body><div class="status"><div class="spinner"></div><div>Gerando PDF...</div></div></body></html>`);
      win.document.close();
    } catch {
      win.close();
      showToast("Permita popups para gerar o PDF");
      setIsPrinting(false);
      return;
    }

    try {
      const previewHtml = buildPrintDocumentFromPages(previewPages, cfg);
      win.document.open();
      win.document.write(previewHtml);
      win.document.close();
    } catch {
      win.close();
      showToast("Permita popups para gerar o PDF");
      setIsPrinting(false);
      return;
    }

    try {
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        const waitForLayout = async () => {
          try {
            if ("fonts" in win.document && win.document.fonts?.ready) {
              await win.document.fonts.ready;
            }
          } catch {}

          win.requestAnimationFrame(() => {
            win.requestAnimationFrame(() => {
              finish();
            });
          });
        };

        if (win.document.readyState === "complete") {
          void waitForLayout();
        } else {
          win.addEventListener(
            "load",
            () => {
              void waitForLayout();
            },
            { once: true },
          );
        }

        win.setTimeout(finish, 3000);
      });
    } catch {}

    try {
      let remaining: number;
      if (isAnonUser) {
        const result = await consumeAnonCredit(anonId);
        remaining = result.remaining_free_generations + result.paid_credits_remaining;
      } else {
        const result = await consumeToolsCredit();
        remaining = Math.max(0, Number(result.credits) || 0);
      }
      void identity.refresh();
      setCreditsFxTick((v) => v + 1);
      track("generation_success", {
        consumption_type: isAnonUser ? "free" : "paid",
        remaining_after: remaining,
      });
      if (remaining === 0) {
        showToast("Lista gerada! VocÃª usou suas 3 geraÃ§Ãµes gratuitas.");
      } else if (remaining === 1) {
        showToast("Lista gerada Â· Ãšltima geraÃ§Ã£o gratuita disponÃ­vel");
      } else {
        showToast(`Lista gerada Â· ${remaining} geraÃ§Ãµes restantes`);
      }
    } catch (err: unknown) {
      win.close();
      const isPaywallError = err instanceof ApiError && (err as ApiError).status === 402;
      if (isPaywallError) {
        track("generation_blocked", { reason: "paywall_402" });
        setPaywallOpen(true);
      } else {
        showToast("Ocorreu um erro ao gerar a lista. Tente novamente.");
      }
      setIsPrinting(false);
      return;
    }

    win.focus();
    win.print();
    setIsPrinting(false);
    return;

    let html = "";
    if (previewPages.length > 0) {
      const pagesHtml = previewPages
        .map((page) => `<div class="print-page">${page}</div>`)
        .join("");
      html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${cfg.title || "Folha de Exercícios"}</title>
        <style>
          @page{size:A4 portrait;margin:0;}
          html,body{margin:0;padding:0;background:#fff;width:${A4_W_MM};-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
          .print-page{width:${A4_W_MM};height:${A4_H_MM};overflow:hidden;break-after:page;page-break-after:always;position:relative;}
          .print-page:last-child{break-after:auto;page-break-after:auto;}
          @media print{
            html,body{width:${A4_W_MM};height:auto;background:#fff;}
            .preview-container{transform:none !important;}
            .sheet-root{width:100% !important;height:100% !important;}
            .sheet-root .preview-page{
              box-sizing:border-box !important;
              width:${A4_W_MM} !important;
              height:${A4_H_MM} !important;
              min-height:${A4_H_MM} !important;
              max-height:${A4_H_MM} !important;
              overflow:hidden !important;
              display:flex !important;
              flex-direction:column !important;
              border-radius:0 !important;
              box-shadow:none !important;
              animation:none !important;
              transform:none !important;
              break-inside:avoid !important;
              page-break-inside:avoid !important;
            }
          }
        </style>
      </head><body>${pagesHtml}</body></html>`;
    } else {
      const exercises = generateAllExercises(blocks, cfg.embaralhar, seed);
      if (exercises.length === 0) {
        showToast("Nenhum exercício ativo — adicione blocos");
        setIsPrinting(false);
        return;
      }
      html = buildPrintHTML(exercises, blocks, cfg, seed);
    }

    const printExercises = sourceExercises;
    if (!printExercises.length) {
      showToast("Nenhum exercÃ­cio ativo â€” adicione blocos");
      setIsPrinting(false);
      return;
    }

    const printSlices =
      typeof window === "undefined"
        ? paginateSimple(printExercises, blocks, cfg)
        : await paginatePrecisely(printExercises, blocks, cfg);
    const printLayoutAdjustments =
      typeof window === "undefined"
        ? printSlices.map(() => ({ extraRowGap: 0, extraSectionGap: 0 }))
        : await computePageLayoutAdjustments(printSlices, printExercises, blocks, cfg);
    const printAnswerSlices =
      cfg.gabarito === "proxima" ? paginateAnswerPages(printExercises, cfg) : [];
    const printPages = buildPreviewPagesFromSlices(
      printSlices,
      printAnswerSlices,
      printExercises,
      blocks,
      cfg,
      seed,
      printLayoutAdjustments,
    );

    if (!printPages.length) {
      win.close();
      showToast("NÃ£o foi possÃ­vel montar a prÃ©-visualizaÃ§Ã£o para impressÃ£o.");
      setIsPrinting(false);
      return;
    }

    html = buildPrintDocumentFromPages(printPages, cfg);

    try {
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch {
      win.close();
      showToast("Permita popups para gerar o PDF");
      setIsPrinting(false);
      return;
    }

    try {
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        const waitForLayout = async () => {
          try {
            if ("fonts" in win.document && win.document.fonts?.ready) {
              await win.document.fonts.ready;
            }
          } catch {}

          win.requestAnimationFrame(() => {
            win.requestAnimationFrame(() => {
              finish();
            });
          });
        };

        if (win.document.readyState === "complete") {
          void waitForLayout();
        } else {
          win.addEventListener(
            "load",
            () => {
              void waitForLayout();
            },
            { once: true },
          );
        }

        win.setTimeout(finish, 3000);
      });
    } catch {}

    try {
      let remaining: number;
      if (isAnonUser) {
        const result = await consumeAnonCredit(anonId);
        remaining = result.remaining_free_generations + result.paid_credits_remaining;
      } else {
        const result = await consumeToolsCredit();
        remaining = Math.max(0, Number(result.credits) || 0);
      }
      void identity.refresh();
      setCreditsFxTick((v) => v + 1);
      track("generation_success", {
        consumption_type: isAnonUser ? "free" : "paid",
        remaining_after: remaining,
      });
      if (remaining === 0) {
        showToast("Lista gerada! Você usou suas 3 gerações gratuitas.");
      } else if (remaining === 1) {
        showToast("Lista gerada · Última geração gratuita disponível");
      } else {
        showToast(`Lista gerada · ${remaining} gerações restantes`);
      }
    } catch (err: unknown) {
      win.close();
      // 402 = paywall — abre o modal de compra sem toast
      const isPaywallError = err instanceof ApiError && (err as ApiError).status === 402;
      if (isPaywallError) {
        track("generation_blocked", { reason: "paywall_402" });
        setPaywallOpen(true);
      } else {
        showToast("Ocorreu um erro ao gerar a lista. Tente novamente.");
      }
      setIsPrinting(false);
      return;
    }

    win.focus();
    win.print();
    setIsPrinting(false);
  }, [
    isPrinting,
    credits,
    isAnonUser,
    anonId,
    identity,
    previewPages,
    generatedExercises,
    cfg,
    blocks,
    seed,
    showToast,
  ]);

  const totalExercises = useMemo(
    () => blocks.filter((b) => b.active).reduce((s, b) => s + b.config.quantidade, 0),
    [blocks],
  );
  const activeCount = useMemo(() => blocks.filter((b) => b.active).length, [blocks]);
  const canRefreshExercises = activeCount > 0;
  const selectedBlock = useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) ?? null,
    [blocks, selectedBlockId],
  );
  useEffect(() => {
    if (!blockDetailModalOpen || !selectedBlock) {
      setBlockDraft(null);
      return;
    }

    setBlockDraft(cloneBlock(selectedBlock));
  }, [blockDetailModalOpen, selectedBlock]);

  const closeBlockDetailModal = useCallback(() => {
    setBlockDetailModalOpen(false);
    setBlockDraft(null);
  }, []);

  const updateDraftBlockConfig = useCallback((key: keyof BlockConfig, val: unknown) => {
    setBlockDraft((prev) =>
      prev ? { ...prev, config: { ...prev.config, [key]: val } } : prev,
    );
  }, []);

  const changeDraftBlockType = useCallback((type: BlockType) => {
    setBlockDraft((prev) =>
      prev
        ? {
            ...prev,
            type,
            config: { ...BLOCK_META[type].defaults, quantidade: prev.config.quantidade },
          }
        : prev,
    );
  }, []);

  const confirmBlockDetailChanges = useCallback(() => {
    if (!blockDraft) return;
    setBlocks((prev) => prev.map((b) => (b.id === blockDraft.id ? cloneBlock(blockDraft) : b)));
    invalidate();
    closeBlockDetailModal();
  }, [blockDraft, closeBlockDetailModal, invalidate]);
  const selectedGuidedStage = useMemo(
    () => GUIDED_STAGE_OPTIONS.find((item) => item.id === guidedStageId) ?? null,
    [guidedStageId],
  );
  const guidedSuggestionsForStage = useMemo(
    () =>
      guidedStageId
        ? GUIDED_BLOCK_SUGGESTIONS.filter((item) => item.stageId === guidedStageId)
        : [],
    [guidedStageId],
  );
  // Input / select class
  const inputCls =
    "mt-1 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-[13px] text-[#0f172a] placeholder-[#94a3b8] outline-none transition focus:border-[#fb923c] focus:shadow-[0_0_0_3px_rgba(251,146,60,0.14)]";
  const segBtnCls = (active: boolean) =>
    `flex-1 rounded-[var(--radius-md)] py-1.5 text-xs font-semibold transition-all duration-150 ${active ? "bg-[#fb923c] text-white shadow-[0_2px_10px_rgba(251,146,60,0.28)]" : "border border-[#e5e7eb] bg-white text-[#64748b] hover:scale-[1.01] hover:bg-[#f8fafc] hover:text-[#0f172a] hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)]"}`;
  const subtlePrimaryFx =
    "!shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(176,86,38,0.55),0_3px_0_rgba(176,86,38,0.28),0_8px_14px_rgba(93,48,22,0.14)] hover:!brightness-105 active:translate-y-[1px] active:!shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(176,86,38,0.5),0_1px_0_rgba(176,86,38,0.24),0_4px_10px_rgba(93,48,22,0.12)]";
  const subtleOutlineFx =
    "!shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-2px_0_rgba(213,190,159,0.8),0_3px_0_rgba(149,124,92,0.16),0_8px_14px_rgba(33,49,46,0.08)] hover:!brightness-102 active:translate-y-[1px] active:!shadow-[inset_0_1px_0_rgba(255,255,255,0.86),inset_0_-1px_0_rgba(213,190,159,0.82),0_1px_0_rgba(149,124,92,0.14),0_4px_10px_rgba(33,49,46,0.06)]";
  const subtleDestructiveFx =
    "!shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(155,34,34,0.55),0_3px_0_rgba(155,34,34,0.24),0_8px_14px_rgba(120,28,28,0.12)] active:translate-y-[1px] active:!shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(155,34,34,0.5),0_1px_0_rgba(155,34,34,0.22),0_4px_10px_rgba(120,28,28,0.1)]";
  const chunkyPrimaryBtn =
    `axiora-chunky-btn axiora-chunky-btn--secondary cursor-pointer disabled:cursor-not-allowed !rounded-[var(--radius-lg)] px-4 py-2 text-[12px] font-extrabold tracking-[0.01em] ${subtlePrimaryFx}`;
  const chunkyOutlineBtn =
    `axiora-chunky-btn axiora-chunky-btn--outline cursor-pointer disabled:cursor-not-allowed !rounded-[var(--radius-lg)] px-3 py-2 text-[11px] font-bold tracking-[0.01em] text-[#2F527D] ${subtleOutlineFx}`;
  const chunkySmallOutlineBtn =
    `axiora-chunky-btn axiora-chunky-btn--outline cursor-pointer disabled:cursor-not-allowed !rounded-[var(--radius-md)] axiora-admin-btn-sm text-[#2F527D] ${subtleOutlineFx}`;
  const chunkySmallDestructiveBtn =
    `axiora-chunky-btn axiora-chunky-btn--destructive cursor-pointer disabled:cursor-not-allowed !rounded-[var(--radius-md)] axiora-admin-btn-sm text-white ${subtleDestructiveFx}`;
  const chunkyChipBtn = (active: boolean) =>
    `axiora-chunky-btn cursor-pointer disabled:cursor-not-allowed ${active ? "axiora-chunky-chip--active text-white" : "axiora-chunky-chip text-[#1f3d39]"} !rounded-[var(--radius-md)] px-3 py-1 text-[11px] font-black`;
  const loginOrangeBtn =
    "cursor-pointer rounded-[var(--radius-lg)] bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.18),0_3px_0_rgba(158,74,30,0.28),0_8px_14px_rgba(93,48,22,0.14)] transition hover:brightness-105 active:translate-y-[1px] active:shadow-[inset_0_1px_0_rgba(255,219,190,0.14),0_1px_0_rgba(158,74,30,0.24),0_4px_10px_rgba(93,48,22,0.12)] disabled:cursor-not-allowed";
  const desktopIconBtnCls =
    "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[12px] border border-[#d7c3a9] bg-[linear-gradient(180deg,#fffaf3_0%,#f4e8d7_100%)] text-[#6b7280] shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_2px_0_rgba(203,173,135,0.2),0_6px_10px_rgba(33,49,46,0.06)] transition hover:brightness-102 disabled:cursor-not-allowed disabled:opacity-60";
  const desktopSecondaryBtnCls = `${chunkyOutlineBtn} !h-8 !px-2.5 !py-0 !text-[10px]`;
  const desktopTopActionBtnCls = `${chunkyOutlineBtn} !h-8 !px-3 !py-0 !text-[10px] whitespace-nowrap`;
  const desktopPreviewBtnCls = `${chunkyPrimaryBtn} !h-8 !px-3 !py-0 !text-[10px] whitespace-nowrap`;
  const refreshBtnCls = `whitespace-nowrap inline-flex items-center gap-1.5 rounded-[var(--radius-lg)] px-3 py-0 text-[10px] font-bold tracking-[0.01em] transition disabled:cursor-not-allowed ${
    canRefreshExercises
      ? `${desktopTopActionBtnCls} text-[#2F527D]`
      : `${desktopTopActionBtnCls} text-[#94a3b8] opacity-70 shadow-none`
  }`;
  const desktopPrimaryBtnCls = `inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[12px] px-3 text-[10px] font-extrabold tracking-[0.01em] disabled:cursor-not-allowed disabled:opacity-70 ${isPrinting ? "bg-[#cbd5e1] text-white shadow-none" : loginOrangeBtn}`;
  const previewToolbarBtnCls =
    "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-[#d9e2ec] bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-2.5 text-[10px] font-semibold text-[#526072] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-1px_0_rgba(217,226,236,0.88),0_2px_0_rgba(148,163,184,0.14),0_6px_10px_rgba(15,23,42,0.05)] transition hover:border-[#cbd5e1] hover:text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-60";
  const previewToolbarIconBtnCls = `${previewToolbarBtnCls} w-8 px-0`;
  const previewToolbarPrimaryBtnCls =
    "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] border border-[#f4b183] bg-[linear-gradient(180deg,#ffb06f_0%,#ff8d4a_100%)] px-3 text-[10px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.16),inset_0_-1px_0_rgba(176,86,38,0.5),0_2px_0_rgba(176,86,38,0.22),0_6px_10px_rgba(93,48,22,0.1)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60";
  const previewMetaPillCls =
    "inline-flex items-center rounded-full border border-[#dde6f0] bg-[rgba(255,255,255,0.92)] px-2.5 py-0.5 text-[10px] font-semibold text-[#607086] shadow-[0_1px_4px_rgba(15,23,42,0.04)]";
  const previewZoomBtnCls = (active: boolean) =>
    `inline-flex h-7 cursor-pointer items-center justify-center rounded-[9px] border px-2.5 text-[10px] font-semibold transition ${
      active
        ? "border-[#f2a36e] bg-[linear-gradient(180deg,#ffb06f_0%,#ff8d4a_100%)] text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.14),inset_0_-1px_0_rgba(176,86,38,0.48),0_2px_0_rgba(176,86,38,0.2),0_5px_8px_rgba(93,48,22,0.1)]"
        : "border-[#d9e2ec] bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] text-[#607086] shadow-[inset_0_1px_0_rgba(255,255,255,0.88),inset_0_-1px_0_rgba(217,226,236,0.84),0_2px_0_rgba(148,163,184,0.12),0_5px_8px_rgba(15,23,42,0.04)] hover:border-[#cbd5e1] hover:text-[#0f172a]"
    }`;
  const previewPagerBtnCls = (disabled: boolean) =>
    `inline-flex h-7 w-7 items-center justify-center rounded-[9px] border transition ${
      disabled
        ? "cursor-not-allowed border-[#e2e8f0] bg-[#f8fafc] text-[#cbd5e1] opacity-70"
        : "cursor-pointer border-[#d9e2ec] bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] text-[#607086] shadow-[0_2px_6px_rgba(15,23,42,0.05)] hover:border-[#cbd5e1] hover:text-[#0f172a]"
    }`;
  const creditsBadgeTone =
    creditsLoading || credits === null
      ? "border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]"
      : credits === 0
        ? "border-[#fecaca] bg-[#ffecec] text-[#d64545]"
        : credits === 1
          ? "border-[#fed7aa] bg-[#fff4e5] text-[#c2410c]"
          : "border-[#bbf7d0] bg-[#ecfdf3] text-[#15803d]";
  const creditsBadgeLabel =
    creditsLoading || credits === null
      ? "Verificando créditos"
      : credits === 0
        ? "Sem gerações disponíveis"
        : credits === 1
          ? "Última geração gratuita"
          : `${credits} gerações disponíveis`;

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-visible bg-white md:h-full md:overflow-hidden md:min-h-0"
      data-paginating={isPaginating ? "true" : "false"}
    >
      {/* ── MOBILE TAB BAR ──────────────────────────────────────────── */}
      <div
        className={`${mobileTab === "config" ? "flex" : "hidden"} shrink-0 border-b border-[#e5e7eb] md:hidden`}
        style={{ background: "#ffffff" }}
      >
        <button
          type="button"
          onClick={() => setMobileTab((prev) => (prev === "config" ? "blocks" : "config"))}
          className={`m-1 flex-1 ${chunkyChipBtn(mobileTab === "config")} py-2`}
        >
          Voltar aos exercícios
        </button>
      </div>

      {/* ── LEFT PANEL ──────────────────────────────────────────────── */}
      <div className="hidden min-w-0 border-b border-[#e5e7eb] bg-white px-4 md:flex md:h-[74px] xl:px-5">
        <div className="flex w-full min-w-0 items-center justify-between gap-3 overflow-visible">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto pr-2">
            <span
              className={`inline-flex h-7 items-center rounded-[8px] border px-2.5 text-[11px] font-semibold ${creditsBadgeTone}`}
            >
              {creditsBadgeLabel}
            </span>
            <span className="inline-flex h-7 items-center rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] px-2.5 text-[11px] font-semibold text-[#475569]">
              {activeCount} ativo{activeCount === 1 ? "" : "s"}
            </span>
            <span className="inline-flex h-7 items-center rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] px-2.5 text-[11px] font-semibold text-[#475569]">
              {totalExercises} exercícios
            </span>
          </div>

          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              aria-label="Voltar para home"
              onClick={() => router.push("/tools")}
              className={`${desktopTopActionBtnCls} !flex !w-8 !items-center !justify-center !px-0 text-[#ee8748]`}
            >
              <Home className="axiora-fixed-icon" size={15} strokeWidth={2} />
            </button>

            <button
              type="button"
              onClick={openCategoryModalWithHaptic}
              className={desktopPreviewBtnCls}
            >
              Adicionar exerc&iacute;cios
            </button>

            <button
              type="button"
              onClick={addBlockWithHaptic}
              className={desktopTopActionBtnCls}
            >
              Modelo pronto
            </button>

            <button
              type="button"
              onClick={openDesktopSettings}
              className={desktopTopActionBtnCls}
            >
              Configurações
            </button>

            <button
              type="button"
              onClick={rerollSeed}
              disabled={!canRefreshExercises}
              aria-label="Atualizar exercícios"
              title="Atualizar exercícios"
              className={refreshBtnCls}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0115-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 01-15 6.7L3 16" />
              </svg>
              Atualizar
            </button>

            <button type="button" onClick={openPreviewWindow} className={desktopPreviewBtnCls}>
              {previewOpenPending ? "Preparando..." : "Pré-visualização"}
            </button>

          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col overflow-visible bg-white md:overflow-hidden">
        <aside
          className={`${mobileTab === "config" ? "flex" : "hidden"} flex-col overflow-hidden transition-opacity duration-150 md:hidden md:min-h-0 md:min-w-0`}
          style={{
            background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
            borderRight: "1px solid #e5e7eb",
          }}
        >
          {/* Panel header */}
          <div
            className="relative shrink-0 overflow-hidden px-5 py-3.5"
            style={{
              borderBottom: "1px solid #e5e7eb",
              background: "linear-gradient(180deg, rgba(251,146,60,0.05) 0%, transparent 100%)",
            }}
          >
            <div className="absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(90deg,#ee8748,rgba(238,135,72,0.2),transparent)]" />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold tracking-[0.01em] text-[#1e293b]">
                  Configurações
                </div>
                <div className="mt-0.5 text-[11px] text-[#64748b]">
                  Ajuste cabeçalho, layout global e opções da folha.
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pb-24 md:pb-6">
            {/* CABEÇALHO */}
            <div className="border-b border-[#f1f5f9] px-4">
              <button
                type="button"
                onClick={() => toggleSection("cabecalho")}
                className="flex w-full items-center justify-between py-3 text-left transition-opacity hover:opacity-70"
              >
                <div className="flex items-center gap-2">
                  <span className="h-3 w-[3px] rounded-full bg-[#ee8748]" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">
                    Cabeçalho da Folha
                  </span>
                </div>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className={`transition-transform duration-200 ${openSections.has("cabecalho") ? "rotate-180" : ""}`}
                >
                  <path d="M2 4l4 4 4-4" />
                </svg>
              </button>
              <div
                className={`overflow-hidden transition-all duration-200 ${openSections.has("cabecalho") ? "max-h-[400px] opacity-100 pb-4" : "max-h-0 opacity-0"}`}
              >
                <div className="space-y-2.5">
                  <label className="block text-[11px] font-medium text-[#475569]">
                    Título
                    <input
                      className={inputCls}
                      value={settingsDraftCfg.title}
                      onChange={(e) => updateSettingsDraft("title", e.target.value)}
                    />
                  </label>
                  <label className="block text-[11px] font-medium text-[#475569]">
                    Instruções
                    <textarea
                      className={`${inputCls} resize-none`}
                      rows={2}
                      value={settingsDraftCfg.subtitle}
                      onChange={(e) => updateSettingsDraft("subtitle", e.target.value)}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[11px] font-medium text-[#475569]">
                      Turma
                      <input
                        className={inputCls}
                        placeholder="7º Ano A"
                        value={settingsDraftCfg.turma}
                        onChange={(e) => updateSettingsDraft("turma", e.target.value)}
                      />
                    </label>
                    <label className="block text-[11px] font-medium text-[#475569]">
                      Tempo
                      <input
                        className={inputCls}
                        placeholder="30 min"
                        value={settingsDraftCfg.tempo}
                        onChange={(e) => updateSettingsDraft("tempo", e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* LAYOUT */}
            <div className="border-b border-[#f1f5f9] px-4">
              <button
                type="button"
                onClick={() => openSettingsSubview("layout")}
                className="flex w-full items-center justify-between py-3 text-left transition-opacity hover:opacity-70"
              >
                <div className="flex items-center gap-2">
                  <span className="h-3 w-[3px] rounded-full bg-[#ee8748]" />
                  <span className="text-[12px] font-medium text-[#475569]">Layout Global</span>
                </div>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>

            {/* OPÇÕES */}
            <div className="px-4">
              <button
                type="button"
                onClick={() => openSettingsSubview("options")}
                className="flex w-full items-center justify-between py-3 text-left transition-opacity hover:opacity-70"
              >
                <div className="flex items-center gap-2">
                  <span className="h-3 w-[3px] rounded-full bg-[#ee8748]" />
                  <span className="text-[12px] font-medium text-[#475569]">Opções</span>
                </div>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>

            {/* RESUMO */}
            <div className="border-t border-[#e2e8f0] px-5 py-4">
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">
                Resumo da Folha
              </div>
              <div className="space-y-1.5">
                {(
                  [
                    ["Colunas", String(settingsDraftCfg.cols)],
                    [
                      "Fonte",
                      settingsDraftCfg.fontSize === "P"
                        ? "Pequena"
                        : settingsDraftCfg.fontSize === "M"
                          ? "Média"
                          : "Grande",
                    ],
                    ["Espaçamento", `${settingsDraftCfg.spacing}px`],
                    [
                      "Gabarito",
                      settingsDraftCfg.gabarito === "sem"
                        ? "Sem gabarito"
                        : settingsDraftCfg.gabarito === "mesma"
                          ? "Mesma página"
                          : "Próxima página",
                    ],
                    ["Total exercícios", String(totalExercises)],
                    ["Blocos ativos", `${activeCount} de ${blocks.length}`],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between py-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">
                      {label}
                    </span>
                    <span className="text-[11px] font-medium text-[#475569]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="shrink-0 border-t border-[#e2e8f0] bg-white px-4 py-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeSettingsFlow}
                className={`flex-1 ${chunkyOutlineBtn}`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmSettingsFlow}
                className={`flex-1 ${chunkyPrimaryBtn}`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </aside>

        {/* ── CENTER PANEL ────────────────────────────────────────────── */}
        <main
          id="sheet-blocks-panel"
          className={`${mobileTab === "blocks" ? "flex" : "hidden"} flex-col overflow-visible border-t border-[#e5e7eb] transition-opacity duration-150 md:flex md:min-h-0 md:min-w-0 md:flex-1 md:overflow-hidden md:border-t-0`}
          style={{ background: "#ffffff" }}
        >
          {/* Header */}
          <div
            className="flex shrink-0 flex-col gap-3 px-4 py-3 2xl:px-5"
            style={{ borderBottom: "1px solid #e5e7eb", background: "#ffffff" }}
          >
            <div className="flex min-w-0 flex-col gap-2">
              <div>
                <div className="text-[13px] font-semibold tracking-[0.01em] text-[#1e293b]">
                  Blocos de Exercícios
                </div>
                <div className="mt-0.5 text-[11px] text-[#94a3b8]">
                  Monte sua lista, organize os tipos e acompanhe o total em tempo real.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${activeCount > 0 ? "bg-[rgba(238,135,72,0.12)] text-[#ee8748]" : "bg-[#f1f5f9] text-[#94a3b8]"}`}
                >
                  {activeCount} ativo{activeCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:hidden">
              <div
                key={creditsFxTick}
                className={`whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-all ${
                  creditsLoading || credits === null
                    ? "border-[#e2e8f0] bg-white text-[#94a3b8]"
                    : credits === 0
                      ? "border-[#fee2e2] bg-[#fff1f2] text-[#be123c]"
                      : credits === 1
                        ? "border-[#fef3c7] bg-[#fffbeb] text-[#b45309]"
                        : "border-[#e2e8f0] bg-white text-[#475569]"
                } ${creditsFxTick > 0 ? "animate-pulse" : ""}`}
              >
                {creditsLoading ? (
                  "Verificando créditos..."
                ) : credits === null ? (
                  "Créditos indisponíveis"
                ) : credits === 0 ? (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#be123c]" />
                    Sem gerações — compre um pacote
                  </span>
                ) : credits === 1 ? (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
                    Última geração gratuita
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                    {credits} gerações disponíveis
                  </span>
                )}
              </div>
              <button
                type="button"
                aria-label="Voltar para home"
                onClick={() => router.push("/tools")}
                className={`${chunkyOutlineBtn} !flex !h-[34px] !w-[34px] !items-center !justify-center !px-0 !py-0 text-[#ee8748]`}
              >
                <Home className="axiora-fixed-icon" size={15} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={openCategoryModalWithHaptic}
                className={`${chunkyPrimaryBtn} !px-2.5 !py-1.5 !text-[10px] whitespace-nowrap`}
              >
                Adicionar exerc&iacute;cios
              </button>
              <button
                type="button"
                onClick={addBlockWithHaptic}
                className={`${chunkyOutlineBtn} !px-2.5 !py-1.5 !text-[10px] whitespace-nowrap`}
              >
                Modelo pronto
              </button>
              <button
                type="button"
                onClick={openMobileSettings}
                className={`${chunkyOutlineBtn} !px-2.5 !py-1.5 !text-[10px] whitespace-nowrap`}
              >
                Configurações
              </button>
              <button
                type="button"
                onClick={rerollSeed}
                disabled={!canRefreshExercises}
                aria-label="Atualizar exercícios"
                title="Atualizar exercícios"
                className={`${refreshBtnCls} !gap-1.5 !px-2.5 !py-1.5 !text-[10px]`}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 2v6h-6" />
                  <path d="M3 12a9 9 0 0115-6.7L21 8" />
                  <path d="M3 22v-6h6" />
                  <path d="M21 12a9 9 0 01-15 6.7L3 16" />
                </svg>
                Atualizar
              </button>
              <button
                type="button"
                onClick={openPreviewWindow}
                className={`${chunkyOutlineBtn} !px-2.5 !py-1.5 !text-[10px] whitespace-nowrap`}
              >
                {previewOpenPending ? "Preparando..." : "Prévia"}
              </button>
            </div>
          </div>

          {/* Blocks list */}
          <div className="overflow-visible bg-white pb-0 md:flex-1 md:overflow-y-auto md:pb-0">
            {blocks.length === 0 ? (
              <div
                id="sheet-blocks-entry"
                className="flex h-full flex-col items-center justify-start gap-4 px-6 py-4 text-center transition-all duration-300"
              >

                {/* Illustration */}
                <button
                  type="button"
                  onClick={openCategoryModalWithHaptic}
                  aria-label="Adicionar exercícios"
                  className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-2xl transition hover:brightness-105"
                  style={{
                    background: "linear-gradient(135deg, #fff7f0 0%, #ffe8d4 100%)",
                    border: "1px solid rgba(238,135,72,0.2)",
                  }}
                >
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ee8748"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <path d="M9 12h6M12 9v6" />
                  </svg>
                </button>
                <div>
                  <p className="text-[14px] font-bold text-[#1e293b]">
                    Crie sua primeira atividade
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#94a3b8]">
                    Monte do zero clicando em Adicionar exercícios ou use um Modelo pronto
                  </p>
                </div>
                {/* Steps */}
                <div className="w-full space-y-2">
                  {(
                    [
                      { step: "1", label: "Monte a lista", desc: "Adicione blocos de exercícios" },
                      {
                        step: "2",
                        label: "Ajuste os exercicios",
                        desc: "Defina categoria, quantidade e formato",
                      },
                      { step: "3", label: "Exporte o PDF", desc: "Pronto para imprimir" },
                    ] as { step: string; label: string; desc: string }[]
                  ).map(({ step, label, desc }) => (
                    <div
                      key={step}
                      className="flex items-center gap-3 rounded-xl border border-[#f1f5f9] bg-white px-4 py-3 text-left"
                    >
                      <div
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: "#ee8748" }}
                      >
                        {step}
                      </div>
                      <div>
                        <div className="text-[12px] font-semibold text-[#334155]">{label}</div>
                        <div className="text-[11px] text-[#94a3b8]">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 px-3 py-3">
                {blocks.map((block, idx) => {
                  const meta = BLOCK_META[block.type];
                  const isSelected = block.id === selectedBlockId;
                  return (
                    <div
                      id={`sheet-block-card-${block.id}`}
                      key={block.id}
                      onClick={() => {
                        setSelectedBlockId(block.id);
                        setBlockDetailModalOpen(true);
                        setMobileTab("blocks");
                      }}
                      className={`group relative cursor-pointer rounded-2xl border p-3.5 transition-all duration-150 ease-linear hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] ${isSelected ? "border-[#fb923c] bg-[#fff7ed] shadow-[0_8px_20px_rgba(251,146,60,0.14)]" : "border-[#eef2f7] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.04)]"} ${!block.active ? "opacity-55" : ""}`}
                      style={{ transition: "all 160ms ease" }}
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                          style={{ background: isSelected ? "rgba(251,146,60,0.14)" : meta.color }}
                        >
                          <meta.Icon
                            size={15}
                            strokeWidth={1.9}
                            style={{ color: isSelected ? "#ea580c" : meta.accent }}
                          />
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[14px] font-semibold text-[#0f172a]">
                              {meta.name}
                            </span>
                            {isSelected && (
                              <span className="rounded-full bg-[#ffedd5] px-2 py-0.5 text-[10px] font-semibold text-[#c2410c]">
                                Selecionado
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-[12px] text-[#64748b]">
                            {blockMetaText(block)}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-[#94a3b8]">
                            <span>Bloco #{idx + 1}</span>
                            <span className="h-1 w-1 rounded-full bg-[#cbd5e1]" />
                            <span>{block.active ? "Ativo" : "Inativo"}</span>
                          </div>
                        </div>

                        <div
                          className="flex shrink-0 items-start gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="rounded-full bg-[#f1f5f9] px-[10px] py-[4px] text-[12px] font-semibold text-[#334155]">
                            {block.config.quantidade}
                          </div>
                          <button
                            onClick={() => toggleBlock(block.id)}
                            aria-label={block.active ? "Desativar bloco" : "Ativar bloco"}
                            className="relative flex h-6 w-11 cursor-pointer items-center rounded-full transition-all duration-200"
                            style={{
                              background: block.active ? "#ee8748" : "#e2e8f0",
                              boxShadow: block.active ? "0 0 8px rgba(238,135,72,0.28)" : "none",
                            }}
                          >
                            <div
                              className={`absolute h-4 w-4 rounded-full bg-white shadow-md transition-all duration-200 ${block.active ? "left-6" : "left-1"}`}
                            />
                          </button>
                          <button
                            onClick={() => removeBlock(block.id)}
                            aria-label="Remover bloco"
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[#cbd5e1] transition hover:bg-red-50 hover:text-red-400 group-hover:text-[#94a3b8]"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                            >
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Total stats */}
            {blocks.length > 0 && (
              <div style={{ borderTop: "1px solid #f1f5f9" }}>
                <div className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">
                      Total de exercícios
                    </div>
                    <div className="mt-0.5 text-[18px] font-black tracking-tight text-[#0f172a]">
                      {totalExercises}
                    </div>
                  </div>
                  <div className="h-8 w-px bg-[#e2e8f0]" />
                  <div className="text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">
                      Blocos ativos
                    </div>
                    <div className="mt-0.5 text-[18px] font-black tracking-tight text-[#ee8748]">
                      {activeCount}
                    </div>
                  </div>
                  <div className="h-8 w-px bg-[#e2e8f0]" />
                  <div className="text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">
                      Colunas
                    </div>
                    <div className="mt-0.5 text-[18px] font-black tracking-tight text-[#64748b]">
                      {cfg.cols}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

      </div>
      {portalReady &&
        previewWindowState === "minimized" &&
        createPortal(
        <button
          type="button"
          onClick={openPreviewWindow}
          className="fixed bottom-[84px] right-4 z-[980] flex items-center gap-3 rounded-2xl border border-[#dbe4f0] bg-white px-3 py-2 text-left shadow-[0_18px_34px_rgba(15,23,42,0.18)] transition hover:shadow-[0_20px_40px_rgba(15,23,42,0.22)] md:bottom-5"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#fff7ed_0%,#ffe7cf_100%)] text-[#ee8748]">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <path d="M8 20h8" />
              <path d="M12 16v4" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-bold text-[#0f172a]">Preview minimizado</div>
            <div className="text-[11px] text-[#94a3b8]">
              {previewPages.length > 0
                ? `Página ${currentPage + 1} de ${previewPages.length}`
                : "Abra para visualizar a folha"}
            </div>
          </div>
        </button>
        , document.body)}

      {portalReady &&
        previewWindowOpen &&
        createPortal(
        <div
          className={`fixed inset-0 z-[990] flex ${
            isMobileViewport ? "items-stretch justify-stretch" : "items-center justify-center"
          }`}
          style={{ backdropFilter: "blur(8px)", background: "rgba(15,23,42,0.52)" }}
          onClick={closePreviewWindow}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Janela de preview da folha"
            className={`relative flex w-full flex-col overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[0_28px_90px_rgba(15,23,42,0.28)] ${
              isMobileViewport || previewWindowState === "maximized"
                ? "h-[100dvh] max-w-none rounded-none border-0"
                : "mx-3 h-[min(90vh,940px)] max-w-[min(1240px,calc(100vw-24px))] rounded-[28px] border border-[rgba(255,255,255,0.45)]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`flex items-center justify-end gap-2 border-b border-[rgba(226,232,240,0.72)] bg-[rgba(255,255,255,0.94)] backdrop-blur-sm ${
                previewWindowState === "maximized" ? "px-4 py-2" : "px-4 py-2"
              }`}
            >
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void handlePrint()}
                  disabled={isPrinting || isPaginating || previewPages.length === 0}
                  className={previewToolbarPrimaryBtnCls}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 15V3m0 12-4-4m4 4 4-4M2 17l.621 2.485A2 2 0 004.56 21h14.878a2 2 0 001.94-1.515L22 17" />
                  </svg>
                  {isPrinting ? "Gerando..." : isPaginating ? "Preparando..." : "Gerar PDF"}
                </button>
                <button
                  type="button"
                  onClick={minimizePreviewWindow}
                  className={previewToolbarIconBtnCls}
                  aria-label="Minimizar preview"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M6 12h12" />
                  </svg>
                </button>
                {!isMobileViewport ? (
                  <button
                    type="button"
                    onClick={togglePreviewWindowSize}
                    className={previewToolbarIconBtnCls}
                    aria-label={previewWindowState === "maximized" ? "Restaurar preview" : "Maximizar preview"}
                  >
                    {previewWindowState === "maximized" ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                        <path d="M16 3h3a2 2 0 0 1 2 2v3" />
                        <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
                        <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h6v6" />
                        <path d="M9 21H3v-6" />
                        <path d="M21 3l-7 7" />
                        <path d="M3 21l7-7" />
                      </svg>
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closePreviewWindow}
                  className={previewToolbarIconBtnCls}
                  aria-label="Fechar preview"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div
              className={`flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(226,232,240,0.68)] bg-[rgba(248,250,252,0.9)] ${
                previewWindowState === "maximized" ? "px-4 py-1.5" : "px-4 py-1.5"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={previewMetaPillCls}>
                  {previewPages.length > 0
                    ? `${previewPages.length} página${previewPages.length === 1 ? "" : "s"}`
                    : "Sem páginas geradas"}
                </span>
                <span className={previewMetaPillCls}>
                  {activeCount} bloco{activeCount === 1 ? "" : "s"} ativo{activeCount === 1 ? "" : "s"}
                </span>
              </div>
              {!isMobileViewport ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="mr-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">
                    Zoom
                  </span>
                  {(
                    [
                      { label: "50%", value: 0.5 },
                      { label: "75%", value: 0.75 },
                      { label: "100%", value: 1 },
                    ] as const
                  ).map((z) => (
                    <button
                      key={z.label}
                      type="button"
                      onClick={() => setZoom(z.value)}
                      className={previewZoomBtnCls(zoom === z.value)}
                      aria-label={`Zoom ${z.label}`}
                    >
                      {z.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div
              ref={previewCanvasRef}
              className="preview-canvas"
              style={{
                flex: isMobileViewport ? "0 1 auto" : 1,
                minHeight: 0,
                overflow: "auto",
                background:
                  isMobileViewport
                    ? "#ffffff"
                    : "linear-gradient(180deg, rgba(53,65,84,0.98) 0%, rgba(41,50,65,0.99) 100%)",
                maxHeight: isMobileViewport ? "calc(100dvh - 168px)" : undefined,
                padding: isMobileViewport
                  ? "0"
                  : previewWindowState === "maximized"
                    ? "18px 28px 22px"
                    : "20px 32px 24px",
                display: "flex",
                justifyContent: isMobileViewport ? "flex-start" : "center",
                alignItems: "flex-start",
              }}
            >
              {previewPages.length > 0 ? (
                <div
                  className="page-wrapper"
                  style={{
                    width: isMobileViewport ? "100%" : `${Math.round(A4_W * previewScale)}px`,
                    height: `${Math.round(A4_H * previewScale)}px`,
                    transition: "width 0.2s ease, height 0.2s ease, opacity 0.2s ease",
                    borderRadius: isMobileViewport ? 0 : 12,
                    boxShadow: isMobileViewport
                      ? "none"
                      : "0 26px 80px rgba(15,23,42,0.42), 0 10px 28px rgba(15,23,42,0.22)",
                    margin: isMobileViewport ? "0 auto" : "0 auto",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <div
                    className="preview-container"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: `${A4_W}px`,
                      height: `${A4_H}px`,
                      transform: `scale(${previewScale})`,
                      transformOrigin: "top left",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "flex-start",
                    }}
                  >
                    <div dangerouslySetInnerHTML={{ __html: previewPages[currentPage] }} />
                  </div>
                </div>
              ) : activeCount > 0 || isPaginating ? (
                <div className="mx-auto flex max-w-[380px] flex-col items-center justify-center gap-4 rounded-[28px] border border-[rgba(238,135,72,0.18)] bg-white/88 px-8 py-10 text-center shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[linear-gradient(135deg,#fff7f0_0%,#ffe8d4_100%)] text-[#ee8748]">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M21 12a9 9 0 1 1-3.15-6.87" />
                      <path d="M21 3v6h-6" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[15px] font-bold text-[#475569]">Preparando a pré-visualização</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-[#94a3b8]">
                      Estamos organizando as páginas para manter o conteúdo próximo ao rodapé, sem cortar a folha.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex max-w-[380px] flex-col items-center justify-center gap-4 rounded-[28px] border border-[rgba(238,135,72,0.18)] bg-white/88 px-8 py-10 text-center shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[linear-gradient(135deg,#fff7f0_0%,#ffe8d4_100%)] text-[#ee8748]">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18M9 21V9" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[15px] font-bold text-[#475569]">Preview indisponível</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-[#94a3b8]">
                      Adicione blocos ativos para abrir a folha em uma janela maior e revisar o resultado com conforto.
                    </p>
                  </div>
                  <button type="button" onClick={closePreviewWindow} className={desktopSecondaryBtnCls}>
                    Voltar para edição
                  </button>
                </div>
              )}
            </div>

            <div
              className={`border-t border-[rgba(226,232,240,0.72)] bg-[rgba(255,255,255,0.94)] ${
                previewWindowState === "maximized" ? "px-4 py-2" : "px-4 py-2"
              }`}
            >
              <div className={`grid items-center gap-2 ${isMobileViewport ? "grid-cols-1" : "grid-cols-[1fr_auto_1fr]"}`}>
              <div className={isMobileViewport ? "hidden" : ""} />
              <div className={`flex items-center gap-2 ${isMobileViewport ? "mx-auto" : "justify-center"}`}>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0 || previewPages.length <= 1}
                  className={previewPagerBtnCls(currentPage === 0 || previewPages.length <= 1)}
                  aria-label="Página anterior"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <span className="min-w-[112px] text-center text-[12px] font-medium tabular-nums text-[#6b7280]">
                  {previewPages.length > 0 ? `Página ${currentPage + 1} de ${previewPages.length}` : "—"}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(previewPages.length - 1, p + 1))}
                  disabled={currentPage === previewPages.length - 1 || previewPages.length <= 1}
                  className={previewPagerBtnCls(
                    currentPage === previewPages.length - 1 || previewPages.length <= 1,
                  )}
                  aria-label="Próxima página"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </div>
              <div className={`flex items-center gap-2 text-[9px] text-[#94a3b8] ${isMobileViewport ? "hidden" : "justify-end"}`}>
                <span className="hidden sm:inline">Revise no tamanho maior e exporte quando estiver pronto.</span>
              </div>
              </div>
            </div>
          </div>
        </div>
        , document.body)}

      {/* ── BLOCK DETAIL MODAL ───────────────────────────────────────── */}
      {blockDetailModalOpen &&
        blockDraft &&
        renderPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ backdropFilter: "blur(6px)", background: "rgba(15,23,42,0.45)" }}
          onClick={closeBlockDetailModal}
        >
          <div
            className="relative mx-4 flex max-h-[85vh] w-full max-w-[420px] flex-col overflow-visible rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#f1f5f9] px-5 py-4">
              <div>
                <div className="text-[15px] font-bold text-[#0f172a]">
                  {BLOCK_META[blockDraft.type].name}
                </div>
                <div className="text-[11px] text-[#94a3b8]">
                  #{blockDraft.id} ·{" "}
                  {blockDraft.active ? (
                    <span className="text-emerald-500">Ativo</span>
                  ) : (
                    <span className="text-[#94a3b8]">Inativo</span>
                  )}
                </div>
              </div>
              <button
                onClick={closeBlockDetailModal}
                aria-label="Fechar detalhes do bloco"
                className={`flex h-8 w-8 items-center justify-center ${chunkySmallOutlineBtn}`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-visible">
              <BlockDetailPanel
                block={blockDraft}
                onUpdate={updateDraftBlockConfig}
                onChangeType={changeDraftBlockType}
              />
            </div>
            <div className="border-t border-[#f1f5f9] px-5 py-3">
              <button
                type="button"
                onClick={confirmBlockDetailChanges}
                className={`w-full ${chunkyPrimaryBtn}`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
        )}

      {settingsModalOpen &&
        renderPortal(
        <div
          className="fixed inset-0 z-[200] hidden items-center justify-center md:flex"
          style={{ backdropFilter: "blur(6px)", background: "rgba(15,23,42,0.45)" }}
          onClick={closeSettingsFlow}
        >
          <div
            className="relative mx-4 w-full max-w-[540px] overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#f1f5f9] px-5 py-4">
              <div>
                <div className="text-[15px] font-bold text-[#0f172a]">Configurações</div>
                <div className="text-[12px] text-[#94a3b8]">
                  Ajuste o cabeçalho e abra as opções avançadas.
                </div>
              </div>
              <button
                onClick={closeSettingsFlow}
                className={`flex h-8 w-8 items-center justify-center ${chunkySmallOutlineBtn}`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <label className="block text-[11px] font-medium text-[#475569]">
                Título
                <input
                  className={inputCls}
                  value={settingsDraftCfg.title}
                  onChange={(e) => updateSettingsDraft("title", e.target.value)}
                />
              </label>
              <label className="block text-[11px] font-medium text-[#475569]">
                Instruções
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  value={settingsDraftCfg.subtitle}
                  onChange={(e) => updateSettingsDraft("subtitle", e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-[11px] font-medium text-[#475569]">
                  Turma
                  <input
                    className={inputCls}
                    placeholder="7º Ano A"
                    value={settingsDraftCfg.turma}
                    onChange={(e) => updateSettingsDraft("turma", e.target.value)}
                  />
                </label>
                <label className="block text-[11px] font-medium text-[#475569]">
                  Tempo
                  <input
                    className={inputCls}
                    placeholder="30 min"
                    value={settingsDraftCfg.tempo}
                    onChange={(e) => updateSettingsDraft("tempo", e.target.value)}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    openSettingsSubview("layout");
                  }}
                  className={`${chunkyOutlineBtn} !h-10 !justify-center !px-3 !text-[10px]`}
                >
                  Layout
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openSettingsSubview("options");
                  }}
                  className={`${chunkyOutlineBtn} !h-10 !justify-center !px-3 !text-[10px]`}
                >
                  Opções
                </button>
              </div>
              <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">
                  Resumo
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-[#475569]">
                  <span>{activeCount} blocos ativos</span>
                  <span>{totalExercises} exercícios</span>
                  <span>{settingsDraftCfg.cols} colunas</span>
                </div>
              </div>
            </div>
            <div className="border-t border-[#f1f5f9] px-5 py-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeSettingsFlow}
                  className={`flex-1 ${chunkyOutlineBtn}`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmSettingsFlow}
                  className={`flex-1 ${chunkyPrimaryBtn}`}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
        )}

      {/* ── LAYOUT MODAL ─────────────────────────────────────────── */}
      {layoutModalOpen &&
        renderPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ backdropFilter: "blur(6px)", background: "rgba(15,23,42,0.45)" }}
          onClick={closeLayoutModal}
        >
          <div
            className="relative mx-4 w-full max-w-[420px] overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#f1f5f9] px-5 py-4">
              <div className="flex items-center gap-3">
                <div>
                <div className="text-[15px] font-bold text-[#0f172a]">Layout Global</div>
                <div className="text-[12px] text-[#94a3b8]">Configurações visuais da folha</div>
                </div>
              </div>
              <button
                onClick={closeLayoutModal}
                className={`flex h-8 w-8 items-center justify-center ${chunkySmallOutlineBtn}`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Content */}
            <div className="space-y-5 px-5 py-5">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#94a3b8]">
                  Colunas
                </div>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => updateLayoutDraft("cols", n)}
                      className={segBtnCls((layoutDraft ?? settingsHeavyDraft ?? heavyCfg).cols === n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#94a3b8]">
                  Tamanho da fonte
                </div>
                <div className="flex gap-1.5">
                  {(["P", "M", "G"] as FontSize[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => updateLayoutDraft("fontSize", s)}
                      className={segBtnCls((layoutDraft ?? settingsHeavyDraft ?? heavyCfg).fontSize === s)}
                    >
                      {s === "P" ? "Pequena" : s === "M" ? "Média" : "Grande"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#94a3b8]">
                  Gabarito
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => updateLayoutDraft("gabarito", "sem")}
                      className={segBtnCls((layoutDraft ?? settingsHeavyDraft ?? heavyCfg).gabarito === "sem")}
                    >
                      Sem gabarito
                    </button>
                    <button
                      onClick={() => updateLayoutDraft("gabarito", "mesma")}
                      className={segBtnCls((layoutDraft ?? settingsHeavyDraft ?? heavyCfg).gabarito === "mesma")}
                    >
                      Mesma página
                    </button>
                  </div>
                  <button
                    onClick={() => updateLayoutDraft("gabarito", "proxima")}
                    className={segBtnCls((layoutDraft ?? settingsHeavyDraft ?? heavyCfg).gabarito === "proxima")}
                  >
                    Próxima página
                  </button>
                </div>
              </div>
            </div>
            {/* Footer */}
            <div className="border-t border-[#f1f5f9] px-5 py-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeLayoutModal}
                  className={`flex-1 ${chunkyOutlineBtn}`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmLayoutModal}
                  className={`flex-1 ${chunkyPrimaryBtn}`}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
        )}

      {/* ── OPÇÕES MODAL ─────────────────────────────────────────── */}
      {opcoesModalOpen &&
        renderPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ backdropFilter: "blur(6px)", background: "rgba(15,23,42,0.45)" }}
          onClick={closeOptionsModal}
        >
          <div
            className="relative mx-4 w-full max-w-[420px] overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#f1f5f9] px-5 py-4">
              <div className="flex items-center gap-3">
                <div>
                <div className="text-[15px] font-bold text-[#0f172a]">Opções</div>
                <div className="text-[12px] text-[#94a3b8]">Personalização da folha</div>
                </div>
              </div>
              <button
                onClick={closeOptionsModal}
                className={`flex h-8 w-8 items-center justify-center ${chunkySmallOutlineBtn}`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Toggles */}
            <div className="space-y-2 px-5 py-4">
              {(
                [
                  [
                    "embaralhar",
                    "Embaralhar exercícios",
                    "Ordena aleatoriamente os exercícios no PDF",
                  ],
                  ["showNome", "Campo Nome / Data", "Adiciona linha para o aluno preencher"],
                  ["numerar", "Numerar exercícios", "Exibe 1., 2., 3. antes de cada exercício"],
                  ["repeatHeader", "Repetir cabeçalho", "Repete o título em cada página do PDF"],
                ] as [keyof GlobalConfig, string, string][]
              ).map(([key, label, desc]) => (
                <button
                  key={key}
                  type="button"
                  role="switch"
                  aria-checked={!!(optionsDraft ?? settingsHeavyDraft ?? heavyCfg)[key as keyof HeavyConfig]}
                  onClick={() =>
                    updateOptionsDraft(
                      key as keyof HeavyConfig,
                      !(optionsDraft ?? settingsHeavyDraft ?? heavyCfg)[key as keyof HeavyConfig],
                    )
                  }
                  className={`flex w-full cursor-pointer items-center gap-4 px-4 py-3 text-left ${chunkySmallOutlineBtn}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[#334155]">{label}</div>
                    <div className="text-[11px] text-[#94a3b8]">{desc}</div>
                  </div>
                  <div
                    className="relative h-5 w-9 shrink-0 rounded-full transition-all duration-200"
                    style={{
                      background: (optionsDraft ?? settingsHeavyDraft ?? heavyCfg)[key as keyof HeavyConfig]
                        ? "#ee8748"
                        : "#cbd5e1",
                      boxShadow: (optionsDraft ?? settingsHeavyDraft ?? heavyCfg)[key as keyof HeavyConfig]
                        ? "0 0 8px rgba(238,135,72,0.35)"
                        : "none",
                    }}
                  >
                    <div
                      className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-md transition-all duration-200"
                      style={{
                        left:
                          (optionsDraft ?? settingsHeavyDraft ?? heavyCfg)[key as keyof HeavyConfig]
                            ? "20px"
                            : "2px",
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>
            {/* Footer */}
            <div className="border-t border-[#f1f5f9] px-5 py-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeOptionsModal}
                  className={`flex-1 ${chunkyOutlineBtn}`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmOptionsModal}
                  className={`flex-1 ${chunkyPrimaryBtn}`}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
        )}

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onBuy={handleBuyCredits}
      />

      {categoryModalOpen &&
        renderPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ backdropFilter: "blur(6px)", background: "rgba(15,23,42,0.45)" }}
          onClick={() => setCategoryModalOpen(false)}
        >
          <div
            className="relative mx-4 flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-hidden rounded-3xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[#f1f5f9] px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[16px] font-bold text-[#0f172a]">Adicionar exercícios</div>
                  <div className="mt-1 max-w-[440px] text-[12px] leading-relaxed text-[#64748b]">
                    Escolha uma categoria para criar um bloco novo com a configuração inicial da
                    área selecionada.
                  </div>
                </div>
                <button
                  onClick={() => setCategoryModalOpen(false)}
                  className={`flex h-8 w-8 items-center justify-center ${chunkySmallOutlineBtn}`}
                  aria-label="Fechar seleção de categorias"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid gap-3 overflow-y-auto px-5 py-5 sm:grid-cols-2">
              {(Object.keys(BLOCK_META) as BlockType[]).map((type) => {
                const meta = BLOCK_META[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleSelectCategory(type)}
                    className="group rounded-2xl border border-[#e2e8f0] bg-white p-4 text-left transition-all hover:border-[rgba(238,135,72,0.35)] hover:shadow-[0_16px_30px_rgba(15,23,42,0.08)]"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
                        style={{ background: meta.color }}
                      >
                        <meta.Icon size={18} strokeWidth={1.9} style={{ color: meta.accent }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-bold text-[#0f172a]">{meta.name}</div>
                        <p className="mt-1 text-[12px] leading-relaxed text-[#64748b]">
                          {blockMetaText({
                            id: 0,
                            type,
                            active: true,
                            config: { ...meta.defaults },
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#ee8748]">
                        Criar bloco desta categoria
                      </span>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#ee8748"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        )}

      {addBlockModalOpen &&
        renderPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ backdropFilter: "blur(6px)", background: "rgba(15,23,42,0.45)" }}
          onClick={closeAddBlockModal}
        >
          <div
            className="relative mx-4 flex max-h-[84vh] w-full max-w-[760px] flex-col overflow-hidden rounded-3xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[#f1f5f9] px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[16px] font-bold text-[#0f172a]">
                    Adicionar bloco inteligente
                  </div>
                  <div className="mt-1 max-w-[560px] text-[12px] leading-relaxed text-[#64748b]">
                    {selectedGuidedStage
                      ? `Agora escolha o objetivo dentro de ${selectedGuidedStage.stage}. A Axiora monta um primeiro bloco coerente com essa intenção.`
                      : "Escolha a fase escolar da criança. Depois a Axiora sugere objetivos coerentes com esse momento de aprendizagem."}
                  </div>
                </div>
                <button
                  onClick={closeAddBlockModal}
                  className={`flex h-8 w-8 items-center justify-center ${chunkySmallOutlineBtn}`}
                  aria-label="Fechar sugestões de bloco"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-4 rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#94a3b8]">
                  {selectedGuidedStage ? "Objetivo" : "Critério"}
                </div>
                <p className="mt-1 text-[12px] text-[#475569]">
                  {selectedGuidedStage ? (
                    <>
                      Dentro da fase, sugerimos mais de um caminho para que o botão fique realmente
                      inteligente: você escolhe a <strong>intenção pedagógica</strong> antes de
                      criar o bloco.
                    </>
                  ) : (
                    <>
                      Preferimos <strong>fase</strong> em vez de idade isolada porque ela
                      representa melhor o repertório matemático da criança. Depois de criar, você
                      ainda pode ajustar tudo no detalhe do bloco.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="overflow-y-auto px-5 py-5">
              {selectedGuidedStage ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setGuidedStageId(null)}
                    className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#dbe4f0] bg-[#f8fafc] px-3 py-1.5 text-[11px] font-semibold text-[#475569] transition hover:border-[#cbd5e1] hover:text-[#0f172a]"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    >
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                    Voltar para fases
                  </button>

                  <div className="mb-4 rounded-2xl border border-[#e2e8f0] bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_100%)] px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div
                          className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white"
                          style={{ background: selectedGuidedStage.color }}
                        >
                          {renderStageBadge(selectedGuidedStage.stage)}
                        </div>
                        <div className="mt-3 text-[16px] font-bold text-[#0f172a]">
                          {selectedGuidedStage.title}
                        </div>
                        <p className="mt-1 max-w-[520px] text-[12px] leading-relaxed text-[#64748b]">
                          {selectedGuidedStage.summary}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {guidedSuggestionsForStage.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleAddGuidedBlock(item.id)}
                        className="group rounded-2xl border border-[#e2e8f0] bg-white p-4 text-left transition-all hover:border-[rgba(238,135,72,0.35)] hover:shadow-[0_16px_30px_rgba(15,23,42,0.08)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="inline-flex rounded-full bg-[#fff7ed] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#c2410c]">
                            {item.objective}
                          </div>
                          <span className="text-[10px] font-semibold text-[#94a3b8]">
                            {BLOCK_META[item.type].name}
                          </span>
                        </div>
                        <div className="mt-3 text-[15px] font-bold text-[#0f172a]">
                          {item.focus}
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-[#64748b]">
                          {item.summary}
                        </p>
                        <div className="mt-3 rounded-2xl bg-[#f8fafc] px-3 py-2">
                          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#94a3b8]">
                            Por que sugerimos isso
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-[#475569]">
                            {item.rationale}
                          </p>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-[#ee8748]">
                            Criar bloco sugerido
                          </span>
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#ee8748"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                Array.from(new Set(GUIDED_STAGE_OPTIONS.map((item) => item.group))).map((group) => (
                  <div key={group} className="mb-5 last:mb-0">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#94a3b8]">
                      {group}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {GUIDED_STAGE_OPTIONS.filter((item) => item.group === group).map((item) => {
                        const objectiveCount = GUIDED_BLOCK_SUGGESTIONS.filter(
                          (suggestion) => suggestion.stageId === item.id,
                        ).length;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setGuidedStageId(item.id)}
                            className="group rounded-2xl border border-[#e2e8f0] bg-white p-4 text-left transition-all hover:border-[rgba(238,135,72,0.35)] hover:shadow-[0_16px_30px_rgba(15,23,42,0.08)]"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div
                                className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white"
                                style={{ background: item.color }}
                              >
                                {renderStageBadge(item.stage)}
                              </div>
                              <span className="text-[10px] font-semibold text-[#94a3b8]">
                                {objectiveCount} objetivos
                              </span>
                            </div>
                            <div className="mt-3 text-[15px] font-bold text-[#0f172a]">
                              {item.title}
                            </div>
                            <p className="mt-1 text-[12px] leading-relaxed text-[#64748b]">
                              {item.summary}
                            </p>
                            <div className="mt-3 rounded-2xl bg-[#f8fafc] px-3 py-2">
                              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#94a3b8]">
                                Por que faz sentido agora
                              </div>
                              <p className="mt-1 text-[11px] leading-relaxed text-[#475569]">
                                {item.rationale}
                              </p>
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-[#ee8748]">
                                Ver objetivos sugeridos
                              </span>
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#ee8748"
                                strokeWidth="2"
                                strokeLinecap="round"
                              >
                                <path d="M9 18l6-6-6-6" />
                              </svg>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-[#f1f5f9] px-5 py-4">
              <p className="text-[11px] text-[#94a3b8]">
                Esse fluxo cria um ponto de partida inteligente. Depois de escolher a fase e o
                objetivo, você ainda pode abrir o bloco e ajustar operação, quantidade, formato e
                dificuldade.
              </p>
            </div>
          </div>
        </div>
        )}
      {presetModalOpen &&
        renderPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ backdropFilter: "blur(6px)", background: "rgba(15,23,42,0.45)" }}
          onClick={closePresetModal}
        >
          <div
            className="relative mx-4 flex max-h-[80vh] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#f1f5f9] px-5 py-4">
              <div className="flex items-center gap-3">
                <div>
                <div className="text-[15px] font-bold text-[#0f172a]">Preset Pedagógico</div>
                <div className="text-[12px] text-[#94a3b8]">Selecione um modelo para começar</div>
                </div>
              </div>
              <button
                onClick={closePresetModal}
                className={`flex h-8 w-8 items-center justify-center ${chunkySmallOutlineBtn}`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Preset list */}
            <div className="overflow-y-auto">
              {(
                [
                  {
                    group: "Anos Iniciais",
                    color: "#3b82f6",
                    items: [
                      { key: "2ano", label: "2º Ano", desc: "Adição e Subtração com 2 dígitos" },
                      {
                        key: "2ano-avancado",
                        label: "2º Ano Avançado",
                        desc: "Operações com 3 dígitos + tabuada",
                      },
                      {
                        key: "3ano-tabuada",
                        label: "3º Ano — Tabuada",
                        desc: "Tabuada completa de × e ÷",
                      },
                      { key: "3ano", label: "3º Ano", desc: "Multiplicação e Divisão" },
                      {
                        key: "4ano-divisao",
                        label: "4º Ano — Divisão",
                        desc: "Divisão com resto (3÷2 dígitos)",
                      },
                      { key: "4ano", label: "4º/5º Ano", desc: "Frações básicas + Multiplicação" },
                      {
                        key: "5ano-fracoes",
                        label: "5º Ano — Frações",
                        desc: "Frações avançadas com denominador comum",
                      },
                      {
                        key: "5ano-completo",
                        label: "5º Ano Completo",
                        desc: "Revisão: ×, ÷, frações soma e sub",
                      },
                    ],
                  },
                  {
                    group: "Anos Finais",
                    color: "#ee8748",
                    items: [
                      {
                        key: "6ano-expressoes",
                        label: "6º Ano — Expressões",
                        desc: "Expressões numéricas simples e com parênteses",
                      },
                      {
                        key: "6ano",
                        label: "6º Ano",
                        desc: "Equações 1º grau + Expressões médias",
                      },
                      {
                        key: "6ano-fracoes-avancado",
                        label: "6º Ano — Frações + Eq.",
                        desc: "Frações mistas, simplificação e equações",
                      },
                      {
                        key: "7ano-equacoes",
                        label: "7º Ano — Equações",
                        desc: "Equações com coeficientes negativos",
                      },
                      {
                        key: "7ano-potencias",
                        label: "7º Ano — Potências",
                        desc: "Potenciação e raízes quadradas perfeitas",
                      },
                      {
                        key: "8ano-completo",
                        label: "8º Ano Completo",
                        desc: "Equações, potências e expressões avançadas",
                      },
                      {
                        key: "9ano-revisao",
                        label: "9º Ano — Revisão",
                        desc: "Preparação ENEM/Vestibular completa",
                      },
                    ],
                  },
                  {
                    group: "Por Tema",
                    color: "#14b8a6",
                    items: [
                      {
                        key: "so-adicao",
                        label: "Só Adição",
                        desc: "3 níveis progressivos de dificuldade",
                      },
                      {
                        key: "so-multiplicacao",
                        label: "Só Multiplicação",
                        desc: "3 níveis: 1×1, 2×1, 3×2 dígitos",
                      },
                      { key: "so-divisao", label: "Só Divisão", desc: "3 níveis com e sem resto" },
                      { key: "so-fracoes", label: "Só Frações", desc: "Soma, subtração e misto" },
                      {
                        key: "so-potencias",
                        label: "Só Potências e Raízes",
                        desc: "Potenciação, raiz e misto",
                      },
                      {
                        key: "revisao-geral",
                        label: "Revisão Geral",
                        desc: "5 blocos — uma operação de cada tipo",
                      },
                      {
                        key: "avaliacao-trimestral",
                        label: "Avaliação Trimestral",
                        desc: "Balanceado para prova completa",
                      },
                    ],
                  },
                ] as {
                  group: string;
                  color: string;
                  items: { key: string; label: string; desc: string }[];
                }[]
              ).map(({ group, color, items }) => (
                <div key={group}>
                  <div
                    className="sticky top-0 bg-[#f8fafc] px-5 py-2"
                    style={{ borderBottom: "1px solid #f1f5f9" }}
                  >
                    <span
                      className="text-[10px] font-bold uppercase tracking-[1.8px]"
                      style={{ color }}
                    >
                      {group}
                    </span>
                  </div>
                  {items.map(({ key, label, desc }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPresetSelectionDraft({ key, label })}
                      className={`flex w-full cursor-pointer items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-[#f8fafc] ${
                        presetSelectionDraft?.key === key ? "bg-[#fff7ed]" : ""
                      }`}
                      style={{ borderBottom: "1px solid #f8fafc" }}
                    >
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-black text-white"
                        style={{ background: color }}
                      >
                        {label.match(/\d/)?.[0] ?? label[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-[#0f172a]">{label}</div>
                        <div className="text-[11px] text-[#94a3b8]">{desc}</div>
                      </div>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#cbd5e1"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-[#f1f5f9] px-5 py-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closePresetModal}
                  className={`flex-1 ${chunkyOutlineBtn}`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmPresetSelection}
                  disabled={!presetSelectionDraft}
                  className={`flex-1 ${chunkyPrimaryBtn} ${
                    !presetSelectionDraft ? "cursor-not-allowed opacity-50" : ""
                  }`}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
        )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK DETAIL PANEL
// ─────────────────────────────────────────────────────────────────────────────

function BlockDetailPanel({
  block,
  onUpdate,
  onChangeType,
}: {
  block: Block;
  onUpdate: (key: keyof BlockConfig, val: unknown) => void;
  onChangeType: (type: BlockType) => void;
}) {
  const PremiumSelect = ({
    value,
    options,
    onChange,
  }: {
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
  }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const onPointerDown = (event: PointerEvent) => {
        if (!rootRef.current) return;
        if (!rootRef.current.contains(event.target as Node)) {
          setOpen(false);
        }
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      };
      window.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("keydown", onKeyDown);
      return () => {
        window.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("keydown", onKeyDown);
      };
    }, []);

    const selected = options.find((opt) => opt.value === value);

    return (
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-[#d1d5db] bg-white px-3 py-2 text-left text-[13px] font-semibold text-[#0f172a] shadow-[0_2px_0_rgba(207,217,243,0.95)] outline-none transition hover:border-[#cbd5e1] focus:border-[#ee8748]"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span>{selected?.label ?? "Selecionar"}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className={`text-[#64748b] transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {open && (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-[#e2e8f0] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
            <div role="listbox" className="max-h-52 overflow-y-auto py-1">
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition ${
                      isSelected
                        ? "bg-[#fff7ed] font-semibold text-[#c2410c]"
                        : "text-[#334155] hover:bg-[#f8fafc]"
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span>{opt.label}</span>
                    {isSelected && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#c2410c"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                      >
                        <path d="M5 12l4 4 10-10" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const meta = BLOCK_META[block.type];
  const c = block.config;
  const up = (key: keyof BlockConfig, val: unknown) => onUpdate(key, val);
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openTooltip) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setOpenTooltip(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openTooltip]);

  const fieldTooltips: Record<string, string> = {
    categoria: "Define o tipo de exercício do bloco. Cada categoria abre configurações específicas.",
    operacao: "Escolhe qual cálculo será praticado, como adição, subtração, multiplicação ou divisão.",
    digitos: "Determina quantos algarismos aparecem nos números usados em cada conta.",
    formato: "Armada organiza a conta na vertical. Linear mostra o cálculo em uma única linha.",
    denominador: "Controla o maior denominador permitido nas frações geradas.",
    tipoEquacao: "Define a estrutura da equação para variar o nível de desafio.",
    tipoPotencia: "Escolhe se o bloco mistura potências e raízes ou trabalha só um tipo.",
    complexidade: "Ajusta o nível de dificuldade e a combinação de operações na expressão.",
    termos: "Indica quantos números ou partes aparecem em cada expressão.",
    operacoesLista: "Seleciona quais operações podem aparecer dentro das expressões.",
    agrupamento: "Controla se as expressões usam parênteses, colchetes ou chaves para organizar o cálculo.",
  };

  const TooltipInfo = ({
    tooltipKey,
    instanceKey,
    align = "left",
  }: {
    tooltipKey: keyof typeof fieldTooltips;
    instanceKey?: string;
    align?: "left" | "right";
  }) => {
    const tooltipId = instanceKey ?? tooltipKey;
    const isOpen = openTooltip === tooltipId;

    return (
      <div ref={isOpen ? tooltipRef : null} className="relative inline-flex">
        <button
          type="button"
          aria-label={`Ajuda sobre ${tooltipKey}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpenTooltip((prev) => (prev === tooltipId ? null : tooltipId));
          }}
          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#cbd5e1] bg-white text-[8px] font-bold leading-none text-[#64748b] transition hover:border-[#fb923c] hover:text-[#c2410c]"
        >
          i
        </button>
        {isOpen && (
          <div
            className={`absolute top-6 z-30 w-56 rounded-xl border border-[#e2e8f0] bg-white p-3 text-[11px] leading-relaxed text-[#475569] shadow-[0_12px_30px_rgba(15,23,42,0.14)] ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {fieldTooltips[tooltipKey]}
          </div>
        )}
      </div>
    );
  };

  const FieldLabel = ({
    label,
    tooltipKey,
    tooltipInstanceKey,
    tooltipAlign,
    className = "mb-1 block text-xs text-[#475569]",
  }: {
    label: string;
    tooltipKey?: keyof typeof fieldTooltips;
    tooltipInstanceKey?: string;
    tooltipAlign?: "left" | "right";
    className?: string;
  }) => (
    <label className={className}>
      <span className="inline-flex items-center gap-1.5">
        <span>{label}</span>
        {tooltipKey ? (
          <TooltipInfo
            tooltipKey={tooltipKey}
            instanceKey={tooltipInstanceKey}
            align={tooltipAlign}
          />
        ) : null}
      </span>
    </label>
  );

  const SegBtn = ({
    val,
    cur,
    onSel,
    label,
  }: {
    val: string;
    cur: string | undefined;
    onSel: (v: string) => void;
    label: string;
  }) => (
    <button
      onClick={() => onSel(val)}
      className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-semibold transition ${cur === val ? "bg-[#ee8748] text-white" : "border border-[#d1d5db] text-[#64748b] hover:text-[#0f172a]"}`}
    >
      {label}
    </button>
  );

  const Toggle = ({
    val,
    onSel,
    label,
  }: {
    val: boolean;
    onSel: (v: boolean) => void;
    label: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={val}
      onClick={() => onSel(!val)}
      className="flex cursor-pointer items-center gap-2 text-left"
    >
      <div
        className="relative h-5 w-9 shrink-0 rounded-full transition-all duration-200"
        style={{ background: val ? "#ee8748" : "#cbd5e1" }}
      >
        <div
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200"
          style={{ left: val ? "20px" : "2px" }}
        />
      </div>
      <span className="text-[13px] text-[#334155]">{label}</span>
    </button>
  );

  const RangeRow = ({
    label,
    tooltipKey,
    tooltipInstanceKey,
    tooltipAlign,
    value,
    min,
    max,
    onSel,
  }: {
    label: string;
    tooltipKey?: keyof typeof fieldTooltips;
    tooltipInstanceKey?: string;
    tooltipAlign?: "left" | "right";
    value: number;
    min: number;
    max: number;
    onSel: (v: number) => void;
  }) => (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs text-[#475569]">
          <span>{label}</span>
          {tooltipKey ? (
            <TooltipInfo
              tooltipKey={tooltipKey}
              instanceKey={tooltipInstanceKey}
              align={tooltipAlign}
            />
          ) : null}
        </span>
        <span className="rounded bg-[rgba(238,135,72,0.12)] px-1.5 py-0.5 text-[11px] font-semibold text-[#ee8748]">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onSel(Number(e.target.value))}
        className="w-full accent-[#ee8748]"
      />
    </div>
  );

  return (
    <>
      <div className="flex-1 overflow-y-auto overflow-x-visible px-4 py-4 pb-20 ">
        {/* Type selector */}
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[1.3px] text-[#94a3b8]">
          Tipo de Exercício
        </div>
        <div className="mb-4">
          <FieldLabel label="Categoria" tooltipKey="categoria" />
            <PremiumSelect
              value={block.type}
              options={Object.entries(BLOCK_META).map(([k, v]) => ({ value: k, label: v.name }))}
              onChange={(value) => onChangeType(value as BlockType)}
            />
        </div>

        {/* Quantity */}
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[1.3px] text-[#94a3b8]">
          Quantidade
        </div>
        <RangeRow
          label="Exercícios"
          value={c.quantidade}
          min={1}
          max={40}
          onSel={(v) => up("quantidade", v)}
        />

        {/* Type-specific params */}
        <div className="my-3 h-px bg-[#e2e8f0]" />
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[1.3px] text-[#94a3b8]">
          <span className="inline-flex items-center gap-1.5">
            <span>Parâmetros</span>
            {block.type === "fracoes" ? <TooltipInfo tooltipKey="operacao" /> : null}
          </span>
        </div>

        {block.type === "aritmetica" && (
          <>
            <div className="mb-3">
              <FieldLabel label="Operação" tooltipKey="operacao" />
              <PremiumSelect
                value={c.operacao ?? "multiplicacao"}
                options={[
                  { value: "adicao", label: "Adição" },
                  { value: "subtracao", label: "Subtração" },
                  { value: "multiplicacao", label: "Multiplicação" },
                  { value: "divisao", label: "Divisão" },
                  { value: "misto", label: "Misto" },
                ]}
                onChange={(value) => up("operacao", value)}
              />
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <RangeRow
                label="Dígitos 1"
                tooltipKey="digitos"
                value={c.digitos1 ?? 3}
                tooltipInstanceKey="digitos1"
                min={1}
                max={6}
                onSel={(v) => up("digitos1", v)}
              />
              <RangeRow
                label="Dígitos 2"
                tooltipKey="digitos"
                value={c.digitos2 ?? 3}
                tooltipInstanceKey="digitos2"
                tooltipAlign="right"
                min={1}
                max={6}
                onSel={(v) => up("digitos2", v)}
              />
            </div>
            <div className="mb-3">
              <FieldLabel label="Formato" tooltipKey="formato" />
              <div className="flex gap-1">
                <SegBtn
                  val="armada"
                  cur={c.formato}
                  onSel={(v) => up("formato", v)}
                  label="Armada"
                />
                <SegBtn
                  val="linear"
                  cur={c.formato}
                  onSel={(v) => up("formato", v)}
                  label="Linear"
                />
              </div>
            </div>
            {(c.operacao === "divisao" || c.operacao === "misto") && (
              <div className="mb-3">
                <Toggle
                  val={!!c.permitirResto}
                  onSel={(v) => up("permitirResto", v)}
                  label="Permitir resto"
                />
              </div>
            )}
          </>
        )}

        {block.type === "fracoes" && (
          <>
            <div className="mb-3">
              <div className="flex gap-1">
                <SegBtn val="soma" cur={c.operacao} onSel={(v) => up("operacao", v)} label="Soma" />
                <SegBtn
                  val="subtracao"
                  cur={c.operacao}
                  onSel={(v) => up("operacao", v)}
                  label="Subtração"
                />
                <SegBtn
                  val="misto"
                  cur={c.operacao}
                  onSel={(v) => up("operacao", v)}
                  label="Misto"
                />
              </div>
            </div>
            <RangeRow
              label="Denominador máx."
              tooltipKey="denominador"
              value={c.denomMax ?? 10}
              min={2}
              max={20}
              onSel={(v) => up("denomMax", v)}
            />
            <div className="space-y-2">
              <Toggle
                val={c.semprePropria !== false}
                onSel={(v) => up("semprePropria", v)}
                label="Apenas frações próprias"
              />
              <Toggle
                val={!!c.denominadorComum}
                onSel={(v) => up("denominadorComum", v)}
                label="Mesmo denominador"
              />
              <Toggle
                val={c.resultadoPositivo !== false}
                onSel={(v) => up("resultadoPositivo", v)}
                label="Resultado sempre positivo"
              />
            </div>
          </>
        )}

        {block.type === "equacoes" && (
          <>
            <div className="mb-3">
              <FieldLabel label="Tipo de Equação" tooltipKey="tipoEquacao" />
              <div className="grid grid-cols-2 gap-1">
                {["misto", "ax+b=c", "ax-b=c", "x/a+b=c"].map((t) => (
                  <button
                    key={t}
                    onClick={() => up("tipo", t)}
                    className={`rounded-[var(--radius-sm)] py-1 font-mono text-xs font-semibold transition ${c.tipo === t ? "bg-[#ee8748] text-white" : "border border-[#d1d5db] text-[#64748b] hover:text-[#0f172a]"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <RangeRow
              label="Coeficiente máx."
              value={c.coefMax ?? 9}
              min={2}
              max={20}
              onSel={(v) => up("coefMax", v)}
            />
            <RangeRow
              label="Resposta máx."
              value={c.respMax ?? 20}
              min={5}
              max={100}
              onSel={(v) => up("respMax", v)}
            />
          </>
        )}

        {block.type === "potenciacao" && (
          <>
            <div className="mb-3">
              <FieldLabel label="Tipo" tooltipKey="tipoPotencia" />
              <div className="flex gap-1">
                <SegBtn val="misto" cur={c.tipo} onSel={(v) => up("tipo", v)} label="Misto" />
                <SegBtn val="potencia" cur={c.tipo} onSel={(v) => up("tipo", v)} label="Potência" />
                <SegBtn val="raiz" cur={c.tipo} onSel={(v) => up("tipo", v)} label="Raiz" />
              </div>
            </div>
            <RangeRow
              label="Base máx."
              value={c.baseMax ?? 12}
              min={2}
              max={20}
              onSel={(v) => up("baseMax", v)}
            />
            <RangeRow
              label="Expoente máx."
              value={c.expMax ?? 3}
              min={2}
              max={6}
              onSel={(v) => up("expMax", v)}
            />
          </>
        )}

        {block.type === "expressoes" && (
          <>
            <div className="mb-3">
              <FieldLabel label="Complexidade" tooltipKey="complexidade" />
              <div className="flex gap-1">
                <SegBtn
                  val="simples"
                  cur={c.complexidade}
                  onSel={(v) => up("complexidade", v)}
                  label="Simples"
                />
                <SegBtn
                  val="media"
                  cur={c.complexidade}
                  onSel={(v) => up("complexidade", v)}
                  label="Média"
                />
                <SegBtn
                  val="avancada"
                  cur={c.complexidade}
                  onSel={(v) => up("complexidade", v)}
                  label="Avançada"
                />
              </div>
            </div>
            <RangeRow
              label="Nº de termos"
              tooltipKey="termos"
              value={c.termos ?? 4}
              min={2}
              max={8}
              onSel={(v) => up("termos", v)}
            />
            <div className="mb-3">
              <FieldLabel label="Operações" tooltipKey="operacoesLista" />
              <div className="space-y-1.5">
                {[
                  ["adicao", "Adição"],
                  ["subtracao", "Subtração"],
                  ["multiplicacao", "Multiplicação"],
                  ["divisao", "Divisão"],
                ].map(([op, label]) => {
                  const ops = c.operacoes ?? [];
                  return (
                    <label key={op} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="accent-[#ee8748]"
                        checked={ops.includes(op)}
                        onChange={(e) => {
                          const newOps = e.target.checked
                            ? [...ops, op]
                            : ops.filter((o) => o !== op);
                          up("operacoes", newOps);
                        }}
                      />
                      <span className="text-[13px] text-[#334155]">{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="mb-3">
              <FieldLabel label="Agrupamento" tooltipKey="agrupamento" />
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => {
                    up("usarParenteses", false);
                    up("nivelAgrupamento", 0);
                  }}
                  className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-semibold transition ${!c.usarParenteses ? "bg-[#ee8748] text-white" : "border border-white/15 text-white/60 hover:text-white"}`}
                >
                  Nenhum
                </button>
                <button
                  onClick={() => {
                    up("usarParenteses", true);
                    up("nivelAgrupamento", 1);
                  }}
                  className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-semibold transition ${c.usarParenteses && (c.nivelAgrupamento ?? 1) === 1 ? "bg-[#ee8748] text-white" : "border border-white/15 text-white/60 hover:text-white"}`}
                >
                  ( )
                </button>
                <button
                  onClick={() => {
                    up("usarParenteses", true);
                    up("nivelAgrupamento", 2);
                  }}
                  className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-semibold transition ${c.usarParenteses && c.nivelAgrupamento === 2 ? "bg-[#ee8748] text-white" : "border border-white/15 text-white/60 hover:text-white"}`}
                >
                  [ ]
                </button>
                <button
                  onClick={() => {
                    up("usarParenteses", true);
                    up("nivelAgrupamento", 3);
                  }}
                  className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-semibold transition ${c.usarParenteses && c.nivelAgrupamento === 3 ? "bg-[#ee8748] text-white" : "border border-white/15 text-white/60 hover:text-white"}`}
                >
                  {"{ }"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
