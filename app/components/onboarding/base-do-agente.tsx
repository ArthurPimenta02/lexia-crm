"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, Database, Eye, Loader2 } from "lucide-react";

import type { Previa, ResultadoDaGravacao } from "@/lib/onboarding/exportar-base";
import type { Exportacao, Pendencia } from "@/lib/onboarding/exportar";

/**
 * Etapa 3, só para a equipe da Lexia: a passagem do que a cliente respondeu para a base PRÓPRIA do agente dela.
 * "Prévia" mostra tudo sem gravar; "Gravar" só abre quando a prévia não tem erros e pede confirmação.
 * Tela interna do Arthur: textos em pt-BR direto (sem dicionário).
 */
export function BaseDoAgente({ previa, gravar }: { previa: () => Promise<Previa>; gravar: () => Promise<ResultadoDaGravacao> }) {
  const [resultado, setResultado] = useState<Previa | null>(null);
  const [gravado, setGravado] = useState<ResultadoDaGravacao | null>(null);
  const [aGerar, iniciarPrevia] = useTransition();
  const [aGravar, iniciarGravar] = useTransition();
  const ex = resultado?.exportacao;
  const podeGravar = !!ex && ex.erros.length === 0 && !aGravar && !aGerar;

  return (
    <section className="ds-cartao flex min-w-0 flex-col gap-4 p-5 sm:p-6">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="ds-titulo-3 flex items-center gap-2 text-foreground"><Database aria-hidden="true" className="h-4 w-4" />Base do agente</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Passa as respostas confirmadas da entrevista para a base própria desta cliente (serviços, informações, configurações, profissionais e promoções). Só entra o que ela confirmou; nada é apagado na base dela.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="ds-botao ds-botao-secundario min-h-9 px-3 text-[0.8125rem]"
          disabled={aGerar || aGravar}
          onClick={() =>
            iniciarPrevia(async () => {
              setGravado(null);
              setResultado(await previa());
            })
          }
          type="button"
        >
          {aGerar ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Eye aria-hidden="true" className="h-3.5 w-3.5" />}
          Prévia da base do agente
        </button>
        <button
          className="ds-botao ds-botao-primario min-h-9 px-3 text-[0.8125rem]"
          disabled={!podeGravar}
          onClick={() => {
            if (!ex || !window.confirm(`Gravar na base do agente de ${ex.cliente.slug}?\n\n${ex.servicos.length} serviços, ${ex.info.length} informações, ${ex.config.length} configurações, ${ex.profissionais.length} profissionais e ${ex.promocoes.length} promoções.\n\nNada é apagado: o que já existe é atualizado e o que saiu fica desativado.`)) return;
            iniciarGravar(async () => setGravado(await gravar()));
          }}
          title={ex && ex.erros.length ? "Corrija os erros da prévia antes de gravar" : !ex ? "Faça a prévia primeiro" : undefined}
          type="button"
        >
          {aGravar ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Check aria-hidden="true" className="h-3.5 w-3.5" />}
          Gravar na base do agente
        </button>
      </div>

      {resultado && !resultado.ok ? <Aviso tom="perigo">{resultado.erro}</Aviso> : null}
      {gravado ? (
        gravado.ok ? (
          <Aviso tom="acao">
            Gravado.{" "}
            {Object.entries(gravado.tabelas ?? {})
              .map(([t, c]) => `${t}: ${c.criadas} novas, ${c.atualizadas} atualizadas${c.desativadas ? `, ${c.desativadas} desativadas` : ""}`)
              .join(" · ")}
          </Aviso>
        ) : (
          <Aviso tom="perigo">{gravado.erro}</Aviso>
        )
      ) : null}
      {gravado?.ok && gravado.avisos?.length ? <Lista titulo="Avisos da gravação" itens={gravado.avisos} tom="alerta" /> : null}

      {ex ? <Resumo ex={ex} /> : null}
    </section>
  );
}

// Classes escritas por inteiro (o Tailwind não vê classes montadas com variáveis).
const COR = {
  perigo: "text-[var(--ds-perigo)] bg-[color-mix(in_oklab,var(--ds-perigo)_10%,transparent)]",
  acao: "text-[var(--ds-acao)] bg-[color-mix(in_oklab,var(--ds-acao)_10%,transparent)]",
  alerta: "text-[var(--ds-alerta)] bg-[color-mix(in_oklab,var(--ds-alerta)_10%,transparent)]",
};
const TEXTO = { perigo: "text-[var(--ds-perigo)]", alerta: "text-[var(--ds-alerta)]" };

