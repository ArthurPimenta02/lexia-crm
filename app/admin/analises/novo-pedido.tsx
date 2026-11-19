"use client";

import { ScanSearch, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { Segmentado } from "@/app/components/ds";
import { useIdioma } from "@/app/components/idioma";

type Tipo = "geral" | "especifica";
type Periodo = "24h" | "3d" | "7d";

/**
 * Os dois botões de pedir uma análise e a janela de cada um. O pedido vai à
 * rota /api/analises/pedir (só admin), que grava a linha e, se houver token,
 * avisa a rotina na nuvem. A mensagem da rota aparece por baixo dos botões.
 */
export function NovoPedido({
  clienteAtual,
  clientes,
}: {
  clienteAtual: string;
  clientes: { nome: string; slug: string }[];
}) {
  const { t } = useIdioma();
  const router = useRouter();
  const [aberto, setAberto] = useState<Tipo | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tom: "ok" | "erro" } | null>(null);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:items-end">
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
        <button className="ds-botao ds-botao-primario" onClick={() => setAberto("geral")} type="button">
          <Sparkles aria-hidden className="size-4" />
          {t("Nova análise geral")}
        </button>
        <button className="ds-botao ds-botao-secundario" onClick={() => setAberto("especifica")} type="button">
          <ScanSearch aria-hidden className="size-4" />
          {t("Análise específica")}
        </button>
      </div>
      {aviso ? (
        <p
          className={`text-sm font-medium ${aviso.tom === "erro" ? "text-[var(--ds-perigo)]" : "text-[var(--ds-acao-forte)]"}`}
          role="status"
        >
          {aviso.texto}
        </p>
      ) : null}
      {aberto ? (
        <JanelaPedido
          clienteAtual={clienteAtual}
          clientes={clientes}
          fechar={() => setAberto(null)}
          onFeito={(texto) => {
            setAviso({ texto, tom: "ok" });
            setAberto(null);
            router.refresh();
          }}
          tipo={aberto}
        />
      ) : null}
    </div>
  );
}

function JanelaPedido({
  clienteAtual,
  clientes,
  fechar,
  onFeito,
  tipo,
}: {
  clienteAtual: string;
  clientes: { nome: string; slug: string }[];
  fechar: () => void;
  onFeito: (mensagem: string) => void;
  tipo: Tipo;
}) {
  const { t } = useIdioma();
  const painel = useRef<HTMLFormElement>(null);
  const [periodo, setPeriodo] = useState<Periodo>("24h");
  const [cliente, setCliente] = useState(tipo === "especifica" ? clienteAtual : "");
  const [conversa, setConversa] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    painel.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    document.addEventListener("keydown", tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
    };
  }, [fechar]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/analises/pedir", {
        body: JSON.stringify({ cliente, conversa, pergunta, periodo, tipo }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const corpo = (await r.json().catch(() => ({}))) as { erro?: string; mensagem?: string };
      if (!r.ok) {
        setErro(corpo.erro ?? t("Não foi possível registrar o pedido."));
        return;
      }
      onFeito(corpo.mensagem ?? t("Pedido registrado; roda na próxima análise."));
    } catch {
      setErro(t("Não foi possível registrar o pedido."));
    } finally {
      setEnviando(false);
    }
  }

  const titulo = tipo === "geral" ? t("Nova análise geral") : t("Análise específica");

  // No body: o cabeçalho da tela tem animação (transform), que prenderia o `fixed` dentro dele.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button aria-label={t("Fechar")} className="absolute inset-0 bg-foreground/30" onClick={fechar} tabIndex={-1} type="button" />
      <form
        aria-labelledby="pedido-titulo"
        aria-modal="true"
        className="relative flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom,0px)] shadow-[0_12px_40px_rgba(16,19,26,0.18)] outline-none sm:rounded-2xl sm:pb-0"
        onSubmit={enviar}
        ref={painel}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground" id="pedido-titulo">
            {titulo}
          </h2>
          <button
            aria-label={t("Fechar")}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            onClick={fechar}
            type="button"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5">
          <p className="text-sm text-muted-foreground">
            {tipo === "geral"
              ? t("Lê as conversas e os turnos de todos os clientes no período e procura erros do agente.")
              : t("Lê só o cliente (e, se quiser, uma conversa) e responde à sua pergunta.")}
          </p>

          <div className="flex flex-col gap-1.5">
            <span className="ds-sobretitulo">{t("Período")}</span>
            <Segmentado<Periodo>
              onChange={setPeriodo}
              opcoes={[
                { label: t("Últimas 24 h"), valor: "24h" },
                { label: t("3 dias"), valor: "3d" },
                { label: t("7 dias"), valor: "7d" },
              ]}
              valor={periodo}
            />
          </div>

          {tipo === "especifica" ? (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="ds-sobretitulo">{t("Cliente")}</span>
                <select className="ds-campo text-base sm:text-sm" onChange={(e) => setCliente(e.target.value)} required value={cliente}>
                  <option value="">{t("Escolha o cliente")}</option>
                  {clientes.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="ds-sobretitulo">{t("Conversa (opcional)")}</span>
                <input
                  autoComplete="off"
                  className="ds-campo text-base sm:text-sm"
                  maxLength={200}
                  onChange={(e) => setConversa(e.target.value)}
                  placeholder={t("ex.: whatsapp:5511999990000")}
                  value={conversa}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="ds-sobretitulo">{t("O que quer saber")}</span>
                <textarea
                  className="ds-campo min-h-28 py-2.5 text-base leading-relaxed sm:text-sm"
                  maxLength={4000}
                  onChange={(e) => setPergunta(e.target.value)}
                  placeholder={t("ex.: Por que o agente não ofereceu horário ao lead que pediu sábado?")}
                  required
                  value={pergunta}
                />
              </label>
            </>
          ) : null}

          {erro ? (
            <p className="text-sm font-medium text-[var(--ds-perigo)]" role="alert">
              {erro}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3.5 sm:flex-row sm:justify-end">
          <button className="ds-botao ds-botao-fantasma" onClick={fechar} type="button">
            {t("Cancelar")}
          </button>
          <button className="ds-botao ds-botao-primario" disabled={enviando} type="submit">
            {enviando ? t("Enviando...") : t("Pedir análise")}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
