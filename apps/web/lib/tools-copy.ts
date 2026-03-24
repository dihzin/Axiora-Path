/**
 * tools-copy.ts — Sanitização de copy para o Axiora Tools.
 *
 * O Axiora Tools suporta EXCLUSIVAMENTE Matemática neste momento.
 * Qualquer referência a outras disciplinas quebra a confiança do usuário
 * e reduz conversão.
 *
 * Use `sanitizeSubjectCopy(text)` em todos os pontos dinâmicos onde o
 * nome de uma matéria pode aparecer (notificações, templates, preview, etc.).
 */

/**
 * Mapa de substituição: termos proibidos → "Matemática".
 * Inclui variações com/sem acento, maiúsculas/minúsculas e
 * formas parciais comuns em strings concatenadas.
 */
const SUBJECT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/portugu[eê]s/gi, "Matemática"],
  [/ci[eê]ncias?/gi, "Matemática"],
  [/hist[oó]ria/gi, "Matemática"],
  [/geografia/gi, "Matemática"],
  [/f[ií]sica/gi, "Matemática"],
  [/qu[ií]mica/gi, "Matemática"],
  [/biologia/gi, "Matemática"],
  [/ingl[eê]s/gi, "Matemática"],
  [/espanhol/gi, "Matemática"],
  [/filosofia/gi, "Matemática"],
  [/sociologia/gi, "Matemática"],
  [/artes?/gi, "Matemática"],
  [/educa[cç][aã]o\s+f[ií]sica/gi, "Matemática"],
  [/literatura/gi, "Matemática"],
  [/gram[aá]tica/gi, "Matemática"],
];

/**
 * Substitui nomes de disciplinas não matemáticas por "Matemática".
 *
 * @example
 * sanitizeSubjectCopy("Mariana gerou Português")
 * // → "Mariana gerou Matemática"
 *
 * sanitizeSubjectCopy("Mariana acabou de gerar — Português · 7 anos")
 * // → "Mariana acabou de gerar — Matemática · 7 anos"
 *
 * sanitizeSubjectCopy("Lista de Ciências · Fotossíntese")
 * // → "Lista de Matemática · Fotossíntese"
 *
 * sanitizeSubjectCopy("Matemática · Frações")
 * // → "Matemática · Frações"  (sem alteração)
 */
export function sanitizeSubjectCopy(text: string): string {
  let result = text;
  for (const [pattern, replacement] of SUBJECT_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Verifica se um texto contém referência a disciplina não matemática.
 * Útil para logging ou validação em tempo de desenvolvimento.
 */
export function containsNonMathSubject(text: string): boolean {
  return SUBJECT_REPLACEMENTS.some(([pattern]) => {
    pattern.lastIndex = 0; // reset regexp stateful index
    return pattern.test(text);
  });
}
