"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Calculator,
  Divide,
  Scale,
  Zap,
  Sigma,
  type LucideIcon,
} from "lucide-react";

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

interface ExerciseItem {
  blockId: number;
  type: BlockType;
  html: string;
  answer: string | number;
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const BLOCK_META: Record<BlockType, { name: string; Icon: LucideIcon; color: string; accent: string; defaults: BlockConfig }> = {
  aritmetica: {
    name: "Aritmética",
    Icon: Calculator,
    color: "rgba(59,130,246,0.15)",
    accent: "#3b82f6",
    defaults: { operacao: "multiplicacao", digitos1: 3, digitos2: 3, formato: "armada", quantidade: 10 },
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

const DEFAULT_BLOCKS: Omit<Block, "id">[] = [
  { type: "aritmetica", active: true, config: { ...BLOCK_META.aritmetica.defaults, operacao: "multiplicacao", quantidade: 6 } },
  { type: "aritmetica", active: true, config: { ...BLOCK_META.aritmetica.defaults, operacao: "divisao", formato: "armada", quantidade: 4 } },
  { type: "fracoes", active: true, config: { ...BLOCK_META.fracoes.defaults, quantidade: 4 } },
  { type: "equacoes", active: true, config: { ...BLOCK_META.equacoes.defaults, quantidade: 4 } },
  { type: "potenciacao", active: true, config: { ...BLOCK_META.potenciacao.defaults, quantidade: 4 } },
  { type: "expressoes", active: false, config: { ...BLOCK_META.expressoes.defaults, quantidade: 4 } },
];

// ─────────────────────────────────────────────────────────────────────────────
// EXERCISE GENERATORS (ported from FolhaMath v8)
// ─────────────────────────────────────────────────────────────────────────────

function rnd(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function nDigits(n: number): number {
  if (n <= 0) return rnd(1, 9);
  const lo = Math.pow(10, n - 1);
  const hi = Math.pow(10, n) - 1;
  return rnd(lo, hi);
}

function fracHTML(num: number, den: number): string {
  return `<span class="ex-frac"><span class="ex-frac-num">${num}</span><span class="ex-frac-den">${den}</span></span>`;
}

function genAritmetica(c: BlockConfig): { html: string; answer: string | number } {
  const op = c.operacao || "multiplicacao";
  const opSymbols: Record<string, string> = { adicao: "+", subtracao: "−", multiplicacao: "×", divisao: "÷" };
  const sym = opSymbols[op] || "×";

  if (c.formato === "linear") {
    let a = nDigits(c.digitos1 ?? 3), b = nDigits(c.digitos2 ?? 3);
    if (op === "subtracao" && !c.negativos && a < b) { const t = a; a = b; b = t; }
    let ans: string | number;
    if (op === "adicao") ans = a + b;
    else if (op === "subtracao") ans = a - b;
    else if (op === "multiplicacao") ans = a * b;
    else {
      if (!c.permitirResto) {
        b = nDigits(c.digitos2 ?? 2);
        const q = rnd(1, Math.max(1, Math.floor(9999 / b)));
        a = b * q;
        ans = q;
      } else {
        const q = Math.floor(a / b);
        const r = a % b;
        ans = r > 0 ? `${q} r${r}` : q;
      }
    }
    return { html: `<span class="ex-linear">${a} ${sym} ${b} =</span>`, answer: ans };
  }

  if (op === "divisao") {
    const divisor = nDigits(c.digitos2 ?? 2);
    let dividendo: number, quotient: number, resto: number;
    if (c.permitirResto) {
      let attempts = 0;
      do {
        dividendo = nDigits(c.digitos1 ?? 3);
        quotient = Math.floor(dividendo / divisor);
        resto = dividendo % divisor;
        if (quotient < 1) { dividendo = divisor * 2 + rnd(0, divisor - 1); quotient = Math.floor(dividendo / divisor); resto = dividendo % divisor; }
        attempts++;
      } while (dividendo === divisor && attempts < 20);
    } else {
      const loD = Math.pow(10, (c.digitos1 ?? 3) - 1);
      const hiD = Math.pow(10, c.digitos1 ?? 3) - 1;
      const loQ = Math.max(2, Math.ceil(loD / divisor));
      const hiQ = Math.floor(hiD / divisor);
      quotient = loQ <= hiQ ? rnd(loQ, hiQ) : Math.max(2, rnd(2, Math.max(2, Math.floor(hiD / divisor))));
      dividendo = divisor * quotient;
      resto = 0;
    }
    const answer = resto > 0 ? `${quotient} r${resto}` : `${quotient}`;
    const html = `<div class="ex-divisao-armada">
      <span class="ex-divisao-dividendo">${dividendo}</span>
      <div class="ex-divisao-right">
        <span class="ex-divisao-divisor">${divisor}</span>
        <span class="ex-divisao-quociente"></span>
      </div>
    </div>`;
    return { html, answer };
  }

  let a = nDigits(c.digitos1 ?? 3), b = nDigits(c.digitos2 ?? 3);
  if (op === "subtracao" && a < b) { const t = a; a = b; b = t; }
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
  if (forceDenomComum) { d1 = d2 = rnd(2, denomMax); }
  else { d1 = rnd(2, denomMax); d2 = rnd(2, denomMax); }

  const maxN1 = semprePropria ? d1 - 1 : d1 + Math.floor(d1 / 2);
  const maxN2 = semprePropria ? d2 - 1 : d2 + Math.floor(d2 / 2);
  let n1 = rnd(1, Math.max(1, maxN1)), n2 = rnd(1, Math.max(1, maxN2));

  let op = c.operacao || "soma";
  if (op === "misto") op = Math.random() < 0.5 ? "soma" : "subtracao";

  if (op === "subtracao" && resultadoPositivo) {
    if (n1 * d2 < n2 * d1) { [n1, n2] = [n2, n1]; [d1, d2] = [d2, d1]; }
    if (n1 * d2 === n2 * d1) { d2 = d1 + 1; n2 = 1; }
  }

  const sym = op === "subtracao" ? "−" : "+";
  const mmc = (a: number, b: number): number => { let x = a, y = b; while (y) { const t = y; y = x % y; x = t; } return a * b / x; };
  const mdc = (a: number, b: number): number => b ? mdc(b, a % b) : a;
  const lcd = mmc(d1, d2);
  const resN = op === "subtracao" ? n1 * (lcd / d1) - n2 * (lcd / d2) : n1 * (lcd / d1) + n2 * (lcd / d2);
  const g = mdc(Math.abs(resN), lcd);
  const rNum = resN / g, rDen = lcd / g;

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
  const coefMax = c.coefMax ?? 9, respMax = c.respMax ?? 20;
  let tipo = c.tipo ?? "misto";
  if (tipo === "misto") {
    const opts = ["ax+b=c", "ax-b=c", "x/a+b=c"];
    tipo = opts[rnd(0, opts.length - 1)];
  }
  const a = rnd(2, coefMax);
  const b = rnd(1, Math.min(10, respMax - 1));
  let lhs = "", sol = 0, rhs = 0;

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
    rhs = (sol / a) + b;
    lhs = `<span class="ex-eq-frac-wrap"><span class="ex-eq-frac-top">x</span><span class="ex-eq-frac-bot">${a}</span></span> <span class="ex-eq-op">+</span> <span class="ex-eq-num">${b}</span>`;
  }

  return {
    answer: `x = ${sol}`,
    html: `<span class="ex-equacao">${lhs}<span class="ex-eq-equals"> = </span><span class="ex-eq-num">${rhs}</span></span>`,
  };
}

function genPotenciacao(c: BlockConfig): { html: string; answer: string | number } {
  let tipo = c.tipo ?? "misto";
  if (tipo === "misto") tipo = Math.random() < 0.5 ? "potencia" : "raiz";

  if (tipo === "raiz") {
    const expMax = Math.min(c.expMax ?? 3, 3);
    const n = rnd(2, expMax);
    const base = rnd(2, Math.min(c.baseMax ?? 12, 12));
    const val = Math.pow(base, n);
    const svgSym = `<svg class="ex-raiz-svg" xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 14 24" overflow="visible" style="overflow:visible;display:block" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="0,8 3,18 11,0"/></svg>`;
    const idxHtml = n > 2
      ? `<span class="ex-raiz-idx-wrap"><span class="ex-raiz-idx">${n}</span><svg class="ex-raiz-svg" xmlns="http://www.w3.org/2000/svg" style="margin-left:7px;overflow:visible;display:block" viewBox="-1 -1 14 24" overflow="visible" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="0,8 3,18 11,0"/></svg></span>`
      : svgSym;
    return {
      answer: base,
      html: `<span style="display:inline-flex;align-items:center;gap:4px"><span class="ex-raiz">${idxHtml}<span class="ex-raiz-val">${val}</span></span><span class="ex-pot-result"> =</span></span>`,
    };
  }

  const base = rnd(2, c.baseMax ?? 12), exp = rnd(2, c.expMax ?? 3);
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
  const l = evalNode(node.left), r = evalNode(node.right);
  if (node.op === "adicao") return l + r;
  if (node.op === "subtracao") return l - r;
  if (node.op === "multiplicacao") return l * r;
  if (node.op === "divisao") return r !== 0 ? l / r : NaN;
  return l;
}

function validateTree(node: ASTNode, opts?: { onlyIntegers?: boolean }): { ok: boolean; value: number } {
  if (node.type === "num") return { ok: true, value: node.val };
  if (node.type === "pot") { const v = Math.pow(node.base, node.exp); return { ok: Number.isFinite(v), value: v }; }
  if (node.type === "raiz") { const v = Math.sqrt(node.val); return { ok: Number.isFinite(v) && v >= 0, value: v }; }
  if (node.type === "frac") return node.den !== 0 ? { ok: true, value: node.num / node.den } : { ok: false, value: NaN };
  if (node.type === "mod") { const inner = validateTree(node.inner, opts); return inner.ok ? { ok: true, value: Math.abs(inner.value) } : inner; }
  const left = validateTree(node.left, opts);
  if (!left.ok) return left;
  const right = validateTree(node.right, opts);
  if (!right.ok) return right;
  const l = left.value, r = right.value;
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
  if (node.type === "pot") return `<span class="ex-expr-term" style="display:inline;white-space:nowrap"><span>${node.base}</span><span style="font-size:0.6em;vertical-align:super;line-height:1;margin-left:1px">${node.exp}</span></span>`;
  if (node.type === "raiz") {
    const svgSym = `<svg class="ex-raiz-svg" xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 14 24" overflow="visible" style="overflow:visible;display:block" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="0,8 3,18 11,0"/></svg>`;
    return `<span class="ex-raiz">${svgSym}<span class="ex-raiz-val">${node.val}</span></span>`;
  }
  if (node.type === "frac") return `<span class="ex-expr-term" style="display:inline-flex;flex-direction:column;align-items:center;line-height:1.1;vertical-align:middle;margin:0 2px"><span style="border-bottom:1.5px solid #111;padding:0 2px 1px;font-size:0.85em">${node.num}</span><span style="padding:1px 2px 0;font-size:0.85em">${node.den}</span></span>`;
  if (node.type === "mod") return `<span class="ex-expr-op">|</span>${renderNode(node.inner, opsSyms)}<span class="ex-expr-op">|</span>`;
  const sym = opsSyms[node.op] || "+";
  const left = renderNode(node.left, opsSyms);
  const right = renderNode(node.right, opsSyms);
  const inner = `${left} <span class="ex-expr-op">${sym}</span> ${right}`;
  if (node.paren) {
    const GROUPS: [string, string][] = [["(", ")"], ["[", "]"], ["{", "}"]];
    const level = Math.min(node.groupLevel ?? 0, GROUPS.length - 1);
    const [open, close] = GROUPS[level];
    return `<span class="ex-expr-op">${open}</span>${inner}<span class="ex-expr-op">${close}</span>`;
  }
  return inner;
}

function genExpressoes(c: BlockConfig): { html: string; answer: string | number } {
  const opsKeys = c.operacoes && c.operacoes.length > 0 ? c.operacoes : ["adicao", "subtracao"];
  const opsSyms: Record<string, string> = { adicao: "+", subtracao: "−", multiplicacao: "×", divisao: "÷", potenciacao: "^", radiciacao: "√", fracao: "/", modulo: "|" };
  const termos = Math.max(2, c.termos ?? 3);
  const maxVal = c.complexidade === "simples" ? 9 : c.complexidade === "avancada" ? 99 : 20;
  const somenteInteiros = true;
  const ATOM_OPS = ["potenciacao", "radiciacao", "fracao", "modulo"];
  const atomOpsSet = new Set(opsKeys.filter((k) => ATOM_OPS.includes(k)));
  const binOps = opsKeys.filter((k) => !ATOM_OPS.includes(k));
  const binOpsEfetivos = binOps.length > 0 ? binOps : ["adicao"];
  const QUADRADOS = [4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144];
  const FRACOES_SIMPLES: [number, number][] = [[1, 2], [1, 3], [1, 4], [1, 5], [2, 3], [3, 4], [2, 5], [3, 5], [4, 5]];
  const HIGH_PREC = new Set(["multiplicacao", "divisao"]);
  const maxNivel = c.nivelAgrupamento ?? (c.usarParenteses ? 1 : 0);

  function buildPrecedenceTree(atoms: ASTNode[], ops: string[]): ASTNode {
    const termNodes: ASTNode[] = [atoms[0]];
    const lowOps: string[] = [];
    for (let i = 0; i < ops.length; i++) {
      if (HIGH_PREC.has(ops[i])) {
        const left = termNodes[termNodes.length - 1];
        termNodes[termNodes.length - 1] = { type: "op", op: ops[i], left, right: atoms[i + 1], paren: false };
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
      let inner: ASTNode = { type: "op", op: groupOps[groupOps.length - 1], left: groupAtoms[groupAtoms.length - 2], right: groupAtoms[groupAtoms.length - 1], paren: true, groupLevel: 0 };
      for (let gi = groupOps.length - 2; gi >= 0; gi--) {
        const level = Math.min(groupOps.length - 1 - gi, nivel - 1);
        inner = { type: "op", op: groupOps[gi], left: groupAtoms[gi], right: inner, paren: true, groupLevel: level };
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
      if (allowAtom && atomOpsSet.size > 0 && Math.random() < 0.45) {
        const atomTipos = [...atomOpsSet];
        const tipo = atomTipos[rnd(0, atomTipos.length - 1)];
        if (tipo === "potenciacao") { const base = rnd(2, maxVal <= 9 ? 4 : 9); const exp = rnd(2, maxVal <= 9 ? 2 : 3); return { type: "pot", base, exp }; }
        if (tipo === "radiciacao") { const q = QUADRADOS[rnd(0, Math.min(QUADRADOS.length - 1, maxVal <= 9 ? 2 : 7))]; return { type: "raiz", val: q }; }
        if (tipo === "fracao") { const [num, den] = FRACOES_SIMPLES[rnd(0, FRACOES_SIMPLES.length - 1)]; return { type: "frac", num, den }; }
        if (tipo === "modulo") { const a = rnd(1, maxVal); const b = rnd(1, maxVal); const innerNode: ASTNode = { type: "op", op: "subtracao", left: { type: "num", val: Math.min(a, b) }, right: { type: "num", val: Math.max(a, b) }, paren: false }; return { type: "mod", inner: innerNode }; }
      }
      return { type: "num", val: rnd(1, maxVal) };
    }

    const atomNodes: ASTNode[] = Array.from({ length: termos }, (_, i) => gerarAtomo(i > 0));
    atomNodes[0] = { type: "num", val: rnd(1, maxVal) };
    const opList: string[] = Array.from({ length: termos - 1 }, () => binOpsEfetivos[rnd(0, binOpsEfetivos.length - 1)]);

    if (somenteInteiros) {
      for (let i = 0; i < opList.length; i++) {
        if (opList[i] === "divisao") {
          if (atomNodes[i].type !== "num" || atomNodes[i + 1].type !== "num") { opList[i] = "multiplicacao"; continue; }
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
    return { answer: result, html: `<span class="ex-expressao">${parts}&nbsp;<span class="ex-expr-eq">=</span></span>` };
  }

  const a = rnd(1, maxVal), b = rnd(1, maxVal);
  return { answer: a + b, html: `<span class="ex-expressao"><span class="ex-expr-term">${a}</span> <span class="ex-expr-op">+</span> <span class="ex-expr-term">${b}</span>&nbsp;<span class="ex-expr-eq">=</span></span>` };
}

const GENERATORS: Record<BlockType, (c: BlockConfig) => { html: string; answer: string | number }> = {
  aritmetica: genAritmetica,
  fracoes: genFracoes,
  equacoes: genEquacoes,
  potenciacao: genPotenciacao,
  expressoes: genExpressoes,
};

function generateAllExercises(blocks: Block[], shuffle: boolean): ExerciseItem[] {
  const seen = new Set<string>();
  const all: ExerciseItem[] = [];
  for (const block of blocks) {
    if (!block.active) continue;
    const fn = GENERATORS[block.type];
    if (!fn) continue;
    let generated = 0, attempts = 0;
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
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
  }
  return all;
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
  seed: number
): string {
  const fzMap: Record<FontSize, string> = { P: "12px", M: "14px", G: "18px" };
  const fz = fzMap[cfg.fontSize];
  const fzSm = cfg.fontSize === "P" ? "10px" : cfg.fontSize === "G" ? "14px" : "11px";
  const fzTitle = cfg.fontSize === "P" ? "16px" : cfg.fontSize === "G" ? "24px" : "18px";

  const cols = cfg.cols;
  const numerar = cfg.numerar;
  const showNome = cfg.showNome;

  const S = {
    title: `font-family:Georgia,'Times New Roman',serif;font-size:${fzTitle};font-weight:700;text-align:center;letter-spacing:0.2px;`,
    rule2: `height:2px;background:#111;margin:4px 0 2px;`,
    rule1: `height:1px;background:#111;margin:2px 0;`,
    ruleGray: `height:1px;background:#888;margin:3px 0;`,
    infoRow: `font-family:'Courier New',monospace;font-size:${fz};color:#111;padding:3px 0;`,
    secHead: `font-family:'Courier New',monospace;font-size:${fz};font-weight:700;color:#111;margin:10px 0 6px;`,
    exNum: `font-family:'Courier New',monospace;font-size:${fz};color:#111;white-space:nowrap;flex-shrink:0;min-width:28px;line-height:1.6;`,
    exBody: `font-family:'Courier New',monospace;font-size:${fz};color:#111;line-height:1.6;flex:1;min-width:0;`,
    page: `font-family:'Courier New',Courier,monospace;font-size:${fz};color:#111;line-height:1.6;`,
    footer: `font-size:${fzSm};color:#888;`,
  };

  const nomeLine = showNome ? `
    <div style="${S.infoRow} display:flex;align-items:baseline;">
      <span style="white-space:nowrap;flex-shrink:0;">Nome:&nbsp;</span>
      <span style="flex:1;border-bottom:1px solid #555;display:inline-block;vertical-align:bottom;min-width:120px;">&nbsp;</span>
      <span style="white-space:nowrap;flex-shrink:0;margin-left:32px;">
        Data:&nbsp;<span style="display:inline-block;min-width:28px;border-bottom:1px solid #555;vertical-align:bottom">&nbsp;</span>/<span style="display:inline-block;min-width:28px;border-bottom:1px solid #555;vertical-align:bottom">&nbsp;</span>/<span style="display:inline-block;min-width:42px;border-bottom:1px solid #555;vertical-align:bottom">&nbsp;</span>
      </span>
    </div>
    <div style="${S.infoRow} display:flex;align-items:baseline;margin-top:2px;">
      <span style="white-space:nowrap;flex-shrink:0;">Turma:${cfg.turma ? "&nbsp;" + cfg.turma : ""}</span>
      <span style="flex:1;">&nbsp;</span>
      <span style="white-space:nowrap;flex-shrink:0;">
        Nota:&nbsp;<span style="display:inline-block;min-width:60px;border-bottom:1px solid #555;vertical-align:bottom">&nbsp;</span>
        ${cfg.tempo ? `&nbsp;&nbsp;Tempo:&nbsp;<span style="display:inline-block;min-width:60px;border-bottom:1px solid #555;vertical-align:bottom"><strong>${cfg.tempo}</strong></span>` : ""}
      </span>
    </div>` : "";

  const header = `
    <div style="${S.title}">${cfg.title || "Folha de Exercícios"}</div>
    <div style="${S.rule2}"></div>
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
  activeBlocks.forEach((b) => { blockNameMap[b.id] = BLOCK_META[b.type].name; });
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
  const gridStyle = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:${cfg.spacing}px 24px;align-items:start;`;
  let exRows = "";
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    const isArmada = ex.type === "aritmetica";
    const numSpan = numerar
      ? `<span style="${S.exNum}">${i + 1})</span>`
      : "";
    if (sectionHeaders[i]) {
      exRows += `<div style="grid-column:1/-1;${S.secHead} margin-top:8px;padding-bottom:2px;border-bottom:1px solid #e0e0e0;">${sectionHeaders[i]}</div>`;
    }
    if (isArmada) {
      exRows += `<div style="display:flex;align-items:flex-start;gap:6px;break-inside:avoid;page-break-inside:avoid;">${numSpan}<div style="${S.exBody}">${ex.html}</div></div>`;
    } else {
      exRows += `<div style="display:flex;align-items:baseline;gap:6px;break-inside:avoid;page-break-inside:avoid;">${numSpan}<div style="${S.exBody}">${ex.html}</div></div>`;
    }
  }

  const exSection = `<div style="${gridStyle}">${exRows}</div>`;

  // Gabarito
  let gabSection = "";
  if (cfg.gabarito !== "sem") {
    const ansItems = exercises.map((ex, i) => {
      const num = numerar ? `${i + 1})` : "";
      const val = ex.answer !== undefined && ex.answer !== null ? String(ex.answer) : "—";
      return `<div style="font-family:'Courier New',monospace;font-size:${fz};line-height:1.8;">${num}&nbsp;${val}</div>`;
    });
    const gabGrid = `display:grid;grid-template-columns:repeat(2,1fr);gap:2px 32px;`;
    if (cfg.gabarito === "proxima") {
      gabSection = `
        <div style="page-break-before:always;break-before:page;${S.page}">
          <div style="${S.title}">Gabarito</div>
          <div style="${S.rule2}"></div>
          <div style="${S.rule1} margin-bottom:10px;"></div>
          <div style="${gabGrid}">${ansItems.join("")}</div>
        </div>`;
    } else {
      gabSection = `
        <div style="margin-top:16px;">
          <div style="${S.rule2}"></div>
          <div style="${S.rule1} margin-bottom:8px;"></div>
          <div style="font-family:'Courier New',monospace;font-size:${fz};font-weight:700;margin-bottom:6px;">Gabarito&nbsp;&nbsp;Seed: ${seed}</div>
          <div style="${gabGrid}">${ansItems.join("")}</div>
        </div>`;
    }
  }

  const footerHtml = `<div style="margin-top:auto;padding-top:4mm;border-top:1px solid #ddd;display:flex;justify-content:space-between;${S.footer}"><span>Axiora Tools · axiora.com.br&nbsp;&nbsp;Seed: ${seed}</span><span>Reprodução livre para fins pedagógicos</span></div>`;

  const subtitleHtml = cfg.subtitle ? `<p style="font-style:italic;font-size:${fz};color:#444;margin:6px 0 10px;border-bottom:1px solid #ddd;border-top:1px solid #ddd;padding:4px 0;">${cfg.subtitle}</p>` : "";

  const exStyles = `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
    html,body{background:#fff;font-family:'Courier New',Courier,monospace;font-size:${fz};color:#111;line-height:1.6;}
    @page{size:A4 portrait;margin:18mm 20mm;}
    @media print{body{background:#fff;}.no-print{display:none!important;}}
    .ex-mult-armada{display:inline-flex;flex-direction:column;align-items:flex-end;font-family:'Courier New',monospace;font-size:${fz};gap:2px;}
    .ex-mult-row{display:flex;align-items:center;gap:6px;white-space:nowrap;}
    .ex-mult-op-symbol{min-width:16px;text-align:right;}
    .ex-mult-line{width:100%;height:0;border-top:1.5px solid #111;margin:2px 0 0;}
    .ex-divisao-armada{display:inline-flex;align-items:flex-start;font-family:'Courier New',monospace;font-size:${fz};}
    .ex-divisao-dividendo{white-space:nowrap;padding-right:4px;line-height:1.5;}
    .ex-divisao-right{display:flex;flex-direction:column;}
    .ex-divisao-divisor{white-space:nowrap;padding:0 2px 3px 6px;border-left:1px solid #111;border-bottom:1px solid #111;}
    .ex-divisao-quociente{min-height:1.8em;padding:2px 2px 0 6px;}
    .ex-linear{font-family:'Courier New',monospace;font-size:${fz};white-space:normal;word-break:break-word;}
    .ex-frac{display:inline-flex;flex-direction:column;align-items:center;line-height:1.1;}
    .ex-frac-num{border-bottom:1.5px solid #111;padding-bottom:2px;text-align:center;min-width:16px;font-size:${fz};}
    .ex-frac-den{padding-top:2px;text-align:center;min-width:16px;font-size:${fz};}
    .ex-frac-op{font-size:${fz};padding:0 2px;align-self:center;}
    .ex-frac-result{align-self:center;font-size:${fz};}
    .ex-fracao-expr{display:inline-flex;align-items:center;gap:10px;font-family:'Courier New',monospace;font-size:${fz};}
    .ex-equacao{font-family:'Courier New',monospace;font-size:${fz};display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px;}
    .ex-eq-var{font-style:italic;font-size:${fz};}
    .ex-eq-op,.ex-eq-equals,.ex-eq-num,.ex-eq-coef{font-size:${fz};}
    .ex-eq-frac-wrap{display:inline-flex;flex-direction:column;align-items:center;line-height:1.1;vertical-align:middle;margin:0 2px;}
    .ex-eq-frac-top{font-style:italic;font-size:calc(${fz} * 0.85);border-bottom:1.5px solid #111;padding-bottom:1px;min-width:14px;text-align:center;}
    .ex-eq-frac-bot{font-size:calc(${fz} * 0.85);padding-top:1px;text-align:center;}
    .ex-pot{font-family:'Courier New',monospace;font-size:${fz};white-space:nowrap;display:inline;}
    .ex-pot-base{font-size:${fz};}
    .ex-pot-exp{font-size:.6em;vertical-align:super;line-height:1;margin-left:1px;}
    .ex-pot-result{font-size:${fz};margin-left:6px;}
    .ex-raiz{display:inline-flex;align-items:flex-end;font-family:'Courier New',monospace;font-size:${fz};gap:0;vertical-align:middle;}
    .ex-raiz-svg{height:1.5em;width:auto;overflow:visible;flex-shrink:0;}
    .ex-raiz-val{border-top:1.5px solid #111;padding:0 4px 0 0;font-size:${fz};line-height:1.5;}
    .ex-raiz-idx-wrap{position:relative;display:inline-block;line-height:0;}
    .ex-raiz-idx{position:absolute;top:0;left:1px;font-size:0.55em;line-height:1;font-family:'Courier New',monospace;}
    .ex-expressao{font-family:'Courier New',monospace;font-size:${fz};display:inline-flex;align-items:center;flex-wrap:wrap;gap:5px;}
    .ex-expr-term,.ex-expr-op,.ex-expr-eq{font-size:${fz};}
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<title>${cfg.title || "Folha de Exercícios"}</title>
<style>${exStyles}</style>
</head><body style="padding:0;margin:0;">
<div style="${S.page} padding:0; display:flex; flex-direction:column; min-height:100vh;">
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
    case "1ano-contagem":
      setBlocks([mk("aritmetica", { operacao: "adicao", digitos1: 1, digitos2: 1, formato: "linear", quantidade: 10 }), mk("aritmetica", { operacao: "subtracao", digitos1: 1, digitos2: 1, formato: "linear", quantidade: 8 })]); break;
    case "2ano":
      setBlocks([mk("aritmetica", { operacao: "adicao", digitos1: 2, digitos2: 2, quantidade: 8 }), mk("aritmetica", { operacao: "subtracao", digitos1: 2, digitos2: 2, quantidade: 8 })]); break;
    case "2ano-avancado":
      setBlocks([mk("aritmetica", { operacao: "adicao", digitos1: 3, digitos2: 2, quantidade: 8 }), mk("aritmetica", { operacao: "subtracao", digitos1: 3, digitos2: 2, quantidade: 8 }), mk("aritmetica", { operacao: "multiplicacao", digitos1: 1, digitos2: 1, formato: "linear", quantidade: 6 })]); break;
    case "3ano":
      setBlocks([mk("aritmetica", { operacao: "multiplicacao", digitos1: 2, digitos2: 1, quantidade: 8 }), mk("aritmetica", { operacao: "divisao", formato: "armada", quantidade: 6 })]); break;
    case "3ano-tabuada":
      setBlocks([mk("aritmetica", { operacao: "multiplicacao", digitos1: 1, digitos2: 1, formato: "linear", quantidade: 12 }), mk("aritmetica", { operacao: "divisao", digitos1: 2, digitos2: 1, formato: "linear", quantidade: 10 })]); break;
    case "4ano":
      setBlocks([mk("aritmetica", { operacao: "multiplicacao", digitos1: 3, digitos2: 2, quantidade: 6 }), mk("fracoes", { operacao: "soma", denomMax: 8, quantidade: 6 }), mk("fracoes", { operacao: "subtracao", denomMax: 8, quantidade: 4 })]); break;
    case "4ano-divisao":
      setBlocks([mk("aritmetica", { operacao: "divisao", digitos1: 3, digitos2: 2, formato: "armada", permitirResto: true, quantidade: 8 }), mk("aritmetica", { operacao: "multiplicacao", digitos1: 3, digitos2: 2, quantidade: 6 })]); break;
    case "5ano-fracoes":
      setBlocks([mk("fracoes", { operacao: "soma", denomMax: 12, denominadorComum: true, quantidade: 6 }), mk("fracoes", { operacao: "subtracao", denomMax: 12, denominadorComum: true, quantidade: 6 }), mk("fracoes", { operacao: "misto", denomMax: 10, quantidade: 4 })]); break;
    case "5ano-completo":
      setBlocks([mk("aritmetica", { operacao: "multiplicacao", digitos1: 3, digitos2: 2, quantidade: 4 }), mk("aritmetica", { operacao: "divisao", digitos1: 4, digitos2: 2, formato: "armada", quantidade: 4 }), mk("fracoes", { operacao: "soma", denomMax: 10, quantidade: 4 }), mk("fracoes", { operacao: "subtracao", denomMax: 10, quantidade: 4 })]); break;
    // ── Anos Finais ────────────────────────────────────────────────────────
    case "6ano":
      setBlocks([mk("equacoes", { tipo: "misto", coefMax: 9, respMax: 20, quantidade: 6 }), mk("expressoes", { complexidade: "media", termos: 4, operacoes: ["adicao", "subtracao", "multiplicacao"], quantidade: 6 })]); break;
    case "6ano-expressoes":
      setBlocks([mk("expressoes", { complexidade: "simples", termos: 3, operacoes: ["adicao", "subtracao"], quantidade: 6 }), mk("expressoes", { complexidade: "media", termos: 4, operacoes: ["adicao", "subtracao", "multiplicacao"], usarParenteses: true, quantidade: 6 })]); break;
    case "6ano-fracoes-avancado":
      setBlocks([mk("fracoes", { operacao: "misto", denomMax: 15, numerosMistos: true, quantidade: 6 }), mk("fracoes", { operacao: "soma", denomMax: 12, simplificar: true, quantidade: 6 }), mk("equacoes", { tipo: "misto", coefMax: 5, quantidade: 4 })]); break;
    case "7ano-equacoes":
      setBlocks([mk("equacoes", { tipo: "misto", coefMax: 15, respMax: 30, respNegativa: true, quantidade: 8 }), mk("expressoes", { complexidade: "media", termos: 4, operacoes: ["adicao", "subtracao", "multiplicacao", "divisao"], usarParenteses: true, quantidade: 6 })]); break;
    case "7ano-potencias":
      setBlocks([mk("potenciacao", { tipo: "potencia", baseMax: 10, expMax: 3, quantidade: 8 }), mk("potenciacao", { tipo: "raiz", baseMax: 144, expMax: 2, somentePerfeitasRaiz: true, quantidade: 8 })]); break;
    case "8ano-completo":
      setBlocks([mk("equacoes", { tipo: "misto", coefMax: 20, respMax: 50, respNegativa: true, quantidade: 6 }), mk("potenciacao", { tipo: "misto", baseMax: 15, expMax: 4, quantidade: 6 }), mk("expressoes", { complexidade: "avancada", termos: 5, operacoes: ["adicao", "subtracao", "multiplicacao", "divisao"], usarParenteses: true, nivelAgrupamento: 2, quantidade: 4 })]); break;
    case "9ano-revisao":
      setBlocks([mk("equacoes", { tipo: "misto", coefMax: 25, respMax: 100, respNegativa: true, quantidade: 6 }), mk("potenciacao", { tipo: "misto", baseMax: 20, expMax: 4, quantidade: 6 }), mk("expressoes", { complexidade: "avancada", termos: 6, operacoes: ["adicao", "subtracao", "multiplicacao", "divisao"], usarParenteses: true, nivelAgrupamento: 3, quantidade: 4 })]); break;
    // ── Temáticos ─────────────────────────────────────────────────────────
    case "so-adicao":
      setBlocks([mk("aritmetica", { operacao: "adicao", digitos1: 2, digitos2: 2, quantidade: 8 }), mk("aritmetica", { operacao: "adicao", digitos1: 3, digitos2: 2, quantidade: 6 }), mk("aritmetica", { operacao: "adicao", digitos1: 3, digitos2: 3, quantidade: 4 })]); break;
    case "so-multiplicacao":
      setBlocks([mk("aritmetica", { operacao: "multiplicacao", digitos1: 1, digitos2: 1, formato: "linear", quantidade: 10 }), mk("aritmetica", { operacao: "multiplicacao", digitos1: 2, digitos2: 1, quantidade: 8 }), mk("aritmetica", { operacao: "multiplicacao", digitos1: 3, digitos2: 2, quantidade: 6 })]); break;
    case "so-divisao":
      setBlocks([mk("aritmetica", { operacao: "divisao", digitos1: 2, digitos2: 1, formato: "armada", quantidade: 8 }), mk("aritmetica", { operacao: "divisao", digitos1: 3, digitos2: 2, formato: "armada", quantidade: 6 }), mk("aritmetica", { operacao: "divisao", digitos1: 4, digitos2: 2, formato: "armada", permitirResto: true, quantidade: 4 })]); break;
    case "so-fracoes":
      setBlocks([mk("fracoes", { operacao: "soma", denomMax: 8, quantidade: 6 }), mk("fracoes", { operacao: "subtracao", denomMax: 8, quantidade: 6 }), mk("fracoes", { operacao: "misto", denomMax: 12, quantidade: 6 })]); break;
    case "so-potencias":
      setBlocks([mk("potenciacao", { tipo: "potencia", baseMax: 12, expMax: 3, quantidade: 8 }), mk("potenciacao", { tipo: "raiz", baseMax: 196, expMax: 2, somentePerfeitasRaiz: true, quantidade: 6 }), mk("potenciacao", { tipo: "misto", baseMax: 10, expMax: 4, quantidade: 6 })]); break;
    case "revisao-geral":
      setBlocks([mk("aritmetica", { operacao: "multiplicacao", digitos1: 3, digitos2: 2, quantidade: 4 }), mk("aritmetica", { operacao: "divisao", digitos1: 3, digitos2: 2, formato: "armada", quantidade: 4 }), mk("fracoes", { operacao: "misto", denomMax: 10, quantidade: 4 }), mk("equacoes", { tipo: "misto", coefMax: 9, quantidade: 4 }), mk("potenciacao", { tipo: "misto", baseMax: 10, expMax: 3, quantidade: 4 })]); break;
    case "avaliacao-trimestral":
      setBlocks([mk("aritmetica", { operacao: "misto", digitos1: 3, digitos2: 2, quantidade: 6 }), mk("fracoes", { operacao: "misto", denomMax: 12, quantidade: 4 }), mk("equacoes", { tipo: "misto", coefMax: 12, respMax: 30, respNegativa: true, quantidade: 4 }), mk("expressoes", { complexidade: "media", termos: 4, operacoes: ["adicao", "subtracao", "multiplicacao"], usarParenteses: true, quantidade: 4 })]); break;
    case "limpar": setBlocks([]); break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK META TEXT
// ─────────────────────────────────────────────────────────────────────────────

function blockMetaText(block: Block): string {
  const c = block.config;
  switch (block.type) {
    case "aritmetica": {
      const opNames: Record<string, string> = { adicao: "Adição", subtracao: "Subtração", multiplicacao: "Multiplicação", divisao: "Divisão" };
      const fmt = c.formato === "armada" ? "Armada" : "Linear";
      return `${opNames[c.operacao ?? ""] ?? c.operacao} · ${c.digitos1}×${c.digitos2} dígitos · ${fmt}`;
    }
    case "fracoes": {
      const opNames: Record<string, string> = { soma: "Soma", subtracao: "Subtração", misto: "Misto" };
      return `${opNames[c.operacao ?? ""] ?? c.operacao} · Denom. máx. ${c.denomMax}`;
    }
    case "equacoes": return `${c.tipo === "misto" ? "Misto" : c.tipo} · Coef. até ${c.coefMax}`;
    case "potenciacao": { const t = c.tipo === "misto" ? "Misto" : c.tipo === "potencia" ? "Potência" : "Raiz"; return `${t} · Base até ${c.baseMax} · Exp. até ${c.expMax}`; }
    case "expressoes": { const cNames: Record<string, string> = { simples: "Simples", media: "Média", avancada: "Avançada" }; return `${cNames[c.complexidade ?? ""] ?? c.complexidade} · ${c.termos} termos`; }
    default: return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function SheetGeneratorTool() {
  const nextId = useRef(1);
  const [blocks, setBlocks] = useState<Block[]>(() =>
    DEFAULT_BLOCKS.map((b) => ({ ...b, id: nextId.current++ }))
  );
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [seed, setSeed] = useState<number>(() => Math.floor(10000 + Math.random() * 90000));
  const [snapshot, setSnapshot] = useState<ExerciseItem[] | null>(null);
  const [cfg, setCfg] = useState<GlobalConfig>({
    title: "Folha de Exercícios",
    subtitle: "Resolva todos os exercícios.",
    turma: "",
    tempo: "",
    cols: 2,
    fontSize: "M",
    gabarito: "proxima",
    spacing: 8,
    embaralhar: false,
    showNome: true,
    numerar: true,
    showPontuacao: false,
    repeatHeader: true,
  });
  const [toast, setToast] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"config" | "blocks" | "detail">("blocks");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["cabecalho"]));
  const toggleSection = useCallback((id: string) => setOpenSections(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; }), []);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [layoutModalOpen, setLayoutModalOpen] = useState(false);
  const [opcoesModalOpen, setOpcoesModalOpen] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const invalidate = useCallback(() => setSnapshot(null), []);

  const updateCfg = useCallback(<K extends keyof GlobalConfig>(key: K, val: GlobalConfig[K]) => {
    setCfg((prev) => ({ ...prev, [key]: val }));
    invalidate();
  }, [invalidate]);

  const addBlock = useCallback(() => {
    const types = Object.keys(BLOCK_META) as BlockType[];
    const type = types[blocks.length % types.length];
    const newBlock: Block = { id: nextId.current++, type, active: true, config: { ...BLOCK_META[type].defaults } };
    setBlocks((prev) => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
    showToast(`${BLOCK_META[type].name} adicionado`);
    invalidate();
  }, [blocks.length, showToast, invalidate]);

  const removeBlock = useCallback((id: number) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setSelectedBlockId((prev) => (prev === id ? null : prev));
    showToast("Bloco removido");
    invalidate();
  }, [showToast, invalidate]);

  const toggleBlock = useCallback((id: number) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, active: !b.active } : b)));
    invalidate();
  }, [invalidate]);

  const updateBlockConfig = useCallback((id: number, key: keyof BlockConfig, val: unknown) => {
    setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, config: { ...b.config, [key]: val } } : b));
    invalidate();
  }, [invalidate]);

  const changeBlockType = useCallback((id: number, type: BlockType) => {
    setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, type, config: { ...BLOCK_META[type].defaults, quantidade: b.config.quantidade } } : b));
    invalidate();
  }, [invalidate]);

  const getOrBuildSnapshot = useCallback((): ExerciseItem[] => {
    if (snapshot) return snapshot;
    const result = generateAllExercises(blocks, cfg.embaralhar);
    setSnapshot(result);
    return result;
  }, [snapshot, blocks, cfg.embaralhar]);

  const rerollSeed = useCallback(() => {
    setSeed(Math.floor(10000 + Math.random() * 90000));
    invalidate();
    showToast("Novo seed gerado — clique em Imprimir para ver os novos exercícios");
  }, [invalidate, showToast]);

  const handlePrint = useCallback(() => {
    const exercises = getOrBuildSnapshot();
    if (exercises.length === 0) { showToast("Nenhum exercício ativo — adicione blocos"); return; }
    const html = buildPrintHTML(exercises, blocks, cfg, seed);
    const win = window.open("", "_blank", "width=860,height=750");
    if (!win) { showToast("Permita pop-ups para imprimir"); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }, [getOrBuildSnapshot, blocks, cfg, seed, showToast]);

  const totalExercises = useMemo(() => blocks.filter((b) => b.active).reduce((s, b) => s + b.config.quantidade, 0), [blocks]);
  const activeCount = useMemo(() => blocks.filter((b) => b.active).length, [blocks]);
  const selectedBlock = useMemo(() => blocks.find((b) => b.id === selectedBlockId) ?? null, [blocks, selectedBlockId]);

  // Input / select class
  const inputCls = "mt-1 w-full rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-[13px] text-[#0f172a] placeholder-[#94a3b8] outline-none transition focus:border-[#ee8748] focus:shadow-[0_0_0_3px_rgba(238,135,72,0.12)]";
  const segBtnCls = (active: boolean) =>
    `flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${active ? "bg-[#ee8748] text-white shadow-[0_2px_0_rgba(158,74,30,0.35)]" : "border border-[#d1d5db] bg-white text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]"}`;

  return (
    <div className="flex flex-col h-full min-h-[500px] overflow-hidden md:flex-row md:min-h-[600px]" style={{ background: "#ffffff" }}>

      {/* ── MOBILE TAB BAR ──────────────────────────────────────────── */}
      <div className="flex shrink-0 border-b border-[#e2e8f0] md:hidden" style={{ background: "#ffffff" }}>
        {([["config", "Configurar"], ["blocks", "Blocos"], ["detail", "Detalhes"]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMobileTab(id)}
            className={`flex-1 py-3 text-[12px] font-semibold transition-colors ${mobileTab === id ? "border-b-2 border-[#ee8748] text-[#ee8748]" : "text-[#94a3b8] hover:text-[#475569]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── LEFT PANEL ──────────────────────────────────────────────── */}
      <aside className={`${mobileTab === "config" ? "flex" : "hidden"} flex-col overflow-hidden md:flex md:w-[272px] md:shrink-0`} style={{ background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)", borderRight: "1px solid #e2e8f0" }}>
        {/* Panel header */}
        <div className="relative overflow-hidden px-5 py-3.5" style={{ borderBottom: "1px solid #e2e8f0", background: "linear-gradient(180deg, rgba(238,135,72,0.05) 0%, transparent 100%)" }}>
          <div className="absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(90deg,#ee8748,rgba(238,135,72,0.2),transparent)]" />
          <div className="text-[13px] font-bold text-[#0f172a]">Configurações</div>
          <div className="mt-0.5 text-[11px] text-[#94a3b8]">Personalize sua folha</div>
        </div>

        <div className="flex-1 overflow-y-auto pb-20">

          {/* CABEÇALHO */}
          <div className="border-b border-[#f1f5f9] px-4">
            <button type="button" onClick={() => toggleSection("cabecalho")} className="flex w-full items-center justify-between py-3 text-left transition-opacity hover:opacity-70">
              <div className="flex items-center gap-2">
                <span className="h-3 w-[3px] rounded-full bg-[#ee8748]" />
                <span className="text-[10px] font-bold uppercase tracking-[1.8px] text-[#64748b]">Cabeçalho da Folha</span>
              </div>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" className={`transition-transform duration-200 ${openSections.has("cabecalho") ? "rotate-180" : ""}`}><path d="M2 4l4 4 4-4"/></svg>
            </button>
            <div className={`overflow-hidden transition-all duration-200 ${openSections.has("cabecalho") ? "max-h-[400px] opacity-100 pb-4" : "max-h-0 opacity-0"}`}>
              <div className="space-y-2.5">
                <label className="block text-[11px] font-medium text-[#475569]">
                  Título
                  <input className={inputCls} value={cfg.title} onChange={(e) => updateCfg("title", e.target.value)} />
                </label>
                <label className="block text-[11px] font-medium text-[#475569]">
                  Instruções
                  <textarea className={`${inputCls} resize-none`} rows={2} value={cfg.subtitle} onChange={(e) => updateCfg("subtitle", e.target.value)} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-[11px] font-medium text-[#475569]">
                    Turma
                    <input className={inputCls} placeholder="7º Ano A" value={cfg.turma} onChange={(e) => updateCfg("turma", e.target.value)} />
                  </label>
                  <label className="block text-[11px] font-medium text-[#475569]">
                    Tempo
                    <input className={inputCls} placeholder="30 min" value={cfg.tempo} onChange={(e) => updateCfg("tempo", e.target.value)} />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* PRESET */}
          <div className="border-b border-[#f1f5f9] px-4">
            <button type="button" onClick={() => setPresetModalOpen(true)} className="flex w-full items-center justify-between py-3 text-left transition-opacity hover:opacity-70">
              <div className="flex items-center gap-2">
                <span className="h-3 w-[3px] rounded-full bg-[#ee8748]" />
                <span className="text-[10px] font-bold uppercase tracking-[1.8px] text-[#64748b]">Preset Pedagógico</span>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>

          {/* LAYOUT */}
          <div className="border-b border-[#f1f5f9] px-4">
            <button type="button" onClick={() => setLayoutModalOpen(true)} className="flex w-full items-center justify-between py-3 text-left transition-opacity hover:opacity-70">
              <div className="flex items-center gap-2">
                <span className="h-3 w-[3px] rounded-full bg-[#ee8748]" />
                <span className="text-[10px] font-bold uppercase tracking-[1.8px] text-[#64748b]">Layout Global</span>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>

          {/* OPÇÕES */}
          <div className="px-4">
            <button type="button" onClick={() => setOpcoesModalOpen(true)} className="flex w-full items-center justify-between py-3 text-left transition-opacity hover:opacity-70">
              <div className="flex items-center gap-2">
                <span className="h-3 w-[3px] rounded-full bg-[#ee8748]" />
                <span className="text-[10px] font-bold uppercase tracking-[1.8px] text-[#64748b]">Opções</span>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>

        </div>
      </aside>

      {/* ── CENTER PANEL ────────────────────────────────────────────── */}
      <main className={`${mobileTab === "blocks" ? "flex" : "hidden"} flex-col overflow-hidden md:flex md:flex-1`} style={{ background: "#ffffff", borderLeft: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
          <div className="flex items-center gap-3">
            <div>
              <div className="text-[13px] font-bold text-[#0f172a]">Blocos de Exercícios</div>
              <div className="mt-0.5 text-[11px] text-[#94a3b8]">Clique em um bloco para configurar</div>
            </div>
            {activeCount > 0 && (
              <span className="rounded-full bg-[rgba(238,135,72,0.12)] px-2.5 py-0.5 text-[11px] font-bold text-[#ee8748]">{activeCount} ativo{activeCount === 1 ? "" : "s"}</span>
            )}
          </div>
          <button onClick={addBlock} className="flex items-center gap-2 rounded-xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-4 py-2 text-[12px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.25),0_3px_0_rgba(158,74,30,0.5),0_8px_16px_rgba(93,48,22,0.25)] transition hover:brightness-110 active:translate-y-[2px] active:shadow-none">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
            Adicionar Bloco
          </button>
        </div>

        {/* Blocks list */}
        <div className="flex-1 overflow-y-auto">
          {blocks.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-5 px-6 py-6 text-center">
              {/* Illustration */}
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(135deg, #fff7f0 0%, #ffe8d4 100%)", border: "1px solid rgba(238,135,72,0.2)" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ee8748" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12h6M12 9v6"/></svg>
              </div>
              <div>
                <p className="text-[14px] font-bold text-[#1e293b]">Crie sua primeira atividade</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#94a3b8]">Escolha um ponto de partida abaixo</p>
              </div>
              {/* Steps */}
              <div className="w-full space-y-2">
                {([
                  { step: "1", label: "Escolha o conteúdo", desc: "Adicione blocos de exercícios" },
                  { step: "2", label: "Ajuste o layout", desc: "Colunas, fonte e espaçamento" },
                  { step: "3", label: "Exporte o PDF", desc: "Pronto para imprimir" },
                ] as { step: string; label: string; desc: string }[]).map(({ step, label, desc }) => (
                  <div key={step} className="flex items-center gap-3 rounded-xl border border-[#f1f5f9] bg-white px-4 py-3 text-left">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: "#ee8748" }}>{step}</div>
                    <div>
                      <div className="text-[12px] font-semibold text-[#334155]">{label}</div>
                      <div className="text-[11px] text-[#94a3b8]">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* CTAs */}
              <div className="flex w-full flex-col gap-2">
                <button
                  type="button"
                  onClick={() => { applyPreset("2ano", setBlocks, nextId); setSelectedBlockId(null); invalidate(); }}
                  className="w-full cursor-pointer rounded-xl py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #ee8748 0%, #f97316 100%)" }}
                >
                  Usar preset →
                </button>
                <button
                  type="button"
                  onClick={addBlock}
                  className="w-full cursor-pointer rounded-xl border border-[#e2e8f0] bg-white py-2.5 text-[13px] font-semibold text-[#475569] transition hover:border-[#d1d5db] hover:bg-[#f8fafc]"
                >
                  Começar do zero
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#f1f5f9]">
              {blocks.map((block, idx) => {
                const meta = BLOCK_META[block.type];
                const isSelected = block.id === selectedBlockId;
                return (
                  <div
                    key={block.id}
                    onClick={() => { setSelectedBlockId(block.id); setMobileTab("detail"); }}
                    className={`group relative cursor-pointer transition-colors duration-100 ${isSelected ? "bg-[rgba(238,135,72,0.05)]" : "hover:bg-[#f8fafc]"} ${!block.active ? "opacity-40" : ""}`}
                  >
                    {/* Selected left accent */}
                    {isSelected && <div className="absolute inset-y-0 left-0 w-[2px]" style={{ background: "#ee8748" }} />}

                    <div className="flex items-center gap-3 py-3 pl-5 pr-4">
                      {/* Icon */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: meta.color }}>
                        <meta.Icon size={15} strokeWidth={1.75} style={{ color: meta.accent }} />
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-semibold text-[#0f172a]">{meta.name}</span>
                          <span className="shrink-0 text-[11px] text-[#cbd5e1]">#{idx + 1}</span>
                        </div>
                        <div className="truncate text-[11px] text-[#94a3b8]">{blockMetaText(block)}</div>
                      </div>

                      {/* Qty pill */}
                      <div className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-bold" style={{ background: meta.color, color: meta.accent }}>
                        {block.config.quantidade}
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-1.5 pl-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => toggleBlock(block.id)}
                          aria-label={block.active ? "Desativar bloco" : "Ativar bloco"}
                          className="relative flex h-6 w-11 cursor-pointer items-center rounded-full transition-all duration-200"
                          style={{ background: block.active ? "#ee8748" : "rgba(255,255,255,0.12)", boxShadow: block.active ? "0 0 10px rgba(238,135,72,0.35)" : "none" }}
                        >
                          <div className={`absolute h-4 w-4 rounded-full bg-white shadow-md transition-all duration-200 ${block.active ? "left-6" : "left-1"}`} />
                        </button>
                        <button onClick={() => removeBlock(block.id)} aria-label="Remover bloco" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[#cbd5e1] transition hover:bg-red-50 hover:text-red-400 group-hover:text-[#94a3b8]">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
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
              <div className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#94a3b8]">Total de exercícios</div>
                  <div className="mt-0.5 text-[22px] font-black tracking-tight text-[#0f172a]">{totalExercises}</div>
                </div>
                <div className="h-8 w-px bg-[#e2e8f0]" />
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#94a3b8]">Blocos ativos</div>
                  <div className="mt-0.5 text-[22px] font-black tracking-tight text-[#ee8748]">{activeCount}</div>
                </div>
                <div className="h-8 w-px bg-[#e2e8f0]" />
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#94a3b8]">Colunas</div>
                  <div className="mt-0.5 text-[22px] font-black tracking-tight text-[#64748b]">{cfg.cols}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom bar — Seed + Print */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
          {/* Seed chip */}
          <div className="flex items-center gap-0 overflow-hidden rounded-lg" style={{ border: "1px solid #e2e8f0" }}>
            <div className="flex items-center gap-1.5 px-3 py-2" style={{ background: "#ffffff" }}>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-[#94a3b8]">Seed</span>
              <span className="font-mono text-[13px] font-bold text-[#475569]">{seed}</span>
            </div>
            <button onClick={rerollSeed} aria-label="Gerar novo seed" title="Novo seed" className="flex h-full cursor-pointer items-center px-2.5 text-[#94a3b8] transition hover:bg-[#f1f5f9] hover:text-[#475569]" style={{ borderLeft: "1px solid #e2e8f0" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0115-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/></svg>
            </button>
          </div>

          <div className="flex-1" />

          <button onClick={handlePrint} className="flex items-center gap-2.5 rounded-xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-5 py-2.5 text-[13px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.3),0_4px_0_rgba(158,74,30,0.5),0_10px_20px_rgba(93,48,22,0.25)] transition hover:brightness-110 active:translate-y-[3px] active:shadow-[inset_0_1px_0_rgba(255,219,190,0.3),0_1px_0_rgba(158,74,30,0.5)]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Imprimir / Salvar PDF
          </button>
        </div>
      </main>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────── */}
      <aside className={`${mobileTab === "detail" ? "flex" : "hidden"} flex-col overflow-hidden md:flex md:w-[280px] md:shrink-0`} style={{ background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)", borderLeft: "1px solid #e2e8f0" }}>
        {!selectedBlock ? (
          <div className="flex flex-1 flex-col gap-0 overflow-y-auto">
            {/* Header */}
            <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #e2e8f0" }}>
              <div className="text-[13px] font-bold text-[#0f172a]">Resumo da Folha</div>
              <div className="mt-0.5 text-[11px] text-[#94a3b8]">Visão geral da configuração atual</div>
            </div>

            {/* Cabeçalho preview */}
            <div className="px-5 py-4" style={{ borderBottom: "1px solid #f1f5f9" }}>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[1.5px] text-[#94a3b8]">Cabeçalho</div>
              <div className="space-y-1.5">
                <div className="truncate text-[13px] font-bold text-[#0f172a]">{cfg.title || <span className="italic text-[#cbd5e1]">Sem título</span>}</div>
                {cfg.subtitle && <div className="truncate text-[11px] text-[#64748b]">{cfg.subtitle}</div>}
                <div className="flex gap-3 text-[11px] text-[#94a3b8]">
                  {cfg.turma && <span>Turma: <span className="font-medium text-[#475569]">{cfg.turma}</span></span>}
                  {cfg.tempo && <span>Tempo: <span className="font-medium text-[#475569]">{cfg.tempo}</span></span>}
                </div>
              </div>
            </div>

            {/* Layout preview */}
            <div className="px-5 py-4" style={{ borderBottom: "1px solid #f1f5f9" }}>
              <div className="mb-3 text-[10px] font-bold uppercase tracking-[1.5px] text-[#94a3b8]">Layout</div>
              {/* Column diagram */}
              <div className="mb-3 flex gap-1">
                {Array.from({ length: cfg.cols }).map((_, i) => (
                  <div key={i} className="flex-1 rounded" style={{ background: "rgba(238,135,72,0.15)", border: "1px solid rgba(238,135,72,0.3)", height: "40px" }} />
                ))}
              </div>
              <div className="space-y-1.5">
                {([
                  ["Colunas", String(cfg.cols)],
                  ["Fonte", cfg.fontSize === "P" ? "Pequena" : cfg.fontSize === "M" ? "Média" : "Grande"],
                  ["Espaçamento", `${cfg.spacing}px`],
                  ["Gabarito", cfg.gabarito === "sem" ? "Sem gabarito" : cfg.gabarito === "mesma" ? "Mesma página" : "Próxima página"],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[11px] text-[#94a3b8]">{label}</span>
                    <span className="text-[11px] font-semibold text-[#334155]">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Opções ativas */}
            <div className="px-5 py-4" style={{ borderBottom: "1px solid #f1f5f9" }}>
              <div className="mb-3 text-[10px] font-bold uppercase tracking-[1.5px] text-[#94a3b8]">Opções ativas</div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  [cfg.showNome, "Nome/Data"],
                  [cfg.numerar, "Numeração"],
                  [cfg.embaralhar, "Embaralhado"],
                  [cfg.repeatHeader, "Repete cabeçalho"],
                ] as [boolean, string][]).map(([on, label]) => (
                  <span key={label} className="rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ background: on ? "rgba(238,135,72,0.12)" : "#f1f5f9", color: on ? "#ee8748" : "#94a3b8", border: `1px solid ${on ? "rgba(238,135,72,0.25)" : "#e2e8f0"}` }}>
                    {on ? "✓ " : ""}{label}
                  </span>
                ))}
              </div>
            </div>

            {/* Blocos summary */}
            <div className="px-5 py-4">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-[1.5px] text-[#94a3b8]">Blocos ({blocks.length})</div>
              <div className="space-y-1.5">
                {blocks.map((b, i) => {
                  const meta = BLOCK_META[b.type];
                  return (
                    <div key={b.id} onClick={() => { setSelectedBlockId(b.id); setMobileTab("detail"); }} className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 transition hover:bg-white ${!b.active ? "opacity-40" : ""}`} style={{ border: "1px solid #e2e8f0" }}>
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: meta.color }}>
                        <meta.Icon size={12} strokeWidth={2} style={{ color: meta.accent }} />
                      </div>
                      <span className="flex-1 truncate text-[11px] font-medium text-[#334155]">{meta.name}</span>
                      <span className="text-[10px] font-bold" style={{ color: meta.accent }}>#{i + 1}</span>
                    </div>
                  );
                })}
                {blocks.length === 0 && <p className="text-[11px] italic text-[#cbd5e1]">Nenhum bloco adicionado</p>}
              </div>
            </div>
          </div>
        ) : (
          <BlockDetailPanel block={selectedBlock} onUpdate={updateBlockConfig} onChangeType={changeBlockType} />
        )}
      </aside>

      {/* ── LAYOUT MODAL ─────────────────────────────────────────── */}
      {layoutModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backdropFilter: "blur(6px)", background: "rgba(15,23,42,0.45)" }} onClick={() => setLayoutModalOpen(false)}>
          <div className="relative mx-4 w-full max-w-[420px] overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#f1f5f9] px-5 py-4">
              <div>
                <div className="text-[15px] font-bold text-[#0f172a]">Layout Global</div>
                <div className="text-[12px] text-[#94a3b8]">Configurações visuais da folha</div>
              </div>
              <button onClick={() => setLayoutModalOpen(false)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#94a3b8] transition hover:bg-[#f1f5f9] hover:text-[#475569]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            {/* Content */}
            <div className="space-y-5 px-5 py-5">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#94a3b8]">Colunas</div>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} onClick={() => updateCfg("cols", n)} className={segBtnCls(cfg.cols === n)}>{n}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#94a3b8]">Tamanho da fonte</div>
                <div className="flex gap-1.5">
                  {(["P", "M", "G"] as FontSize[]).map((s) => (
                    <button key={s} onClick={() => updateCfg("fontSize", s)} className={segBtnCls(cfg.fontSize === s)}>{s === "P" ? "Pequena" : s === "M" ? "Média" : "Grande"}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[1.5px] text-[#94a3b8]">
                  <span>Espaçamento</span>
                  <span className="rounded-md bg-[rgba(238,135,72,0.12)] px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-[#ee8748]">{cfg.spacing}px</span>
                </div>
                <input type="range" min={0} max={40} value={cfg.spacing} onChange={(e) => updateCfg("spacing", Number(e.target.value))} className="w-full accent-[#ee8748]" style={{ height: "4px" }} />
                <div className="mt-1.5 flex justify-between text-[10px] text-[#94a3b8]">
                  <span>Compacto</span><span>Normal</span><span>Amplo</span>
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#94a3b8]">Gabarito</div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    <button onClick={() => updateCfg("gabarito", "sem")} className={segBtnCls(cfg.gabarito === "sem")}>Sem gabarito</button>
                    <button onClick={() => updateCfg("gabarito", "mesma")} className={segBtnCls(cfg.gabarito === "mesma")}>Mesma página</button>
                  </div>
                  <button onClick={() => updateCfg("gabarito", "proxima")} className={segBtnCls(cfg.gabarito === "proxima")}>Próxima página</button>
                </div>
              </div>
            </div>
            {/* Footer */}
            <div className="border-t border-[#f1f5f9] px-5 py-3">
              <button onClick={() => setLayoutModalOpen(false)} className="w-full cursor-pointer rounded-lg bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── OPÇÕES MODAL ─────────────────────────────────────────── */}
      {opcoesModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backdropFilter: "blur(6px)", background: "rgba(15,23,42,0.45)" }} onClick={() => setOpcoesModalOpen(false)}>
          <div className="relative mx-4 w-full max-w-[420px] overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#f1f5f9] px-5 py-4">
              <div>
                <div className="text-[15px] font-bold text-[#0f172a]">Opções</div>
                <div className="text-[12px] text-[#94a3b8]">Personalização da folha</div>
              </div>
              <button onClick={() => setOpcoesModalOpen(false)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#94a3b8] transition hover:bg-[#f1f5f9] hover:text-[#475569]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            {/* Toggles */}
            <div className="space-y-2 px-5 py-4">
              {([
                ["embaralhar", "Embaralhar exercícios", "Ordena aleatoriamente os exercícios no PDF"],
                ["showNome", "Campo Nome / Data", "Adiciona linha para o aluno preencher"],
                ["numerar", "Numerar exercícios", "Exibe 1., 2., 3. antes de cada exercício"],
                ["repeatHeader", "Repetir cabeçalho", "Repete o título em cada página do PDF"],
              ] as [keyof GlobalConfig, string, string][]).map(([key, label, desc]) => (
                <button
                  key={key}
                  type="button"
                  role="switch"
                  aria-checked={!!cfg[key]}
                  onClick={() => updateCfg(key, !cfg[key] as never)}
                  className="flex w-full cursor-pointer items-center gap-4 rounded-xl border border-[#e2e8f0] bg-white px-4 py-3 text-left transition hover:border-[#d1d5db] hover:bg-[#f8fafc]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[#334155]">{label}</div>
                    <div className="text-[11px] text-[#94a3b8]">{desc}</div>
                  </div>
                  <div className="relative h-5 w-9 shrink-0 rounded-full transition-all duration-200" style={{ background: cfg[key] ? "#ee8748" : "#cbd5e1", boxShadow: cfg[key] ? "0 0 8px rgba(238,135,72,0.35)" : "none" }}>
                    <div className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-md transition-all duration-200" style={{ left: cfg[key] ? "20px" : "2px" }} />
                  </div>
                </button>
              ))}
            </div>
            {/* Footer */}
            <div className="border-t border-[#f1f5f9] px-5 py-3">
              <button onClick={() => setOpcoesModalOpen(false)} className="w-full cursor-pointer rounded-lg bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ───────────────────────────────────────────────────── */}
      {/* ── PRESET MODAL ──────────────────────────────────────────── */}
      {presetModalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ backdropFilter: "blur(6px)", background: "rgba(15,23,42,0.45)" }}
          onClick={() => setPresetModalOpen(false)}
        >
          <div
            className="relative mx-4 flex max-h-[80vh] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#f1f5f9] px-5 py-4">
              <div>
                <div className="text-[15px] font-bold text-[#0f172a]">Preset Pedagógico</div>
                <div className="text-[12px] text-[#94a3b8]">Selecione um modelo para começar</div>
              </div>
              <button onClick={() => setPresetModalOpen(false)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#94a3b8] transition hover:bg-[#f1f5f9] hover:text-[#475569]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Preset list */}
            <div className="overflow-y-auto">
              {([
                {
                  group: "Anos Iniciais",
                  color: "#3b82f6",
                  items: [
                    { key: "1ano-contagem", label: "1º Ano", desc: "Iniciação — Adição e Subtração simples" },
                    { key: "2ano", label: "2º Ano", desc: "Adição e Subtração com 2 dígitos" },
                    { key: "2ano-avancado", label: "2º Ano Avançado", desc: "Operações com 3 dígitos + tabuada" },
                    { key: "3ano-tabuada", label: "3º Ano — Tabuada", desc: "Tabuada completa de × e ÷" },
                    { key: "3ano", label: "3º Ano", desc: "Multiplicação e Divisão" },
                    { key: "4ano-divisao", label: "4º Ano — Divisão", desc: "Divisão com resto (3÷2 dígitos)" },
                    { key: "4ano", label: "4º/5º Ano", desc: "Frações básicas + Multiplicação" },
                    { key: "5ano-fracoes", label: "5º Ano — Frações", desc: "Frações avançadas com denominador comum" },
                    { key: "5ano-completo", label: "5º Ano Completo", desc: "Revisão: ×, ÷, frações soma e sub" },
                  ],
                },
                {
                  group: "Anos Finais",
                  color: "#ee8748",
                  items: [
                    { key: "6ano-expressoes", label: "6º Ano — Expressões", desc: "Expressões numéricas simples e com parênteses" },
                    { key: "6ano", label: "6º Ano", desc: "Equações 1º grau + Expressões médias" },
                    { key: "6ano-fracoes-avancado", label: "6º Ano — Frações + Eq.", desc: "Frações mistas, simplificação e equações" },
                    { key: "7ano-equacoes", label: "7º Ano — Equações", desc: "Equações com coeficientes negativos" },
                    { key: "7ano-potencias", label: "7º Ano — Potências", desc: "Potenciação e raízes quadradas perfeitas" },
                    { key: "8ano-completo", label: "8º Ano Completo", desc: "Equações, potências e expressões avançadas" },
                    { key: "9ano-revisao", label: "9º Ano — Revisão", desc: "Preparação ENEM/Vestibular completa" },
                  ],
                },
                {
                  group: "Por Tema",
                  color: "#14b8a6",
                  items: [
                    { key: "so-adicao", label: "Só Adição", desc: "3 níveis progressivos de dificuldade" },
                    { key: "so-multiplicacao", label: "Só Multiplicação", desc: "3 níveis: 1×1, 2×1, 3×2 dígitos" },
                    { key: "so-divisao", label: "Só Divisão", desc: "3 níveis com e sem resto" },
                    { key: "so-fracoes", label: "Só Frações", desc: "Soma, subtração e misto" },
                    { key: "so-potencias", label: "Só Potências e Raízes", desc: "Potenciação, raiz e misto" },
                    { key: "revisao-geral", label: "Revisão Geral", desc: "5 blocos — uma operação de cada tipo" },
                    { key: "avaliacao-trimestral", label: "Avaliação Trimestral", desc: "Balanceado para prova completa" },
                  ],
                },
              ] as { group: string; color: string; items: { key: string; label: string; desc: string }[] }[]).map(({ group, color, items }) => (
                <div key={group}>
                  <div className="sticky top-0 bg-[#f8fafc] px-5 py-2" style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <span className="text-[10px] font-bold uppercase tracking-[1.8px]" style={{ color }}>{group}</span>
                  </div>
                  {items.map(({ key, label, desc }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { applyPreset(key, setBlocks, nextId); setSelectedBlockId(null); invalidate(); setPresetModalOpen(false); showToast(`Preset "${label}" aplicado`); }}
                      className="flex w-full cursor-pointer items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-[#f8fafc]"
                      style={{ borderBottom: "1px solid #f8fafc" }}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-black text-white" style={{ background: color }}>
                        {label.match(/\d/)?.[0] ?? label[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-[#0f172a]">{label}</div>
                        <div className="text-[11px] text-[#94a3b8]">{desc}</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-[#f1f5f9] px-5 py-3">
              <button
                type="button"
                onClick={() => { applyPreset("limpar", setBlocks, nextId); setSelectedBlockId(null); invalidate(); setPresetModalOpen(false); showToast("Blocos removidos"); }}
                className="w-full cursor-pointer rounded-lg py-2 text-[12px] font-semibold text-[#94a3b8] transition hover:bg-red-50 hover:text-red-400"
              >
                ↺ Limpar todos os blocos
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-[999] -translate-x-1/2 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]" style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(12px)" }}>
          {toast}
        </div>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK DETAIL PANEL
// ─────────────────────────────────────────────────────────────────────────────

function BlockDetailPanel({ block, onUpdate, onChangeType }: {
  block: Block;
  onUpdate: (id: number, key: keyof BlockConfig, val: unknown) => void;
  onChangeType: (id: number, type: BlockType) => void;
}) {
  const meta = BLOCK_META[block.type];
  const c = block.config;
  const id = block.id;
  const up = (key: keyof BlockConfig, val: unknown) => onUpdate(id, key, val);

  const SegBtn = ({ val, cur, onSel, label }: { val: string; cur: string | undefined; onSel: (v: string) => void; label: string }) => (
    <button onClick={() => onSel(val)} className={`rounded px-2.5 py-1 text-xs font-semibold transition ${cur === val ? "bg-[#ee8748] text-white" : "border border-[#d1d5db] text-[#64748b] hover:text-[#0f172a]"}`}>{label}</button>
  );

  const Toggle = ({ val, onSel, label }: { val: boolean; onSel: (v: boolean) => void; label: string }) => (
    <button type="button" role="switch" aria-checked={val} onClick={() => onSel(!val)} className="flex cursor-pointer items-center gap-2 text-left">
      <div className="relative h-5 w-9 shrink-0 rounded-full transition-all duration-200" style={{ background: val ? "#ee8748" : "#cbd5e1" }}>
        <div className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200" style={{ left: val ? "20px" : "2px" }} />
      </div>
      <span className="text-[13px] text-[#334155]">{label}</span>
    </button>
  );

  const RangeRow = ({ label, value, min, max, onSel }: { label: string; value: number; min: number; max: number; onSel: (v: number) => void }) => (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-[#475569]">{label}</span>
        <span className="rounded bg-[rgba(238,135,72,0.12)] px-1.5 py-0.5 text-[11px] font-semibold text-[#ee8748]">{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onSel(Number(e.target.value))} className="w-full accent-[#ee8748]" />
    </div>
  );

  return (
    <>
      <div className="sticky top-0 border-b border-[#e2e8f0] bg-white px-5 py-3.5">
        <div className="text-[13px] font-bold text-[#0f172a]">{meta.name}</div>
        <div className="mt-0.5 text-[11px] text-[#94a3b8]">#{block.id} · {block.active ? <span className="text-emerald-500">Ativo</span> : <span className="text-[#94a3b8]">Inativo</span>}</div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-20 ">

        {/* Type selector */}
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[1.3px] text-[#94a3b8]">Tipo de Exercício</div>
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[#475569]">Categoria</label>
          <select className="w-full rounded-md border border-[#d1d5db] bg-white px-2.5 py-1.5 text-[13px] text-[#0f172a] outline-none focus:border-[#ee8748]" value={block.type} onChange={(e) => onChangeType(id, e.target.value as BlockType)}>
            {Object.entries(BLOCK_META).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
        </div>

        {/* Quantity */}
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[1.3px] text-[#94a3b8]">Quantidade</div>
        <RangeRow label="Exercícios" value={c.quantidade} min={1} max={40} onSel={(v) => up("quantidade", v)} />

        {/* Type-specific params */}
        <div className="my-3 h-px bg-[#e2e8f0]" />
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[1.3px] text-[#94a3b8]">Parâmetros</div>

        {block.type === "aritmetica" && (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#475569]">Operação</label>
              <select className="w-full rounded-md border border-[#d1d5db] bg-white px-2.5 py-1.5 text-[13px] text-[#0f172a] outline-none focus:border-[#ee8748]" value={c.operacao} onChange={(e) => up("operacao", e.target.value)}>
                <option value="adicao">Adição</option>
                <option value="subtracao">Subtração</option>
                <option value="multiplicacao">Multiplicação</option>
                <option value="divisao">Divisão</option>
              </select>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <RangeRow label="Dígitos 1" value={c.digitos1 ?? 3} min={1} max={6} onSel={(v) => up("digitos1", v)} />
              <RangeRow label="Dígitos 2" value={c.digitos2 ?? 3} min={1} max={6} onSel={(v) => up("digitos2", v)} />
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#475569]">Formato</label>
              <div className="flex gap-1">
                <SegBtn val="armada" cur={c.formato} onSel={(v) => up("formato", v)} label="Armada" />
                <SegBtn val="linear" cur={c.formato} onSel={(v) => up("formato", v)} label="Linear" />
              </div>
            </div>
            {c.operacao === "divisao" && (
              <div className="mb-3">
                <Toggle val={!!c.permitirResto} onSel={(v) => up("permitirResto", v)} label="Permitir resto" />
              </div>
            )}
          </>
        )}

        {block.type === "fracoes" && (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-white/70">Operação</label>
              <div className="flex gap-1">
                <SegBtn val="soma" cur={c.operacao} onSel={(v) => up("operacao", v)} label="Soma" />
                <SegBtn val="subtracao" cur={c.operacao} onSel={(v) => up("operacao", v)} label="Subtração" />
                <SegBtn val="misto" cur={c.operacao} onSel={(v) => up("operacao", v)} label="Misto" />
              </div>
            </div>
            <RangeRow label="Denominador máx." value={c.denomMax ?? 10} min={2} max={20} onSel={(v) => up("denomMax", v)} />
            <div className="space-y-2">
              <Toggle val={c.semprePropria !== false} onSel={(v) => up("semprePropria", v)} label="Apenas frações próprias" />
              <Toggle val={!!c.denominadorComum} onSel={(v) => up("denominadorComum", v)} label="Mesmo denominador" />
              <Toggle val={c.resultadoPositivo !== false} onSel={(v) => up("resultadoPositivo", v)} label="Resultado sempre positivo" />
            </div>
          </>
        )}

        {block.type === "equacoes" && (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#475569]">Tipo de Equação</label>
              <div className="grid grid-cols-2 gap-1">
                {["misto", "ax+b=c", "ax-b=c", "x/a+b=c"].map((t) => (
                  <button key={t} onClick={() => up("tipo", t)} className={`rounded py-1 font-mono text-xs font-semibold transition ${c.tipo === t ? "bg-[#ee8748] text-white" : "border border-[#d1d5db] text-[#64748b] hover:text-[#0f172a]"}`}>{t}</button>
                ))}
              </div>
            </div>
            <RangeRow label="Coeficiente máx." value={c.coefMax ?? 9} min={2} max={20} onSel={(v) => up("coefMax", v)} />
            <RangeRow label="Resposta máx." value={c.respMax ?? 20} min={5} max={100} onSel={(v) => up("respMax", v)} />
          </>
        )}

        {block.type === "potenciacao" && (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#475569]">Tipo</label>
              <div className="flex gap-1">
                <SegBtn val="misto" cur={c.tipo} onSel={(v) => up("tipo", v)} label="Misto" />
                <SegBtn val="potencia" cur={c.tipo} onSel={(v) => up("tipo", v)} label="Potência" />
                <SegBtn val="raiz" cur={c.tipo} onSel={(v) => up("tipo", v)} label="Raiz" />
              </div>
            </div>
            <RangeRow label="Base máx." value={c.baseMax ?? 12} min={2} max={20} onSel={(v) => up("baseMax", v)} />
            <RangeRow label="Expoente máx." value={c.expMax ?? 3} min={2} max={6} onSel={(v) => up("expMax", v)} />
          </>
        )}

        {block.type === "expressoes" && (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#475569]">Complexidade</label>
              <div className="flex gap-1">
                <SegBtn val="simples" cur={c.complexidade} onSel={(v) => up("complexidade", v)} label="Simples" />
                <SegBtn val="media" cur={c.complexidade} onSel={(v) => up("complexidade", v)} label="Média" />
                <SegBtn val="avancada" cur={c.complexidade} onSel={(v) => up("complexidade", v)} label="Avançada" />
              </div>
            </div>
            <RangeRow label="Nº de termos" value={c.termos ?? 4} min={2} max={8} onSel={(v) => up("termos", v)} />
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#475569]">Operações</label>
              <div className="space-y-1.5">
                {[["adicao", "Adição"], ["subtracao", "Subtração"], ["multiplicacao", "Multiplicação"], ["divisao", "Divisão"]].map(([op, label]) => {
                  const ops = c.operacoes ?? [];
                  return (
                    <label key={op} className="flex cursor-pointer items-center gap-2">
                      <input type="checkbox" className="accent-[#ee8748]" checked={ops.includes(op)} onChange={(e) => {
                        const newOps = e.target.checked ? [...ops, op] : ops.filter((o) => o !== op);
                        up("operacoes", newOps);
                      }} />
                      <span className="text-[13px] text-[#334155]">{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#475569]">Agrupamento</label>
              <div className="flex flex-wrap gap-1">
                <button onClick={() => { up("usarParenteses", false); up("nivelAgrupamento", 0); }} className={`rounded px-2.5 py-1 text-xs font-semibold transition ${!c.usarParenteses ? "bg-[#ee8748] text-white" : "border border-white/15 text-white/60 hover:text-white"}`}>Nenhum</button>
                <button onClick={() => { up("usarParenteses", true); up("nivelAgrupamento", 1); }} className={`rounded px-2.5 py-1 text-xs font-semibold transition ${c.usarParenteses && (c.nivelAgrupamento ?? 1) === 1 ? "bg-[#ee8748] text-white" : "border border-white/15 text-white/60 hover:text-white"}`}>( )</button>
                <button onClick={() => { up("usarParenteses", true); up("nivelAgrupamento", 2); }} className={`rounded px-2.5 py-1 text-xs font-semibold transition ${c.usarParenteses && c.nivelAgrupamento === 2 ? "bg-[#ee8748] text-white" : "border border-white/15 text-white/60 hover:text-white"}`}>[ ]</button>
                <button onClick={() => { up("usarParenteses", true); up("nivelAgrupamento", 3); }} className={`rounded px-2.5 py-1 text-xs font-semibold transition ${c.usarParenteses && c.nivelAgrupamento === 3 ? "bg-[#ee8748] text-white" : "border border-white/15 text-white/60 hover:text-white"}`}>{"{ }"}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
