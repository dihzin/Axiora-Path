"use client";

import { useEffect, useMemo, useState } from "react";

import {
  createAxionStudioPolicy,
  createAxionStudioTemplate,
  getApiErrorMessage,
  getAxionStudioAudit,
  getAxionStudioMe,
  getAxionStudioPolicies,
  getAxionStudioPolicyVersions,
  getAxionStudioPreviewUsers,
  getAxionStudioTemplates,
  getAxionStudioTemplateVersions,
  patchAxionStudioPolicy,
  patchAxionStudioTemplate,
  previewAxionStudio,
  restoreAxionStudioPolicy,
  restoreAxionStudioTemplate,
  toggleAxionStudioPolicy,
  toggleAxionStudioTemplate,
  logout,
  type AxionStudioAudit,
  type AxionStudioMe,
  type AxionStudioPolicy,
  type AxionStudioPreviewResponse,
  type AxionStudioPreviewUser,
  type AxionStudioTemplate,
  type AxionStudioVersion,
} from "@/lib/api/client";
import { clearTenantSlug, clearTokens } from "@/lib/api/session";

type Tab = "policies" | "messages" | "preview" | "audit";

const CONTEXTS = ["child_tab", "before_learning", "after_learning", "games_tab", "wallet_tab"] as const;
const TONES = ["CALM", "ENCOURAGE", "CHALLENGE", "CELEBRATE", "SUPPORT"] as const;

const CONTEXT_LABELS: Record<string, string> = {
  child_tab: "Aba da criança",
  before_learning: "Antes de aprender",
  after_learning: "Após aprender",
  games_tab: "Aba de jogos",
  wallet_tab: "Aba da carteira",
};

const TONE_LABELS: Record<string, string> = {
  CALM: "Calmo",
  ENCOURAGE: "Incentivo",
  CHALLENGE: "Desafio",
  CELEBRATE: "Celebração",
  SUPPORT: "Apoio",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  RULE: "Regra",
  TEMPLATE: "Template",
};

const ACTION_LABELS: Record<string, string> = {
  RULE_CREATE: "Criação de regra",
  RULE_UPDATE: "Atualização de regra",
  RULE_TOGGLE: "Ativar/Desativar regra",
  TEMPLATE_CREATE: "Criação de template",
  TEMPLATE_UPDATE: "Atualização de template",
  TEMPLATE_TOGGLE: "Ativar/Desativar template",
  RESTORE_VERSION: "Restauração de versão",
};

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function safeParseJson(text: string, fallback: unknown): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function contextLabel(value: string): string {
  return CONTEXT_LABELS[value] ?? value;
}

function toneLabel(value: string): string {
  return TONE_LABELS[value] ?? value;
}

