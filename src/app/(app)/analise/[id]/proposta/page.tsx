"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ContractSimulation from "@/components/ContractSimulation";
import { brl, dateBR, getJson, postJson } from "@/lib/fetcher";
import type { AgencyService, AgencySettings, HistoryGrid, HistorySnapshot, PlaceAnalysis } from "@/lib/types";

type Line = AgencyService & { selected: boolean };

export default function PropostaPage() {
  const { id } = useParams<{ id: string }>();
  const [a, setA] = useState<PlaceAnalysis | null>(null);
  const [settings, setSettings] = useState<AgencySettings | null>(null);
  const [grid, setGrid] = useState<HistoryGrid | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [contact, setContact] = useState("");
  // Serviços, tempos de contrato e observações começam com o padrão salvo e podem ser ajustados nesta proposta.
  const [terms, setTerms] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getJson<PlaceAnalysis>(`/api/place/${id}`),
      getJson<{ settings: AgencySettings }>("/api/settings"),
      getJson<{ snapshots: HistorySnapshot[]; grids: HistoryGrid[] }>(`/api/history/${id}`),
    ])
      .then(([analysis, s, h]) => {
        setA(analysis);
        setSettings(s.settings);
        setLines(s.settings.services.map((sv) => ({ ...sv, selected: true })));
        setTerms(s.settings.contractTerms);
        setNotes(s.settings.proposalNotes);
        setGrid(h.grids[h.grids.length - 1] ?? null);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const sumOf = (type: AgencyService["type"]) =>
    lines.filter((l) => l.selected && l.type === type).reduce((s, l) => s + l.price, 0);
  const fixedTotal = useMemo(() => sumOf("fixo"), [lines]); // eslint-disable-line react-hooks/exhaustive-deps
  const recurringTotal = useMemo(() => sumOf("recorrente"), [lines]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="error">{error}</div>;
  if (!a || !settings) return <p className="small">Carregando...</p>;

  const { place, score, checklist } = a;
  const pending = checklist.filter((c) => c.status !== "ok").sort((x, y) => y.max - y.points - (x.max - x.points));
  const potential = Math.min(100, score + pending.reduce((s, c) => s + (c.max - c.points), 0));
  const agency = settings.agencyName || "Sua agência";
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  /** Grava os serviços, os tempos de contrato e as observações desta tela como padrão das próximas propostas. */
  async function saveAsDefault() {
    if (!settings) return;
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      const body: AgencySettings = {
        ...settings,
        services: lines.map(({ selected: _selected, ...s }) => s),
        contractTerms: terms,
        proposalNotes: notes,
      };
      const d = await postJson<{ settings: AgencySettings }>("/api/settings", body, "PUT");
      setSettings(d.settings);
      setMsg("Salvo como padrão: as próximas propostas já abrem assim.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="no-print">
        <p>
          <Link href={`/analise/${id}`}>← Voltar para a análise</Link>
        </p>
        <h1>Proposta comercial</h1>
        <p className="sub">
          Ajuste os serviços e imprima em PDF. Os dados da agência (nome, contato) vêm de{" "}
          <Link href="/configuracoes">Configurações</Link>.
        </p>
        <section className="card">
          <label className="field">
            A/C (nome do contato no cliente)
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Ex.: João Silva" />
          </label>
        </section>

        <section className="card">
          <h2>Serviços da proposta</h2>
          <p className="sub">
            Marque os que entram nesta proposta e ajuste à vontade. Para usar a lista em todas as propostas, clique em
            “Salvar como padrão”.
          </p>

          {(["fixo", "recorrente"] as const).map((type) => (
            <div key={type} className="service-group">
              <h3>{type === "fixo" ? "Fixo (pago uma vez)" : "Recorrente (mensalidade)"}</h3>
              {lines.map((l, i) =>
                l.type !== type ? null : (
                  <div key={i} className="row" style={{ marginBottom: 12, alignItems: "start" }}>
                    <label className="field" style={{ width: 70, alignItems: "center" }}>
                      Incluir
                      <input
                        type="checkbox"
                        checked={l.selected}
                        onChange={(e) => setLine(i, { selected: e.target.checked })}
                        style={{ width: 18, height: 18, marginTop: 10 }}
                      />
                    </label>
                    <label className="field" style={{ flex: 1, minWidth: 180 }}>
                      Serviço
                      <input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} />
                    </label>
                    <label className="field" style={{ flex: 2, minWidth: 220 }}>
                      Descrição
                      <input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                    </label>
                    <label className="field" style={{ width: 140 }}>
                      {type === "fixo" ? "Valor (R$)" : "Valor/mês (R$)"}
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.price}
                        onChange={(e) => setLine(i, { price: Number(e.target.value) })}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-sm btn-danger"
                      style={{ marginTop: 22 }}
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    >
                      Remover
                    </button>
                  </div>
                ),
              )}
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setLines([...lines, { name: "", description: "", price: 0, type, selected: true }])}
              >
                + Adicionar serviço {type === "fixo" ? "fixo" : "recorrente"}
              </button>
            </div>
          ))}

          <label className="field" style={{ marginTop: 18 }}>
            Observações da proposta (condições, validade, prazos)
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="row" style={{ marginTop: 14, alignItems: "center" }}>
            <button type="button" onClick={() => window.print()}>
              Imprimir / salvar PDF
            </button>
            <button type="button" className="btn-ghost" onClick={saveAsDefault} disabled={saving}>
              {saving ? "Salvando..." : "Salvar como padrão"}
            </button>
            {msg && <span className="small">{msg}</span>}
          </div>
          <p className="small" style={{ marginBottom: 0 }}>
            Os tempos de contrato (3, 6, 12 meses…) você ajusta na simulação, logo abaixo, na seção 3.
          </p>
        </section>
      </div>

      <article className="card proposal">
        <header className="proposal-head">
          <div>
            <div className="small">Proposta de otimização do Perfil da Empresa no Google</div>
            <h1 style={{ margin: "4px 0" }}>{place.name}</h1>
            <div className="small">
              {contact && <>A/C {contact} · </>}
              {dateBR(new Date().toISOString())}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <strong>{agency}</strong>
            <div className="small">{[settings.responsible, settings.phone, settings.email].filter(Boolean).join(" · ")}</div>
            {settings.website && <div className="small">{settings.website}</div>}
          </div>
        </header>

        <h2>1. Diagnóstico atual</h2>
        <div className="stats">
          <div className="stat">
            <b style={{ color: score >= 80 ? "var(--ok)" : score >= 50 ? "var(--warn)" : "var(--bad)" }}>{score}/100</b>
            <span>nota de saúde do perfil hoje</span>
          </div>
          <div className="stat">
            <b style={{ color: "var(--ok)" }}>{potential}/100</b>
            <span>nota possível após a otimização</span>
          </div>
          <div className="stat">
            <b>{place.rating?.toFixed(1) ?? "—"} ★</b>
            <span>{place.userRatingCount} avaliações</span>
          </div>
          {grid && (
            <div className="stat">
              <b>{grid.top3Share}%</b>
              <span>
                da região no top 3 para “{grid.keyword}”
              </span>
            </div>
          )}
        </div>
        {grid && grid.top3Share < 50 && (
          <p>
            Hoje a empresa aparece entre os 3 primeiros do Google Maps em apenas <strong>{grid.top3Share}%</strong> da região
            analisada para a busca “{grid.keyword}”. As outras posições ficam com concorrentes — e é nos 3 primeiros que
            acontece a maior parte dos cliques e ligações.
          </p>
        )}

        <h2>2. Pontos de melhoria encontrados</h2>
        {pending.length === 0 ? (
          <p>O perfil está completo nos itens verificáveis publicamente. O foco passa a ser manutenção e crescimento.</p>
        ) : (
          <table>
            <tbody>
              {pending.map((c) => (
                <tr key={c.id}>
                  <td style={{ width: 90 }}>
                    <span className={`pill ${c.status}`}>{c.status === "parcial" ? "Parcial" : "Falta"}</span>
                  </td>
                  <td>
                    <strong>{c.label}</strong>
                    <div className="small">{c.tip}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>3. Investimento</h2>
        {(["fixo", "recorrente"] as const).map((type) => {
          const group = lines.filter((l) => l.selected && l.type === type);
          if (!group.length) return null;
          return (
            <table key={type} style={{ marginBottom: 14 }}>
              <thead>
                <tr>
                  <th>{type === "fixo" ? "Serviços fixos (pagos uma vez)" : "Serviços recorrentes (mensalidade)"}</th>
                  <th className="num">{type === "fixo" ? "Valor" : "Valor/mês"}</th>
                </tr>
              </thead>
              <tbody>
                {group.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <strong>{l.name}</strong>
                      <div className="small">{l.description}</div>
                    </td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      {l.price > 0 ? brl(l.price) : "a combinar"}
                    </td>
                  </tr>
                ))}
                <tr className="me">
                  <td>{type === "fixo" ? "Total fixo" : "Total recorrente (por mês)"}</td>
                  <td className="num">{brl(type === "fixo" ? fixedTotal : recurringTotal)}</td>
                </tr>
              </tbody>
            </table>
          );
        })}
        <h3 style={{ marginTop: 18 }}>Simulação por tempo de contrato</h3>
        <ContractSimulation fixedTotal={fixedTotal} recurringTotal={recurringTotal} terms={terms} onTermsChange={setTerms} />

        {notes.trim() && (
          <>
            <h2>4. Condições</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{notes}</p>
          </>
        )}
      </article>

      <style>{`
        .proposal h2 { margin-top: 22px; font-size: 17px; }
        .proposal-head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;
          border-bottom: 3px solid var(--accent); padding-bottom: 14px; margin-bottom: 8px; }
      `}</style>
    </>
  );
}