function Aviso({ tom, children }: { tom: "perigo" | "acao" | "alerta"; children: React.ReactNode }) {
  return (
    <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${COR[tom]}`} role={tom === "perigo" ? "alert" : undefined}>
      {tom === "acao" ? <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

function Lista({ titulo, itens, tom }: { titulo: string; itens: string[]; tom: "perigo" | "alerta" }) {
  return (
    <div className="min-w-0">
      <p className={`text-sm font-semibold ${TEXTO[tom]}`}>{titulo}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-[0.8125rem] leading-relaxed text-foreground">
        {itens.map((i, n) => (
          <li className="break-words" key={n}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

const nomePendencia = (p: Pendencia) => `${p.item ? `${p.item} · ` : ""}${p.campo}${p.estado ? ` (${p.estado})` : ""}`;

function Dobra({ titulo, children, aberta = false }: { titulo: string; children: React.ReactNode; aberta?: boolean }) {
  return (
    <details className="min-w-0 border-t border-[var(--ds-linha)] pt-3" open={aberta}>
      <summary className="cursor-pointer text-sm font-semibold text-foreground">{titulo}</summary>
      <div className="mt-2 min-w-0 overflow-x-auto">{children}</div>
    </details>
  );
}

function Resumo({ ex }: { ex: Exportacao }) {
  const nomeDoServico = new Map(ex.servicos.map((s) => [s.origem_item_id, s.nome]));
  const td = "border-b border-[var(--ds-linha)] px-2 py-1.5 align-top";
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          [ex.tabelas.servicos, ex.servicos.length],
          [ex.tabelas.info, ex.info.length],
          [ex.tabelas.config, ex.config.length],
          [ex.tabelas.profissionais, ex.profissionais.length],
          [ex.tabelas.promocoes, ex.promocoes.length],
        ].map(([t, n]) => (
          <div className="ds-bloco min-w-0 px-3 py-2" key={t}>
            <p className="text-2xl font-semibold tabular-nums text-foreground">{n}</p>
            <p className="truncate text-[0.75rem] text-muted-foreground">{t}</p>
          </div>
        ))}
      </div>
      <p className="text-[0.8125rem] text-muted-foreground">
        {ex.contagem.resolvidas} respostas confirmadas · {ex.contagem.comDestino} com destino · {ex.semDestino.length} sem destino · {ex.contagem.rascunho} rascunhos não confirmados (não entram) · {ex.pendencias.length} puladas/vagas · {ex.foraDeUso.length} que já não se aplicam · IA: {ex.ia.usada ? (ex.ia.erro ? "falhou" : "usada") : "não usada"}
      </p>

      {ex.erros.length ? <Lista itens={ex.erros} titulo={`Erros (impedem gravar): ${ex.erros.length}`} tom="perigo" /> : <Aviso tom="acao">Sem erros: pode gravar.</Aviso>}
      {ex.semDestino.length ? <Lista itens={ex.semDestino.map(nomePendencia)} titulo="Respostas sem destino na base" tom="perigo" /> : null}
      {ex.faltamObrigatorios.length ? (
        <Dobra titulo={`Obrigatórios ainda por resolver na entrevista (${ex.faltamObrigatorios.length})`}>
          <ul className="list-disc pl-5 text-[0.8125rem] leading-relaxed">{ex.faltamObrigatorios.map((p, n) => <li key={n}>{nomePendencia(p)}</li>)}</ul>
        </Dobra>
      ) : null}
      {ex.avisos.length ? <Lista itens={ex.avisos} titulo="Avisos" tom="alerta" /> : null}

      <Dobra aberta titulo={`Serviços e o preço como o agente vai dizer (${ex.servicos.length})`}>
        <table className="w-full min-w-[40rem] text-left text-[0.8125rem]">
          <thead className="text-muted-foreground">
            <tr><th className={td}>Serviço</th><th className={td}>Preço falado</th><th className={td}>Duração</th><th className={td}>Consulta antes</th><th className={td}>Categoria</th></tr>
          </thead>
          <tbody>
            {ex.servicos.map((s) => (
              <tr key={s.origem_item_id}>
                <td className={td}>{s.nome}</td>
                <td className={td}>{ex.precoFalado[s.origem_item_id]}</td>
                <td className={`${td} tabular-nums`}>{s.duracao_min ? `${s.duracao_min} min` : "—"}</td>
                <td className={td}>{s.requer_avaliacao ? "sim" : "não"}</td>
                <td className={td}>{s.categoria ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Dobra>
      <Dobra titulo={`Promoções (${ex.promocoes.length})`}>
        <table className="w-full min-w-[40rem] text-left text-[0.8125rem]">
          <thead className="text-muted-foreground">
            <tr><th className={td}>Promoção</th><th className={td}>Preço</th><th className={td}>Para quem</th><th className={td}>Até</th><th className={td}>Serviços</th><th className={td}>Ativa</th></tr>
          </thead>
          <tbody>
            {ex.promocoes.map((p) => (
              <tr key={p.origem_item_id}>
                <td className={td}>{p.nome}</td>
                <td className={`${td} tabular-nums`}>{p.preco_promocional !== null ? `US$ ${p.preco_promocional}` : p.desconto_percentual !== null ? `${p.desconto_percentual}%` : "—"}</td>
                <td className={td}>{p.publico}</td>
                <td className={td}>{p.ate_acabar ? "até acabar" : (p.fim ?? "—")}</td>
                <td className={td}>{p.servicos_origem.map((o) => nomeDoServico.get(o)).join(", ") || "nenhum"}</td>
                <td className={td}>{p.ativo ? "sim" : "não"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Dobra>
      {[
        [`Informações (${ex.info.length})`, ex.info],
        [`Configurações (${ex.config.length})`, ex.config],
      ].map(([titulo, linhas]) => (
        <Dobra key={titulo as string} titulo={titulo as string}>
          <table className="w-full min-w-[32rem] text-left text-[0.8125rem]">
            <tbody>
              {(linhas as Exportacao["info"]).map((l) => (
                <tr key={l.chave}><td className={`${td} w-1/3 font-medium`}>{l.chave}</td><td className={`${td} whitespace-pre-wrap break-words`}>{l.valor}</td></tr>
              ))}
            </tbody>
          </table>
        </Dobra>
      ))}
      <Dobra titulo={`Profissionais (${ex.profissionais.length})`}>
        <ul className="list-disc pl-5 text-[0.8125rem] leading-relaxed">
          {ex.profissionais.map((p) => <li key={p.origem_item_id}>{p.nome} — {p.servicos.length} serviços{p.especialidade ? ` · ${p.especialidade}` : ""}</li>)}
        </ul>
      </Dobra>
    </div>
  );
}