export default function AxionStudioPage() {
  const [tab, setTab] = useState<Tab>("policies");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [me, setMe] = useState<AxionStudioMe | null>(null);
  const [policies, setPolicies] = useState<AxionStudioPolicy[]>([]);
  const [templates, setTemplates] = useState<AxionStudioTemplate[]>([]);
  const [audit, setAudit] = useState<AxionStudioAudit[]>([]);
  const [users, setUsers] = useState<AxionStudioPreviewUser[]>([]);

  const [policySearch, setPolicySearch] = useState("");
  const [policyContext, setPolicyContext] = useState("");
  const [policyDraft, setPolicyDraft] = useState<{
    id: number | null;
    name: string;
    context: string;
    conditionJson: string;
    actionsJson: string;
    priority: number;
    enabled: boolean;
  }>({
    id: null,
    name: "",
    context: "before_learning",
    conditionJson: "{}",
    actionsJson: "[]",
    priority: 100,
    enabled: true,
  });

  const [templateDraft, setTemplateDraft] = useState<{
    id: number | null;
    context: string;
    tone: string;
    tagsCsv: string;
    conditionsJson: string;
    text: string;
    weight: number;
    enabled: boolean;
  }>({
    id: null,
    context: "child_tab",
    tone: "ENCOURAGE",
    tagsCsv: "axion,studio",
    conditionsJson: "{}",
    text: "",
    weight: 1,
    enabled: true,
  });

  const [previewUserId, setPreviewUserId] = useState<number | null>(null);
  const [previewContext, setPreviewContext] = useState("child_tab");
  const [previewResult, setPreviewResult] = useState<AxionStudioPreviewResponse | null>(null);
  const [versions, setVersions] = useState<AxionStudioVersion[]>([]);
  const [versionsTitle, setVersionsTitle] = useState("");
  const [versionsTarget, setVersionsTarget] = useState<{ type: "RULE" | "TEMPLATE"; id: number } | null>(null);

  const templateCharCount = useMemo(() => templateDraft.text.trim().length, [templateDraft.text]);

  const loadBase = async () => {
    setLoading(true);
    setError(null);
    try {
      const [meData, policyRows, templateRows, auditRows, userRows] = await Promise.all([
        getAxionStudioMe(),
        getAxionStudioPolicies({ context: policyContext || undefined, q: policySearch || undefined }),
        getAxionStudioTemplates(),
        getAxionStudioAudit(),
        getAxionStudioPreviewUsers(),
      ]);
      setMe(meData);
      setPolicies(policyRows);
      setTemplates(templateRows);
      setAudit(auditRows);
      setUsers(userRows);
      if (!previewUserId && userRows.length > 0) setPreviewUserId(userRows[0].userId);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar o Axion Studio."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
    } catch {
      // mesmo em erro, forçamos encerramento local da sessão
    } finally {
      clearTokens();
      clearTenantSlug();
      window.location.assign("/login");
    }
  };

  const savePolicy = async (previewAfterSave: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        name: policyDraft.name.trim(),
        context: policyDraft.context,
        condition: safeParseJson(policyDraft.conditionJson, {}) as Record<string, unknown>,
        actions: safeParseJson(policyDraft.actionsJson, []) as Array<Record<string, unknown>>,
        priority: policyDraft.priority,
        enabled: policyDraft.enabled,
      };
      if (policyDraft.id) {
        await patchAxionStudioPolicy(policyDraft.id, payload);
      } else {
        await createAxionStudioPolicy(payload);
      }
      await loadBase();
      if (previewAfterSave && previewUserId) {
        const result = await previewAxionStudio({ userId: previewUserId, context: previewContext });
        setPreviewResult(result);
        setTab("preview");
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao salvar regra."));
    } finally {
      setLoading(false);
    }
  };

  const saveTemplate = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        context: templateDraft.context,
        tone: templateDraft.tone,
        tags: templateDraft.tagsCsv
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        conditions: safeParseJson(templateDraft.conditionsJson, {}) as Record<string, unknown>,
        text: templateDraft.text.trim(),
        weight: templateDraft.weight,
        enabled: templateDraft.enabled,
      };
      if (templateDraft.id) {
        await patchAxionStudioTemplate(templateDraft.id, payload);
      } else {
        await createAxionStudioTemplate(payload);
      }
      await loadBase();
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao salvar template."));
    } finally {
      setLoading(false);
    }
  };

  const runPreview = async () => {
    if (!previewUserId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await previewAxionStudio({ userId: previewUserId, context: previewContext });
      setPreviewResult(result);
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao executar prévia."));
    } finally {
      setLoading(false);
    }
  };

  const loadPolicyVersions = async (policyId: number) => {
    const rows = await getAxionStudioPolicyVersions(policyId);
    setVersions(rows);
    setVersionsTitle(`Versões da regra #${policyId}`);
    setVersionsTarget({ type: "RULE", id: policyId });
    setTab("audit");
  };

  const loadTemplateVersions = async (templateId: number) => {
    const rows = await getAxionStudioTemplateVersions(templateId);
    setVersions(rows);
    setVersionsTitle(`Versões do template #${templateId}`);
    setVersionsTarget({ type: "TEMPLATE", id: templateId });
    setTab("audit");
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1500px] px-4 py-6 md:px-8 xl:px-12">
      <div className="rounded-3xl border border-[#BFD3EE] bg-white p-5 shadow-[0_14px_40px_rgba(16,48,90,0.08)] md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black text-[#17345E]">Axion Studio</h1>
            <p className="mt-1 text-sm font-semibold text-[#5A7AA4]">Gerencie políticas e mensagens do Axion sem deploy de código.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-2xl border border-[#C9D8EF] bg-[#F6FAFF] px-4 py-2 text-right">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#6A86AA]">Sessão</p>
              <p className="text-sm font-black text-[#1E3B65]">{me?.name ?? "Carregando..."}</p>
              <p className="text-xs font-semibold text-[#5F7EA6]">{me?.email ?? ""}</p>
            </div>
            <button
              className="rounded-2xl border border-[#F5B2A9] bg-[#FFF3F1] px-4 py-3 text-sm font-black text-[#B8574B] transition hover:bg-[#FFE7E2]"
              disabled={loading}
              onClick={() => void handleLogout()}
              type="button"
            >
              Sair
            </button>
          </div>
        </div>

        {loading ? <p className="mt-3 text-xs font-bold text-[#5F80AA]">Atualizando dados...</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { id: "policies", label: "Políticas" },
            { id: "messages", label: "Mensagens" },
            { id: "preview", label: "Prévia" },
            { id: "audit", label: "Auditoria" },
          ].map((item) => (
            <button
              key={item.id}
              className={`rounded-2xl px-4 py-2 text-sm font-extrabold transition ${
                tab === item.id ? "bg-[#24B6A9] text-white shadow-[0_5px_0_rgba(13,122,114,0.35)]" : "border border-[#C9D8EF] bg-white text-[#34557F]"
              }`}
              onClick={() => setTab(item.id as Tab)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-[#F4C5C2] bg-[#FFF2F1] px-3 py-2 text-sm font-semibold text-[#B54C47]">{error}</div> : null}

        {tab === "policies" ? (
          <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-[#C9D8EF] p-3">
              <div className="mb-3 flex flex-wrap gap-2">
                <input className="min-w-[220px] flex-1 rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setPolicySearch(e.target.value)} placeholder="Buscar regra..." value={policySearch} />
                <select className="min-w-[200px] rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setPolicyContext(e.target.value)} value={policyContext}>
                  <option value="">Todos os contextos</option>
                  {CONTEXTS.map((ctx) => (
                    <option key={ctx} value={ctx}>
                      {contextLabel(ctx)}
                    </option>
                  ))}
                </select>
                <button className="rounded-xl bg-[#2ABBA3] px-3 py-2 text-sm font-bold text-white" onClick={() => void loadBase()} type="button">
                  Filtrar
                </button>
              </div>
              <div className="max-h-[560px] overflow-auto rounded-xl border border-[#D7E2F4]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] text-left text-sm">
                    <thead className="bg-[#F4F8FF] text-[#35567F]">
                      <tr>
                        <th className="px-3 py-2">Nome</th>
                        <th className="px-3 py-2">Contexto</th>
                        <th className="px-3 py-2">Prioridade</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {policies.length === 0 ? (
                        <tr>
                          <td className="px-3 py-6 text-center text-sm font-semibold text-[#6B87AC]" colSpan={5}>
                            Nenhuma regra encontrada com os filtros atuais.
                          </td>
                        </tr>
                      ) : null}
                      {policies.map((p) => (
                        <tr key={p.id} className="border-t border-[#E2EAF8]">
                          <td className="px-3 py-2 font-semibold text-[#223F68]">{p.name}</td>
                          <td className="px-3 py-2">{contextLabel(p.context)}</td>
                          <td className="px-3 py-2">{p.priority}</td>
                          <td className="px-3 py-2">{p.enabled ? "Ativa" : "Inativa"}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              <button
                                className="rounded-lg border border-[#BCD1EE] px-2 py-1 text-xs font-bold"
                                onClick={() =>
                                  setPolicyDraft({
                                    id: p.id,
                                    name: p.name,
                                    context: p.context,
                                    conditionJson: pretty(p.condition),
                                    actionsJson: pretty(p.actions),
                                    priority: p.priority,
                                    enabled: p.enabled,
                                  })
                                }
                                type="button"
                              >
                                Editar
                              </button>
                              <button className="rounded-lg border border-[#BCD1EE] px-2 py-1 text-xs font-bold" onClick={() => void toggleAxionStudioPolicy(p.id).then(loadBase)} type="button">
                                {p.enabled ? "Desativar" : "Ativar"}
                              </button>
                              <button className="rounded-lg border border-[#BCD1EE] px-2 py-1 text-xs font-bold" onClick={() => void loadPolicyVersions(p.id)} type="button">
                                Versões
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[#C9D8EF] p-3 xl:sticky xl:top-4 xl:self-start">
              <h3 className="mb-2 text-sm font-black text-[#1E3B65]">Editor de regra</h3>
              <input className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setPolicyDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Nome" value={policyDraft.name} />
              <select className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setPolicyDraft((d) => ({ ...d, context: e.target.value }))} value={policyDraft.context}>
                {CONTEXTS.map((ctx) => (
                  <option key={ctx} value={ctx}>
                    {contextLabel(ctx)}
                  </option>
                ))}
              </select>
              <textarea className="mb-2 h-28 w-full rounded-xl border border-[#C9D8EF] p-2 text-xs font-mono" onChange={(e) => setPolicyDraft((d) => ({ ...d, conditionJson: e.target.value }))} value={policyDraft.conditionJson} />
              <textarea className="mb-2 h-28 w-full rounded-xl border border-[#C9D8EF] p-2 text-xs font-mono" onChange={(e) => setPolicyDraft((d) => ({ ...d, actionsJson: e.target.value }))} value={policyDraft.actionsJson} />
              <input className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setPolicyDraft((d) => ({ ...d, priority: Number(e.target.value) || 100 }))} type="number" value={policyDraft.priority} />
              <label className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#2B4E79]">
                <input checked={policyDraft.enabled} onChange={(e) => setPolicyDraft((d) => ({ ...d, enabled: e.target.checked }))} type="checkbox" />
                Habilitada
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-xl bg-[#2ABBA3] px-3 py-2 text-sm font-black text-white" disabled={loading} onClick={() => void savePolicy(false)} type="button">
                  Salvar
                </button>
                <button className="rounded-xl bg-[#FF7A45] px-3 py-2 text-sm font-black text-white" disabled={loading} onClick={() => void savePolicy(true)} type="button">
                  Salvar e prévia
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {tab === "messages" ? (
          <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-[#C9D8EF] p-3">
              <div className="max-h-[560px] overflow-auto rounded-xl border border-[#D7E2F4]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[840px] text-left text-sm">
                    <thead className="bg-[#F4F8FF] text-[#35567F]">
                      <tr>
                        <th className="px-3 py-2">Contexto</th>
                        <th className="px-3 py-2">Tom</th>
                        <th className="px-3 py-2">Tags</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Peso</th>
                        <th className="px-3 py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templates.length === 0 ? (
                        <tr>
                          <td className="px-3 py-6 text-center text-sm font-semibold text-[#6B87AC]" colSpan={6}>
                            Nenhum template encontrado.
                          </td>
                        </tr>
                      ) : null}
                      {templates.map((t) => (
                        <tr key={t.id} className="border-t border-[#E2EAF8]">
                          <td className="px-3 py-2">{contextLabel(t.context)}</td>
                          <td className="px-3 py-2">{toneLabel(t.tone)}</td>
                          <td className="px-3 py-2 text-xs">{t.tags.join(", ")}</td>
                          <td className="px-3 py-2">{t.enabled ? "Ativo" : "Inativo"}</td>
                          <td className="px-3 py-2">{t.weight}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              <button
                                className="rounded-lg border border-[#BCD1EE] px-2 py-1 text-xs font-bold"
                                onClick={() =>
                                  setTemplateDraft({
                                    id: t.id,
                                    context: t.context,
                                    tone: t.tone,
                                    tagsCsv: t.tags.join(", "),
                                    conditionsJson: pretty(t.conditions),
                                    text: t.text,
                                    weight: t.weight,
                                    enabled: t.enabled,
                                  })
                                }
                                type="button"
                              >
                                Editar
                              </button>
                              <button className="rounded-lg border border-[#BCD1EE] px-2 py-1 text-xs font-bold" onClick={() => void toggleAxionStudioTemplate(t.id).then(loadBase)} type="button">
                                {t.enabled ? "Desativar" : "Ativar"}
                              </button>
                              <button className="rounded-lg border border-[#BCD1EE] px-2 py-1 text-xs font-bold" onClick={() => void loadTemplateVersions(t.id)} type="button">
                                Versões
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[#C9D8EF] p-3 xl:sticky xl:top-4 xl:self-start">
              <h3 className="mb-2 text-sm font-black text-[#1E3B65]">Editor de template</h3>
              <select className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setTemplateDraft((d) => ({ ...d, context: e.target.value }))} value={templateDraft.context}>
                {CONTEXTS.map((ctx) => (
                  <option key={ctx} value={ctx}>
                    {contextLabel(ctx)}
                  </option>
                ))}
              </select>
              <select className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setTemplateDraft((d) => ({ ...d, tone: e.target.value }))} value={templateDraft.tone}>
                {TONES.map((tone) => (
                  <option key={tone} value={tone}>
                    {toneLabel(tone)}
                  </option>
                ))}
              </select>
              <input className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setTemplateDraft((d) => ({ ...d, tagsCsv: e.target.value }))} placeholder="tags, separadas por vírgula" value={templateDraft.tagsCsv} />
              <textarea className="mb-2 h-24 w-full rounded-xl border border-[#C9D8EF] p-2 text-xs font-mono" onChange={(e) => setTemplateDraft((d) => ({ ...d, conditionsJson: e.target.value }))} value={templateDraft.conditionsJson} />
              <textarea className="mb-1 h-28 w-full rounded-xl border border-[#C9D8EF] p-2 text-sm" onChange={(e) => setTemplateDraft((d) => ({ ...d, text: e.target.value }))} value={templateDraft.text} />
              <div className={`mb-2 text-xs font-semibold ${templateCharCount > 220 ? "text-[#B94A48]" : "text-[#5A7AA4]"}`}>Caracteres: {templateCharCount}/220</div>
              <input className="mb-2 w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setTemplateDraft((d) => ({ ...d, weight: Number(e.target.value) || 1 }))} type="number" value={templateDraft.weight} />
              <label className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#2B4E79]">
                <input checked={templateDraft.enabled} onChange={(e) => setTemplateDraft((d) => ({ ...d, enabled: e.target.checked }))} type="checkbox" />
                Habilitado
              </label>
              <button className="rounded-xl bg-[#2ABBA3] px-3 py-2 text-sm font-black text-white" disabled={loading || templateCharCount > 220} onClick={() => void saveTemplate()} type="button">
                Salvar
              </button>
              <p className="mt-3 text-xs font-semibold text-[#6C88AF]">Placeholders: {"{{name}}, {{skill}}, {{strongSkill}}, {{lesson}}, {{unit}}, {{streak}}, {{coins}}, {{xp}}, {{dueReviews}}, {{energy}}"}</p>
            </div>
          </section>
        ) : null}

        {tab === "preview" ? (
          <section className="mt-5 rounded-2xl border border-[#C9D8EF] p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <select className="min-w-[260px] flex-1 rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setPreviewUserId(Number(e.target.value))} value={previewUserId ?? ""}>
                {users.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.name} (#{u.userId})
                  </option>
                ))}
              </select>
              <select className="min-w-[200px] rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm" onChange={(e) => setPreviewContext(e.target.value)} value={previewContext}>
                {CONTEXTS.map((ctx) => (
                  <option key={ctx} value={ctx}>
                    {contextLabel(ctx)}
                  </option>
                ))}
              </select>
              <button className="rounded-xl bg-[#2ABBA3] px-3 py-2 text-sm font-black text-white" onClick={() => void runPreview()} type="button">
                Executar prévia
              </button>
              <button
                className="rounded-xl border border-[#BCD1EE] px-3 py-2 text-sm font-bold"
                onClick={() => void navigator.clipboard.writeText(pretty(previewResult ?? {}))}
                type="button"
              >
                Copiar JSON
              </button>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="rounded-xl bg-[#F6FAFF] p-3">
                <h4 className="text-sm font-black text-[#20406A]">Saída sugerida</h4>
                <p className="mt-2 text-sm font-semibold text-[#2E4E78]">{previewResult?.message ?? "Sem prévia ainda."}</p>
                <p className="mt-2 text-xs font-bold text-[#6582AA]">Tom: {previewResult?.tone ? toneLabel(previewResult.tone) : "-"}</p>
                <p className="mt-1 text-xs font-bold text-[#6582AA]">CTA: {(previewResult?.cta?.label as string) ?? "-"}</p>
                <p className="mt-1 text-xs font-bold text-[#6582AA]">Regras acionadas: {previewResult?.chosenRuleIds.join(", ") || "-"}</p>
              </div>
              <div className="rounded-xl bg-[#F6FAFF] p-3">
                <h4 className="text-sm font-black text-[#20406A]">Resumo amigável</h4>
                <pre className="mt-2 overflow-auto text-xs text-[#2E4E78]">{pretty({ estado: previewResult?.state, fatos: previewResult?.facts })}</pre>
              </div>
            </div>
          </section>
        ) : null}

        {tab === "audit" ? (
          <section className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="max-h-[560px] overflow-auto rounded-2xl border border-[#C9D8EF] p-3">
              {audit.length === 0 ? <p className="text-sm font-semibold text-[#6B87AC]">Sem eventos de auditoria ainda.</p> : null}
              {audit.map((item) => (
                <div key={item.id} className="mb-2 rounded-xl border border-[#DCE6F7] bg-[#F7FAFF] p-3">
                  <p className="text-xs font-black text-[#24456F]">
                    {ACTION_LABELS[item.action] ?? item.action} • {ENTITY_TYPE_LABELS[item.entityType] ?? item.entityType} #{item.entityId}
                  </p>
                  <p className="text-[11px] font-semibold text-[#6B87AC]">Autor: {item.actorUserId} • {new Date(item.createdAt).toLocaleString("pt-BR")}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-[#C9D8EF] p-3">
              <h3 className="text-sm font-black text-[#1E3B65]">{versionsTitle || "Versões"}</h3>
              <div className="mt-2 max-h-[500px] space-y-2 overflow-auto">
                {versions.map((v) => (
                  <div key={v.id} className="rounded-xl border border-[#DCE6F7] bg-[#F7FAFF] p-2">
                    <p className="text-xs font-black text-[#24456F]">Versão {v.version}</p>
                    <p className="text-[11px] font-semibold text-[#6B87AC]">{new Date(v.createdAt).toLocaleString("pt-BR")}</p>
                    <div className="mt-2 flex gap-2">
                      {versionsTarget?.type === "RULE" ? (
                        <button className="rounded-lg border border-[#BCD1EE] px-2 py-1 text-xs font-bold" onClick={() => void restoreAxionStudioPolicy(versionsTarget.id, v.version).then(loadBase)} type="button">
                          Restaurar
                        </button>
                      ) : versionsTarget?.type === "TEMPLATE" ? (
                        <button className="rounded-lg border border-[#BCD1EE] px-2 py-1 text-xs font-bold" onClick={() => void restoreAxionStudioTemplate(versionsTarget.id, v.version).then(loadBase)} type="button">
                          Restaurar
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
